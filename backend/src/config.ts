import dotenv from 'dotenv';

dotenv.config();

// ============================================
// CONFIGURATION
// ============================================

export const config = {
    // Server
    port: parseInt(process.env.PORT || '3001'),

    // Sui Network
    rpcUrl: process.env.RPC_URL || 'https://fullnode.testnet.sui.io:443',

    // Admin/Sponsor wallet private key
    adminPrivateKey: process.env.ADMIN_PRIVATE_KEY || '',

    // Smart Contract Config - UPDATE AFTER DEPLOYING
    packageId: process.env.PACKAGE_ID || '0x0',
    poolObjectId: process.env.POOL_OBJECT_ID || '0x0',

    // Token Type Tags - UPDATE THESE AFTER DEPLOYING CONTRACTS!
    // Replace 0x0 with your actual package ID
    usdcType: process.env.USDC_TYPE || '0x0::usdc::USDC',
    walrusType: process.env.WALRUS_TYPE || '0x0::walrus::WALRUS',

    // Native SUI type
    suiType: '0x2::sui::SUI',

    // Exchange rates
    usdcToWalrusRate: 10, // 1 USDC = 10 WALRUS

    // Decimals
    usdcDecimals: 6,
    walrusDecimals: 9,
    suiDecimals: 9,

    // Get Gas amount (0.1 SUI)
    getGasAmountSui: 0.1,
};

// Validate required config
export function validateConfig(): void {
    if (!config.adminPrivateKey) {
        throw new Error('ADMIN_PRIVATE_KEY is required in .env file');
    }

    if (config.usdcType.includes('0x0::')) {
        console.warn('⚠️  WARNING: USDC_TYPE still uses placeholder. Update after deploying contracts!');
    }

    if (config.walrusType.includes('0x0::')) {
        console.warn('⚠️  WARNING: WALRUS_TYPE still uses placeholder. Update after deploying contracts!');
    }
}
