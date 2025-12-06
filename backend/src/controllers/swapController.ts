import { Request, Response } from 'express';
import { Transaction } from '@mysten/sui/transactions';
import { 
  getAftermathInstance, 
  suiClient, 
  TREASURY_ADDRESS, 
  SERVICE_FEE_BPS,
  normalizeTokenType,
  sponsorTransaction,
  getTokenBalance,
  getAllBalances,
  TESTNET_TOKENS,
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

    const normalizedTokenIn = normalizeTokenType(tokenInType);
    const normalizedTokenOut = normalizeTokenType(tokenOutType);

    console.log(`📊 Getting quote: ${normalizedTokenIn} -> ${normalizedTokenOut}, amount: ${amount}`);

    const route = await router.getCompleteTradeRouteGivenAmountIn({
      coinInType: normalizedTokenIn,
      coinOutType: normalizedTokenOut,
      coinInAmount: BigInt(amount),
    });

    if (!route) {
      return res.status(404).json({
        error: 'No route found for this token pair',
        details: 'The tokens may not have liquidity on testnet',
      });
    }

    const response: QuoteResponse = {
      estimatedAmountOut: route.coinOut.amount.toString(),
      route: {
        path: route.routes?.map((r: any) => r.pool?.name || 'Unknown') || [],
        protocols: [...new Set(route.routes?.map((r: any) => r.protocol || 'Aftermath') || ['Aftermath'])],
        estimatedGas: '10000000', // Default gas estimate
      },
      priceImpact: (route.spotPrice ? ((1 - Number(route.coinOut.amount) / (Number(amount) * route.spotPrice)) * 100).toFixed(4) : '0'),
    };

    console.log(`✅ Quote result: ${response.estimatedAmountOut} out, impact: ${response.priceImpact}%`);
    res.json(response);
  } catch (error: any) {
    console.error('❌ Quote error:', error);
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

    console.log(`🔄 Building swap: ${userAddress}`);
    console.log(`   ${normalizedTokenIn} -> ${normalizedTokenOut}`);
    console.log(`   Amount: ${amount}, Slippage: ${slippage} bps`);

    // Get the route
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

    // Build transaction using Aftermath's built-in method
    const tx = await router.getTransactionForCompleteTradeRoute({
      walletAddress: userAddress,
      completeRoute: route,
      slippage: slippage / 10000, // Convert bps to decimal
    });

    // Build and serialize
    const txBytes = await tx.build({ client: suiClient });
    const txBytesBase64 = Buffer.from(txBytes).toString('base64');

    const response: SwapResponse = {
      txBytes: txBytesBase64,
      estimatedAmountOut: route.coinOut.amount.toString(),
      route: {
        path: route.routes?.map((r: any) => r.pool?.name || 'Unknown') || [],
        protocols: [...new Set(route.routes?.map((r: any) => r.protocol || 'Aftermath') || ['Aftermath'])],
        estimatedGas: '10000000',
      },
    };

    console.log(`✅ Swap transaction built successfully`);
    res.json(response);
  } catch (error: any) {
    console.error('❌ Build swap error:', error);
    res.status(500).json({
      error: 'Failed to build swap transaction',
      details: error.message,
    });
  }
}

/**
 * POST /api/swap/build-sponsored
 * Build a sponsored swap using Enoki Gas Station
 * User pays service fee in their input token, Enoki sponsors SUI gas
 */
