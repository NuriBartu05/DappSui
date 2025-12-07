import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import dotenv from 'dotenv';

dotenv.config();

const POOL_ID = process.env.POOL_OBJECT_ID;

async function main() {
    if (!POOL_ID) {
        throw new Error("❌ POOL_OBJECT_ID .env dosyasında bulunamadı!");
    }

    const client = new SuiClient({ url: getFullnodeUrl('testnet') });

    console.log(`🔍 Inspecting Pool: ${POOL_ID}`);
    console.log("------------------------------------------------");

    try {
        const poolObj = await client.getObject({
            id: POOL_ID,
            options: { showContent: true },
        });

        if (poolObj.error) {
            console.error("❌ Pool object not found or deleted:", poolObj.error);
            return;
        }

        const fields = (poolObj.data?.content as any)?.fields;

        if (!fields) {
            console.error("❌ Could not read pool fields.");
            return;
        }

        // Move struct yapısına göre bakiyeleri okuyoruz
        // Genelde: fields.usdc, fields.walrus vb. birer objecttir ve içlerinde 'balance' veya 'value' olabilir.
        // Eğer Coin<T> veya Balance<T> tutuyorsa genelde bir alt field olur.

        // Bakiyeleri güvenli okuma (Move yapısına göre değişebilir, genel formatı yakalamaya çalışıyoruz)
        const usdcRaw = fields.usdc ? (typeof fields.usdc === 'object' ? (fields.usdc.fields?.balance || fields.usdc) : fields.usdc) : 0;
        const walrusRaw = fields.walrus ? (typeof fields.walrus === 'object' ? (fields.walrus.fields?.balance || fields.walrus) : fields.walrus) : 0;
        const suiRaw = fields.sui ? (typeof fields.sui === 'object' ? (fields.sui.fields?.balance || fields.sui) : fields.sui) : 0;

        console.log("📊 POOL STATUS / BALANCE REPORT:");
        console.log(`   💰 USDC Balance:   ${usdcRaw} (Raw Units)`);
        console.log(`   🦭 WALRUS Balance: ${walrusRaw} (Raw Units)`);
        console.log(`   💧 SUI Balance:    ${suiRaw} (Raw Units)`);

        console.log("------------------------------------------------");

        // Yorum
        if (Number(usdcRaw) === 0) {
            console.log("⚠️  WARNING: Pool has 0 USDC! Reverse Swap (Walrus -> USDC) will FAIL.");
        } else {
            console.log("✅  OK: Pool has USDC liquidity.");
        }

    } catch (e) {
        console.error("Error inspecting pool:", e);
    }
}

main();