'use client';

import { useState, useEffect } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { X, Fuel, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useGetGas } from '@/hooks/useGetGas';
import { useBalances } from '@/hooks/useBalances';
import { CONFIG } from '@/lib/config';

interface GetGasModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function GetGasModal({ isOpen, onClose }: GetGasModalProps) {
    const account = useCurrentAccount();
    const { balances, refetch: refetchBalances } = useBalances();
    const { getGas, isLoading, error, txDigest, estimatedCost, reset } = useGetGas();

    // Reset on close
    useEffect(() => {
        if (!isOpen) {
            reset();
        }
    }, [isOpen, reset]);

    // Close and refresh after success
    useEffect(() => {
        if (txDigest) {
            const timer = setTimeout(() => {
                onClose();
                refetchBalances();
                reset();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [txDigest, onClose, refetchBalances, reset]);

    const handleGetGas = async () => {
        await getGas();
    };

    const hasEnoughUsdc = balances && estimatedCost && balances.usdc >= estimatedCost;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="glass-card w-full max-w-sm p-6 relative z-10 animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-gradient-gas">
                            <Fuel className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Get Gas</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg transition-colors
                                   hover:bg-slate-100 dark:hover:bg-white/10"
                    >
                        <X className="w-5 h-5 text-gray-500 dark:text-white/60" />
                    </button>
                </div>

                {/* Description */}
                <p className="text-gray-600 dark:text-white/60 text-sm mb-6">
                    Buy SUI for gas using your USDC. Perfect for when you need to interact with the network but have no SUI.
                </p>

                {/* Amount Info */}
                <div className="p-4 rounded-xl mb-6
                                bg-slate-50 dark:bg-white/5 
                                border border-slate-200 dark:border-white/10">
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-gray-600 dark:text-white/60 text-sm">You receive</span>
                        <span className="text-gray-900 dark:text-white font-semibold">
                            {CONFIG.GET_GAS_AMOUNT_SUI} SUI
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-white/60 text-sm">Estimated cost</span>
                        <span className="text-gray-900 dark:text-white font-semibold">
                            ~{estimatedCost?.toFixed(4) ?? '...'} USDC
                        </span>
                    </div>
                </div>

                {/* Your Balance */}
                <div className="flex justify-between items-center mb-6 text-sm">
                    <span className="text-gray-600 dark:text-white/60">Your USDC balance</span>
                    <span className="text-gray-900 dark:text-white">
                        {balances?.usdc.toFixed(2) ?? '0'} USDC
                    </span>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="flex items-center gap-2 mb-4 p-3 rounded-xl 
                                    bg-red-50 dark:bg-red-500/10 
                                    border border-red-200 dark:border-red-500/20 
                                    text-red-700 dark:text-red-400 text-sm">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Success Message */}
                {txDigest && (
                    <div className="flex items-center gap-2 mb-4 p-3 rounded-xl 
                                    bg-green-50 dark:bg-green-500/10 
                                    border border-green-200 dark:border-green-500/20 
                                    text-green-700 dark:text-green-400 text-sm">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        <span>
                            Gas received!{' '}
                            <a
                                href={`https://testnet.suivision.xyz/txblock/${txDigest}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:text-green-600 dark:hover:text-green-300"
                            >
                                View TX
                            </a>
                        </span>
                    </div>
                )}

                {/* Action Button */}
                <button
                    onClick={handleGetGas}
                    disabled={isLoading || !account || !hasEnoughUsdc}
                    className="btn-gas w-full flex items-center justify-center gap-2 py-3"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Getting Gas...</span>
                        </>
                    ) : !hasEnoughUsdc ? (
                        'Insufficient USDC'
                    ) : (
                        <>
                            <Fuel className="w-4 h-4" />
                            <span>Get Gas</span>
                        </>
                    )}
                </button>

                {/* Info */}
                <p className="text-center text-gray-400 dark:text-white/40 text-xs mt-4">
                    Gas fee is included in the USDC cost
                </p>
            </div>
        </div>
    );
}
