'use client';

import { createNetworkConfig, SuiClientProvider, WalletProvider as SuiWalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

// Create network configuration for Testnet
const { networkConfig } = createNetworkConfig({
  testnet: { url: getFullnodeUrl('testnet') },
});

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 60000, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
});

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <SuiWalletProvider
          autoConnect={true}
          theme="dark"
          // Prefer Slush Wallet but support all standard wallets
          preferredWallets={['Slush Wallet', 'Sui Wallet']}
        >
          {children}
        </SuiWalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}

// Custom hook for wallet operations
import { useCurrentAccount, useSignAndExecuteTransaction, useSignTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';

export function useWalletOperations() {
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const { mutateAsync: signTransaction } = useSignTransaction();

  /**
   * Execute a standard transaction (user pays gas)
   */
  const executeTransaction = async (txBytes: Uint8Array) => {
    if (!currentAccount) {
      throw new Error('Wallet not connected');
    }

    const result = await signAndExecute({
      transaction: Transaction.from(txBytes),
    });

    return result;
  };

  /**
   * Execute a sponsored transaction (Enoki pays gas)
   * User signs, then combines with sponsor signature
   */
  const executeSponsoredTransaction = async (
    txBytes: Uint8Array,
    sponsorSignature: string
  ) => {
    if (!currentAccount) {
      throw new Error('Wallet not connected');
    }

    // User signs the transaction
    const { signature: userSignature } = await signTransaction({
      transaction: Transaction.from(txBytes),
    });

    // Combine user signature and sponsor signature
    // The order matters: [user signature, sponsor signature]
    const combinedSignatures = [userSignature, sponsorSignature];

    // Execute with both signatures
    const result = await signAndExecute({
      transaction: Transaction.from(txBytes),
      signature: combinedSignatures,
    });

    return result;
  };

  return {
    currentAccount,
    address: currentAccount?.address,
    executeTransaction,
    executeSponsoredTransaction,
  };
}
