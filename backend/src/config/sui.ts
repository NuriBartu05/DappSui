import { SuiClient } from '@mysten/sui/client';
import { Aftermath } from 'aftermath-ts-sdk';
import * as dotenv from 'dotenv';

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['SUI_NODE_URL', 'TREASURY_ADDRESS', 'ENOKI_API_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Network Configuration
export const NETWORK = process.env.NETWORK || 'testnet';
export const SUI_NODE_URL = process.env.SUI_NODE_URL!;
export const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS!;
export const SERVICE_FEE_BPS = parseInt(process.env.SERVICE_FEE_BPS || '30', 10);

// Enoki Configuration
export const ENOKI_API_KEY = process.env.ENOKI_API_KEY!;
export const ENOKI_API_URL = process.env.ENOKI_API_URL || 'https://api.enoki.mystenlabs.com';

// Initialize Sui Client for Testnet
export const suiClient = new SuiClient({
  url: SUI_NODE_URL,
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Configuration Loaded:');
console.log(`Network: ${NETWORK}`);
console.log(`Treasury: ${TREASURY_ADDRESS}`);
console.log(`Service Fee: ${SERVICE_FEE_BPS} bps (${SERVICE_FEE_BPS / 100}%)`);
console.log(`Enoki Integration: Enabled`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Initialize Aftermath SDK for Testnet
class AftermathService {
  private static instance: Aftermath | null = null;

  static async getInstance(): Promise<Aftermath> {
    if (!this.instance) {
      try {
        this.instance = new Aftermath(NETWORK as 'testnet');
        await this.instance.init();
        console.log('✅ Aftermath SDK initialized successfully for Testnet');
      } catch (error) {
        console.error('❌ Failed to initialize Aftermath SDK:', error);
        throw new Error('Could not initialize Aftermath SDK');
      }
    }
    return this.instance;
  }
}

export const getAftermathInstance = () => AftermathService.getInstance();

// Common Token Types on Testnet
export const COMMON_TOKENS = {
  SUI: '0x2::sui::SUI',
  // Add testnet token addresses as you discover them
  // USDC: '0x...',
  // USDT: '0x...',
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

// Helper to verify Enoki configuration
export async function verifyEnokiConfiguration(): Promise<boolean> {
  try {
    const response = await fetch(`${ENOKI_API_URL}/gas-station/v1/health`, {
      headers: {
        'Authorization': `Bearer ${ENOKI_API_KEY}`,
      },
    });
    
    if (response.ok) {
      console.log('✅ Enoki Gas Station connection verified');
      return true;
    } else {
      console.warn('⚠️ Enoki Gas Station health check failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Enoki Gas Station connection error:', error);
    return false;
  }
}
