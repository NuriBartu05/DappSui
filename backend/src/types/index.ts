export interface QuoteRequest {
  tokenInType: string;
  tokenOutType: string;
  amount: string;
}

export interface QuoteResponse {
  estimatedAmountOut: string;
  route: RouteInfo;
  priceImpact: string;
}

export interface RouteInfo {
  path: string[];
  protocols: string[];
  estimatedGas: string;
}

export interface SwapRequest {
  userAddress: string;
  tokenInType: string;
  tokenOutType: string;
  amount: string;
  slippage: number; // In basis points (e.g., 50 = 0.5%)
}

export interface SwapResponse {
  txBytes: string;
  estimatedAmountOut: string;
  route: RouteInfo;
}

export interface SponsoredSwapRequest extends SwapRequest {
  // Additional field to specify payment token for fees
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
  amountOut: string; // "1" or "5" SUI
  slippage: number;
}

export interface RefuelResponse {
  txBytes: string;
  estimatedAmountIn: string;
  route: RouteInfo;
}

export interface DustToken {
  tokenType: string;
  balance: string;
}

export interface DustSweepRequest {
  userAddress: string;
  tokens: DustToken[];
  targetTokenType: string; // SUI or USDC
  slippage: number;
}

export interface DustSweepResponse {
  txBytes: string;
  estimatedTotalOut: string;
  swaps: {
    tokenIn: string;
    amountIn: string;
    estimatedOut: string;
  }[];
}

export interface ApiError {
  error: string;
  details?: any;
}
