// API configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Type definitions
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
}

// API Client
class DexAggregatorAPI {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
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
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get quote');
    }

    return response.json();
  }

  /**
   * Build standard swap transaction (user pays gas)
   */
  async buildSwap(params: SwapRequest): Promise<SwapResponse> {
    const response = await fetch(`${this.baseUrl}/api/swap/build`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to build swap');
    }

    return response.json();
  }

  /**
   * Build sponsored swap transaction (Enoki pays gas, user pays fee in USDC)
   */
  async buildSponsoredSwap(params: SponsoredSwapRequest): Promise<SponsoredSwapResponse> {
    const response = await fetch(`${this.baseUrl}/api/swap/build-sponsored`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to build sponsored swap');
    }

    return response.json();
  }

  /**
   * Build refuel transaction (swap to SUI)
   */
  async buildRefuel(params: RefuelRequest): Promise<RefuelResponse> {
    const response = await fetch(`${this.baseUrl}/api/refuel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to build refuel transaction');
    }

    return response.json();
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; network: string }> {
    const response = await fetch(`${this.baseUrl}/health`);
    
    if (!response.ok) {
      throw new Error('Backend is not healthy');
    }

    return response.json();
  }
}

// Export singleton instance
export const dexApi = new DexAggregatorAPI();

// Utility functions
/**
 * Convert base64 transaction bytes to Uint8Array
 * CRITICAL: This fixes the common bug where base64 strings aren't properly converted
 */
export function txBytesFromBase64(base64: string): Uint8Array {
  // Remove any whitespace
  const cleanBase64 = base64.replace(/\s/g, '');
  
  // Decode base64 to binary string
  const binaryString = atob(cleanBase64);
  
  // Convert binary string to Uint8Array
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes;
}

/**
 * Format token amount for display
 */
export function formatTokenAmount(amount: string, decimals: number): string {
  const num = Number(amount) / Math.pow(10, decimals);
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

/**
 * Parse token amount to smallest unit
 */
export function parseTokenAmount(amount: string, decimals: number): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return '0';
  return Math.floor(num * Math.pow(10, decimals)).toString();
}
