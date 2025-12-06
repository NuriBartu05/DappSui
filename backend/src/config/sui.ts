import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Aftermath } from 'aftermath-ts-sdk';
import * as dotenv from 'dotenv';

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['SUI_NODE_URL', 'SPONSOR_PRIVATE_KEY', 'TREASURY_ADDRESS'];
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

// Initialize Sui Client for Testnet
export const suiClient = new SuiClient({
  url: SUI_NODE_URL,
});

// Initialize Sponsor Keypair
let sponsorKeypair: Ed25519Keypair;
try {
  const privateKeyBytes = Buffer.from(process.env.SPONSOR_PRIVATE_KEY!, 'base64');
  sponsorKeypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
} catch (error) {
  throw new Error('Invalid SPONSOR_PRIVATE_KEY format. Must be base64 encoded.');
}

export const SPONSOR_KEYPAIR = sponsorKeypair;
export const SPONSOR_ADDRESS = sponsorKeypair.toSuiAddress();

console.log(`Sponsor Address: ${SPONSOR_ADDRESS}`);
console.log(`Treasury Address: ${TREASURY_ADDRESS}`);

// Initialize Aftermath SDK for Testnet
class AftermathService {
  private static instance: Aftermath | null = null;

  static async getInstance(): Promise<Aftermath> {
    if (!this.instance) {
      try {
        // Initialize Aftermath SDK with Testnet configuration
        this.instance = new Aftermath(NETWORK as 'testnet');
        
        // Verify initialization
        await this.instance.init();
        
        console.log('Aftermath SDK initialized successfully for Testnet');
      } catch (error) {
        console.error('Failed to initialize Aftermath SDK:', error);
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
  USDC: '0x_usdc_testnet_address::usdc::USDC', // Replace with actual testnet address
  USDT: '0x_usdt_testnet_address::usdt::USDT', // Replace with actual testnet address
  DEEP: '0x_deep_testnet_address::deep::DEEP', // Replace with actual testnet address
};

// Helper function to validate Sui address
export function isValidSuiAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(address);
}

// Helper function to normalize token type
export function normalizeTokenType(tokenType: string): string {
  // Remove leading/trailing whitespace
  tokenType = tokenType.trim();
  
  // Ensure it starts with 0x
  if (!tokenType.startsWith('0x')) {
    tokenType = '0x' + tokenType;
  }
  
  return tokenType;
}
