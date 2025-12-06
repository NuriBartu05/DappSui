// API configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Type definitions
export interface TokenInfo {
  symbol: string;
  type: string;
  decimals: number;
  name: string;
  logo?: string;
}

export interface QuoteRequest {
  tokenInType: string;
  tokenOutType: string;
  amount: string;
}

export interface QuoteResponse {
  estimatedAmountOut: string;
  route: {
    path: string[];
    protocols: string[];
    estimatedGas: string;
  };
  priceImpact: string;
}

export interface SwapRequest {
  userAddress: string;
  tokenInType: string;
  tokenOutType: string;
  amount: string;
  slippage: number;
}

export interface SwapResponse {
  txBytes: string;
  estimatedAmountOut: string;
  route: {
    path: string[];
    protocols: string[];
    estimatedGas: string;
  };
}

export interface SponsoredSwapRequest extends SwapRequest {
  paymentTokenType?: string;
}

export interface SponsoredSwapResponse {
  txBytes: string;
  sponsorSignature: string;
  estimatedAmountOut: string;
  gasCostInPaymentToken: string;
  serviceFee: string;
  totalCost: string;
}

export interface RefuelRequest {
  userAddress: string;
  tokenInType: string;
  amountOut: string;
  slippage: number;
}

export interface RefuelResponse {
  txBytes: string;
  estimatedAmountIn: string;
  route: {
    path: string[];
    protocols: string[];
    estimatedGas: string;
  };
  sponsorSignature?: string;
}

export interface BalanceInfo {
  coinType: string;
  totalBalance: string;
  coinObjectCount: number;
}

// API Client
class DexAggregatorAPI {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }
    return response.json();
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; network: string }> {
    const response = await fetch(`${this.baseUrl}/health`);
    return this.handleResponse(response);
  }

  /**
   * Get supported tokens
   */
  async getTokens(): Promise<{ tokens: TokenInfo[] }> {
    const response = await fetch(`${this.baseUrl}/api/tokens`);
    return this.handleResponse(response);
  }

  /**
   * Get user balances
   */
  async getBalances(address: string): Promise<{ address: string; balances: BalanceInfo[] }> {
    const response = await fetch(`${this.baseUrl}/api/balances/${address}`);
    return this.handleResponse(response);
  }

  /**
   * Get swap quote
   */
  async getQuote(params: QuoteRequest): Promise<QuoteResponse> {
    const url = new URL(`${this.baseUrl}/api/quote`);
    url.searchParams.append('tokenInType', params.tokenInType);
    url.searchParams.append('tokenOutType', params.tokenOutType);
    url.searchParams.append('amount', params.amount);

    const response = await fetch(url.toString());
    return this.handleResponse(response);
  }

  /**
   * Build standard swap transaction (user pays gas)
   */
  async buildSwap(params: SwapRequest): Promise<SwapResponse> {
    const response = await fetch(`${this.baseUrl}/api/swap/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return this.handleResponse(response);
  }

  /**
   * Build sponsored swap transaction (Enoki pays gas)
   */
  async buildSponsoredSwap(params: SponsoredSwapRequest): Promise<SponsoredSwapResponse> {
    const response = await fetch(`${this.baseUrl}/api/swap/build-sponsored`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return this.handleResponse(response);
  }

  /**
   * Build refuel transaction (get SUI)
   */
  async buildRefuel(params: RefuelRequest): Promise<RefuelResponse> {
    const response = await fetch(`${this.baseUrl}/api/refuel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return this.handleResponse(response);
  }
}

// Export singleton instance
export const dexApi = new DexAggregatorAPI();

// Utility functions

/**
 * Convert base64 transaction bytes to Uint8Array
 */
export function txBytesFromBase64(base64: string): Uint8Array {
  // Handle browser and Node.js environments
  if (typeof window !== 'undefined' && window.atob) {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } else {
    // Node.js environment
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
}

/**
 * Format token amount for display
 */
export function formatTokenAmount(
  amount: string,
  decimals: number,
  displayDecimals: number = 4
): string {
  const num = Number(amount) / Math.pow(10, decimals);
  
  if (num === 0) return '0';
  if (num < 0.0001) return '<0.0001';
  
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: displayDecimals,
  });
}

/**
 * Parse token amount to smallest unit
 */
export function parseTokenAmount(amount: string, decimals: number): string {
  const num = parseFloat(amount);
  if (isNaN(num) || num <= 0) return '0';
  return Math.floor(num * Math.pow(10, decimals)).toString();
}

/**
 * Shorten address for display
 */
export function shortenAddress(address: string, chars: number = 4): string {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Get explorer URL for transaction
 */
export function getExplorerUrl(digest: string, network: string = 'testnet'): string {
  return `https://suiscan.xyz/${network}/tx/${digest}`;
}

// Default tokens for testnet
export const DEFAULT_TOKENS: TokenInfo[] = [
  {
    symbol: 'SUI',
    type: '0x2::sui::SUI',
    decimals: 9,
    name: 'Sui',
    logo: 'https://cryptologos.cc/logos/sui-sui-logo.png',
  },
];

// Token decimals lookup
export const TOKEN_DECIMALS: Record<string, number> = {
  '0x2::sui::SUI': 9,
};
