
'use client';

import { useState, useCallback } from 'react';
import { useCurrentAccount, useSuiClient, useSignTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { CONFIG } from '@/lib/config';

type SwapDirection = 'USDC_TO_WALRUS' | 'WALRUS_TO_USDC';

interface SponsorResponse {
    bytes: string;
    signature: string;
    walrusAmount?: number;
    usdcAmount?: number;
}

const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID || '';
const POOL_OBJECT_ID = process.env.NEXT_PUBLIC_POOL_OBJECT_ID || '';
const ADMIN_ADDRESS = process.env.NEXT_PUBLIC_ADMIN_ADDRESS || '';

const GAS_FEE_USDC = 0.05;

function toSmallestUnits(amount: number, decimals: number): bigint {
    return BigInt(Math.floor(amount * Math.pow(10, decimals)));
}

export function useSwap() {
    const account = useCurrentAccount();
    const suiClient = useSuiClient();
    const { mutateAsync: signTransaction } = useSignTransaction();

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [txDigest, setTxDigest] = useState<string | null>(null);

    const swap = useCallback(async (
        inputAmount: number,
        isGasless: boolean,
        direction: SwapDirection = 'USDC_TO_WALRUS'
    ) => {
        if (!account?.address) {
            setError('Wallet not connected');
            return;
        }

        setIsLoading(true);
        setError(null);
        setTxDigest(null);

        try {
            console.log(`📦 [1/4] Building ${direction} PTB...`);
            console.log(`   Input: ${inputAmount} ${direction === 'USDC_TO_WALRUS' ? 'USDC' : 'WALRUS'}`);
            console.log(`   Gas Fee: ${GAS_FEE_USDC} USDC → Admin`);

            // Service fee is ALWAYS in USDC regardless of direction
            const gasFeeSmallest = toSmallestUnits(GAS_FEE_USDC, CONFIG.USDC_DECIMALS);

            // Get user's USDC coins for fee (always needed)
            const usdcCoins = await suiClient.getCoins({
                owner: account.address,
                coinType: CONFIG.USDC_TYPE,
            });

            if (usdcCoins.data.length === 0) {
                throw new Error('No USDC coins found for fee payment');
            }

            const tx = new Transaction();

            // Merge USDC coins if multiple
            if (usdcCoins.data.length > 1) {
                const primary = tx.object(usdcCoins.data[0].coinObjectId);
                const rest = usdcCoins.data.slice(1).map(c => tx.object(c.coinObjectId));
                tx.mergeCoins(primary, rest);
            }

            // COMMAND 1: Split USDC for gas fee (always USDC)
            const [gasFeeCoins] = tx.splitCoins(
                tx.object(usdcCoins.data[0].coinObjectId),
                [tx.pure.u64(gasFeeSmallest)]
            );

            // COMMAND 2: Transfer gas fee to Admin
            tx.transferObjects([gasFeeCoins], ADMIN_ADDRESS);

            if (direction === 'USDC_TO_WALRUS') {
                // USDC -> WALRUS swap
                const swapAmountSmallest = toSmallestUnits(inputAmount, CONFIG.USDC_DECIMALS);

                // COMMAND 3: Split USDC for swap
                const [usdcForSwap] = tx.splitCoins(
                    tx.object(usdcCoins.data[0].coinObjectId),
                    [tx.pure.u64(swapAmountSmallest)]
                );

                // COMMAND 4: Call swap function
                tx.moveCall({
                    target: `${PACKAGE_ID}::pool::swap_usdc_for_walrus`,
                    arguments: [tx.object(POOL_OBJECT_ID), usdcForSwap],
                });
            } else {
                // WALRUS -> USDC swap
                const walrusCoins = await suiClient.getCoins({
                    owner: account.address,
                    coinType: CONFIG.WALRUS_TYPE,
                });

                if (walrusCoins.data.length === 0) {
                    throw new Error('No WALRUS coins found for swap');
                }

                // Merge WALRUS coins if multiple
                if (walrusCoins.data.length > 1) {
                    const primary = tx.object(walrusCoins.data[0].coinObjectId);
                    const rest = walrusCoins.data.slice(1).map(c => tx.object(c.coinObjectId));
                    tx.mergeCoins(primary, rest);
                }

                const swapAmountSmallest = toSmallestUnits(inputAmount, CONFIG.WALRUS_DECIMALS);

                // COMMAND 3: Split WALRUS for swap
                const [walrusForSwap] = tx.splitCoins(
                    tx.object(walrusCoins.data[0].coinObjectId),
                    [tx.pure.u64(swapAmountSmallest)]
                );

                // COMMAND 4: Call swap function
                tx.moveCall({
                    target: `${PACKAGE_ID}::pool::swap_walrus_for_usdc`,
                    arguments: [tx.object(POOL_OBJECT_ID), walrusForSwap],
                });
            }

            // Build as TransactionKind only
            const kindBytes = await tx.build({
                client: suiClient as any,
                onlyTransactionKind: true,
            });

            const kindBase64 = Buffer.from(kindBytes).toString('base64');
            console.log('✅ PTB built');

            // Step 2: Send to backend
            console.log('📡 [2/4] Sending to backend for sponsorship...');

            const response = await fetch(`${CONFIG.API_URL}/api/sponsor`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    txBytes: kindBase64,
                    userAddress: account.address,
                    amountUsdc: direction === 'USDC_TO_WALRUS' ? inputAmount : 0,
                    direction,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Sponsorship failed');
            }

            const { bytes: sponsoredBytesB64, signature: adminSig } = await response.json() as SponsorResponse;
            console.log('✅ Received sponsored tx');

            // Step 3: User signs
            console.log('🔐 [3/4] Requesting user signature...');

            const sponsoredBytes = Uint8Array.from(atob(sponsoredBytesB64), c => c.charCodeAt(0));
            const sponsoredTx = Transaction.from(sponsoredBytes);

            const { signature: userSig } = await signTransaction({
                transaction: sponsoredTx as any,
            });
            console.log('✅ User signed');

            // Step 4: Execute
            console.log('🚀 [4/4] Executing...');

            const result = await suiClient.executeTransactionBlock({
                transactionBlock: sponsoredBytes,
                signature: [userSig, adminSig],
                options: { showEffects: true, showEvents: true },
            });

            if (result.effects?.status?.status === 'failure') {
                throw new Error(result.effects.status.error || 'Swap failed');
            }

            console.log('🎉 SUCCESS! Digest:', result.digest);
            setTxDigest(result.digest);

        } catch (err) {
            console.error('❌ Swap error:', err);
            const msg = err instanceof Error ? err.message : 'Swap failed';
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

    return { swap, isLoading, error, txDigest, reset, gasFeeUsdc: GAS_FEE_USDC };
}
