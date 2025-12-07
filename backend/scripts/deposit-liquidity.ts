/**
 * Deposit Liquidity Script
 * 
 * This script deposits WALRUS and SUI into the Pool for the Gasless DEX.
 * It automatically finds the AdminCap and WALRUS coins.
 * 
 * Usage:
 *   npx tsx scripts/deposit-liquidity.ts
 * 
 * Environment:
 *   ADMIN_PRIVATE_KEY - Admin wallet private key (suiprivkey1...)
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

// ============================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================

const CONFIG = {
    // Network
    RPC_URL: process.env.RPC_URL || getFullnodeUrl('testnet'),

    // Admin private key
    ADMIN_PRIVATE_KEY: process.env.ADMIN_PRIVATE_KEY || '',

    // Package ID from deployment
    PACKAGE_ID: process.env.PACKAGE_ID || '0xbeaeeaa7cbf79a5cdb128a3589c9c0835d8812a59f41a3e8d53fe1e859875bbd',

    // Pool object ID from create_pool transaction
    POOL_OBJECT_ID: process.env.POOL_OBJECT_ID || '0x057b75db3da2e6278f6fc8135a97ff5590ac612b1a001d58d5ca4b4cf7acc28c',

    // Amount to deposit (in smallest units)
    // WALRUS has 9 decimals: 100,000 WALRUS = 100_000_000_000_000
    WALRUS_DEPOSIT_AMOUNT: BigInt(process.env.WALRUS_AMOUNT || '100000000000000'),

    // SUI has 9 decimals: 1 SUI = 1_000_000_000
    SUI_DEPOSIT_AMOUNT: BigInt(process.env.SUI_AMOUNT || '500000000'), // 0.5 SUI
};

// Type constants
const WALRUS_TYPE = `${CONFIG.PACKAGE_ID}::walrus::WALRUS`;
const ADMIN_CAP_TYPE = `${CONFIG.PACKAGE_ID}::pool::AdminCap`;

// ============================================
// MAIN SCRIPT
// ============================================

async function main() {
    console.log('🚀 Gasless DEX - Deposit Liquidity Script\n');
    console.log('='.repeat(50));

    // Validate config
    if (!CONFIG.ADMIN_PRIVATE_KEY) {
        throw new Error('ADMIN_PRIVATE_KEY environment variable is required');
    }

    // Initialize client and keypair
    const client = new SuiClient({ url: CONFIG.RPC_URL });
    const { secretKey } = decodeSuiPrivateKey(CONFIG.ADMIN_PRIVATE_KEY);
    const keypair = Ed25519Keypair.fromSecretKey(secretKey);
    const adminAddress = keypair.getPublicKey().toSuiAddress();

    console.log(`\n📍 Admin Address: ${adminAddress}`);
    console.log(`📦 Package ID: ${CONFIG.PACKAGE_ID}`);
    console.log(`🏊 Pool Object: ${CONFIG.POOL_OBJECT_ID}`);

    // ===== STEP 1: Find AdminCap =====
    console.log('\n🔍 Step 1: Finding AdminCap...');

    const adminCapId = await findAdminCap(client, adminAddress);
    if (!adminCapId) {
        throw new Error(`AdminCap not found for ${adminAddress}. Did you run create_pool?`);
    }
    console.log(`   ✅ AdminCap found: ${adminCapId}`);

    // ===== STEP 2: Find WALRUS coins =====
    console.log('\n🔍 Step 2: Finding WALRUS coins...');

    const walrusCoins = await findCoins(client, adminAddress, WALRUS_TYPE);
    if (walrusCoins.length === 0) {
        throw new Error('No WALRUS coins found. Did you mint WALRUS tokens?');
    }

    const totalWalrus = walrusCoins.reduce((sum, c) => sum + BigInt(c.balance), BigInt(0));
    console.log(`   ✅ Found ${walrusCoins.length} WALRUS coin(s)`);
    console.log(`   💰 Total WALRUS: ${formatAmount(totalWalrus, 9)} WALRUS`);

    // ===== STEP 3: Find SUI coins =====
    console.log('\n🔍 Step 3: Finding SUI coins...');

    const suiCoins = await findCoins(client, adminAddress, '0x2::sui::SUI');
    const totalSui = suiCoins.reduce((sum, c) => sum + BigInt(c.balance), BigInt(0));
    console.log(`   ✅ Found ${suiCoins.length} SUI coin(s)`);
    console.log(`   💰 Total SUI: ${formatAmount(totalSui, 9)} SUI`);

    // ===== STEP 4: Deposit WALRUS =====
    console.log('\n📤 Step 4: Depositing WALRUS...');

    if (totalWalrus < CONFIG.WALRUS_DEPOSIT_AMOUNT) {
        throw new Error(`Insufficient WALRUS. Have: ${totalWalrus}, Need: ${CONFIG.WALRUS_DEPOSIT_AMOUNT}`);
    }

    const walrusResult = await depositWalrus(
        client,
        keypair,
        adminCapId,
        walrusCoins,
        CONFIG.WALRUS_DEPOSIT_AMOUNT
    );
    console.log(`   ✅ WALRUS deposited! TX: ${walrusResult}`);

    // ===== STEP 5: Deposit SUI (optional) =====
    if (CONFIG.SUI_DEPOSIT_AMOUNT > 0 && totalSui > CONFIG.SUI_DEPOSIT_AMOUNT + BigInt(100_000_000)) {
        console.log('\n📤 Step 5: Depositing SUI...');

        // Refresh SUI coins after previous tx
        const freshSuiCoins = await findCoins(client, adminAddress, '0x2::sui::SUI');

        const suiResult = await depositSui(
            client,
            keypair,
            adminCapId,
            freshSuiCoins,
            CONFIG.SUI_DEPOSIT_AMOUNT
        );
        console.log(`   ✅ SUI deposited! TX: ${suiResult}`);
    } else {
        console.log('\n⏭️  Step 5: Skipping SUI deposit (insufficient balance or amount is 0)');
    }

    // ===== STEP 6: Verify Pool Balances =====
    console.log('\n🔍 Step 6: Verifying Pool Balances...');

    const poolObject = await client.getObject({
        id: CONFIG.POOL_OBJECT_ID,
        options: { showContent: true },
    });

    if (poolObject.data?.content?.dataType === 'moveObject') {
        const fields = poolObject.data.content.fields as any;
        console.log(`   🏊 Pool Balances:`);
        console.log(`      WALRUS: ${formatAmount(BigInt(fields.walrus_balance || 0), 9)}`);
        console.log(`      SUI:    ${formatAmount(BigInt(fields.sui_balance || 0), 9)}`);
        console.log(`      USDC:   ${formatAmount(BigInt(fields.usdc_balance || 0), 6)}`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ Liquidity deposit complete!');
    console.log('='.repeat(50));
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Find the AdminCap object for the given address
 */