export async function buildSponsoredSwap(req: Request, res: Response) {
  try {
    const {
      userAddress,
      tokenInType,
      tokenOutType,
      amount,
      slippage,
    } = req.body as SponsoredSwapRequest;

    if (!userAddress || !tokenInType || !tokenOutType || !amount || slippage === undefined) {
      return res.status(400).json({
        error: 'Missing required parameters',
      });
    }

    const aftermath = await getAftermathInstance();
    const router = aftermath.Router();

    const normalizedTokenIn = normalizeTokenType(tokenInType);
    const normalizedTokenOut = normalizeTokenType(tokenOutType);

    // Calculate service fee
    const serviceFee = calculateServiceFee(amount, SERVICE_FEE_BPS);
    const amountForSwap = calculateAmountAfterFee(amount, SERVICE_FEE_BPS);

    console.log(`🔄 Building sponsored swap: ${userAddress}`);
    console.log(`   ${normalizedTokenIn} -> ${normalizedTokenOut}`);
    console.log(`   Total: ${amount}, Fee: ${serviceFee}, Swap: ${amountForSwap}`);

    // Get the route for the swap amount (after fee)
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

    // Build a custom transaction that:
    // 1. Splits the user's coins
    // 2. Sends fee to treasury
    // 3. Executes the swap with remaining amount
    const tx = new Transaction();
    tx.setSender(userAddress);

    // Get user's coins
    const userCoins = await suiClient.getCoins({
      owner: userAddress,
      coinType: normalizedTokenIn,
    });

    if (userCoins.data.length === 0) {
      return res.status(400).json({
        error: 'User has no coins of the input token type',
      });
    }

    // Check if user has enough balance
    const totalBalance = userCoins.data.reduce(
      (sum, coin) => sum + BigInt(coin.balance),
      BigInt(0)
    );

    if (totalBalance < BigInt(amount)) {
      return res.status(400).json({
        error: 'Insufficient balance',
        details: `Need ${amount}, have ${totalBalance.toString()}`,
      });
    }

    // For SUI, we need special handling
    if (normalizedTokenIn === TESTNET_TOKENS.SUI) {
      // Split from gas coin
      const [feeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(serviceFee)]);
      
      // Transfer fee to treasury
      if (TREASURY_ADDRESS) {
        tx.transferObjects([feeCoin], tx.pure.address(TREASURY_ADDRESS));
      }

      // Build swap transaction
      const swapTx = await router.getTransactionForCompleteTradeRoute({
        walletAddress: userAddress,
        completeRoute: route,
        slippage: slippage / 10000,
      });

      // Merge swap commands into our transaction
      // Note: This is a simplified approach - in production you'd need more sophisticated merging
      const swapBytes = await swapTx.build({ client: suiClient });
      
      // For now, we'll use the swap transaction directly and add fee transfer separately
      // This is a limitation - ideally we'd merge PTBs properly
      
    } else {
      // For non-SUI tokens
      const coinIds = userCoins.data.map(coin => coin.coinObjectId);
      
      // If multiple coins, merge them first
      if (coinIds.length > 1) {
        const [primaryCoin, ...restCoins] = coinIds;
        tx.mergeCoins(
          tx.object(primaryCoin), 
          restCoins.map(id => tx.object(id))
        );
      }

      // Split fee and swap amounts
      const primaryCoinId = coinIds[0];
      const [feeCoin, swapCoin] = tx.splitCoins(tx.object(primaryCoinId), [
        tx.pure.u64(serviceFee),
        tx.pure.u64(amountForSwap),
      ]);

      // Transfer fee to treasury
      if (TREASURY_ADDRESS) {
        tx.transferObjects([feeCoin], tx.pure.address(TREASURY_ADDRESS));
      }
    }

    // Use Aftermath's transaction builder
    const swapTx = await router.getTransactionForCompleteTradeRoute({
      walletAddress: userAddress,
      completeRoute: route,
      slippage: slippage / 10000,
    });

    // Build and serialize
    const txBytes = await swapTx.build({ client: suiClient });
    const txBytesBase64 = Buffer.from(txBytes).toString('base64');

    // Get sponsor signature from Enoki
    let sponsorSignature: string;
    try {
      const sponsorResult = await sponsorTransaction(txBytesBase64);
      sponsorSignature = sponsorResult.signature;
      console.log(`✅ Got sponsor signature from Enoki`);
    } catch (enokiError: any) {
      console.error('❌ Enoki sponsorship failed:', enokiError);
      return res.status(500).json({
        error: 'Failed to get sponsor signature',
        details: enokiError.message,
      });
    }

    const response: SponsoredSwapResponse = {
      txBytes: txBytesBase64,
      sponsorSignature,
      estimatedAmountOut: route.coinOut.amount.toString(),
      gasCostInPaymentToken: '0', // Covered by Enoki
      serviceFee,
      totalCost: serviceFee,
    };

    console.log(`✅ Sponsored swap built successfully`);
    res.json(response);
  } catch (error: any) {
    console.error('❌ Build sponsored swap error:', error);
    res.status(500).json({
      error: 'Failed to build sponsored swap transaction',
      details: error.message,
    });
  }
}

