import { SuiClient } from '@mysten/sui/client';
import { Aftermath } from 'aftermath-ts-sdk';
import * as dotenv from 'dotenv';

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['SUI_NODE_URL', 'TREASURY_ADDRESS', 'ENOKI_API_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`⚠️ Missing environment variable: ${envVar}`);
  }
}

// Network Configuration
export const NETWORK = (process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';
export const SUI_NODE_URL = process.env.SUI_NODE_URL || 'https://fullnode.testnet.sui.io:443';
export const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || '';
export const SERVICE_FEE_BPS = parseInt(process.env.SERVICE_FEE_BPS || '30', 10);

// Enoki Configuration
export const ENOKI_API_KEY = process.env.ENOKI_API_KEY || '';
export const ENOKI_API_URL = process.env.ENOKI_API_URL || 'https://api.enoki.mystenlabs.com';

// Initialize Sui Client
export const suiClient = new SuiClient({
  url: SUI_NODE_URL,
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔧 Configuration Loaded:');
console.log(`   Network: ${NETWORK}`);
console.log(`   Node URL: ${SUI_NODE_URL}`);
console.log(`   Treasury: ${TREASURY_ADDRESS || 'Not Set'}`);
console.log(`   Service Fee: ${SERVICE_FEE_BPS} bps (${SERVICE_FEE_BPS / 100}%)`);
console.log(`   Enoki: ${ENOKI_API_KEY ? 'Configured ✓' : 'Not Configured ✗'}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Initialize Aftermath SDK
class AftermathService {
  private static instance: Aftermath | null = null;
  private static initPromise: Promise<Aftermath> | null = null;

  static async getInstance(): Promise<Aftermath> {
    if (this.instance) {
      return this.instance;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        this.instance = new Aftermath(NETWORK);
        await this.instance.init();
        console.log(`✅ Aftermath SDK initialized for ${NETWORK}`);
        return this.instance;
      } catch (error) {
        console.error('❌ Failed to initialize Aftermath SDK:', error);
        this.initPromise = null;
        throw new Error('Could not initialize Aftermath SDK');
      }
    })();

    return this.initPromise;
  }
}

export const getAftermathInstance = () => AftermathService.getInstance();

// Common Token Types on Testnet
export const TESTNET_TOKENS = {
  SUI: '0x2::sui::SUI',
  // Testnet USDC - bu adres testnet'e göre değişebilir
  USDC: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
  // Testnet USDT
  USDT: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
};

// Token Decimals
export const TOKEN_DECIMALS: Record<string, number> = {
  [TESTNET_TOKENS.SUI]: 9,
  [TESTNET_TOKENS.USDC]: 6,
  [TESTNET_TOKENS.USDT]: 6,
};

// Helper function to validate Sui address
export function isValidSuiAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(address);
}

// Helper function to normalize token type
export function normalizeTokenType(tokenType: string): string {
  tokenType = tokenType.trim();
  
  if (!tokenType.startsWith('0x')) {
    tokenType = '0x' + tokenType;
  }
  
  return tokenType;
}

// Enoki Gas Station API helper
export async function sponsorTransaction(txBytesBase64: string): Promise<{
  signature: string;
  txDigest?: string;
}> {
  if (!ENOKI_API_KEY) {
    throw new Error('Enoki API key not configured');
  }

  const response = await fetch(`${ENOKI_API_URL}/v1/gas-station/sponsor`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ENOKI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      network: NETWORK,
      txBytes: txBytesBase64,
      allowedAddresses: [], // Empty means allow all
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Enoki sponsor error:', errorText);
    throw new Error(`Enoki sponsorship failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return {
    signature: data.signature,
    txDigest: data.txDigest,
  };
}

// Verify Enoki configuration
export async function verifyEnokiConfiguration(): Promise<boolean> {
  if (!ENOKI_API_KEY) {
    console.warn('⚠️ Enoki API key not set');
    return false;
  }

  try {
    // Test the API key with a simple request
    const response = await fetch(`${ENOKI_API_URL}/v1/app`, {
      headers: {
        'Authorization': `Bearer ${ENOKI_API_KEY}`,
      },
    });
    
    if (response.ok) {
      console.log('✅ Enoki API connection verified');
      return true;
    } else {
      console.warn('⚠️ Enoki API verification failed:', response.status);
      return false;
    }
  } catch (error) {
    console.error('❌ Enoki connection error:', error);
    return false;
  }
}

// Get token balance for user
export async function getTokenBalance(
  userAddress: string,
  tokenType: string
): Promise<bigint> {
  try {
    const coins = await suiClient.getCoins({
      owner: userAddress,
      coinType: normalizeTokenType(tokenType),
    });

    return coins.data.reduce(
      (total, coin) => total + BigInt(coin.balance),
      BigInt(0)
    );
  } catch (error) {
    console.error('Error getting token balance:', error);
    return BigInt(0);
  }
}

// Get all token balances for user
export async function getAllBalances(userAddress: string): Promise<
  Array<{
    coinType: string;
    totalBalance: string;
    coinObjectCount: number;
  }>
> {
  try {
    const balances = await suiClient.getAllBalances({
      owner: userAddress,
    });

    return balances.map((b) => ({
      coinType: b.coinType,
      totalBalance: b.totalBalance,
      coinObjectCount: b.coinObjectCount,
    }));
  } catch (error) {
    console.error('Error getting all balances:', error);
    return [];
  }
}
