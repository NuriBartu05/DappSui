import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import dotenv from 'dotenv';

dotenv.config();

// SENİN CÜZDAN ADRESİN
const TARGET_USER = '0x55d4d4cafbe4e82dcf4e2413233afd72196513d1bc8974e49786f828ca6cd712';
const MINT_AMOUNT = 1000 * 1_000_000_000; // 1000 WALRUS

async function main() {
  const client = new SuiClient({ url: getFullnodeUrl('testnet') });
  const keypair = Ed25519Keypair.fromSecretKey(process.env.ADMIN_PRIVATE_KEY!);
  const adminAddr = keypair.toSuiAddress();

  console.log('🔍 Finding WALRUS TreasuryCap...');

  // Admin'in sahip olduğu objeleri tara ve WALRUS TreasuryCap'i bul
  const objects = await client.getOwnedObjects({
    owner: adminAddr,
    filter: { StructType: '0x2::coin::TreasuryCap' },
    options: { showType: true }
  });

  // WALRUS coin tipinin içindeki package ID'yi kullanarak doğru Cap'i bulmaya çalışıyoruz
  // WALRUS_TYPE genelde: PACKAGE_ID::walrus::WALRUS
  const walrusPackageId = process.env.WALRUS_TYPE?.split('::')[0];
  
  const treasuryCap = objects.data.find(obj => 
    obj.data?.type?.includes(walrusPackageId!) && 
    obj.data?.type?.includes('WALRUS')
  );

  if (!treasuryCap) {
    console.error("❌ Could not find WALRUS TreasuryCap in Admin wallet!");
    // Manuel olarak önceki loglardan bulduğun ID'yi buraya yazabilirsin gerekirse
    return;
  }

  console.log(`✅ Found TreasuryCap: ${treasuryCap.data?.objectId}`);
  console.log(`💸 Minting 1000 WALRUS to ${TARGET_USER}...`);

  const tx = new Transaction();

  tx.moveCall({
    target: '0x2::coin::mint_and_transfer',
    arguments: [
      tx.object(treasuryCap.data!.objectId),
      tx.pure.u64(MINT_AMOUNT),
      tx.pure.address(TARGET_USER),
    ],
    typeArguments: [process.env.WALRUS_TYPE!]
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });

  console.log(`🎉 Success! Digest: ${result.digest}`);
}

main().catch(console.error);