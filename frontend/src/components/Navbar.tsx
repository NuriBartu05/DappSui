'use client';

import { useState, useEffect } from 'react';
import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';
import { Fuel, Moon, Sun, Droplets } from 'lucide-react';
import { GetGasModal } from './GetGasModal';
import { FaucetModal } from './FaucetModal';

export function Navbar() {
    // Initialize theme from localStorage or default to dark
    const [isDark, setIsDark] = useState(true);
    const [showGetGas, setShowGetGas] = useState(false);
    const [showFaucet, setShowFaucet] = useState(false);
    const account = useCurrentAccount();

    // On mount, check localStorage for theme preference
    useEffect(() => {
        const stored = localStorage.getItem('theme');
        if (stored === 'light') {
            setIsDark(false);
            document.documentElement.classList.remove('dark');
        } else {
            setIsDark(true);
            document.documentElement.classList.add('dark');
        }
    }, []);

    const toggleDarkMode = () => {
        const newIsDark = !isDark;
        setIsDark(newIsDark);

        if (newIsDark) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    };

    return (
        <>
            <nav className="sticky top-0 z-50 backdrop-blur-xl transition-colors duration-300
                            bg-dark-900/80 dark:bg-dark-900/80
                            bg-white/80 border-b
                            border-slate-200/50 dark:border-white/5">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Logo */}
                        <div className="flex items-center gap-2">
                            <div className="w-10 h-10 rounded-xl bg-gradient-swap flex items-center justify-center shadow-lg">
                                <Droplets className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xl font-bold bg-gradient-to-r from-primary-400 to-accent-purple bg-clip-text text-transparent">
                                GaslessDEX
                            </span>
                        </div>

                        {/* Right side actions */}
                        <div className="flex items-center gap-3">
                            {/* Faucet Button */}
                            {account && (
                                <button
                                    onClick={() => setShowFaucet(true)}
                                    className="btn-faucet"
                                >
                                    <span>🚰</span>
                                    <span className="hidden sm:inline">Faucet</span>
                                </button>
                            )}

                            {/* Get Gas Button - Only show when wallet connected */}
                            {account && (
                                <button
                                    onClick={() => setShowGetGas(true)}
                                    className="btn-gas flex items-center gap-2"
                                >
                                    <Fuel className="w-4 h-4" />
                                    <span className="hidden sm:inline">Get Gas</span>
                                </button>
                            )}

                            {/* Connect Wallet */}
                            <ConnectButton
                                className="!rounded-xl !px-4 !py-2 !transition-all !duration-200
                                           !bg-white/10 dark:!bg-white/10 !border
                                           !border-slate-300 dark:!border-white/20
                                           !text-gray-700 dark:!text-white
                                           hover:!bg-slate-100 dark:hover:!bg-white/20"
                            />

                            {/* Dark Mode Toggle */}
                            <button
                                onClick={toggleDarkMode}
                                className="p-2 rounded-lg transition-all duration-200
                                           bg-slate-100 dark:bg-white/5 
                                           hover:bg-slate-200 dark:hover:bg-white/10
                                           text-gray-600 dark:text-white"
                                aria-label="Toggle dark mode"
                            >
                                {isDark ? (
                                    <Sun className="w-5 h-5 text-yellow-500" />
                                ) : (
                                    <Moon className="w-5 h-5 text-slate-600" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Get Gas Modal */}
            <GetGasModal isOpen={showGetGas} onClose={() => setShowGetGas(false)} />

            {/* Faucet Modal */}
            <FaucetModal isOpen={showFaucet} onClose={() => setShowFaucet(false)} />
        </>
    );
}
