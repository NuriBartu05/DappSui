import axios from 'axios';
import { SuiClient, CoinStruct } from '@mysten/sui/client';
import { config } from './config.js';

// ============================================
// PRICE UTILITIES
// ============================================

/**
 * Fetch SUI price in USDC from CoinGecko
 * @returns SUI price in USDC (e.g., 1.25 means 1 SUI = $1.25 USDC)
 */
export async function getSuiPrice(): Promise<number> {
    try {
        const response = await axios.get(
            'https://api.coingecko.com/api/v3/simple/price',
            {
                params: {
                    ids: 'sui',
                    vs_currencies: 'usd',
                },
                timeout: 5000,
            }
        );

        const price = response.data?.sui?.usd;
        if (!price) {
            throw new Error('Invalid price response from CoinGecko');
        }

        console.log(`📊 SUI Price: $${price} USDC`);
        return price;
    } catch (error) {
        console.error('Failed to fetch SUI price, using fallback:', error);
        // Fallback price in case API fails
        return 1.0;
    }
}

/**
 * Fetch current gas price from Sui network
 * @param client SuiClient instance
 * @returns Gas price in MIST (smallest SUI unit)
 */
export async function getGasPrice(client: SuiClient): Promise<bigint> {
    try {
        const gasPrice = await client.getReferenceGasPrice();
        console.log(`⛽ Gas Price: ${gasPrice} MIST`);
        return gasPrice;
    } catch (error) {
        console.error('Failed to fetch gas price, using fallback:', error);
        // Fallback gas price (1000 MIST is typical)
        return BigInt(1000);
    }
}

// ============================================
// COIN UTILITIES
// ============================================

/**
 * Get all coins of a specific type for an address
 */
export async function getCoins(
    client: SuiClient,
    address: string,
    coinType: string
): Promise<CoinStruct[]> {
    const coins: CoinStruct[] = [];
    let cursor: string | null = null;

    do {
        const response = await client.getCoins({
            owner: address,
            coinType,
            cursor: cursor ?? undefined,
        });

        coins.push(...response.data);
        cursor = response.nextCursor ?? null;
    } while (cursor);

    return coins;
}

/**
 * Get total balance of a coin type for an address
 */
export async function getBalance(
    client: SuiClient,
    address: string,
    coinType: string
): Promise<bigint> {
    const balance = await client.getBalance({
        owner: address,
        coinType,
    });

    return BigInt(balance.totalBalance);
}

/**
 * Find coins with sufficient balance
 * Returns coin object IDs that can be used for payment
 */
export async function findCoinsForAmount(
    client: SuiClient,
    address: string,
    coinType: string,
    requiredAmount: bigint
): Promise<{ coins: string[]; total: bigint }> {
    const allCoins = await getCoins(client, address, coinType);

    // Sort by balance descending to use fewer coins
    allCoins.sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)));

    const selectedCoins: string[] = [];
    let total = BigInt(0);

    for (const coin of allCoins) {
        if (total >= requiredAmount) break;

        selectedCoins.push(coin.coinObjectId);
        total += BigInt(coin.balance);
    }

    return { coins: selectedCoins, total };
}

// ============================================
// CONVERSION UTILITIES
// ============================================

/**
 * Convert human-readable amount to smallest units
 */
export function toSmallestUnits(amount: number, decimals: number): bigint {
    return BigInt(Math.floor(amount * Math.pow(10, decimals)));
}

/**
 * Convert smallest units to human-readable amount
 */
export function fromSmallestUnits(amount: bigint, decimals: number): number {
    return Number(amount) / Math.pow(10, decimals);
}

/**
 * Estimate gas cost in USDC
 * Assumes gas budget of ~10M gas units
 */
export async function estimateGasCostInUsdc(
    client: SuiClient
): Promise<{ gasCostSui: number; gasCostUsdc: number; gasBudget: bigint }> {
    const gasPrice = await getGasPrice(client);
    const suiPrice = await getSuiPrice();

    // Estimate gas budget (10M gas units is typically enough for complex PTBs)
    const gasBudget = BigInt(10_000_000);

    // Calculate gas cost in SUI (gas_budget * gas_price / 10^9)
    const gasCostMist = gasBudget * gasPrice / BigInt(1000);
    const gasCostSui = fromSmallestUnits(gasCostMist, config.suiDecimals);

    // Convert to USDC
    const gasCostUsdc = gasCostSui * suiPrice;

    console.log(`💰 Estimated Gas: ${gasCostSui.toFixed(6)} SUI (~$${gasCostUsdc.toFixed(4)} USDC)`);

    return { gasCostSui, gasCostUsdc, gasBudget };
}
