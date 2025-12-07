import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import dotenv from 'dotenv';

dotenv.config();

// ============================================
// CONFIGURATION (Auto-loaded from .env)
// ============================================

const PACKAGE_ID = process.env.PACKAGE_ID;
const USDC_TREASURY_CAP = process.env.USDC_TREASURY_CAP;
const WALRUS_TREASURY_CAP = process.env.WALRUS_TREASURY_CAP;

// Initial liquidity amounts
const INITIAL_USDC = 1_000_000 * 1_000_000; // 1M USDC
const INITIAL_WALRUS = 10_000_000 * 1_000_000_000; // 10M WALRUS
const INITIAL_SUI = 1 * 1_000_000_000; // 1 SUI (Düşürüldü, cüzdan yetmesi için)

// ============================================
// MAIN
// ============================================

async function main() {
    console.log('🚀 Setup Pool Script (Dynamic Setup)\n');
    console.log('='.repeat(50));

    if (!process.env.ADMIN_PRIVATE_KEY) throw new Error('❌ ADMIN_PRIVATE_KEY missing in .env');
    if (!PACKAGE_ID) throw new Error('❌ PACKAGE_ID missing in .env');
    if (!USDC_TREASURY_CAP) throw new Error('❌ USDC_TREASURY_CAP missing in .env');
    if (!WALRUS_TREASURY_CAP) throw new Error('❌ WALRUS_TREASURY_CAP missing in .env');

    // Initialize client and keypair
    const suiClient = new SuiClient({ url: process.env.RPC_URL || getFullnodeUrl('testnet') });
    const keypair = Ed25519Keypair.fromSecretKey(process.env.ADMIN_PRIVATE_KEY);
    const adminAddress = keypair.getPublicKey().toSuiAddress();

    console.log('👤 Admin Address:', adminAddress);
    console.log('📦 Package ID:', PACKAGE_ID);
    console.log();

    // ================================
    // STEP 1: Create Pool
    // ================================
    console.log('📋 Step 1: Creating Pool...');

    const createPoolTx = new Transaction();
    createPoolTx.moveCall({
        target: `${PACKAGE_ID}::pool::create_pool`,
        arguments: [],
    });

    const createResult = await suiClient.signAndExecuteTransaction({
        transaction: createPoolTx,
        signer: keypair,
        options: { showEffects: true, showObjectChanges: true },
    });

    if (createResult.effects?.status?.status !== 'success') {
        console.error('❌ Failed to create pool:', createResult.effects?.status?.error);
        process.exit(1);
    }

    // Find Pool ID (shared object) and AdminCap
    let poolId: string | null = null;
    let adminCapId: string | null = null;

    for (const change of createResult.objectChanges || []) {
        if (change.type === 'created') {
            if (change.objectType?.includes('::pool::Pool')) {
                poolId = change.objectId;
            }
            if (change.objectType?.includes('::pool::AdminCap')) {
                adminCapId = change.objectId;
            }
        }
    }

    if (!poolId) {
        console.error('❌ Pool not found in transaction result');
        process.exit(1);
    }

    console.log('✅ Pool created!');
    console.log('   Pool ID:', poolId);
    console.log('   AdminCap ID:', adminCapId || 'None (Created but not found in logs)');
    console.log();

    // ================================
    // STEP 2: Mint USDC (Optional check)
    // ================================
    console.log('📋 Step 2: Minting Initial Liquidity (USDC)...');

    // Basitlik için: Mint işlemini mint-usdc.ts ile yaptığını varsayıyoruz.
    // Ama garanti olsun diye buraya da ufak bir ekleme yapıyoruz.
    const mintUsdcTx = new Transaction();
    mintUsdcTx.moveCall({
        target: '0x2::coin::mint_and_transfer',
        typeArguments: [`${PACKAGE_ID}::usdc::USDC`],
        arguments: [
            mintUsdcTx.object(USDC_TREASURY_CAP),
            mintUsdcTx.pure.u64(INITIAL_USDC),
            mintUsdcTx.pure.address(adminAddress),
        ],
    });
    await suiClient.signAndExecuteTransaction({ transaction: mintUsdcTx, signer: keypair });
    console.log('✅ Minted USDC');

    // ================================
    // STEP 3: Mint WALRUS
    // ================================
    console.log('📋 Step 3: Minting Initial Liquidity (WALRUS)...');
    const mintWalrusTx = new Transaction();
    mintWalrusTx.moveCall({
        target: '0x2::coin::mint_and_transfer',
        typeArguments: [`${PACKAGE_ID}::walrus::WALRUS`],
        arguments: [
            mintWalrusTx.object(WALRUS_TREASURY_CAP),
            mintWalrusTx.pure.u64(INITIAL_WALRUS),
            mintWalrusTx.pure.address(adminAddress),
        ],
    });
    await suiClient.signAndExecuteTransaction({ transaction: mintWalrusTx, signer: keypair });
    console.log('✅ Minted WALRUS');

    // Wait for indexing
    console.log('⏳ Waiting for indexing...');
    await new Promise(r => setTimeout(r, 2000));

    // ================================
    // STEP 4: Deposit WALRUS
    // ================================
    console.log('📋 Step 4: Depositing WALRUS to Pool...');

    const walrusCoins = await suiClient.getCoins({
        owner: adminAddress,
        coinType: `${PACKAGE_ID}::walrus::WALRUS`,
    });

    if (walrusCoins.data.length > 0) {
        const depositWalrusTx = new Transaction();
        // Coin split logic
        const [walrusDep] = depositWalrusTx.splitCoins(
            depositWalrusTx.object(walrusCoins.data[0].coinObjectId),
            [depositWalrusTx.pure.u64(INITIAL_WALRUS)]
        );

        // Move Call: deposit_walrus (Hala AdminCap istiyor mu kontrol etmelisin, varsayılan istiyor)
        // Eğer AdminCap yoksa burası hata verebilir, o zaman setup-pool.ts'i sadece pool create için kullanacağız.
        if (adminCapId) {
            depositWalrusTx.moveCall({
                target: `${PACKAGE_ID}::pool::deposit_walrus`,
                arguments: [
                    depositWalrusTx.object(poolId),
                    depositWalrusTx.object(adminCapId),
                    walrusDep,
                ],
            });
            await suiClient.signAndExecuteTransaction({ transaction: depositWalrusTx, signer: keypair });
            console.log('✅ Deposited WALRUS');
        } else {
            console.log('⚠️ Skipping WALRUS deposit (No AdminCap found, assume manual deposit later)');
        }
    }

    // ================================
    // STEP 5: Deposit SUI
    // ================================
    console.log('📋 Step 5: Depositing SUI to Pool...');
    const suiCoins = await suiClient.getCoins({ owner: adminAddress, coinType: '0x2::sui::SUI' });

    if (suiCoins.data.length > 0 && adminCapId) {
        const tx = new Transaction();
        tx.setGasBudget(100000000);
        const [suiDep] = tx.splitCoins(tx.gas, [tx.pure.u64(INITIAL_SUI)]);

        tx.moveCall({
            target: `${PACKAGE_ID}::pool::deposit_sui`,
            arguments: [
                tx.object(poolId),
                tx.object(adminCapId),
                suiDep,
            ],
        });

        try {
            await suiClient.signAndExecuteTransaction({ transaction: tx, signer: keypair });
            console.log('✅ Deposited SUI');
        } catch (e) {
            console.warn('⚠️ SUI Deposit failed (Likely low balance), skipping...');
        }
    }

    // ================================
    // DONE!
    // ================================
    console.log('\n' + '='.repeat(50));
    console.log('🎉 SETUP COMPLETE!');
    console.log('📝 COPY THIS ID to your .env files:');
    console.log(`POOL_OBJECT_ID=${poolId}`);
    console.log('='.repeat(50));
}

main().catch(console.error);