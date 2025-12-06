import { Request, Response } from 'express';
import { Transaction } from '@mysten/sui/transactions';
import { getAftermathInstance, suiClient, SPONSOR_KEYPAIR, SPONSOR_ADDRESS, TREASURY_ADDRESS, SERVICE_FEE_BPS, COMMON_TOKENS } from '../config/sui';
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

    // Validation
    if (!tokenInType || !tokenOutType || !amount) {
      return res.status(400).json({
        error: 'Missing required parameters: tokenInType, tokenOutType, amount',
      });
    }

    const aftermath = await getAftermathInstance();
    const router = aftermath.Router();

    // Get the best route
    const route = await router.getCompleteTradeRouteGivenAmountIn({
      coinInType: tokenInType,
      coinOutType: tokenOutType,
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

    // Validation
    if (!userAddress || !tokenInType || !tokenOutType || !amount || slippage === undefined) {
      return res.status(400).json({
        error: 'Missing required parameters',
      });
    }

    const aftermath = await getAftermathInstance();
    const router = aftermath.Router();

    // Get the best route
    const route = await router.getCompleteTradeRouteGivenAmountIn({
      coinInType: tokenInType,
      coinOutType: tokenOutType,
      coinInAmount: BigInt(amount),
    });

    if (!route) {
      return res.status(404).json({
        error: 'No route found for this token pair',
      });
    }

    // Calculate minimum amount out based on slippage
    const minAmountOut = calculateMinAmountOut(route.coinOut.amount.toString(), slippage);

    // Build transaction
    const tx = new Transaction();
    tx.setSender(userAddress);

    // Use Aftermath's built-in transaction builder
    const routeTx = await route.getTransaction({
      slippage: slippage / 10000, // Convert from bps to decimal
      walletAddress: userAddress,
    });

    // Merge the route transaction into our transaction
    tx.add(routeTx);

    // Serialize transaction
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
 * Build a sponsored swap transaction where user pays fees in USDC/USDT
 * Backend pays SUI gas fees
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

    // Validation
    if (!userAddress || !tokenInType || !tokenOutType || !amount || slippage === undefined) {
      return res.status(400).json({
        error: 'Missing required parameters',
      });
    }

    const aftermath = await getAftermathInstance();
    const router = aftermath.Router();

    // Calculate service fee and amount for swap
    const serviceFee = calculateServiceFee(amount, SERVICE_FEE_BPS);
    const amountForSwap = calculateAmountAfterFee(amount, SERVICE_FEE_BPS);

    // Get the best route for the swap amount (after fee deduction)
    const route = await router.getCompleteTradeRouteGivenAmountIn({
      coinInType: tokenInType,
      coinOutType: tokenOutType,
      coinInAmount: BigInt(amountForSwap),
    });

    if (!route) {
      return res.status(404).json({
        error: 'No route found for this token pair',
      });
    }

    // Estimate gas cost in payment token (simplified - in production, fetch real price)
    const estimatedGasBudget = route.gasBudget?.toString() || '1000000';
    const gasCostInPaymentToken = '0'; // Simplified for demo

    // Build transaction
    const tx = new Transaction();
    tx.setSender(userAddress);
    tx.setGasOwner(SPONSOR_ADDRESS); // Backend sponsors the gas

    // Step 1: Split the input coins
    // Get user's coin objects for the payment token
    const userCoins = await suiClient.getCoins({
      owner: userAddress,
      coinType: paymentTokenType,
    });

    if (userCoins.data.length === 0) {
      return res.status(400).json({
        error: 'User has no coins of the payment token type',
      });
    }

    // Merge all user coins into one
    const [primaryCoin, ...restCoins] = userCoins.data.map(coin => coin.coinObjectId);
    if (restCoins.length > 0) {
      tx.mergeCoins(primaryCoin, restCoins);
    }

    // Split: one for service fee, one for swap
    const [feeCoin, swapCoin] = tx.splitCoins(primaryCoin, [
      tx.pure.u64(serviceFee),
      tx.pure.u64(amountForSwap),
    ]);

    // Step 2: Transfer service fee to treasury
    tx.transferObjects([feeCoin], TREASURY_ADDRESS);

    // Step 3: Execute the swap with the swap coin
    const routeTx = await route.getTransaction({
      slippage: slippage / 10000,
      walletAddress: userAddress,
      coinInId: swapCoin, // Use the split coin for swap
    });

    tx.add(routeTx);

    // Set gas budget
    tx.setGasBudget(BigInt(estimatedGasBudget));

    // Build transaction bytes
    const txBytes = await tx.build({ client: suiClient });

    // Sign with sponsor keypair (gas owner signature)
    const sponsorSignature = await SPONSOR_KEYPAIR.signTransaction(txBytes);

    const response: SponsoredSwapResponse = {
      txBytes: Buffer.from(txBytes).toString('base64'),
      sponsorSignature: sponsorSignature.signature,
      estimatedAmountOut: route.coinOut.amount.toString(),
      gasCostInPaymentToken,
      serviceFee,
      totalCost: (BigInt(serviceFee) + BigInt(gasCostInPaymentToken)).toString(),
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
 * Swap liquid tokens (USDC/USDT/DEEP) for exactly 1 or 5 SUI
 */
export async function buildRefuel(req: Request, res: Response) {
  try {
    const { userAddress, tokenInType, amountOut, slippage } = req.body as RefuelRequest;

    // Validation
    if (!userAddress || !tokenInType || !amountOut || slippage === undefined) {
      return res.status(400).json({
        error: 'Missing required parameters',
      });
    }

    // Validate amountOut is 1 or 5 SUI
    const validAmounts = ['1000000000', '5000000000']; // 1 SUI and 5 SUI in smallest units
    if (!validAmounts.includes(amountOut)) {
      return res.status(400).json({
        error: 'amountOut must be 1 or 5 SUI (in smallest units: 1000000000 or 5000000000)',
      });
    }

    const aftermath = await getAftermathInstance();
    const router = aftermath.Router();

    // Get route for exact output (reverse lookup)
    const route = await router.getCompleteTradeRouteGivenAmountOut({
      coinInType: tokenInType,
      coinOutType: COMMON_TOKENS.SUI,
      coinOutAmount: BigInt(amountOut),
    });

    if (!route) {
      return res.status(404).json({
        error: 'No route found for refueling',
      });
    }

    // Build transaction
    const tx = new Transaction();
    tx.setSender(userAddress);

    const routeTx = await route.getTransaction({
      slippage: slippage / 10000,
      walletAddress: userAddress,
    });

    tx.add(routeTx);

    // Serialize transaction
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

    // Validation
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

    // Process each dust token
    for (const dustToken of tokens) {
      try {
        // Get user's coins for this token type
        const userCoins = await suiClient.getCoins({
          owner: userAddress,
          coinType: dustToken.tokenType,
        });

        if (userCoins.data.length === 0) {
          console.log(`No coins found for ${dustToken.tokenType}, skipping`);
          continue;
        }

        // Merge all coins of this type
        const [primaryCoin, ...restCoins] = userCoins.data.map(coin => coin.coinObjectId);
        if (restCoins.length > 0) {
          tx.mergeCoins(primaryCoin, restCoins);
        }

        // Get route for this swap
        const route = await router.getCompleteTradeRouteGivenAmountIn({
          coinInType: dustToken.tokenType,
          coinOutType: targetTokenType,
          coinInAmount: BigInt(dustToken.balance),
        });

        if (!route) {
          console.log(`No route found for ${dustToken.tokenType}, skipping`);
          continue;
        }

        // Add swap to transaction
        const routeTx = await route.getTransaction({
          slippage: slippage / 10000,
          walletAddress: userAddress,
          coinInId: primaryCoin,
        });

        tx.add(routeTx);

        // Track swap details
        swaps.push({
          tokenIn: dustToken.tokenType,
          amountIn: dustToken.balance,
          estimatedOut: route.coinOut.amount.toString(),
        });

        totalEstimatedOut += route.coinOut.amount;
      } catch (error) {
        console.error(`Error processing ${dustToken.tokenType}:`, error);
        // Continue with other tokens
      }
    }

    if (swaps.length === 0) {
      return res.status(400).json({
        error: 'No valid swaps could be constructed',
      });
    }

    // Serialize transaction
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
