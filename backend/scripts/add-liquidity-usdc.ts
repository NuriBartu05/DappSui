import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
    console.log('🏦 Add USDC Liquidity to Pool (No AdminCap Version)');
    console.log('==================================================');

    const client = new SuiClient({ url: getFullnodeUrl('testnet') });
    const keypair = Ed25519Keypair.fromSecretKey(process.env.ADMIN_PRIVATE_KEY!);

    const PACKAGE_ID = process.env.PACKAGE_ID;
    const POOL_ID = process.env.POOL_OBJECT_ID || process.env.POOL_ID; // İkisini de kontrol et
    const USDC_TYPE = process.env.USDC_TYPE;

    if (!PACKAGE_ID || !POOL_ID || !USDC_TYPE) {
        throw new Error("Missing env variables (PACKAGE_ID, POOL_ID, USDC_TYPE)");
    }

    console.log(`👤 Admin: ${keypair.toSuiAddress()}`);
    console.log(`📦 Package: ${PACKAGE_ID}`);
    console.log(`🏊 Pool: ${POOL_ID}`);

    // 500,000 USDC yatıracağız
    const DEPOSIT_AMOUNT = 500_000 * 1_000_000;

    console.log('\n🔍 Finding USDC coins...');

    const coins = await client.getCoins({
        owner: keypair.toSuiAddress(),
        coinType: USDC_TYPE
    });

    if (coins.data.length === 0) {
        throw new Error("Admin has no USDC! Run 'npx tsx scripts/mint-usdc.ts' first.");
    }

    // Toplam bakiye kontrolü
    const totalBalance = coins.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
    console.log(`   Found ${coins.data.length} coins, Total Balance: ${Number(totalBalance) / 1000000} USDC`);

    if (totalBalance < BigInt(DEPOSIT_AMOUNT)) {
        throw new Error("Insufficient USDC Balance in Admin Wallet!");
    }

    const tx = new Transaction();

    // Coin'i ayır (Split) - İlk coin'den veya merged coin'den
    // Basitlik için ilk coin yeterliyse onu kullanıyoruz
    const [coinToDeposit] = tx.splitCoins(
        tx.object(coins.data[0].coinObjectId),
        [tx.pure.u64(DEPOSIT_AMOUNT)]
    );

    console.log('📝 Building deposit transaction...');

    // Move Call: deposit_usdc
    // Artık AdminCap İSTEMİYOR! Sadece Pool ve Coin.
    tx.moveCall({
        target: `${PACKAGE_ID}::pool::deposit_usdc`,
        arguments: [
            tx.object(POOL_ID), // Pool
            coinToDeposit,      // Coin
        ]
    });

    tx.setGasBudget(100_000_000);

    console.log('🚀 Executing transaction...');
    const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: { showEffects: true }
    });

    if (result.effects?.status?.status === 'success') {
        console.log(`✅ SUCCESS! USDC Liquidity Added.`);
        console.log(`   Digest: ${result.digest}`);
    } else {
        console.error(`❌ FAILED: ${result.effects?.status?.error}`);
    }
}

main().catch(console.error);