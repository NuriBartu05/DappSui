'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { CONFIG } from '@/lib/config';

interface Balances {
    sui: number;
    usdc: number;
    walrus: number;
}

export function useBalances() {
    const account = useCurrentAccount();
    const suiClient = useSuiClient();

    const [balances, setBalances] = useState<Balances | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchBalances = useCallback(async () => {
        if (!account?.address) {
            setBalances(null);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Fetch all balances in parallel
            const [suiBalance, usdcBalance, walrusBalance] = await Promise.all([
                suiClient.getBalance({
                    owner: account.address,
                    coinType: CONFIG.SUI_TYPE,
                }),
                suiClient.getBalance({
                    owner: account.address,
                    coinType: CONFIG.USDC_TYPE,
                }).catch(() => ({ totalBalance: '0' })), // Fallback if token not found
                suiClient.getBalance({
                    owner: account.address,
                    coinType: CONFIG.WALRUS_TYPE,
                }).catch(() => ({ totalBalance: '0' })), // Fallback if token not found
            ]);

            setBalances({
                sui: Number(suiBalance.totalBalance) / Math.pow(10, CONFIG.SUI_DECIMALS),
                usdc: Number(usdcBalance.totalBalance) / Math.pow(10, CONFIG.USDC_DECIMALS),
                walrus: Number(walrusBalance.totalBalance) / Math.pow(10, CONFIG.WALRUS_DECIMALS),
            });
        } catch (err) {
            console.error('Failed to fetch balances:', err);
            setError('Failed to fetch balances');
        } finally {
            setIsLoading(false);
        }
    }, [account?.address, suiClient]);

    // Fetch on mount and when account changes
    useEffect(() => {
        fetchBalances();
    }, [fetchBalances]);

    return {
        balances,
        isLoading,
        error,
        refetch: fetchBalances,
    };
}
