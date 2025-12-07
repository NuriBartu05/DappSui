// ============================================
// FRONTEND CONFIGURATION
// ============================================

export const CONFIG = {
    // Backend API URL
    API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',

    // Token Type Tags - UPDATE THESE AFTER DEPLOYING CONTRACTS!
    USDC_TYPE: process.env.NEXT_PUBLIC_USDC_TYPE || '0x0::usdc::USDC',
    WALRUS_TYPE: process.env.NEXT_PUBLIC_WALRUS_TYPE || '0x0::walrus::WALRUS',

    // Native SUI type
    SUI_TYPE: '0x2::sui::SUI',

    // Exchange rate: 1 WALRUS = 0.1546 USDC
    // Therefore: 1 USDC = 1/0.1546 WALRUS ≈ 6.468 WALRUS
    WALRUS_PRICE_USDC: 0.1546,
    USDC_TO_WALRUS_RATE: 1 / 0.1546, // ≈ 6.468

    // Get Gas amount
    GET_GAS_AMOUNT_SUI: 0.1,

    // Decimals
    USDC_DECIMALS: 6,
    WALRUS_DECIMALS: 9,
    SUI_DECIMALS: 9,
};
