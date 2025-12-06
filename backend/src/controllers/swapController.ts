import { Request, Response } from 'express';
import { Transaction } from '@mysten/sui/transactions';
import { 
  getAftermathInstance, 
  suiClient, 
  TREASURY_ADDRESS, 
  SERVICE_FEE_BPS,
  ENOKI_API_KEY,
  ENOKI_API_URL,
  normalizeTokenType
} from '../config/sui';
import {
  QuoteRequest,
  QuoteResponse,
  SwapRequest,
  SwapResponse,
  SponsoredSwapRequest,
  SponsoredSwapResponse,
  RefuelRequest,
  RefuelResponse,
  DustSweepRequest,
  DustSweepResponse,
} from '../types';
import {
  calculateMinAmountOut,
  calculateServiceFee,
  calculateAmountAfterFee,
} from '../utils/calculations';

/**
 * GET /api/quote
 * Get the best swap route and estimated output
 */
export async function getQuote(req: Request, res: Response) {
  try {
    const { tokenInType, tokenOutType, amount } = req.query as unknown as QuoteRequest;

    if (!tokenInType || !tokenOutType || !amount) {
      return res.status(400).json({
        error: 'Missing required parameters: tokenInType, tokenOutType, amount',
      });
    }

    const aftermath = await getAftermathInstance();
    const router = aftermath.Router();

    // Normalize token types
    const normalizedTokenIn = normalizeTokenType(tokenInType);
    const normalizedTokenOut = normalizeTokenType(tokenOutType);

    const route = await router.getCompleteTradeRouteGivenAmountIn({
      coinInType: normalizedTokenIn,
      coinOutType: normalizedTokenOut,
      coinInAmount: BigInt(amount),
    });

    if (!route) {
      return res.status(404).json({
        error: 'No route found for this token pair on Testnet',
        details: 'Please verify the token types are available on Testnet',
      });
    }

    const response: QuoteResponse = {
      estimatedAmountOut: route.coinOut.amount.toString(),
      route: {
        path: route.routes.map(r => r.protocol),
        protocols: [...new Set(route.routes.map(r => r.protocol))],
        estimatedGas: route.gasBudget?.toString() || '1000000',
      },
      priceImpact: route.priceImpact?.toString() || '0',
    };

    res.json(response);
  } catch (error: any) {
    console.error('Quote error:', error);
    res.status(500).json({
      error: 'Failed to get quote',
      details: error.message,
    });
  }
}

/**
 * POST /api/swap/build
 * Build a standard swap transaction (user pays gas in SUI)
 */
export async function buildSwap(req: Request, res: Response) {
  try {
    const { userAddress, tokenInType, tokenOutType, amount, slippage } = req.body as SwapRequest;

    if (!userAddress || !tokenInType || !tokenOutType || !amount || slippage === undefined) {
      return res.status(400).json({
        error: 'Missing required parameters',
      });
    }

    const aftermath = await getAftermathInstance();
    const router = aftermath.Router();

    const normalizedTokenIn = normalizeTokenType(tokenInType);
    const normalizedTokenOut = normalizeTokenType(tokenOutType);

    const route = await router.getCompleteTradeRouteGivenAmountIn({
      coinInType: normalizedTokenIn,
      coinOutType: normalizedTokenOut,
      coinInAmount: BigInt(amount),
    });

    if (!route) {
      return res.status(404).json({
        error: 'No route found for this token pair',
      });
    }

    const tx = new Transaction();
    tx.setSender(userAddress);

    const routeTx = await route.getTransaction({
      slippage: slippage / 10000,
      walletAddress: userAddress,
    });

    // Merge route transaction
    const routeCommands = routeTx.getData();
    routeCommands.commands.forEach((cmd: any) => {
      tx.add(cmd);
    });

    const txBytes = await tx.build({ client: suiClient });
    const txBytesBase64 = Buffer.from(txBytes).toString('base64');

    const response: SwapResponse = {
      txBytes: txBytesBase64,
      estimatedAmountOut: route.coinOut.amount.toString(),
      route: {
        path: route.routes.map(r => r.protocol),
        protocols: [...new Set(route.routes.map(r => r.protocol))],
        estimatedGas: route.gasBudget?.toString() || '1000000',
      },
    };

    res.json(response);
  } catch (error: any) {
    console.error('Build swap error:', error);
    res.status(500).json({
      error: 'Failed to build swap transaction',
      details: error.message,
    });
  }
}

/**
 * POST /api/swap/build-sponsored
 * Build a sponsored swap using Enoki Gas Station
 * User pays service fee in USDC, Enoki sponsors SUI gas
 */
