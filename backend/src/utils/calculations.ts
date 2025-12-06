import Big from 'big.js';

// Configure Big.js for precision
Big.DP = 20;
Big.RM = Big.roundDown;

/**
 * Calculate the minimum amount out based on slippage tolerance
 * @param amountOut - Expected output amount (as string)
 * @param slippageBps - Slippage in basis points (e.g., 50 = 0.5%)
 * @returns Minimum amount out as string
 */
export function calculateMinAmountOut(amountOut: string, slippageBps: number): string {
  const amount = new Big(amountOut);
  const slippageMultiplier = new Big(10000 - slippageBps).div(10000);
  return amount.mul(slippageMultiplier).round(0, Big.roundDown).toString();
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
  return fee.round(0, Big.roundUp).toString();
}

/**
 * Calculate the amount after deducting fees
 * @param amount - Original amount
 * @param feeBps - Fee in basis points
 * @returns Amount after fee deduction
 */
export function calculateAmountAfterFee(amount: string, feeBps: number): string {
  const amountBig = new Big(amount);
  const fee = new Big(calculateServiceFee(amount, feeBps));
  return amountBig.minus(fee).round(0, Big.roundDown).toString();
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
  return amountBig.mul(multiplier).round(0, Big.roundDown).toString();
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
 * Format amount for display with specified decimal places
 * @param amount - Amount in smallest unit
 * @param decimals - Token decimals
 * @param displayDecimals - Number of decimals to show (default: 4)
 */
export function formatAmount(
  amount: string, 
  decimals: number, 
  displayDecimals: number = 4
): string {
  const humanAmount = fromSmallestUnit(amount, decimals);
  const num = parseFloat(humanAmount);
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: displayDecimals,
  });
}

/**
 * Calculate price impact percentage
 * @param inputAmount - Input amount in smallest unit
 * @param outputAmount - Output amount in smallest unit
 * @param spotPrice - Spot price (output per input)
 * @returns Price impact as percentage string
 */
export function calculatePriceImpact(
  inputAmount: string,
  outputAmount: string,
  spotPrice: number
): string {
  const input = new Big(inputAmount);
  const output = new Big(outputAmount);
  const expectedOutput = input.mul(spotPrice);
  
  if (expectedOutput.eq(0)) return '0';
  
  const impact = expectedOutput.minus(output).div(expectedOutput).mul(100);
  return impact.round(4).toString();
}

/**
 * Validate numeric string
 */
export function isValidAmount(amount: string): boolean {
  try {
    const num = new Big(amount);
    return num.gt(0);
  } catch {
    return false;
  }
}