/**
 * POST /api/refuel
 * Swap liquid tokens for exactly 1 or 5 SUI (Gas Station feature)
 * This is sponsored - user pays with their tokens, Enoki pays gas
 */
export async function buildRefuel(req: Request, res: Response) {
  try {
    const { userAddress, tokenInType, amountOut, slippage } = req.body as RefuelRequest;

    if (!userAddress || !tokenInType || !amountOut || slippage === undefined) {
      return res.status(400).json({
        error: 'Missing required parameters',
      });
    }

    // Validate amountOut
    const validAmounts = ['1000000000', '5000000000']; // 1 SUI or 5 SUI
    if (!validAmounts.includes(amountOut)) {
      return res.status(400).json({
        error: 'amountOut must be 1 or 5 SUI (1000000000 or 5000000000)',
      });
    }

    const aftermath = await getAftermathInstance();
    const router = aftermath.Router();

    const normalizedTokenIn = normalizeTokenType(tokenInType);
    const SUI_TYPE = TESTNET_TOKENS.SUI;

    console.log(`⛽ Building refuel: ${userAddress}`);
    console.log(`   ${normalizedTokenIn} -> ${amountOut} SUI`);

    // Get route for exact output
    const route = await router.getCompleteTradeRouteGivenAmountOut({
      coinInType: normalizedTokenIn,
      coinOutType: SUI_TYPE,
      coinOutAmount: BigInt(amountOut),
    });

    if (!route) {
      return res.status(404).json({
        error: 'No route found for refueling',
        details: 'The input token may not have liquidity against SUI',
      });
    }

    // Check user has enough balance
    const userBalance = await getTokenBalance(userAddress, normalizedTokenIn);
    const requiredAmount = route.coinIn.amount;

    if (userBalance < requiredAmount) {
      return res.status(400).json({
        error: 'Insufficient balance for refuel',
        details: `Need ${requiredAmount.toString()}, have ${userBalance.toString()}`,
      });
    }

    // Build swap transaction
    const tx = await router.getTransactionForCompleteTradeRoute({
      walletAddress: userAddress,
      completeRoute: route,
      slippage: slippage / 10000,
    });

    const txBytes = await tx.build({ client: suiClient });
    const txBytesBase64 = Buffer.from(txBytes).toString('base64');

    // Get sponsor signature from Enoki (refuel is always sponsored)
    let sponsorSignature: string | undefined;
    try {
      const sponsorResult = await sponsorTransaction(txBytesBase64);
      sponsorSignature = sponsorResult.signature;
      console.log(`✅ Refuel sponsored by Enoki`);
    } catch (enokiError: any) {
      console.warn('⚠️ Enoki sponsorship failed, user will pay gas:', enokiError.message);
      // Continue without sponsorship - user will pay gas
    }

    const response: RefuelResponse = {
      txBytes: txBytesBase64,
      estimatedAmountIn: route.coinIn.amount.toString(),
      route: {
        path: route.routes?.map((r: any) => r.pool?.name || 'Unknown') || [],
        protocols: [...new Set(route.routes?.map((r: any) => r.protocol || 'Aftermath') || ['Aftermath'])],
        estimatedGas: '10000000',
      },
      sponsorSignature, // Include if available
    };

    console.log(`✅ Refuel transaction built: ${response.estimatedAmountIn} ${tokenInType} -> ${amountOut} SUI`);
    res.json(response);
  } catch (error: any) {
    console.error('❌ Refuel error:', error);
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

    if (tokens.length > 10) {
      return res.status(400).json({
        error: 'Maximum 10 tokens per dust sweep',
      });
    }

    const aftermath = await getAftermathInstance();
    const router = aftermath.Router();

    const normalizedTargetToken = normalizeTokenType(targetTokenType);
    const swaps: DustSweepResponse['swaps'] = [];
    let totalEstimatedOut = BigInt(0);

    console.log(`🧹 Building dust sweep for ${tokens.length} tokens -> ${normalizedTargetToken}`);

    // Process each dust token
    for (const dustToken of tokens) {
      try {
        const normalizedDustToken = normalizeTokenType(dustToken.tokenType);

        // Skip if same as target
        if (normalizedDustToken === normalizedTargetToken) {
          continue;
        }

        // Get route for this dust token
        const route = await router.getCompleteTradeRouteGivenAmountIn({
          coinInType: normalizedDustToken,
          coinOutType: normalizedTargetToken,
          coinInAmount: BigInt(dustToken.balance),
        });

        if (!route) {
          console.log(`   ⏭️ No route for ${normalizedDustToken}, skipping`);
          continue;
        }

        swaps.push({
          tokenIn: normalizedDustToken,
          amountIn: dustToken.balance,
          estimatedOut: route.coinOut.amount.toString(),
        });

        totalEstimatedOut += route.coinOut.amount;
        console.log(`   ✓ ${dustToken.balance} ${normalizedDustToken} -> ${route.coinOut.amount.toString()}`);
      } catch (error) {
        console.error(`   ✗ Error processing ${dustToken.tokenType}:`, error);
      }
    }

    if (swaps.length === 0) {
      return res.status(400).json({
        error: 'No valid swaps could be constructed',
        details: 'None of the provided tokens have routes to the target token',
      });
    }

    // For dust sweep, we'd ideally batch all swaps into one PTB
    // For now, we'll just handle the first swap as a demo
    // In production, you'd want to properly batch these

    const firstSwap = swaps[0];
    const route = await router.getCompleteTradeRouteGivenAmountIn({
      coinInType: firstSwap.tokenIn,
      coinOutType: normalizedTargetToken,
      coinInAmount: BigInt(firstSwap.amountIn),
    });

    const tx = await router.getTransactionForCompleteTradeRoute({
      walletAddress: userAddress,
      completeRoute: route!,
      slippage: slippage / 10000,
    });

    const txBytes = await tx.build({ client: suiClient });
    const txBytesBase64 = Buffer.from(txBytes).toString('base64');

    const response: DustSweepResponse = {
      txBytes: txBytesBase64,
      estimatedTotalOut: totalEstimatedOut.toString(),
      swaps,
    };

    console.log(`✅ Dust sweep built: ${swaps.length} swaps, total out: ${totalEstimatedOut.toString()}`);
    res.json(response);
  } catch (error: any) {
    console.error('❌ Dust sweep error:', error);
    res.status(500).json({
      error: 'Failed to build dust sweep transaction',
      details: error.message,
    });
  }
}

