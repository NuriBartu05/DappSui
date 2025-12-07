import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import dotenv from 'dotenv';

dotenv.config();

const PACKAGE_ID = process.env.PACKAGE_ID;

async function main() {
    const client = new SuiClient({ url: getFullnodeUrl('testnet') });

    if (!process.env.ADMIN_PRIVATE_KEY) throw new Error('ADMIN_PRIVATE_KEY missing');
    const keypair = Ed25519Keypair.fromSecretKey(process.env.ADMIN_PRIVATE_KEY);
    const adminAddress = keypair.toSuiAddress();

    console.log(`👤 Scanning Admin Address: ${adminAddress}`);
    console.log(`📦 Looking for AdminCap in Package: ${PACKAGE_ID}`);

    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage) {
        const objects = await client.getOwnedObjects({
            owner: adminAddress,
            options: { showType: true },
            cursor: cursor,
        });

        // AdminCap tipini arıyoruz: PACKAGE::pool::AdminCap
        const adminCap = objects.data.find(obj =>
            obj.data?.type?.includes(`${PACKAGE_ID}::pool::AdminCap`)
        );

        if (adminCap) {
            console.log("\n✅ FOUND REAL ADMIN CAP!");
            console.log("------------------------------------------------");
            console.log(`Object ID: ${adminCap.data?.objectId}`);
            console.log(`Type:      ${adminCap.data?.type}`);
            console.log("------------------------------------------------");
            console.log("👉 Lütfen backend/.env dosyasındaki ADMIN_CAP_ID değerini bu ID ile güncelle!");
            return;
        }

        hasNextPage = objects.hasNextPage;
        cursor = objects.nextCursor;
    }

    console.log("\n❌ AdminCap bulunamadı! Deploy sırasında oluşturulmamış veya başka bir adrese gönderilmiş olabilir.");
}

main().catch(console.error);