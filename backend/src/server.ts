import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { config, validateConfig } from './config.js';
import {
    getSuiPrice,
    getCoins,
    getBalance,
    toSmallestUnits,
    fromSmallestUnits,
    estimateGasCostInUsdc,
} from './utils.js';

// ============================================
// INITIALIZATION
// ============================================

validateConfig();

const suiClient = new SuiClient({ url: config.rpcUrl });

function getAdminKeypair(): Ed25519Keypair {
    const { secretKey } = decodeSuiPrivateKey(config.adminPrivateKey);
    return Ed25519Keypair.fromSecretKey(secretKey);
}

const adminKeypair = getAdminKeypair();
const ADMIN_ADDRESS = adminKeypair.getPublicKey().toSuiAddress();

console.log('🏦 Pool Wallet Address:', ADMIN_ADDRESS);

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// CONTRACT CONFIGURATION
// ============================================

// Pool object ID - UPDATE AFTER DEPLOYING CONTRACT AND CALLING create_pool
const POOL_OBJECT_ID = process.env.POOL_OBJECT_ID || '0x0';

// Package ID - UPDATE AFTER DEPLOYING CONTRACT
const PACKAGE_ID = process.env.PACKAGE_ID || '0x0';

// ============================================
// TYPE DEFINITIONS
// ============================================

interface SwapRequest {
    userAddress: string;
    amountUsdc: number;
    isGasless: boolean;
}

interface GetGasRequest {
    userAddress: string;
}

interface SponsoredTxResponse {
    txBytes: string;
    signature: string;
    walrusAmount?: number;
    suiAmount?: number;
    estimatedGasCostUsdc?: number;
    totalUsdcCost?: number;
}

// ============================================
// API ENDPOINTS
// ============================================

/**
 * Health check endpoint
 */
app.get('/api/health', async (_req: Request, res: Response) => {
    try {
        const suiBalance = await getBalance(suiClient, ADMIN_ADDRESS, config.suiType);
        const walrusBalance = await getBalance(suiClient, ADMIN_ADDRESS, config.walrusType);
        const usdcBalance = await getBalance(suiClient, ADMIN_ADDRESS, config.usdcType);

        res.json({
            status: 'healthy',
            adminAddress: ADMIN_ADDRESS,
            poolObjectId: POOL_OBJECT_ID,
            packageId: PACKAGE_ID,
            balances: {
                sui: fromSmallestUnits(suiBalance, config.suiDecimals),
                walrus: fromSmallestUnits(walrusBalance, config.walrusDecimals),
                usdc: fromSmallestUnits(usdcBalance, config.usdcDecimals),
            },
        });
    } catch (error) {
        res.status(500).json({ error: 'Health check failed', details: String(error) });
    }
});

/**
 * Get current prices and rates
 */
