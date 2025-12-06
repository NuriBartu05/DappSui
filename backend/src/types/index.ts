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
  amountOut: string; // "1000000000" (1 SUI) or "5000000000" (5 SUI)
  slippage: number;
}

export interface RefuelResponse {
  txBytes: string;
  estimatedAmountIn: string;
  route: RouteInfo;
  sponsorSignature?: string; // Optional - if Enoki sponsorship is available
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

export interface TokenInfo {
  symbol: string;
  type: string;
  decimals: number;
  name: string;
  logo?: string;
}

export interface BalanceInfo {
  coinType: string;
  totalBalance: string;
  coinObjectCount: number;
}

export interface ApiError {
  error: string;
  details?: any;
  timestamp?: string;
  path?: string;
}
