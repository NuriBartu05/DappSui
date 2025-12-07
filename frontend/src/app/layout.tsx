import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Navbar } from '@/components/Navbar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'Gasless DEX | Swap Tokens Without SUI',
    description: 'A gasless decentralized exchange on Sui Network. Swap tokens and get gas even with zero SUI balance.',
    keywords: ['Sui', 'DEX', 'Gasless', 'Swap', 'Crypto', 'Web3'],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className="dark">
            <body className={inter.className}>
                <Providers>
                    <div className="min-h-screen flex flex-col">
                        <Navbar />
                        <main className="flex-1">
                            {children}
                        </main>
                    </div>
                </Providers>
            </body>
        </html>
    );
}