app.get('/api/prices', async (_req: Request, res: Response) => {
    try {
        const suiPrice = await getSuiPrice();
        const { gasCostUsdc } = await estimateGasCostInUsdc(suiClient);

        res.json({
            suiPriceUsdc: suiPrice,
            usdcToWalrusRate: config.usdcToWalrusRate,
            estimatedGasCostUsdc: gasCostUsdc,
            getGasAmountSui: config.getGasAmountSui,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch prices', details: String(error) });
    }
});

// ============================================
// SPONSOR ENDPOINT (Offline Signing Flow - Step 2)
// ============================================

interface SponsorRequest {
    txBytes: string;       // Base64 encoded TransactionKind from frontend
    userAddress: string;
    amountUsdc: number;
}

/**
 * POST /api/sponsor
 * 
 * Offline Signing Flow - Step 2: Gas Station
 * 
 * 1. Receive TransactionKind bytes from Frontend
 * 2. Reconstruct: Transaction.fromKind(bytes)
 * 3. FORCE sender: tx.setSender(userAddress)
 * 4. FORCE gas owner: tx.setGasOwner(adminAddress)
 * 5. PAY gas: tx.setGasPayment([adminCoins])
 * 6. SIGN: adminKeypair.signTransaction(tx)
 * 7. Return { bytes, signature } to frontend
 */
app.post('/api/sponsor', async (req: Request, res: Response) => {
    try {
        const { txBytes, userAddress, amountUsdc } = req.body as SponsorRequest;

        if (!txBytes || !userAddress) {
            return res.status(400).json({
                error: 'Invalid input: txBytes and userAddress required'
            });
        }

        console.log(`\n🎫 SPONSOR Request from ${userAddress}`);
        console.log(`   Amount: ${amountUsdc} USDC`);

        // Step 1: Decode TransactionKind bytes from Base64
        const kindBytes = Buffer.from(txBytes, 'base64');
        console.log('✅ Decoded TransactionKind bytes, length:', kindBytes.length);

        // Step 2: Reconstruct Transaction from Kind
        const tx = Transaction.fromKind(kindBytes);
        console.log('✅ Reconstructed Transaction from Kind');

        // Step 3: FORCE Sender (User)
        tx.setSender(userAddress);
        console.log(`   Sender: ${userAddress}`);

        // Step 4: FORCE Gas Owner (Admin/Sponsor)
        tx.setGasOwner(ADMIN_ADDRESS);
        console.log(`   Gas Owner: ${ADMIN_ADDRESS}`);

        // Step 5: Get Admin's SUI coins and PAY gas
        const adminSuiCoins = await getCoins(suiClient, ADMIN_ADDRESS, config.suiType);
        if (adminSuiCoins.length === 0) {
            return res.status(500).json({
                error: 'Admin has no SUI for gas sponsorship'
            });
        }

        tx.setGasPayment([{
            objectId: adminSuiCoins[0].coinObjectId,
            version: adminSuiCoins[0].version,
            digest: adminSuiCoins[0].digest,
        }]);
        console.log(`   Gas Coin: ${adminSuiCoins[0].coinObjectId}`);

        // Set Gas Budget (50M MIST = 0.05 SUI max)
        tx.setGasBudget(BigInt(50_000_000));

        // Step 6: Build and SIGN with Admin keypair
        const builtTxBytes = await tx.build({ client: suiClient });
        const { signature } = await adminKeypair.signTransaction(builtTxBytes);

        // ===== 🔍 CHECKPOINT A: Backend Final Build =====
        console.log('\n🔍 [CHECKPOINT A] Backend Final Build:');
        console.log('   - Gas Owner:', tx.getData().gasData.owner);
        console.log('   - Gas Payment Object:', JSON.stringify(tx.getData().gasData.payment));
        console.log('   - Gas Budget:', tx.getData().gasData.budget);
        console.log('   - Sender:', tx.getData().sender);
        console.log('   - Bytes Length:', builtTxBytes.length);
        console.log('   - Signature Length:', signature.length);
        // =================================================

        console.log('✅ Admin signed transaction');

        // Calculate WALRUS amount
        const walrusAmount = amountUsdc * config.usdcToWalrusRate;
        console.log(`✅ Sponsor TX ready. WALRUS: ${walrusAmount}`);

        // Step 7: Return { bytes, signature } - EXACT field names frontend expects
        res.json({
            bytes: Buffer.from(builtTxBytes).toString('base64'),
            signature: signature,
            walrusAmount,
        });

    } catch (error) {
        console.error('❌ Sponsor error:', error);
        res.status(500).json({
            error: 'Sponsorship failed',
            details: String(error)
        });
    }
});

/**
 * POST /api/sponsor-gas
 * 
 * Offline Signing Flow for Get Gas operation
 * Same flow as /api/sponsor
 */
app.post('/api/sponsor-gas', async (req: Request, res: Response) => {
    try {
        const { txBytes, userAddress } = req.body;

        if (!txBytes || !userAddress) {
            return res.status(400).json({
                error: 'Invalid input: txBytes and userAddress required'
            });
        }

        console.log(`\n⛽ SPONSOR-GAS Request from ${userAddress}`);

        // Decode TransactionKind bytes
        const kindBytes = Buffer.from(txBytes, 'base64');

        // Reconstruct Transaction from Kind
        const tx = Transaction.fromKind(kindBytes);

        // Set Sender (User)
        tx.setSender(userAddress);

        // Set Gas Owner (Admin/Sponsor)
        tx.setGasOwner(ADMIN_ADDRESS);

        // Get Admin's SUI coins for gas payment
        const adminSuiCoins = await getCoins(suiClient, ADMIN_ADDRESS, config.suiType);
        if (adminSuiCoins.length === 0) {
            return res.status(500).json({
                error: 'Admin has no SUI for gas sponsorship'
            });
        }

        tx.setGasPayment([{
            objectId: adminSuiCoins[0].coinObjectId,
            version: adminSuiCoins[0].version,
            digest: adminSuiCoins[0].digest,
        }]);

        // Set Gas Budget
        tx.setGasBudget(BigInt(50_000_000));

        // Build and Sign
        const builtTxBytes = await tx.build({ client: suiClient });
        const { signature } = await adminKeypair.signTransaction(builtTxBytes);

        console.log('✅ Sponsor-Gas TX ready');

        // Return with EXACT field names frontend expects
        res.json({
            bytes: Buffer.from(builtTxBytes).toString('base64'),
            signature: signature,
            suiAmount: config.getGasAmountSui,
        });

    } catch (error) {
        console.error('❌ Sponsor-Gas error:', error);
        res.status(500).json({
            error: 'Sponsorship failed',
            details: String(error)
        });
    }
});

/**
 * POST /api/swap
 * 
 * Build a sponsored transaction for atomic swap via smart contract
 * Token is NOT sent until user signs and transaction is executed
 * 
 * Flow:
 * 1. Build PTB that calls pool::swap_usdc_for_walrus
 * 2. Admin sponsors the gas
 * 3. User signs and executes
 * 4. Swap happens atomically in one transaction
 */
app.post('/api/swap', async (req: Request, res: Response) => {
    try {
        const { userAddress, amountUsdc, isGasless } = req.body as SwapRequest;

        if (!userAddress || typeof amountUsdc !== 'number' || amountUsdc <= 0) {
            return res.status(400).json({ error: 'Invalid input: userAddress and amountUsdc required' });
        }

        if (POOL_OBJECT_ID === '0x0') {
            return res.status(500).json({
                error: 'Pool not configured. Deploy contract and set POOL_OBJECT_ID in .env'
            });
        }

        console.log(`\n🔄 SWAP Request: ${amountUsdc} USDC -> WALRUS for ${userAddress}`);
        console.log(`   Gasless: ${isGasless}`);

        // Calculate amounts
        const walrusAmount = amountUsdc * config.usdcToWalrusRate;
        const usdcInSmallest = toSmallestUnits(amountUsdc, config.usdcDecimals);

        // Get gas cost estimate
        let gasCostUsdc = 0;
        if (isGasless) {
            const gasEstimate = await estimateGasCostInUsdc(suiClient);
            gasCostUsdc = gasEstimate.gasCostUsdc * 1.5;
        }

        // Check user has enough USDC
        const userUsdcBalance = await getBalance(suiClient, userAddress, config.usdcType);
        if (userUsdcBalance < usdcInSmallest) {
            return res.status(400).json({
                error: 'Insufficient USDC balance',
                required: amountUsdc,
                available: fromSmallestUnits(userUsdcBalance, config.usdcDecimals),
            });
        }

        // Get user's USDC coins
        const userUsdcCoins = await getCoins(suiClient, userAddress, config.usdcType);
        if (userUsdcCoins.length === 0) {
            return res.status(400).json({ error: 'User has no USDC coins' });
        }

        // Build the transaction
        const tx = new Transaction();
        tx.setSender(userAddress);

        // Merge user's USDC if needed
        if (userUsdcCoins.length > 1) {
            const primaryUsdc = tx.object(userUsdcCoins[0].coinObjectId);
            const usdcToMerge = userUsdcCoins.slice(1).map(c => tx.object(c.coinObjectId));
            tx.mergeCoins(primaryUsdc, usdcToMerge);
        }

        // Split exact USDC amount for the swap
        const [usdcForSwap] = tx.splitCoins(
            tx.object(userUsdcCoins[0].coinObjectId),
            [tx.pure.u64(usdcInSmallest)]
        );

        // Call the swap function on the pool contract
        tx.moveCall({
            target: `${PACKAGE_ID}::pool::swap_usdc_for_walrus`,
            arguments: [
                tx.object(POOL_OBJECT_ID),  // pool: &mut Pool
                usdcForSwap,                 // usdc_payment: Coin<USDC>
            ],
        });

        // ===== GAS SPONSORSHIP =====
        if (isGasless) {
            // Admin sponsors the gas
            const adminSuiCoins = await getCoins(suiClient, ADMIN_ADDRESS, config.suiType);
            if (adminSuiCoins.length === 0) {
                return res.status(500).json({ error: 'Admin has no SUI for gas sponsorship' });
            }

            tx.setGasPayment([{
                objectId: adminSuiCoins[0].coinObjectId,
                version: adminSuiCoins[0].version,
                digest: adminSuiCoins[0].digest,
            }]);
            tx.setGasOwner(ADMIN_ADDRESS);
        }

        const { gasBudget } = await estimateGasCostInUsdc(suiClient);
        tx.setGasBudget(gasBudget);

        // Build the transaction
        const txBytes = await tx.build({ client: suiClient });

        // If gasless, admin signs as gas sponsor
        let sponsorSignature = '';
        if (isGasless) {
            const sig = await adminKeypair.signTransaction(txBytes);
            sponsorSignature = sig.signature;
        }

        console.log(`✅ Swap TX built. WALRUS: ${walrusAmount}, Gasless: ${isGasless}`);

        const response: SponsoredTxResponse = {
            txBytes: Buffer.from(txBytes).toString('base64'),
            signature: sponsorSignature,
            walrusAmount,
            estimatedGasCostUsdc: gasCostUsdc,
            totalUsdcCost: amountUsdc + gasCostUsdc,
        };

        res.json(response);

    } catch (error) {
        console.error('❌ Swap error:', error);
        res.status(500).json({ error: 'Swap failed', details: String(error) });
    }
});

/**
 * POST /api/get-gas
 * 
 * Build a sponsored transaction for getting gas via smart contract
 */
app.post('/api/get-gas', async (req: Request, res: Response) => {
    try {
        const { userAddress } = req.body as GetGasRequest;

        if (!userAddress) {
            return res.status(400).json({ error: 'userAddress is required' });
        }

        if (POOL_OBJECT_ID === '0x0') {
            return res.status(500).json({
                error: 'Pool not configured. Deploy contract and set POOL_OBJECT_ID in .env'
            });
        }

        console.log(`\n⛽ GET GAS Request for ${userAddress}`);

        // Get current prices
        const suiPrice = await getSuiPrice();
        const { gasCostUsdc, gasBudget } = await estimateGasCostInUsdc(suiClient);

        const suiAmount = config.getGasAmountSui;
        const suiCostUsdc = suiAmount * suiPrice;
        const totalCostUsdc = suiCostUsdc + (gasCostUsdc * 1.5);
        const usdcInSmallest = toSmallestUnits(totalCostUsdc, config.usdcDecimals);

        // Convert SUI price to micro USDC (6 decimals) for contract
        const suiPriceInMicroUsdc = Math.floor(suiPrice * 1_000_000);

        console.log(`   SUI Price: $${suiPrice}, Total Cost: $${totalCostUsdc.toFixed(4)}`);

        // Check user has enough USDC
        const userUsdcBalance = await getBalance(suiClient, userAddress, config.usdcType);
        if (userUsdcBalance < usdcInSmallest) {
            return res.status(400).json({
                error: 'Insufficient USDC balance',
                required: totalCostUsdc,
                available: fromSmallestUnits(userUsdcBalance, config.usdcDecimals),
            });
        }

        // Get user's USDC coins
        const userUsdcCoins = await getCoins(suiClient, userAddress, config.usdcType);
        if (userUsdcCoins.length === 0) {
            return res.status(400).json({ error: 'User has no USDC coins' });
        }

        // Build the transaction
        const tx = new Transaction();
        tx.setSender(userAddress);

        // Merge user's USDC if needed
        if (userUsdcCoins.length > 1) {
            const primaryUsdc = tx.object(userUsdcCoins[0].coinObjectId);
            const usdcToMerge = userUsdcCoins.slice(1).map(c => tx.object(c.coinObjectId));
            tx.mergeCoins(primaryUsdc, usdcToMerge);
        }

        // Split exact USDC amount
        const [usdcPayment] = tx.splitCoins(
            tx.object(userUsdcCoins[0].coinObjectId),
            [tx.pure.u64(usdcInSmallest)]
        );

        // Call the get_gas function on the pool contract
        tx.moveCall({
            target: `${PACKAGE_ID}::pool::get_gas`,
            arguments: [
                tx.object(POOL_OBJECT_ID),          // pool: &mut Pool
                usdcPayment,                         // usdc_payment: Coin<USDC>
                tx.pure.u64(suiPriceInMicroUsdc),   // sui_price_in_usdc_micro: u64
            ],
        });

        // Admin sponsors the gas (user has 0 SUI)
        const adminSuiCoins = await getCoins(suiClient, ADMIN_ADDRESS, config.suiType);
        if (adminSuiCoins.length === 0) {
            return res.status(500).json({ error: 'Admin has no SUI for gas sponsorship' });
        }

        tx.setGasPayment([{
            objectId: adminSuiCoins[0].coinObjectId,
            version: adminSuiCoins[0].version,
            digest: adminSuiCoins[0].digest,
        }]);
        tx.setGasOwner(ADMIN_ADDRESS);
        tx.setGasBudget(gasBudget);

        // Build and sign as sponsor
        const txBytes = await tx.build({ client: suiClient });
        const sponsorSig = await adminKeypair.signTransaction(txBytes);

        console.log(`✅ Get Gas TX built. SUI: ${suiAmount}, Cost: $${totalCostUsdc.toFixed(4)}`);

        const response: SponsoredTxResponse = {
            txBytes: Buffer.from(txBytes).toString('base64'),
            signature: sponsorSig.signature,
            suiAmount,
            totalUsdcCost: totalCostUsdc,
        };

        res.json(response);

    } catch (error) {
        console.error('❌ Get Gas error:', error);
        res.status(500).json({ error: 'Get Gas failed', details: String(error) });
    }
});

// ============================================
// FAUCET ENDPOINT
// ============================================

interface FaucetRequest {
    token: 'USDC' | 'WALRUS';
    recipient: string;
}

/**
 * POST /api/faucet
 * 
 * Mint test tokens to user wallet
 * - USDC: 500 tokens
 * - WALRUS: 5000 tokens
 */
app.post('/api/faucet', async (req: Request, res: Response) => {
    try {
        const { token, recipient } = req.body as FaucetRequest;

        if (!token || !recipient) {
            return res.status(400).json({ error: 'token and recipient are required' });
        }

        if (token !== 'USDC' && token !== 'WALRUS') {
            return res.status(400).json({ error: 'token must be USDC or WALRUS' });
        }

        console.log(`\n🚰 FAUCET Request: ${token} -> ${recipient}`);

        // Load Treasury Caps from env
        const USDC_TREASURY_CAP = process.env.USDC_TREASURY_CAP;
        const WALRUS_TREASURY_CAP = process.env.WALRUS_TREASURY_CAP;

        if (!USDC_TREASURY_CAP || !WALRUS_TREASURY_CAP) {
            return res.status(500).json({
                error: 'Treasury caps not configured. Set USDC_TREASURY_CAP and WALRUS_TREASURY_CAP in .env'
            });
        }

        // Determine amounts and types
        const isUsdc = token === 'USDC';
        const treasuryCapId = isUsdc ? USDC_TREASURY_CAP : WALRUS_TREASURY_CAP;
        const tokenType = isUsdc ? config.usdcType : config.walrusType;
        const decimals = isUsdc ? config.usdcDecimals : config.walrusDecimals;
        const amount = isUsdc ? 500 : 5000; // 500 USDC or 5000 WALRUS
        const amountSmallest = toSmallestUnits(amount, decimals);

        console.log(`   Token Type: ${tokenType}`);
        console.log(`   Treasury Cap: ${treasuryCapId}`);
        console.log(`   Amount: ${amount} ${token}`);

        // Build transaction
        const tx = new Transaction();

        tx.moveCall({
            target: '0x2::coin::mint_and_transfer',
            typeArguments: [tokenType],
            arguments: [
                tx.object(treasuryCapId),
                tx.pure.u64(amountSmallest),
                tx.pure.address(recipient),
            ],
        });

        tx.setGasBudget(50_000_000);

        // Sign and execute with admin keypair
        const result = await suiClient.signAndExecuteTransaction({
            transaction: tx,
            signer: adminKeypair,
            options: { showEffects: true },
        });

        if (result.effects?.status?.status !== 'success') {
            console.error('❌ Faucet TX failed:', result.effects?.status?.error);
            return res.status(500).json({
                error: 'Mint failed',
                details: result.effects?.status?.error
            });
        }

        console.log(`✅ Minted ${amount} ${token} to ${recipient}`);
        console.log(`   Digest: ${result.digest}`);

        res.json({
            success: true,
            token,
            amount,
            recipient,
            digest: result.digest,
        });

    } catch (error) {
        console.error('❌ Faucet error:', error);
        res.status(500).json({ error: 'Faucet failed', details: String(error) });
    }
});

// ============================================
// ERROR HANDLING
// ============================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
});

// ============================================
// START SERVER
// ============================================

app.listen(config.port, () => {
    console.log(`
  🚀 Gasless DEX Backend Running!
  ================================
  Port: ${config.port}
  RPC: ${config.rpcUrl}
  Pool Wallet: ${ADMIN_ADDRESS}
  
  Smart Contract Config:
  - Package ID: ${PACKAGE_ID}
  - Pool Object: ${POOL_OBJECT_ID}
  
  ⚠️  Make sure to:
  1. Deploy the contract: sui client publish
  2. Call create_pool function
  3. Update PACKAGE_ID and POOL_OBJECT_ID in .env
  4. Deposit WALRUS and SUI into the pool
  
  Endpoints:
  - GET  /api/health       - Health check & config
  - GET  /api/prices       - Current prices & rates
  - POST /api/sponsor      - Sponsor swap transactions
  - POST /api/sponsor-gas  - Sponsor get-gas transactions
  - POST /api/faucet       - Mint test tokens (NEW!)
  - POST /api/swap         - Legacy swap endpoint
  - POST /api/get-gas      - Legacy get-gas endpoint
  ================================
  `);
});
