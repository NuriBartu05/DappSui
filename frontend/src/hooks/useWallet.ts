'use client';

import { 
  useCurrentAccount, 
  useSignAndExecuteTransaction,
  useSignTransaction,
  useSuiClient,
  useDisconnectWallet,
  useConnectWallet,
  useWallets,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { useCallback, useMemo } from 'react';

export interface WalletOperations {
  address: string | undefined;
  isConnected: boolean;
  connect: (walletName?: string) => void;
  disconnect: () => void;
  executeTransaction: (txBytes: Uint8Array) => Promise<{ digest: string }>;
  executeSponsoredTransaction: (
    txBytes: Uint8Array,
    sponsorSignature: string
  ) => Promise<{ digest: string }>;
  getBalance: () => Promise<bigint>;
}

export function useWallet(): WalletOperations {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const { mutateAsync: signTransaction } = useSignTransaction();
  const { mutate: disconnectWallet } = useDisconnectWallet();
  const { mutate: connectWallet } = useConnectWallet();
  const wallets = useWallets();

  const address = currentAccount?.address;
  const isConnected = !!address;

  /**
   * Connect to a wallet
   */
  const connect = useCallback((walletName?: string) => {
    const targetWallet = walletName 
      ? wallets.find(w => w.name === walletName)
      : wallets[0];
    
    if (targetWallet) {
      connectWallet({ wallet: targetWallet });
    }
  }, [connectWallet, wallets]);

  /**
   * Disconnect wallet
   */
  const disconnect = useCallback(() => {
    disconnectWallet();
  }, [disconnectWallet]);

  /**
   * Execute a standard transaction (user pays gas)
   */
  const executeTransaction = useCallback(async (txBytes: Uint8Array) => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    const tx = Transaction.from(txBytes);
    
    const result = await signAndExecute({
      transaction: tx,
    });

    return { digest: result.digest };
  }, [address, signAndExecute]);

  /**
   * Execute a sponsored transaction
   * User signs, then we combine with sponsor signature
   */
  const executeSponsoredTransaction = useCallback(async (
    txBytes: Uint8Array,
    sponsorSignature: string
  ) => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    const tx = Transaction.from(txBytes);
    
    // Get user signature
    const { signature: userSignature, bytes } = await signTransaction({
      transaction: tx,
    });

    // Execute with both signatures
    const result = await suiClient.executeTransactionBlock({
      transactionBlock: bytes,
      signature: [userSignature, sponsorSignature],
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    return { digest: result.digest };
  }, [address, signTransaction, suiClient]);

  /**
   * Get SUI balance
   */
  const getBalance = useCallback(async () => {
    if (!address) {
      return BigInt(0);
    }

    const balance = await suiClient.getBalance({
      owner: address,
    });

    return BigInt(balance.totalBalance);
  }, [address, suiClient]);

  return useMemo(() => ({
    address,
    isConnected,
    connect,
    disconnect,
    executeTransaction,
    executeSponsoredTransaction,
    getBalance,
  }), [
    address,
    isConnected,
    connect,
    disconnect,
    executeTransaction,
    executeSponsoredTransaction,
    getBalance,
  ]);
}

export default useWallet;
