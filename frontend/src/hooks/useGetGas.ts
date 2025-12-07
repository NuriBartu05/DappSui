'use client';

import { useState, useCallback, useEffect } from 'react';
import { useCurrentAccount, useSuiClient, useSignTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { CONFIG } from '@/lib/config';

interface SponsorResponse {
    bytes: string;
    signature: string;
    suiAmount: number;
}

interface PricesResponse {
    suiPriceUsdc: number;
    estimatedGasCostUsdc: number;
    getGasAmountSui: number;
}

const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID || '0xbeaeeaa7cbf79a5cdb128a3589c9c0835d8812a59f41a3e8d53fe1e859875bbd';
const POOL_OBJECT_ID = process.env.NEXT_PUBLIC_POOL_OBJECT_ID || '0x057b75db3da2e6278f6fc8135a97ff5590ac612b1a001d58d5ca4b4cf7acc28c';

function toSmallestUnits(amount: number, decimals: number): bigint {
    return BigInt(Math.floor(amount * Math.pow(10, decimals)));
}

export function useGetGas() {
    const account = useCurrentAccount();
    const suiClient = useSuiClient();
    const { mutateAsync: signTransaction } = useSignTransaction();

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [txDigest, setTxDigest] = useState<string | null>(null);
    const [estimatedCost, setEstimatedCost] = useState<number | null>(null);

    useEffect(() => {
        const fetchPrices = async () => {
            try {
                const res = await fetch(`${CONFIG.API_URL}/api/prices`);
                if (res.ok) {
                    const data: PricesResponse = await res.json();
                    const suiCost = data.getGasAmountSui * data.suiPriceUsdc;
                    setEstimatedCost(suiCost + (data.estimatedGasCostUsdc * 1.5));
                }
            } catch (err) {
                console.error('Failed to fetch prices:', err);
            }
        };
        fetchPrices();
    }, []);

    const getGas = useCallback(async () => {
        if (!account?.address) {
            setError('Wallet not connected');
            return;
        }

        setIsLoading(true);
        setError(null);
        setTxDigest(null);

        try {
            // ================================================================
            // STEP 1: Build TransactionKind for get_gas
            // ================================================================
            console.log('📦 [1/4] Building get_gas TransactionKind...');

            const pricesRes = await fetch(`${CONFIG.API_URL}/api/prices`);
            const prices: PricesResponse = await pricesRes.json();

            const suiAmount = CONFIG.GET_GAS_AMOUNT_SUI;
            const suiCostUsdc = suiAmount * prices.suiPriceUsdc;
            const totalCostUsdc = suiCostUsdc + (prices.estimatedGasCostUsdc * 1.5);
            const usdcInSmallest = toSmallestUnits(totalCostUsdc, CONFIG.USDC_DECIMALS);
            const suiPriceInMicroUsdc = Math.floor(prices.suiPriceUsdc * 1_000_000);

            const userCoins = await suiClient.getCoins({
                owner: account.address,
                coinType: CONFIG.USDC_TYPE,
            });

            if (userCoins.data.length === 0) {
                throw new Error('No USDC coins found');
            }

            const tx = new Transaction();

            if (userCoins.data.length > 1) {
                const primaryCoin = tx.object(userCoins.data[0].coinObjectId);
                const coinsToMerge = userCoins.data.slice(1).map(c => tx.object(c.coinObjectId));
                tx.mergeCoins(primaryCoin, coinsToMerge);
            }

            const [usdcPayment] = tx.splitCoins(
                tx.object(userCoins.data[0].coinObjectId),
                [tx.pure.u64(usdcInSmallest)]
            );

            tx.moveCall({
                target: `${PACKAGE_ID}::pool::get_gas`,
                arguments: [
                    tx.object(POOL_OBJECT_ID),
                    usdcPayment,
                    tx.pure.u64(suiPriceInMicroUsdc),
                ],
            });

            const kindBytes = await tx.build({
                client: suiClient as any,
                onlyTransactionKind: true,
            });

            const kindBase64 = Buffer.from(kindBytes).toString('base64');
            console.log('✅ TransactionKind ready');

            // ================================================================
            // STEP 2: Send to Backend
            // ================================================================
            console.log('📡 [2/4] Requesting sponsorship...');

            const response = await fetch(`${CONFIG.API_URL}/api/sponsor-gas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    txBytes: kindBase64,
                    userAddress: account.address,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Sponsorship failed');
            }

            const { bytes: sponsoredBytesB64, signature: adminSig, suiAmount: receivedSui } = await response.json() as SponsorResponse;
            console.log('✅ Got sponsored tx. SUI:', receivedSui);

            // ================================================================
            // STEP 3: User Signs
            // ================================================================
            console.log('🔐 [3/4] Requesting user signature...');

            const sponsoredBytes = Uint8Array.from(atob(sponsoredBytesB64), c => c.charCodeAt(0));
            const sponsoredTx = Transaction.from(sponsoredBytes);

            const { signature: userSig } = await signTransaction({
                transaction: sponsoredTx as any,
            });
            console.log('✅ User signed');

            // ================================================================
            // STEP 4: Execute with [userSig, adminSig]
            // ================================================================
            console.log('🚀 [4/4] Executing...');

            const result = await suiClient.executeTransactionBlock({
                transactionBlock: sponsoredBytes,
                signature: [userSig, adminSig],
                options: {
                    showEffects: true,
                    showObjectChanges: true,
                },
            });

            if (result.effects?.status?.status === 'failure') {
                throw new Error(result.effects.status.error || 'Get gas failed');
            }

            console.log('🎉 SUCCESS! Digest:', result.digest);
            setTxDigest(result.digest);

        } catch (err) {
            console.error('❌ Get gas error:', err);
            const msg = err instanceof Error ? err.message : 'Get gas failed';
            if (msg.includes('User rejected')) {
                setError('Transaction rejected by user');
            } else {
                setError(msg);
            }
        } finally {
            setIsLoading(false);
        }
    }, [account?.address, suiClient, signTransaction]);

    const reset = useCallback(() => {
        setError(null);
        setTxDigest(null);
    }, []);

    return { getGas, isLoading, error, txDigest, estimatedCost, reset };
}