async function findAdminCap(client: SuiClient, address: string): Promise<string | null> {
    let cursor: string | null = null;

    do {
        const objects = await client.getOwnedObjects({
            owner: address,
            filter: {
                StructType: ADMIN_CAP_TYPE,
            },
            options: {
                showType: true,
            },
            cursor: cursor ?? undefined,
        });

        if (objects.data.length > 0) {
            return objects.data[0].data?.objectId ?? null;
        }

        cursor = objects.nextCursor ?? null;
    } while (cursor);

    return null;
}

/**
 * Find all coins of a specific type for an address
 */
async function findCoins(client: SuiClient, address: string, coinType: string) {
    const coins: { coinObjectId: string; balance: string; version: string; digest: string }[] = [];
    let cursor: string | null = null;

    do {
        const response = await client.getCoins({
            owner: address,
            coinType,
            cursor: cursor ?? undefined,
        });

        coins.push(...response.data.map(c => ({
            coinObjectId: c.coinObjectId,
            balance: c.balance,
            version: c.version,
            digest: c.digest,
        })));

        cursor = response.nextCursor ?? null;
    } while (cursor);

    return coins;
}

/**
 * Deposit WALRUS into the pool
 */
async function depositWalrus(
    client: SuiClient,
    keypair: Ed25519Keypair,
    adminCapId: string,
    walrusCoins: { coinObjectId: string; balance: string }[],
    amount: bigint
): Promise<string> {
    const tx = new Transaction();

    // If we have multiple coins, we need to merge them first
    if (walrusCoins.length > 1) {
        const primaryCoin = tx.object(walrusCoins[0].coinObjectId);
        const coinsToMerge = walrusCoins.slice(1).map(c => tx.object(c.coinObjectId));
        tx.mergeCoins(primaryCoin, coinsToMerge);
    }

    // Check if we need to split (deposit partial amount)
    const totalBalance = walrusCoins.reduce((sum, c) => sum + BigInt(c.balance), BigInt(0));

    let walrusCoin;
    if (totalBalance > amount) {
        // Split the exact amount we want to deposit
        const [splitCoin] = tx.splitCoins(
            tx.object(walrusCoins[0].coinObjectId),
            [tx.pure.u64(amount)]
        );
        walrusCoin = splitCoin;
    } else {
        // Deposit the entire coin
        walrusCoin = tx.object(walrusCoins[0].coinObjectId);
    }

    // Call deposit_walrus(pool, admin_cap, walrus_coin)
    tx.moveCall({
        target: `${CONFIG.PACKAGE_ID}::pool::deposit_walrus`,
        arguments: [
            tx.object(CONFIG.POOL_OBJECT_ID),  // pool: &mut Pool
            tx.object(adminCapId),              // admin_cap: &AdminCap
            walrusCoin,                          // walrus: Coin<WALRUS>
        ],
    });

    const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
            showEffects: true,
        },
    });

    if (result.effects?.status?.status !== 'success') {
        throw new Error(`Deposit failed: ${result.effects?.status?.error}`);
    }

    return result.digest;
}

/**
 * Deposit SUI into the pool
 */
async function depositSui(
    client: SuiClient,
    keypair: Ed25519Keypair,
    adminCapId: string,
    suiCoins: { coinObjectId: string; balance: string }[],
    amount: bigint
): Promise<string> {
    const tx = new Transaction();

    // For SUI, we should use tx.gas to split from gas coin
    // This is safer than manually selecting coins
    const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);

    // Call deposit_sui(pool, admin_cap, sui_coin)
    tx.moveCall({
        target: `${CONFIG.PACKAGE_ID}::pool::deposit_sui`,
        arguments: [
            tx.object(CONFIG.POOL_OBJECT_ID),  // pool: &mut Pool
            tx.object(adminCapId),              // admin_cap: &AdminCap
            suiCoin,                             // sui: Coin<SUI>
        ],
    });

    const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
            showEffects: true,
        },
    });

    if (result.effects?.status?.status !== 'success') {
        throw new Error(`Deposit failed: ${result.effects?.status?.error}`);
    }

    return result.digest;
}

/**
 * Format amount with decimals
 */
function formatAmount(amount: bigint, decimals: number): string {
    const divisor = BigInt(10 ** decimals);
    const whole = amount / divisor;
    const fraction = amount % divisor;
    const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 4);
    return `${whole}.${fractionStr}`;
}

// Run the script
main().catch((error) => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
});