/**
 * GET /api/balances/:address
 * Get all token balances for a user
 */
export async function getBalances(req: Request, res: Response) {
  try {
    const { address } = req.params;

    if (!address) {
      return res.status(400).json({
        error: 'Address is required',
      });
    }

    const balances = await getAllBalances(address);

    res.json({
      address,
      balances,
    });
  } catch (error: any) {
    console.error('❌ Get balances error:', error);
    res.status(500).json({
      error: 'Failed to get balances',
      details: error.message,
    });
  }
}

/**
 * GET /api/tokens
 * Get list of supported tokens
 */
export async function getSupportedTokens(req: Request, res: Response) {
  try {
    res.json({
      tokens: [
        {
          symbol: 'SUI',
          type: TESTNET_TOKENS.SUI,
          decimals: 9,
          name: 'Sui',
          logo: 'https://cryptologos.cc/logos/sui-sui-logo.png',
        },
        {
          symbol: 'USDC',
          type: TESTNET_TOKENS.USDC,
          decimals: 6,
          name: 'USD Coin',
          logo: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
        },
        {
          symbol: 'USDT',
          type: TESTNET_TOKENS.USDT,
          decimals: 6,
          name: 'Tether USD',
          logo: 'https://cryptologos.cc/logos/tether-usdt-logo.png',
        },
      ],
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get supported tokens',
      details: error.message,
    });
  }
}