export async function buildSponsoredSwap(req: Request, res: Response) {
  try {
    const {
      userAddress,
      tokenInType,
      tokenOutType,
      amount,
      slippage,
      paymentTokenType = tokenInType,
    } = req.body as SponsoredSwapRequest;

    if (!userAddress || !tokenInType || !tokenOutType || !amount || slippage === undefined) {
      return res.status(400).json({
        error: 'Missing required parameters',
      });
    }

    const aftermath = await getAftermathInstance();
    const router = aftermath.Router();

    // Calculate service fee and swap amount
    const serviceFee = calculateServiceFee(amount, SERVICE_FEE_BPS);
    const amountForSwap = calculateAmountAfterFee(amount, SERVICE_FEE_BPS);

    const normalizedTokenIn = normalizeTokenType(tokenInType);
    const normalizedTokenOut = normalizeTokenType(tokenOutType);
    const normalizedPaymentToken = normalizeTokenType(paymentTokenType);

    const route = await router.getCompleteTradeRouteGivenAmountIn({
      coinInType: normalizedTokenIn,
      coinOutType: normalizedTokenOut,
      coinInAmount: BigInt(amountForSwap),
    });

    if (!route) {
      return res.status(404).json({
        error: 'No route found for this token pair',
      });
    }

    // Build the transaction
    const tx = new Transaction();
    tx.setSender(userAddress);

    // Get user's coins for payment token
    const userCoins = await suiClient.getCoins({
      owner: userAddress,
      coinType: normalizedPaymentToken,
    });

    if (userCoins.data.length === 0) {
      return res.status(400).json({
        error: 'User has no coins of the payment token type',
      });
    }

    // Merge all user coins
    const coinIds = userCoins.data.map(coin => coin.coinObjectId);
    const [primaryCoin, ...restCoins] = coinIds;
    
    if (restCoins.length > 0) {
      tx.mergeCoins(tx.object(primaryCoin), restCoins.map(id => tx.object(id)));
    }

    // Split coins: service fee + swap amount
    const [feeCoin, swapCoin] = tx.splitCoins(tx.object(primaryCoin), [
      tx.pure.u64(serviceFee),
      tx.pure.u64(amountForSwap),
    ]);

    // Transfer service fee to treasury
    tx.transferObjects([feeCoin], tx.pure.address(TREASURY_ADDRESS));

    // Build the swap transaction using the split coin
    const routeTx = await route.getTransaction({
      slippage: slippage / 10000,
      walletAddress: userAddress,
    });

    // Merge route commands
    const routeCommands = routeTx.getData();
    routeCommands.commands.forEach((cmd: any) => {
      tx.add(cmd);
    });

    const estimatedGasBudget = route.gasBudget?.toString() || '10000000';
    tx.setGasBudget(BigInt(estimatedGasBudget));

    // Build transaction bytes
    const txBytes = await tx.build({ client: suiClient });
    const txBytesBase64 = Buffer.from(txBytes).toString('base64');

    // Call Enoki Gas Station API for sponsor signature
    let sponsorSignature: string;
    
    try {
      const enokiResponse = await fetch(`${ENOKI_API_URL}/gas-station/v1/sponsor`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ENOKI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          network: 'testnet',
          txBytes: txBytesBase64,
        }),
      });

      if (!enokiResponse.ok) {
        const errorData = await enokiResponse.json();
        throw new Error(`Enoki API error: ${errorData.message || enokiResponse.statusText}`);
      }

      const enokiData = await enokiResponse.json();
      sponsorSignature = enokiData.signature;
    } catch (enokiError: any) {
      console.error('Enoki Gas Station error:', enokiError);
      return res.status(500).json({
        error: 'Failed to get sponsor signature from Enoki',
        details: enokiError.message,
      });
    }

    const response: SponsoredSwapResponse = {
      txBytes: txBytesBase64,
      sponsorSignature,
      estimatedAmountOut: route.coinOut.amount.toString(),
      gasCostInPaymentToken: '0', // Covered by sponsor
      serviceFee,
      totalCost: serviceFee,
    };

    res.json(response);
  } catch (error: any) {
    console.error('Build sponsored swap error:', error);
    res.status(500).json({
      error: 'Failed to build sponsored swap transaction',
      details: error.message,
    });
  }
}

/**
 * POST /api/refuel
 * Swap liquid tokens for exactly 1 or 5 SUI (Gas Station feature)
 */
