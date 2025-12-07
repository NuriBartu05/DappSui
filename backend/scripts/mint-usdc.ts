import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import dotenv from 'dotenv';

dotenv.config();

// ============================================
// CONFIGURATION (LOADED FROM .ENV)
// ============================================

const RPC_URL = process.env.RPC_URL || 'https://fullnode.testnet.sui.io:443';

// ARTIK ELLE YAZMAK YOK, ENV'DEN OKUYORUZ
const PACKAGE_ID = process.env.PACKAGE_ID;
const USDC_TYPE = process.env.USDC_TYPE; 

// Mint amount: 1,000,000 USDC with 6 decimals
const MINT_AMOUNT = 1_000_000 * 1_000_000; 

// ============================================
// MAIN SCRIPT
// ============================================

async function main() {
    // Validate environment
    if (!process.env.ADMIN_PRIVATE_KEY) throw new Error('❌ ADMIN_PRIVATE_KEY is required in .env');
    if (!PACKAGE_ID) throw new Error('❌ PACKAGE_ID is required in .env');
    if (!USDC_TYPE) throw new Error('❌ USDC_TYPE is required in .env');

    const TREASURY_CAP_TYPE = `0x2::coin::TreasuryCap<${USDC_TYPE}>`;

    // Initialize client and keypair
    const suiClient = new SuiClient({ url: RPC_URL });
    const { secretKey } = decodeSuiPrivateKey(process.env.ADMIN_PRIVATE_KEY);
    const adminKeypair = Ed25519Keypair.fromSecretKey(secretKey);
    const adminAddress = adminKeypair.getPublicKey().toSuiAddress();

    console.log('🔐 Admin Address:', adminAddress);
    console.log('📦 Package ID:', PACKAGE_ID);
    console.log('🪙 USDC Type:', USDC_TYPE);
    console.log('');

    // ============================================
    // Step 1: Find TreasuryCap
    // ============================================

    console.log('🔍 Searching for TreasuryCap...');
    console.log(`   Looking for type: ${TREASURY_CAP_TYPE}`);

    let treasuryCapId: string | null = null;
    let cursor: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
        const ownedObjects = await suiClient.getOwnedObjects({
            owner: adminAddress,
            cursor: cursor ?? undefined,
            options: { showType: true, showContent: true },
        });

        for (const obj of ownedObjects.data) {
            if (obj.data?.type === TREASURY_CAP_TYPE) {
                treasuryCapId = obj.data.objectId;
                console.log('✅ Found USDC TreasuryCap!');
                console.log(`   Object ID: ${treasuryCapId}`);
                break;
            }
        }

        if (treasuryCapId) break;

        hasNextPage = ownedObjects.hasNextPage;
        cursor = ownedObjects.nextCursor ?? null;
    }

    if (!treasuryCapId) {
        // Fallback: Belki .env dosyasında manuel tanımlıdır?
        if (process.env.USDC_TREASURY_CAP) {
            console.log("⚠️ Auto-detection failed, using USDC_TREASURY_CAP from .env");
            treasuryCapId = process.env.USDC_TREASURY_CAP;
        } else {
            throw new Error(`❌ TreasuryCap not found! Make sure you are the Admin and deployed the package.`);
        }
    }

    // ============================================
    // Step 2: Build and Execute Mint Transaction
    // ============================================

    console.log('');
    console.log('💰 Minting 1,000,000 USDC...');

    const tx = new Transaction();
    
    // Move Call: mint_and_transfer
    tx.moveCall({
        target: '0x2::coin::mint_and_transfer',
        typeArguments: [USDC_TYPE],
        arguments: [
            tx.object(treasuryCapId!),          
            tx.pure.u64(MINT_AMOUNT),           
            tx.pure.address(adminAddress),      
        ],
    });

    const result = await suiClient.signAndExecuteTransaction({
        transaction: tx,
        signer: adminKeypair,
        options: { showEffects: true, showObjectChanges: true },
    });

    // ============================================
    // Step 3: Log Results
    // ============================================

    if (result.effects?.status?.status === 'success') {
        console.log('🎉 SUCCESS!');
        console.log(`   Digest: ${result.digest}`);
        
        // Yeni bakiyeyi kontrol et
        const balance = await suiClient.getBalance({
            owner: adminAddress,
            coinType: USDC_TYPE,
        });
        console.log(`💵 New Balance: ${Number(balance.totalBalance) / 1_000_000} USDC`);
    } else {
        console.error('❌ Transaction failed:', result.effects?.status);
    }
}

main().catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
});