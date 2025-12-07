'use client';

import { useState, useEffect, useMemo } from 'react';
import { useCurrentAccount, useSuiClient, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { ArrowDownUp, Loader2, AlertCircle, CheckCircle2, ArrowUpDown } from 'lucide-react';
import { useBalances } from '@/hooks/useBalances';
import { useSwap } from '@/hooks/useSwap';
import { CONFIG } from '@/lib/config';

type SwapDirection = 'USDC_TO_WALRUS' | 'WALRUS_TO_USDC';

export function SwapCard() {
    const account = useCurrentAccount();
    const suiClient = useSuiClient();
    const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
    const { balances, isLoading: balancesLoading, refetch: refetchBalances } = useBalances();
    const { swap, isLoading: isGaslessLoading, error: gaslessError, txDigest: gaslessTxDigest, reset, gasFeeUsdc } = useSwap();

    const [inputAmount, setInputAmount] = useState<string>('');
    const [direction, setDirection] = useState<SwapDirection>('USDC_TO_WALRUS');
    const [isGaslessMode, setIsGaslessMode] = useState(true);
    const [isStandardLoading, setIsStandardLoading] = useState(false);
    const [standardError, setStandardError] = useState<string | null>(null);
    const [standardTxDigest, setStandardTxDigest] = useState<string | null>(null);

    // Combine loading/error/txDigest states
    const isLoading = isGaslessMode ? isGaslessLoading : isStandardLoading;
    const error = isGaslessMode ? gaslessError : standardError;
    const txDigest = isGaslessMode ? gaslessTxDigest : standardTxDigest;

    // Token info based on direction
    const fromToken = direction === 'USDC_TO_WALRUS' ? 'USDC' : 'WALRUS';
    const toToken = direction === 'USDC_TO_WALRUS' ? 'WALRUS' : 'USDC';
    const fromBalance = direction === 'USDC_TO_WALRUS' ? balances?.usdc : balances?.walrus;
    const toBalance = direction === 'USDC_TO_WALRUS' ? balances?.walrus : balances?.usdc;

    // Calculate output amount based on real rate
    const outputAmount = useMemo(() => {
        const amount = parseFloat(inputAmount);
        if (isNaN(amount) || amount <= 0) return '0';
        if (direction === 'USDC_TO_WALRUS') {
            return (amount * CONFIG.USDC_TO_WALRUS_RATE).toFixed(4);
        } else {
            return (amount * CONFIG.WALRUS_PRICE_USDC).toFixed(4);
        }
    }, [inputAmount, direction]);

    // Reverse swap direction
    const handleReverseDirection = () => {
        setDirection(d => d === 'USDC_TO_WALRUS' ? 'WALRUS_TO_USDC' : 'USDC_TO_WALRUS');
        setInputAmount('');
    };

    // Reset success state after showing
    useEffect(() => {
        if (txDigest) {
            const timer = setTimeout(() => {
                reset();
                setStandardTxDigest(null);
                setInputAmount('');
                refetchBalances();
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [txDigest, reset, refetchBalances]);

    // Standard swap (user pays SUI gas)
    const handleStandardSwap = async () => {
        if (!account?.address) return;
        const amount = parseFloat(inputAmount);
        if (isNaN(amount) || amount <= 0) return;

        setIsStandardLoading(true);
        setStandardError(null);
        setStandardTxDigest(null);

        try {
            const tx = new Transaction();
            const decimals = direction === 'USDC_TO_WALRUS' ? CONFIG.USDC_DECIMALS : CONFIG.WALRUS_DECIMALS;
            const coinType = direction === 'USDC_TO_WALRUS' ? CONFIG.USDC_TYPE : CONFIG.WALRUS_TYPE;
            const amountSmallest = BigInt(Math.floor(amount * Math.pow(10, decimals)));

            const userCoins = await suiClient.getCoins({ owner: account.address, coinType });
            if (userCoins.data.length === 0) throw new Error(`No ${fromToken} coins found`);

            if (userCoins.data.length > 1) {
                const primary = tx.object(userCoins.data[0].coinObjectId);
                const rest = userCoins.data.slice(1).map(c => tx.object(c.coinObjectId));
                tx.mergeCoins(primary, rest);
            }

            const [coinForSwap] = tx.splitCoins(
                tx.object(userCoins.data[0].coinObjectId),
                [tx.pure.u64(amountSmallest)]
            );

            const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID || '';
            const POOL_OBJECT_ID = process.env.NEXT_PUBLIC_POOL_OBJECT_ID || '';
            const target = direction === 'USDC_TO_WALRUS'
                ? `${PACKAGE_ID}::pool::swap_usdc_for_walrus`
                : `${PACKAGE_ID}::pool::swap_walrus_for_usdc`;

            tx.moveCall({
                target,
                arguments: [tx.object(POOL_OBJECT_ID), coinForSwap],
            });

            const result = await signAndExecute({ transaction: tx });
            setStandardTxDigest(result.digest);
        } catch (err) {
            console.error('Standard swap error:', err);
            setStandardError(err instanceof Error ? err.message : 'Swap failed');
        } finally {
            setIsStandardLoading(false);
        }
    };

    // Handle swap based on mode
    const handleSwap = async () => {
        const amount = parseFloat(inputAmount);
        if (isNaN(amount) || amount <= 0) return;

        if (isGaslessMode) {
            await swap(amount, true, direction);
        } else {
            await handleStandardSwap();
        }
    };

    const handleMaxClick = () => {
        if (!fromBalance) return;
        if (isGaslessMode && fromToken === 'USDC') {
            setInputAmount(Math.max(0, fromBalance - gasFeeUsdc - 0.01).toFixed(2));
        } else {
            setInputAmount(fromBalance.toFixed(4));
        }
    };

    const isValidAmount = parseFloat(inputAmount) > 0;
    const requiredBalance = isGaslessMode && fromToken === 'USDC'
        ? parseFloat(inputAmount) + gasFeeUsdc
        : parseFloat(inputAmount);
    const hasInsufficientBalance = fromBalance !== undefined && requiredBalance > fromBalance;

    // Display rate string
    const rateDisplay = `1 WALRUS = ${CONFIG.WALRUS_PRICE_USDC} USDC`;

    return (
        <div className="glass-card w-full max-w-md p-6 relative z-10">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Swap</h2>
                <div className="text-xs text-gray-500 dark:text-white/40">{rateDisplay}</div>
            </div>

            {/* From Token */}
            <div className="mb-2">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600 dark:text-white/60">From</span>
                    <span className="text-sm text-gray-500 dark:text-white/40">
                        Balance: {balancesLoading ? '...' : (fromBalance?.toFixed(2) ?? '0')} {fromToken}
                    </span>
                </div>
                <div className="relative">
                    <input
                        type="number"
                        value={inputAmount}
                        onChange={(e) => setInputAmount(e.target.value)}
                        placeholder="0.00"
                        className="input-field pr-28"
                        disabled={!account || isLoading}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        <button
                            onClick={handleMaxClick}
                            className="text-xs font-medium text-primary-500 hover:text-primary-400 transition-colors"
                            disabled={!account}
                        >
                            MAX
                        </button>
                        <div className="token-badge">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${fromToken === 'USDC' ? 'bg-blue-500' : 'bg-gradient-to-r from-teal-400 to-blue-500'
                                }`}>
                                {fromToken === 'USDC' ? '$' : '🦭'}
                            </div>
                            <span className="text-sm font-medium text-gray-800 dark:text-white">{fromToken}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Swap Arrow - Clickable */}
            <div className="flex justify-center my-4">
                <button
                    onClick={handleReverseDirection}
                    className="p-2 rounded-xl transition-all group
                               bg-slate-100 dark:bg-white/5 
                               border border-slate-200 dark:border-white/10 
                               hover:bg-slate-200 dark:hover:bg-white/10 
                               hover:border-primary-400 dark:hover:border-primary-500/50"
                    title="Reverse swap direction"
                >
                    <ArrowUpDown className="w-5 h-5 text-gray-500 dark:text-white/60 group-hover:text-primary-500 dark:group-hover:text-primary-400 transition-colors" />
                </button>
            </div>

            {/* To Token */}
            <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600 dark:text-white/60">To</span>
                    <span className="text-sm text-gray-500 dark:text-white/40">
                        Balance: {balancesLoading ? '...' : (toBalance?.toFixed(2) ?? '0')} {toToken}
                    </span>
                </div>
                <div className="relative">
                    <input
                        type="text"
                        value={outputAmount}
                        readOnly
                        placeholder="0.00"
                        className="input-field pr-24 !bg-slate-50 dark:!bg-white/[0.02]"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <div className="token-badge">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white ${toToken === 'USDC' ? 'bg-blue-500 font-bold' : 'bg-gradient-to-r from-teal-400 to-blue-500'
                                }`}>
                                {toToken === 'USDC' ? '$' : '🦭'}
                            </div>
                            <span className="text-sm font-medium text-gray-800 dark:text-white">{toToken}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Gas Mode Toggle */}
            <div className="flex items-center justify-between mb-4 p-3 rounded-xl 
                            bg-slate-50 dark:bg-white/5 
                            border border-slate-200 dark:border-white/10">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isGaslessMode ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    <span className="text-sm text-gray-700 dark:text-white/80">
                        {isGaslessMode ? 'Gasless Mode' : 'Standard Gas'}
                    </span>
                    {isGaslessMode && (
                        <span className="text-xs text-gray-500 dark:text-white/40">(Fee: {gasFeeUsdc} USDC)</span>
                    )}
                </div>
                <button
                    onClick={() => setIsGaslessMode(!isGaslessMode)}
                    className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${isGaslessMode ? 'bg-green-500' : 'bg-yellow-500'
                        }`}
                >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-transform duration-200 ${isGaslessMode ? 'translate-x-7' : 'translate-x-1'
                        }`} />
                </button>
            </div>

            {/* Info Box */}
            {isGaslessMode && (
                <div className="info-box-green flex items-center justify-between mb-4">
                    <span>Admin Sponsored Gas</span>
                    <span className="text-xs opacity-70">You pay 0 SUI</span>
                </div>
            )}

            {!isGaslessMode && (
                <div className="info-box-yellow flex items-center gap-2 mb-4">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>You will pay gas in SUI</span>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="info-box-red flex items-center gap-2 mb-4">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Success Message */}
            {txDigest && (
                <div className="info-box-green flex items-center gap-2 mb-4">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span>
                        Swap successful!{' '}
                        <a
                            href={`https://testnet.suivision.xyz/txblock/${txDigest}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:opacity-80"
                        >
                            View TX
                        </a>
                    </span>
                </div>
            )}

            {/* Swap Button */}
            {!account ? (
                <div className="text-center py-4 text-gray-500 dark:text-white/50">
                    Connect wallet to swap
                </div>
            ) : (
                <button
                    onClick={handleSwap}
                    disabled={isLoading || !isValidAmount || hasInsufficientBalance}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Swapping...</span>
                        </>
                    ) : hasInsufficientBalance ? (
                        `Insufficient ${fromToken} Balance`
                    ) : !isValidAmount ? (
                        'Enter Amount'
                    ) : (
                        `Swap ${fromToken} → ${toToken}`
                    )}
                </button>
            )}
        </div>
    );
}
