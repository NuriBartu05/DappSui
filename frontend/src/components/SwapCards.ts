'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useWalletOperations } from '@/providers/WalletProvider';
import { 
  dexApi, 
  txBytesFromBase64, 
  formatTokenAmount, 
  parseTokenAmount,
  QuoteResponse 
} from '@/lib/api';
import { Loader2, ArrowDownUp, Fuel } from 'lucide-react';

const TOKEN_DECIMALS = {
  SUI: 9,
  USDC: 6,
  USDT: 6,
};

export function SwapCard() {
  const { toast } = useToast();
  const { address, executeTransaction, executeSponsoredTransaction } = useWalletOperations();

  // Form state
  const [tokenIn, setTokenIn] = useState('0x2::sui::SUI');
  const [tokenOut, setTokenOut] = useState('');
  const [amountIn, setAmountIn] = useState('');
  const [slippage, setSlippage] = useState(50); // 0.5%
  const [useSponsored, setUseSponsored] = useState(false);
  const [paymentToken, setPaymentToken] = useState('USDC');

  // Quote state
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  
  // Transaction state
  const [executing, setExecuting] = useState(false);

  // Fetch quote when inputs change
  useEffect(() => {
    const fetchQuote = async () => {
      if (!tokenIn || !tokenOut || !amountIn || parseFloat(amountIn) <= 0) {
        setQuote(null);
        return;
      }

      setLoadingQuote(true);
      try {
        const amount = parseTokenAmount(amountIn, TOKEN_DECIMALS.SUI);
        const quoteData = await dexApi.getQuote({
          tokenInType: tokenIn,
          tokenOutType: tokenOut,
          amount,
        });
        setQuote(quoteData);
      } catch (error: any) {
        console.error('Quote error:', error);
        toast({
          title: 'Quote Error',
          description: error.message,
          variant: 'destructive',
        });
      } finally {
        setLoadingQuote(false);
      }
    };

    const debounce = setTimeout(fetchQuote, 500);
    return () => clearTimeout(debounce);
  }, [tokenIn, tokenOut, amountIn, toast]);

  /**
   * Handle swap execution
   */
  const handleSwap = async () => {
    if (!address) {
      toast({
        title: 'Wallet Not Connected',
        description: 'Please connect your wallet first',
        variant: 'destructive',
      });
      return;
    }

    if (!quote) {
      toast({
        title: 'No Quote',
        description: 'Please wait for quote to load',
        variant: 'destructive',
      });
      return;
    }

    setExecuting(true);

    try {
      const amount = parseTokenAmount(amountIn, TOKEN_DECIMALS.SUI);

      if (useSponsored) {
        // Sponsored swap (Enoki pays gas)
        const response = await dexApi.buildSponsoredSwap({
          userAddress: address,
          tokenInType: tokenIn,
          tokenOutType: tokenOut,
          amount,
          slippage,
          paymentTokenType: paymentToken === 'USDC' ? tokenIn : tokenIn,
        });

        // Convert base64 to Uint8Array
        const txBytes = txBytesFromBase64(response.txBytes);

        // Execute with sponsor signature
        const result = await executeSponsoredTransaction(
          txBytes,
          response.sponsorSignature
        );

        toast({
          title: 'Swap Successful! 🎉',
          description: `Transaction: ${result.digest}`,
        });
      } else {
        // Standard swap (user pays gas)
        const response = await dexApi.buildSwap({
          userAddress: address,
          tokenInType: tokenIn,
          tokenOutType: tokenOut,
          amount,
          slippage,
        });

        const txBytes = txBytesFromBase64(response.txBytes);
        const result = await executeTransaction(txBytes);

        toast({
          title: 'Swap Successful! 🎉',
          description: `Transaction: ${result.digest}`,
        });
      }

      // Reset form
      setAmountIn('');
      setQuote(null);
    } catch (error: any) {
      console.error('Swap error:', error);
      toast({
        title: 'Swap Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setExecuting(false);
    }
  };

  /**
   * Handle refuel (get gas)
   */
  const handleRefuel = async (suiAmount: '1' | '5') => {
    if (!address) {
      toast({
        title: 'Wallet Not Connected',
        description: 'Please connect your wallet first',
        variant: 'destructive',
      });
      return;
    }

    setExecuting(true);

    try {
      const amountOut = suiAmount === '1' ? '1000000000' : '5000000000';

      const response = await dexApi.buildRefuel({
        userAddress: address,
        tokenInType: tokenIn,
        amountOut,
        slippage: 100, // 1% slippage for refuel
      });

      const txBytes = txBytesFromBase64(response.txBytes);
      const result = await executeTransaction(txBytes);

      toast({
        title: `Refueled ${suiAmount} SUI! ⛽`,
        description: `Transaction: ${result.digest}`,
      });
    } catch (error: any) {
      console.error('Refuel error:', error);
      toast({
        title: 'Refuel Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Swap Tokens</CardTitle>
        <CardDescription>
          Swap tokens on Sui Testnet with the best rates
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* From Token */}
        <div className="space-y-2">
          <Label>From</Label>
          <Input
            type="text"
            placeholder="0x2::sui::SUI"
            value={tokenIn}
            onChange={(e) => setTokenIn(e.target.value)}
          />
          <Input
            type="number"
            placeholder="Amount"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
          />
        </div>

        {/* Swap Direction Icon */}
        <div className="flex justify-center">
          <ArrowDownUp className="h-6 w-6 text-muted-foreground" />
        </div>

        {/* To Token */}
        <div className="space-y-2">
          <Label>To</Label>
          <Input
            type="text"
            placeholder="Token out address"
            value={tokenOut}
            onChange={(e) => setTokenOut(e.target.value)}
          />
          {quote && (
            <div className="text-sm text-muted-foreground">
              Estimated: {formatTokenAmount(quote.estimatedAmountOut, TOKEN_DECIMALS.USDC)}
            </div>
          )}
        </div>

        {/* Gas Preference Toggle */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="space-y-0.5">
            <Label>Pay gas with USDC</Label>
            <p className="text-sm text-muted-foreground">
              Use sponsored transaction
            </p>
          </div>
          <Switch
            checked={useSponsored}
            onCheckedChange={setUseSponsored}
          />
        </div>

        {/* Quote Info */}
        {loadingQuote && (
          <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading quote...
          </div>
        )}

        {quote && !loadingQuote && (
          <div className="p-4 border rounded-lg space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price Impact:</span>
              <span>{parseFloat(quote.priceImpact).toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Route:</span>
              <span>{quote.route.protocols.join(' → ')}</span>
            </div>
          </div>
        )}

        {/* Swap Button */}
        <Button 
          className="w-full" 
          onClick={handleSwap}
          disabled={!address || !quote || executing || loadingQuote}
        >
          {executing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Swapping...
            </>
          ) : !address ? (
            'Connect Wallet'
          ) : (
            'Swap'
          )}
        </Button>

        {/* Refuel Buttons */}
        <div className="pt-4 border-t">
          <Label className="mb-2 flex items-center">
            <Fuel className="h-4 w-4 mr-2" />
            Get Gas (Refuel)
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => handleRefuel('1')}
              disabled={!address || executing}
            >
              Get 1 SUI
            </Button>
            <Button
              variant="outline"
              onClick={() => handleRefuel('5')}
              disabled={!address || executing}
            >
              Get 5 SUI
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
