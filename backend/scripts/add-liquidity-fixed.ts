import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import dotenv from 'dotenv';

dotenv.config();

// SENİN VERDİĞİN POOL ID (Elle yazdık, hata veremez)
const POOL_ID = '0x7d24ac938049d30410d24158cd630bc77bc755b6260ccd479397e9cad65083c6';

async function main() {
  const client = new SuiClient({ url: getFullnodeUrl('testnet') });
  const keypair = Ed25519Keypair.fromSecretKey(process.env.ADMIN_PRIVATE_KEY!);
  const PACKAGE_ID = process.env.PACKAGE_ID;
  const USDC_TYPE = process.env.USDC_TYPE;

  if (!PACKAGE_ID || !USDC_TYPE) {
    throw new Error("Lütfen backend/.env dosyasında PACKAGE_ID ve USDC_TYPE olduğundan emin ol!");
  }

  // Havuza eklenecek miktar: 500,000 USDC
  const DEPOSIT_AMOUNT = 500_000 * 1_000_000; 

  console.log('🔍 Finding USDC to deposit...');
  
  const coins = await client.getCoins({
    owner: keypair.toSuiAddress(),
    coinType: USDC_TYPE
  });

  if (coins.data.length === 0) {
    throw new Error("Admin has no USDC! Run mint-usdc.ts first.");
  }

  const tx = new Transaction();

  // Coin'i ayır (Split)
  const [coinToDeposit] = tx.splitCoins(
    tx.object(coins.data[0].coinObjectId), 
    [tx.pure.u64(DEPOSIT_AMOUNT)]
  );

  console.log('🏊 Depositing USDC to Pool...');
  console.log(`Target: ${PACKAGE_ID}::pool::deposit`);
  console.log(`Pool ID: ${POOL_ID}`);

  // Move Call: pool::deposit
  tx.moveCall({
    target: `${PACKAGE_ID}::pool::deposit`, 
    typeArguments: [USDC_TYPE],
    arguments: [
      tx.object(POOL_ID), // ID'yi direkt buradan alıyor
      coinToDeposit,
    ]
  });

  tx.setGasBudget(100_000_000);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true }
  });

  console.log(`✅ USDC Liquidity Added! Digest: ${result.digest}`);
}

main().catch(console.error);