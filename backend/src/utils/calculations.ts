import Big from 'big.js';

/**
 * Calculate the minimum amount out based on slippage tolerance
 * @param amountOut - Expected output amount (as string)
 * @param slippageBps - Slippage in basis points (e.g., 50 = 0.5%)
 * @returns Minimum amount out as string
 */
export function calculateMinAmountOut(amountOut: string, slippageBps: number): string {
  const amount = new Big(amountOut);
  const slippageMultiplier = new Big(10000 - slippageBps).div(10000);
  return amount.mul(slippageMultiplier).toFixed(0);
}

/**
 * Calculate service fee amount
 * @param amount - Input amount (as string)
 * @param feeBps - Fee in basis points (e.g., 30 = 0.3%)
 * @returns Fee amount as string
 */
export function calculateServiceFee(amount: string, feeBps: number): string {
  const amountBig = new Big(amount);
  const fee = amountBig.mul(feeBps).div(10000);
  return fee.toFixed(0);
}

/**
 * Calculate the amount after deducting fees
 * @param amount - Original amount
 * @param feeBps - Fee in basis points
 * @returns Amount after fee deduction
 */
export function calculateAmountAfterFee(amount: string, feeBps: number): string {
  const amountBig = new Big(amount);
  const fee = calculateServiceFee(amount, feeBps);
  return amountBig.minus(fee).toFixed(0);
}

/**
 * Convert a human-readable amount to the smallest unit based on decimals
 * @param amount - Human readable amount (e.g., "1.5")
 * @param decimals - Token decimals (e.g., 6 for USDC, 9 for SUI)
 * @returns Amount in smallest unit as string
 */
export function toSmallestUnit(amount: string, decimals: number): string {
  const amountBig = new Big(amount);
  const multiplier = new Big(10).pow(decimals);
  return amountBig.mul(multiplier).toFixed(0);
}

/**
 * Convert from smallest unit to human-readable amount
 * @param amount - Amount in smallest unit
 * @param decimals - Token decimals
 * @returns Human readable amount as string
 */
export function fromSmallestUnit(amount: string, decimals: number): string {
  const amountBig = new Big(amount);
  const divisor = new Big(10).pow(decimals);
  return amountBig.div(divisor).toString();
}

/**
 * Estimate gas cost in payment token
 * @param gasBudget - Gas budget in SUI (smallest unit)
 * @param suiPriceInPaymentToken - Price of 1 SUI in payment token
 * @returns Estimated gas cost in payment token
 */
export function estimateGasCostInToken(
  gasBudget: string,
  suiPriceInPaymentToken: string
): string {
  const gasBig = new Big(gasBudget);
  const price = new Big(suiPriceInPaymentToken);
  return gasBig.mul(price).toFixed(0);
}
