'use client';

import { Fragment, useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { X, Loader2, CheckCircle2, AlertCircle, DollarSign } from 'lucide-react';
import { CONFIG } from '@/lib/config';

interface FaucetModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type TokenType = 'USDC' | 'WALRUS';

interface MintState {
    loading: boolean;
    success: boolean;
    error: string | null;
    digest: string | null;
}

const initialMintState: MintState = {
    loading: false,
    success: false,
    error: null,
    digest: null,
};

export function FaucetModal({ isOpen, onClose }: FaucetModalProps) {
    const account = useCurrentAccount();
    const [usdcState, setUsdcState] = useState<MintState>(initialMintState);
    const [walrusState, setWalrusState] = useState<MintState>(initialMintState);

    if (!isOpen) return null;

    const handleMint = async (token: TokenType) => {
        if (!account?.address) return;

        const setState = token === 'USDC' ? setUsdcState : setWalrusState;

        setState({ loading: true, success: false, error: null, digest: null });

        try {
            const response = await fetch(`${CONFIG.API_URL}/api/faucet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    recipient: account.address,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Mint failed');
            }

            setState({
                loading: false,
                success: true,
                error: null,
                digest: data.digest
            });

            // Auto-reset success after 5 seconds
            setTimeout(() => {
                setState(initialMintState);
            }, 5000);

        } catch (err) {
            console.error(`Faucet error (${token}):`, err);
            setState({
                loading: false,
                success: false,
                error: err instanceof Error ? err.message : 'Mint failed',
                digest: null,
            });
        }
    };

    const handleClose = () => {
        setUsdcState(initialMintState);
        setWalrusState(initialMintState);
        onClose();
    };

    return (
        <Fragment>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="glass-card w-full max-w-sm p-6 relative animate-in fade-in zoom-in-95 duration-200">
                    {/* Close Button */}
                    <button
                        onClick={handleClose}
                        className="absolute top-4 right-4 p-2 rounded-lg 
                                   bg-slate-100 dark:bg-white/5 
                                   hover:bg-slate-200 dark:hover:bg-white/10
                                   text-gray-500 dark:text-white/60 
                                   hover:text-gray-700 dark:hover:text-white
                                   transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    {/* Header */}
                    <div className="text-center mb-6">
                        <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                            <span className="text-2xl">🚰</span>
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            Test Token Faucet
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-white/50 mt-1">
                            Get free tokens for testing
                        </p>
                    </div>

                    {/* Token Options */}
                    <div className="space-y-3">
                        {/* USDC Row */}
                        <TokenRow
                            token="USDC"
                            amount={500}
                            icon={<DollarSign className="w-5 h-5 text-white" />}
                            iconBg="bg-blue-500"
                            state={usdcState}
                            onMint={() => handleMint('USDC')}
                            disabled={!account}
                        />

                        {/* WALRUS Row */}
                        <TokenRow
                            token="WALRUS"
                            amount={5000}
                            icon={<span className="text-lg">🦭</span>}
                            iconBg="bg-gradient-to-br from-teal-400 to-blue-500"
                            state={walrusState}
                            onMint={() => handleMint('WALRUS')}
                            disabled={!account}
                        />
                    </div>

                    {/* Footer Note */}
                    <p className="text-center text-xs text-gray-400 dark:text-white/30 mt-5">
                        Testnet tokens only • No real value
                    </p>
                </div>
            </div>
        </Fragment>
    );
}

interface TokenRowProps {
    token: string;
    amount: number;
    icon: React.ReactNode;
    iconBg: string;
    state: MintState;
    onMint: () => void;
    disabled: boolean;
}

function TokenRow({ token, amount, icon, iconBg, state, onMint, disabled }: TokenRowProps) {
    return (
        <div className="p-4 rounded-xl 
                        bg-slate-50 dark:bg-white/5 
                        border border-slate-200 dark:border-white/10">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center`}>
                        {icon}
                    </div>
                    <div>
                        <div className="font-semibold text-gray-900 dark:text-white">{token}</div>
                        <div className="text-xs text-gray-500 dark:text-white/50">{amount.toLocaleString()} tokens</div>
                    </div>
                </div>

                {state.success ? (
                    <a
                        href={`https://testnet.suivision.xyz/txblock/${state.digest}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 rounded-lg font-medium text-sm
                                   bg-green-100 dark:bg-green-500/20 
                                   text-green-700 dark:text-green-400
                                   hover:bg-green-200 dark:hover:bg-green-500/30
                                   transition-colors flex items-center gap-1"
                    >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Done!</span>
                    </a>
                ) : (
                    <button
                        onClick={onMint}
                        disabled={disabled || state.loading}
                        className={`px-4 py-2 rounded-lg font-medium text-sm text-white
                                   transition-all duration-200 
                                   disabled:opacity-50 disabled:cursor-not-allowed
                                   ${token === 'USDC'
                                ? 'bg-blue-500 hover:bg-blue-600'
                                : 'bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600'}
                                   ${!disabled && !state.loading ? 'hover:scale-105 active:scale-95' : ''}`}
                    >
                        {state.loading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            'Mint'
                        )}
                    </button>
                )}
            </div>

            {/* Error Display */}
            {state.error && (
                <div className="mt-3 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    <span>{state.error}</span>
                </div>
            )}
        </div>
    );
}
