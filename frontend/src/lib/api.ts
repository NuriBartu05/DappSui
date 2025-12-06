// API configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Type definitions
export interface Token {
  symbol: string;
  coinType: string;
  decimals: number;
  name: string;
  logo?: string;
}

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
  amountIn: string;
  amountOut: string;
  route: {
    path: string[];
    protocols: string[];
    estimatedGas: string;
  };
  priceImpact: string;
}

export interface SwapRequest {
  walletAddress: string;
  coinTypeIn: string;
  coinTypeOut: string;
  amountIn: string;
  slippageBps: number;
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

export interface SponsoredSwapRequest extends SwapRequest {}

export interface SponsoredSwapResponse {
  txBytes: string;
  sponsorSignature?: string;
  estimatedAmountOut: string;
  serviceFee: string;
}

export interface RefuelRequest {
  walletAddress: string;
  coinTypeIn: string;
  amountOut: string;
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
  balance: string;
  decimals: number;
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
   * Get supported tokens
   */
  async getTokens(): Promise<Token[]> {
    const response = await fetch(`${this.baseUrl}/api/tokens`);
    const data = await this.handleResponse<{ tokens: TokenInfo[] }>(response);
    // Transform to Token format
    return data.tokens.map((t) => ({
      symbol: t.symbol,
      coinType: t.type,
      decimals: t.decimals,
      name: t.name,
      logo: t.logo,
    }));
  }

  /**
   * Get user balances
   */
  async getBalances(address: string): Promise<BalanceInfo[]> {
    const response = await fetch(`${this.baseUrl}/api/balances/${address}`);
    const data = await this.handleResponse<{ address: string; balances: any[] }>(response);
    return data.balances.map((b) => ({
      coinType: b.coinType,
      balance: b.totalBalance || b.balance || '0',
      decimals: TOKEN_DECIMALS[b.coinType] || 9,
    }));
  }

  /**
   * Get swap quote
   */
  async getQuote(coinTypeIn: string, coinTypeOut: string, amountIn: string): Promise<QuoteResponse> {
    const url = new URL(`${this.baseUrl}/api/quote`);
    url.searchParams.append('tokenInType', coinTypeIn);
    url.searchParams.append('tokenOutType', coinTypeOut);
    url.searchParams.append('amount', amountIn);

    const response = await fetch(url.toString());
    const data = await this.handleResponse<{
      estimatedAmountOut: string;
      route: any;
      priceImpact: string;
    }>(response);
    
    return {
      amountIn,
      amountOut: data.estimatedAmountOut,
      route: data.route,
      priceImpact: data.priceImpact,
    };
  }

  /**
   * Build standard swap transaction (user pays gas)
   */
  async buildSwap(params: SwapRequest): Promise<SwapResponse> {
    const response = await fetch(`${this.baseUrl}/api/swap/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAddress: params.walletAddress,
        tokenInType: params.coinTypeIn,
        tokenOutType: params.coinTypeOut,
        amount: params.amountIn,
        slippage: params.slippageBps,
      }),
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
      body: JSON.stringify({
        userAddress: params.walletAddress,
        tokenInType: params.coinTypeIn,
        tokenOutType: params.coinTypeOut,
        amount: params.amountIn,
        slippage: params.slippageBps,
      }),
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
      body: JSON.stringify({
        userAddress: params.walletAddress,
        tokenInType: params.coinTypeIn,
        amountOut: params.amountOut,
        slippage: 100, // Default 1% slippage for refuel
      }),
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
 * Get explorer URL for transaction or address
 */
export function getExplorerUrl(hash: string, type: 'tx' | 'address' = 'tx', network: string = 'testnet'): string {
  if (type === 'address') {
    return `https://suiscan.xyz/${network}/account/${hash}`;
  }
  return `https://suiscan.xyz/${network}/tx/${hash}`;
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
