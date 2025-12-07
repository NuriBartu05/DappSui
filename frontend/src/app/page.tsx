import { SwapCard } from '@/components/SwapCard';

export default function Home() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] px-4 py-8">
            {/* Background decorations */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl animate-float" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-purple/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '-3s' }} />
            </div>

            {/* Hero Section */}
            <div className="text-center mb-8 relative z-10">
                <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary-400 via-accent-purple to-accent-pink bg-clip-text text-transparent">
                    Gasless DEX
                </h1>
                <p className="text-gray-600 dark:text-white/60 text-lg max-w-md mx-auto">
                    Swap tokens effortlessly, even with zero SUI.
                    <span className="text-primary-500 dark:text-primary-400"> We cover the gas.</span>
                </p>
            </div>

            {/* Swap Card */}
            <SwapCard />

            {/* Features */}
            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl w-full relative z-10">
                <FeatureCard
                    icon="⚡"
                    title="Zero Gas Needed"
                    description="Swap tokens even with empty wallet"
                />
                <FeatureCard
                    icon="🔒"
                    title="Secure"
                    description="Non-custodial, you sign every tx"
                />
                <FeatureCard
                    icon="💎"
                    title="Best Rates"
                    description="Direct pool swaps, minimal slippage"
                />
            </div>
        </div>
    );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
    return (
        <div className="glass-card p-4 text-center">
            <div className="text-3xl mb-2">{icon}</div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>
            <p className="text-gray-500 dark:text-white/50 text-sm">{description}</p>
        </div>
    );
}
