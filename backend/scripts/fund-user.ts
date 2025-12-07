import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import dotenv from 'dotenv';

dotenv.config();

// SENİN CÜZDANIN
const TARGET_USER = '0x55d4d4cafbe4e82dcf4e2413233afd72196513d1bc8974e49786f828ca6cd712';

// GÖNDERİLECEK MİKTARLAR
const MINT_USDC_AMOUNT = 500 * 1_000_000;       // 500 USDC
const MINT_WALRUS_AMOUNT = 5000 * 1_000_000_000; // 5000 WALRUS
const SEND_SUI_AMOUNT = 0.5 * 1_000_000_000;    // 0.5 SUI (Admin'i batırmamak için az tutuyoruz)

async function main() {
  console.log('🎁 FINAL FUNDING SCRIPT FOR USER');
  console.log('================================');
  console.log(`👤 Target User: ${TARGET_USER}`);

  const client = new SuiClient({ url: getFullnodeUrl('testnet') });
  const keypair = Ed25519Keypair.fromSecretKey(process.env.ADMIN_PRIVATE_KEY!);
  const adminAddr = keypair.toSuiAddress();

  const PACKAGE_ID = process.env.PACKAGE_ID;
  const USDC_TYPE = process.env.USDC_TYPE;
  const WALRUS_TYPE = process.env.WALRUS_TYPE;
  const USDC_CAP = process.env.USDC_TREASURY_CAP;
  const WALRUS_CAP = process.env.WALRUS_TREASURY_CAP;

  if (!USDC_CAP || !WALRUS_CAP) {
    throw new Error("TreasuryCaps missing in .env! Run setup-pool.ts first.");
  }

  const tx = new Transaction();

  // 1. MINT USDC DIRECTLY TO USER
  console.log('🔹 Minting 500 USDC...');
  tx.moveCall({
    target: '0x2::coin::mint_and_transfer',
    typeArguments: [USDC_TYPE!],
    arguments: [
      tx.object(USDC_CAP),
      tx.pure.u64(MINT_USDC_AMOUNT),
      tx.pure.address(TARGET_USER),
    ],
  });

  // 2. MINT WALRUS DIRECTLY TO USER
  console.log('🔹 Minting 5000 WALRUS...');
  tx.moveCall({
    target: '0x2::coin::mint_and_transfer',
    typeArguments: [WALRUS_TYPE!],
    arguments: [
      tx.object(WALRUS_CAP),
      tx.pure.u64(MINT_WALRUS_AMOUNT),
      tx.pure.address(TARGET_USER),
    ],
  });

  // 3. TRANSFER SUI (Admin'den User'a)
  // Admin'de SUI var mı diye basit bir kontrol yapalım, yoksa script patlamasın.
  try {
      const balance = await client.getBalance({ owner: adminAddr });
      if (Number(balance.totalBalance) > SEND_SUI_AMOUNT + 50000000) { // Gas payı bırak
          console.log('🔹 Sending 0.5 SUI...');
          const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(SEND_SUI_AMOUNT)]);
          tx.transferObjects([suiCoin], TARGET_USER);
      } else {
          console.warn('⚠️ Admin has low SUI balance! Skipping SUI transfer to prevent failure.');
          console.warn('👉 User should use Discord Faucet for SUI.');
      }
  } catch (e) {
      console.warn('⚠️ Could not check Admin balance, attempting transaction anyway...');
  }

  // EXECUTE
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true }
  });

  if (result.effects?.status?.status === 'success') {
      console.log(`\n🎉 SUCCESS! Care Package Sent.`);
      console.log(`   Digest: ${result.digest}`);
  } else {
      console.error(`❌ FAILED: ${result.effects?.status?.error}`);
  }
}

main().catch(console.error);