export async function buildRefuel(req: Request, res: Response) {
  try {
    const { userAddress, tokenInType, amountOut, slippage } = req.body as RefuelRequest;

    if (!userAddress || !tokenInType || !amountOut || slippage === undefined) {
      return res.status(400).json({
        error: 'Missing required parameters',
      });
    }

    const validAmounts = ['1000000000', '5000000000'];
    if (!validAmounts.includes(amountOut)) {
      return res.status(400).json({
        error: 'amountOut must be 1 or 5 SUI (1000000000 or 5000000000)',
      });
    }

    const aftermath = await getAftermathInstance();
    const router = aftermath.Router();

    const normalizedTokenIn = normalizeTokenType(tokenInType);
    const SUI_TYPE = '0x2::sui::SUI';

    const route = await router.getCompleteTradeRouteGivenAmountOut({
      coinInType: normalizedTokenIn,
      coinOutType: SUI_TYPE,
      coinOutAmount: BigInt(amountOut),
    });

    if (!route) {
      return res.status(404).json({
        error: 'No route found for refueling',
      });
    }

    const tx = new Transaction();
    tx.setSender(userAddress);

    const routeTx = await route.getTransaction({
      slippage: slippage / 10000,
      walletAddress: userAddress,
    });

    const routeCommands = routeTx.getData();
    routeCommands.commands.forEach((cmd: any) => {
      tx.add(cmd);
    });

    const txBytes = await tx.build({ client: suiClient });
    const txBytesBase64 = Buffer.from(txBytes).toString('base64');

    const response: RefuelResponse = {
      txBytes: txBytesBase64,
      estimatedAmountIn: route.coinIn.amount.toString(),
      route: {
        path: route.routes.map(r => r.protocol),
        protocols: [...new Set(route.routes.map(r => r.protocol))],
        estimatedGas: route.gasBudget?.toString() || '1000000',
      },
    };

    res.json(response);
  } catch (error: any) {
    console.error('Refuel error:', error);
    res.status(500).json({
      error: 'Failed to build refuel transaction',
      details: error.message,
    });
  }
}

/**
 * POST /api/dust/sweep
 * Convert multiple small token balances to SUI or USDC
 */
export async function buildDustSweep(req: Request, res: Response) {
  try {
    const { userAddress, tokens, targetTokenType, slippage } = req.body as DustSweepRequest;

    if (!userAddress || !tokens || tokens.length === 0 || !targetTokenType || slippage === undefined) {
      return res.status(400).json({
        error: 'Missing required parameters',
      });
    }

    const aftermath = await getAftermathInstance();
    const router = aftermath.Router();

    const tx = new Transaction();
    tx.setSender(userAddress);

    const swaps: DustSweepResponse['swaps'] = [];
    let totalEstimatedOut = BigInt(0);

    const normalizedTargetToken = normalizeTokenType(targetTokenType);

    for (const dustToken of tokens) {
      try {
        const normalizedDustToken = normalizeTokenType(dustToken.tokenType);

        const userCoins = await suiClient.getCoins({
          owner: userAddress,
          coinType: normalizedDustToken,
        });

        if (userCoins.data.length === 0) {
          console.log(`No coins found for ${normalizedDustToken}, skipping`);
          continue;
        }

        const coinIds = userCoins.data.map(coin => coin.coinObjectId);
        const [primaryCoin, ...restCoins] = coinIds;

        if (restCoins.length > 0) {
          tx.mergeCoins(tx.object(primaryCoin), restCoins.map(id => tx.object(id)));
        }

        const route = await router.getCompleteTradeRouteGivenAmountIn({
          coinInType: normalizedDustToken,
          coinOutType: normalizedTargetToken,
          coinInAmount: BigInt(dustToken.balance),
        });

        if (!route) {
          console.log(`No route found for ${normalizedDustToken}, skipping`);
          continue;
        }

        const routeTx = await route.getTransaction({
          slippage: slippage / 10000,
          walletAddress: userAddress,
        });

        const routeCommands = routeTx.getData();
        routeCommands.commands.forEach((cmd: any) => {
          tx.add(cmd);
        });

        swaps.push({
          tokenIn: normalizedDustToken,
          amountIn: dustToken.balance,
          estimatedOut: route.coinOut.amount.toString(),
        });

        totalEstimatedOut += route.coinOut.amount;
      } catch (error) {
        console.error(`Error processing ${dustToken.tokenType}:`, error);
      }
    }

    if (swaps.length === 0) {
      return res.status(400).json({
        error: 'No valid swaps could be constructed',
      });
    }

    const txBytes = await tx.build({ client: suiClient });
    const txBytesBase64 = Buffer.from(txBytes).toString('base64');

    const response: DustSweepResponse = {
      txBytes: txBytesBase64,
      estimatedTotalOut: totalEstimatedOut.toString(),
      swaps,
    };

    res.json(response);
  } catch (error: any) {
    console.error('Dust sweep error:', error);
    res.status(500).json({
      error: 'Failed to build dust sweep transaction',
      details: error.message,
    });
  }
}
