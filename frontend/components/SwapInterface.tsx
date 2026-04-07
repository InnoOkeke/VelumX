/**
 * SwapInterface Component
 * UI for swapping tokens on Stacks using our AMM swap contract
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/lib/hooks/useWallet';
import { useConfig, getConfig } from '@/lib/config';
import { ArrowDownUp, Settings, Info, Loader2, AlertTriangle, Wallet, ChevronDown, Zap } from 'lucide-react';
import { formatUnits, parseUnits } from 'viem';
import { getStacksTransactions, getStacksNetwork, getStacksCommon, getStacksConnect, getNetworkInstance } from '@/lib/stacks-loader';
import { encodeStacksAddress, bytesToHex } from '@/lib/utils/address-encoding';
import { getVelumXClient } from '@/lib/velumx';
import { TokenInput } from './ui/TokenInput';
import { SettingsPanel } from './ui/SettingsPanel';
import { GaslessToggle } from './ui/GaslessToggle';
import { SwapDetails } from './ui/SwapDetails';
import { TransactionStatus } from './ui/TransactionStatus';

interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoUrl?: string;
  assetName?: string; // Explicit asset name for post-conditions
}

interface SwapQuote {
  amountOut: string;
  priceImpact: string;
  fee: string;
  rate: string;
}

interface SwapState {
  inputToken: Token | null;
  outputToken: Token | null;
  inputAmount: string;
  outputAmount: string;
  gaslessMode: boolean;
  selectedGasToken: Token | null; // New: Universal Gas Token
  isProcessing: boolean;
  isFetchingQuote: boolean;
  error: string | null;
  success: string | null;
  quote: SwapQuote | null;
  gasFee: string;
  slippage: number;
  showSettings: boolean;
  isRegistering: boolean;
}

// Absolute minimal baseline for boot (STX is universal)
const FALLBACK_STX: Token = {
  symbol: 'STX',
  name: 'Stacks',
  address: 'token-wstx',
  decimals: 6,
  logoUrl: 'https://assets.coingecko.com/coins/images/2069/small/Stacks_logo_full.png',
};

// High-priority VelumX assets that must be available even if discovery is pending
const VELUMX_PRIORITY_TOKENS: Token[] = [
  {
    symbol: 'USDCx',
    name: 'VelumX USDC',
    address: 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx',
    decimals: 6,
    logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
  }
];

export function SwapInterface() {
  const { stacksAddress, stacksConnected, balances, fetchBalances, stacksPublicKey, recoverPublicKey } = useWallet();
  const config = useConfig();

  const getBalance = (token: Token | null): string => {
    if (!token) return '0';
    const symbol = token.symbol.toLowerCase();
    return (balances as any)[symbol] || '0';
  };

  const [tokens, setTokens] = useState<Token[]>([FALLBACK_STX, ...VELUMX_PRIORITY_TOKENS]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [state, setState] = useState<SwapState>({
    inputToken: FALLBACK_STX,
    outputToken: VELUMX_PRIORITY_TOKENS[0], // USDCx
    inputAmount: '',
    outputAmount: '',
    gaslessMode: true,
    selectedGasToken: VELUMX_PRIORITY_TOKENS[0], // USDCx
    isProcessing: false,
    isFetchingQuote: false,
    error: null,
    success: null,
    quote: null,
    gasFee: '0.2',
    slippage: 0.5,
    showSettings: false,
    isRegistering: false,
  });

  // Dynamic Token Discovery via ALEX SDK
  useEffect(() => {
    let isMounted = true;

    const fetchAlexTokens = async () => {
      try {
        setIsDiscovering(true);
        console.log("Swap: Initializing Token Discovery (ALEX SDK v3)...");
        
        const { AlexSDK } = await import('alex-sdk');
        const alex = new AlexSDK();
        
        let alexTokensList: any[] = [];
        
        try {
          // ALEX SDK v3 - Try multiple methods to get token list
          console.log("Swap: Attempting to fetch token list from ALEX SDK...");
          
          // Method 1: Try getFtList (v3 method)
          if (typeof (alex as any).getFtList === 'function') {
            console.log("Swap: Using getFtList method...");
            const ftList = await (alex as any).getFtList();
            if (ftList && typeof ftList === 'object') {
              alexTokensList = Object.values(ftList);
              console.log(`Swap: Found ${alexTokensList.length} tokens via getFtList`);
            }
          }
          
          // Method 2: Try currency property (v3)
          if (alexTokensList.length === 0 && (alex as any).currency) {
            console.log("Swap: Using currency property...");
            const currencies = (alex as any).currency;
            if (currencies && typeof currencies === 'object') {
              alexTokensList = Object.values(currencies);
              console.log(`Swap: Found ${alexTokensList.length} tokens via currency`);
            }
          }
          
          // Method 3: Try getAllTokens if available
          if (alexTokensList.length === 0 && typeof (alex as any).getAllTokens === 'function') {
            console.log("Swap: Using getAllTokens method...");
            const allTokens = await (alex as any).getAllTokens();
            if (allTokens) {
              alexTokensList = Array.isArray(allTokens) ? allTokens : Object.values(allTokens);
              console.log(`Swap: Found ${alexTokensList.length} tokens via getAllTokens`);
            }
          }
          
          // Method 4: Hardcoded fallback for common ALEX tokens
          if (alexTokensList.length === 0) {
            console.warn("Swap: ALEX SDK methods failed, using hardcoded token list");
            alexTokensList = [
              {
                id: 'token-alex',
                symbol: 'ALEX',
                name: 'ALEX Token',
                decimals: 8,
                icon: 'https://assets.coingecko.com/coins/images/18776/small/alex-logo.png'
              },
              {
                id: 'token-susdt',
                symbol: 'sUSDT',
                name: 'Stacks USDT',
                decimals: 8,
                icon: 'https://assets.coingecko.com/coins/images/325/small/Tether.png'
              },
              {
                id: 'token-wstx',
                symbol: 'wSTX',
                name: 'Wrapped STX',
                decimals: 6,
                icon: 'https://assets.coingecko.com/coins/images/2069/small/Stacks_logo_full.png'
              }
            ];
          }
          
        } catch (innerError) {
          console.error("Swap: SDK Discovery Failed", innerError);
        }
        
        if (!isMounted) return;

        if (alexTokensList && alexTokensList.length > 0) {
          // Map ALEX tokens to our Token interface
          const mappedTokens: Token[] = alexTokensList
            .map((t: any) => ({
              symbol: t.symbol || t.name || 'Unknown',
              name: t.name || t.symbol || 'Unknown Token',
              address: t.id || t.contractAddress || t.address || 'unknown-address',
              decimals: t.decimals || 8,
              logoUrl: t.icon || t.logo || t.logoUrl || '',
            }))
            .filter(t => t.symbol !== 'Unknown' && t.address !== 'unknown-address');

          console.log(`Swap: Mapped ${mappedTokens.length} valid tokens`);

          // Merging logic: Keep Priority tokens at the top, then add discovered ones
          setTokens(prev => {
            const unique = [FALLBACK_STX, ...VELUMX_PRIORITY_TOKENS];
            mappedTokens.forEach(mt => {
              const alreadyIn = unique.find(ut => 
                ut.symbol.toLowerCase() === mt.symbol.toLowerCase() || 
                ut.address.toLowerCase() === mt.address.toLowerCase()
              );
              if (!alreadyIn) {
                unique.push(mt);
              }
            });
            console.log(`Swap: Discovery complete. ${unique.length} total assets available.`);
            return unique;
          });
        } else {
          console.warn("Swap: No tokens discovered from ALEX SDK");
        }
      } catch (e) {
        console.error("Swap: Discovery Critical Failure", e);
      } finally {
        if (isMounted) setIsDiscovering(false);
      }
    };
    
    fetchAlexTokens();
    return () => { isMounted = false; };
  }, []);

  const fetchQuote = async () => {
    if (!state.inputToken || !state.outputToken || !state.inputAmount) return;

    setState(prev => ({ ...prev, isFetchingQuote: true, error: null }));

    try {
      // Lazy load AlexSDK to optimize bundle size
      const { AlexSDK, Currency } = await import('alex-sdk');
      const alex = new AlexSDK() as any;

      // Convert input amount to micro units
      const amountInMicro = BigInt(parseUnits(state.inputAmount, state.inputToken.decimals).toString());

      // Fetch quote from ALEX SDK
      // Alex uses specific token principals. For STX it's usually 'token-wstx'
      const tokenIn = (state.inputToken.symbol === 'STX' ? 'token-wstx' : state.inputToken.address) as any;
      const tokenOut = (state.outputToken.symbol === 'STX' ? 'token-wstx' : state.outputToken.address) as any;
      
      const amountOut = await alex.getAmountTo(
        tokenIn,
        amountInMicro,
        tokenOut
      );

      if (amountOut === undefined || amountOut === null) {
        throw new Error('No liquidity found for this pair on ALEX');
      }

      // Fetch price impact if available (some SDK versions have getPriceImpact)
      let priceImpact = 0.3;
      try {
        const routers = await alex.getRouter(tokenIn, tokenOut);
        // Simplified impact for now as it depends on SDK version
      } catch (e) {}

      // Convert output amount from micro units to display units
      const outputAmountFormatted = (Number(amountOut) / Math.pow(10, state.outputToken.decimals)).toFixed(6);
      const rate = (Number(amountOut) / Number(amountInMicro)).toFixed(6);

      setState(prev => ({
        ...prev,
        outputAmount: outputAmountFormatted,
        quote: {
          amountOut: outputAmountFormatted,
          priceImpact: priceImpact.toFixed(2),
          fee: "0.3%", // ALEX standard AMM fee
          rate: rate,
        },
        isFetchingQuote: false,
      }));
    } catch (error) {
      console.error('Failed to fetch quote via ALEX SDK:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to get quote from ALEX. Pool may not exist or liquidity is low.',
        isFetchingQuote: false,
      }));
    }
  };

  // Fetch fee estimate for universal gas mode
  const fetchFeeEstimate = useCallback(async () => {
    if (!state.gaslessMode || !state.selectedGasToken) return;

    try {
      const velumxClient = getVelumXClient();
      const estimate = await velumxClient.estimateFee({
        estimatedGas: 100000,
        feeToken: state.selectedGasToken.address // Pass the Universal Token address
      });

      console.log('Universal Fee Estimate:', estimate);

      if (estimate && estimate.maxFee) {
        const fee = estimate.maxFee;
        setState(prev => ({
          ...prev,
          gasFee: (Number(fee) / Math.pow(10, state.selectedGasToken?.decimals || 6)).toFixed(4),
        }));
      }
    } catch (error) {
      console.error('Failed to fetch universal fee estimate:', error);
    }
  }, [state.gaslessMode, state.selectedGasToken, config.backendUrl]);

  // Fetch quote and fee estimate when input changes
  useEffect(() => {
    if (state.inputToken && state.outputToken && state.inputAmount && parseFloat(state.inputAmount) > 0) {
      const timer = setTimeout(() => {
        fetchQuote();
        if (state.gaslessMode) {
          fetchFeeEstimate();
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setState(prev => ({ ...prev, outputAmount: '', quote: null }));
    }
  }, [state.inputToken, state.outputToken, state.inputAmount, state.gaslessMode, fetchFeeEstimate]);




  const switchTokens = () => {
    setState(prev => ({
      ...prev,
      inputToken: prev.outputToken,
      outputToken: prev.inputToken,
      inputAmount: prev.outputAmount,
      outputAmount: prev.inputAmount,
      quote: null,
    }));
  };

  const handleSwap = async () => {
    if (!stacksAddress || !state.inputToken || !state.outputToken) {
      setState(prev => ({ ...prev, error: 'Please connect wallet and select tokens' }));
      return;
    }

    if (!state.inputAmount || parseFloat(state.inputAmount) <= 0) {
      setState(prev => ({ ...prev, error: 'Please enter a valid amount' }));
      return;
    }

    if (!state.quote) {
      setState(prev => ({ ...prev, error: 'Please wait for quote' }));
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, error: null, success: null }));

    try {
      const useGasless = state.gaslessMode;

      if (useGasless) {
        // Use VelumX SDK for gasless swaps
        const { executeSimpleGaslessSwap } = await import('@/lib/helpers/simple-gasless-swap');
        
        // Convert amounts to micro units (6 decimals for most tokens)
        const amountInMicro = parseUnits(state.inputAmount, state.inputToken.decimals).toString();
        const minAmountOutMicro = parseUnits(
          (parseFloat(state.outputAmount) * (1 - state.slippage / 100)).toFixed(6),
          state.outputToken.decimals
        ).toString();
        
        const txid = await executeSimpleGaslessSwap({
          userAddress: stacksAddress,
          tokenIn: state.inputToken.symbol === 'STX' ? 'token-wstx' : state.inputToken.address,
          tokenOut: state.outputToken.symbol === 'STX' ? 'token-wstx' : state.outputToken.address,
          amountIn: amountInMicro,
          minOut: minAmountOutMicro,
          feeToken: state.selectedGasToken?.address,
          onProgress: (step) => {
            setState(prev => ({ ...prev, success: step }));
          }
        });

        setState(prev => ({
          ...prev,
          isProcessing: false,
          success: `Swap successful! TX: ${txid}. You will receive approximately ${state.outputAmount} ${state.outputToken?.symbol}`,
          inputAmount: '',
          outputAmount: '',
          quote: null,
        }));
      } else {
        // Standard non-gasless swap via ALEX SDK
        const { AlexSDK } = await import('alex-sdk');
        const alex = new AlexSDK();
        
        const amountInMicro = BigInt(parseUnits(state.inputAmount, state.inputToken.decimals).toString());
        const minAmountOutMicro = BigInt(parseUnits(
          (parseFloat(state.outputAmount) * (1 - state.slippage / 100)).toFixed(6),
          state.outputToken.decimals
        ).toString());

        const tokenIn = (state.inputToken.symbol === 'STX' ? 'token-wstx' : state.inputToken.address) as any;
        const tokenOut = (state.outputToken.symbol === 'STX' ? 'token-wstx' : state.outputToken.address) as any;

        // Perform swap via Alex SDK
        // Note: ALEX SDK handles connect/wallet interaction internally or provides the tx hex
        // We'll use the connect integration for the best UX
        const { getStacksConnect } = await import('@/lib/stacks-loader');
        const connect = await getStacksConnect();

        // This is a simplified version of ALEX integration
        // In a real app, we might use alex.getSwapTransaction or similar
        // For now, we manually build the ALEX call to ensure compatibility with our loader
        const transactions = await import('@stacks/transactions');
        const { Cl, Pc } = transactions;
        
        // ALEX swaps often use multi-hops. The SDK's 'getRouter' provides the path.
        const router = await alex.getRouter(tokenIn, tokenOut);
        
        // Map ALEX router to contract calls
        // For simplicity, we use the direct vault call if possible
        const [contractAddress, contractName] = config.stacksSwapContractAddress.split('.');

        await connect.openContractCall({
          contractAddress,
          contractName,
          functionName: 'swap-helper', // Typical ALEX swap helper
          functionArgs: [
            Cl.principal(tokenIn),
            Cl.principal(tokenOut),
            Cl.uint(amountInMicro.toString()),
            Cl.uint(minAmountOutMicro.toString())
          ],
          network: 'mainnet',
          anchorMode: 'any',
          postConditionMode: 'allow',
          postConditions: [],
          onFinish: (data: any) => {
            setState(prev => ({
              ...prev,
              isProcessing: false,
              success: `Swap successful! TX: ${data.txid}`,
              inputAmount: '',
              outputAmount: '',
              quote: null,
            }));
            if (fetchBalances) {
              setTimeout(() => fetchBalances(), 3000);
            }
          },
          onCancel: () => {
            setState(prev => ({ ...prev, isProcessing: false }));
          }
        });
      }

      // Refresh balances after successful transaction
      if (fetchBalances) {
        setTimeout(() => {
          fetchBalances();
        }, 3000);
      }
    } catch (error) {
      console.error('Swap error:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: (error as Error).message || 'Failed to execute swap',
      }));
    }
  };

  // Check if balances is in scope by moving getBalance usage inside component or ensure scope is correct


  return (
    <div className="max-w-lg mx-auto">
      <div className="rounded-3xl vellum-shadow transition-all duration-300" style={{
        backgroundColor: 'var(--bg-surface)',
        border: `1px solid var(--border-color)`,
        padding: '2rem'
      }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Swap Interface
          </h2>
          <button
            onClick={() => setState(prev => ({ ...prev, showSettings: !prev.showSettings }))}
            className={`p-2 rounded-lg transition-all ${state.showSettings ? 'bg-purple-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            style={{ color: state.showSettings ? '' : 'var(--text-secondary)' }}
          >
            <Settings className={`w-5 h-5 ${state.showSettings ? 'animate-spin-slow' : ''}`} />
          </button>
        </div>

        {/* Token Discovery Label */}
        <div className="flex items-center gap-2 mb-6 px-1">
          <div className={`w-2 h-2 rounded-full ${isDiscovering ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
          <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
            {isDiscovering ? 'Discovering Liquidity...' : `${tokens.length} Assets Synchronized`}
          </span>
          {tokens.length <= 1 && (
             <button 
                onClick={() => setTokens([FALLBACK_STX, ...VELUMX_PRIORITY_TOKENS])}
                className="text-[10px] font-bold text-purple-500 hover:underline ml-2"
             >
               Force Sync
             </button>
          )}
        </div>

        <SettingsPanel
          slippage={state.slippage}
          setSlippage={(val: number) => setState(prev => ({ ...prev, slippage: val }))}
          isOpen={state.showSettings}
        />


        <div className="relative">
          <TokenInput
            label="Sell"
            amount={state.inputAmount}
            setAmount={(val: string) => setState(prev => ({ ...prev, inputAmount: val, error: null }))}
            token={state.inputToken}
            setToken={(t) => setState(prev => ({ ...prev, inputToken: t }))}
            tokens={tokens}
            balance={getBalance(state.inputToken)}
            isProcessing={state.isProcessing}
            onMax={() => setState(prev => ({ ...prev, inputAmount: getBalance(state.inputToken) }))}
            variant="purple"
          />

          {/* Switch Button */}
          <div className="flex justify-center my-4 relative z-10">
            <button
              onClick={switchTokens}
              disabled={state.isProcessing}
              className="rounded-full p-3 transition-all disabled:opacity-50 hover:border-purple-600 dark:hover:border-purple-400 shadow-lg"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: `2px solid var(--border-color)`
              }}
            >
              <ArrowDownUp className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>

          <TokenInput
            label="Buy"
            amount={state.outputAmount}
            setAmount={() => { }}
            token={state.outputToken}
            setToken={(t) => setState(prev => ({ ...prev, outputToken: t }))}
            tokens={tokens}
            balance={getBalance(state.outputToken)}
            isProcessing={state.isProcessing}
            variant="blue"
          />
        </div>

        <div className="mt-6">
          <SwapDetails
            quote={state.quote}
            inputSymbol={state.inputToken?.symbol || ''}
            outputSymbol={state.outputToken?.symbol || ''}
            outputAmount={state.outputAmount}
            slippage={state.slippage}
          />

          <GaslessToggle
            enabled={state.gaslessMode}
            setEnabled={(val: boolean) => setState(prev => ({ ...prev, gaslessMode: val }))}
            disabled={state.isProcessing}
          />

          {/* Universal Gas Token Selector */}
          {state.gaslessMode && (
            <div className="mt-8 p-6 rounded-3xl transition-all duration-300 border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 relative">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest text-purple-700 dark:text-purple-300">
                    Pay Gas With
                  </span>
                </div>
                
                <div className="flex items-center gap-3 bg-white/5 p-1 rounded-2xl border border-white/10 group/gas-container">
                  <div className="relative">
                    <button
                      onClick={() => setState(prev => ({ ...prev, isRegistering: !prev.isRegistering }))}
                      className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-purple-800 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all hover:shadow-purple-500/20 active:scale-95 whitespace-nowrap"
                    >
                      {state.selectedGasToken?.logoUrl ? (
                         <img 
                           src={state.selectedGasToken.logoUrl} 
                           alt={state.selectedGasToken.symbol} 
                           className="w-4 h-4 rounded-full" 
                           onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                           crossOrigin="anonymous"
                         />
                      ) : (
                         <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[8px]">{state.selectedGasToken?.symbol[0]}</div>
                      )}
                      <span>{state.selectedGasToken?.symbol}</span>
                      <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${state.isRegistering ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {/* Floating Dropdown for Gas Token */}
                    {state.isRegistering && (
                       <div className="absolute right-0 mt-3 w-64 max-h-64 overflow-y-auto rounded-2xl shadow-2xl z-[100] border p-2"
                        style={{ 
                          backgroundColor: 'var(--bg-card)',
                          borderColor: 'var(--border-color)'
                        }}
                       >
                         {tokens.filter(t => t.symbol !== 'STX').map(t => (
                           <button
                              key={t.symbol}
                              onClick={() => {
                                setState(prev => ({ ...prev, selectedGasToken: t, isRegistering: false }));
                              }}
                              className="w-full flex items-center justify-between p-3 hover:bg-white/5 rounded-xl transition-colors group"
                           >
                             <div className="flex items-center gap-3">
                                {t.logoUrl ? (
                                  <img 
                                    src={t.logoUrl} 
                                    alt={t.symbol} 
                                    className="w-6 h-6 rounded-full" 
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    crossOrigin="anonymous"
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px]">{t.symbol[0]}</div>
                                )}
                                <div className="text-left">
                                   <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{t.symbol}</div>
                                   <div className="text-[10px] opacity-40" style={{ color: 'var(--text-secondary)' }}>Bal: {parseFloat(getBalance(t)).toFixed(2)}</div>
                                </div>
                             </div>
                             {t.symbol === state.selectedGasToken?.symbol && (
                               <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                             )}
                           </button>
                         ))}
                       </div>
                    )}
                  </div>
                  
                  <div className="h-6 w-px bg-white/10 mx-1" />
                  
                  <div className="flex flex-col items-end pr-3">
                    <span className="text-[10px] font-mono font-bold text-purple-600 dark:text-purple-400">
                      Fee: {state.gasFee} {state.selectedGasToken?.symbol}
                    </span>
                    <span className="text-[8px] opacity-40 uppercase font-black" style={{ color: 'var(--text-secondary)' }}>Sponsored v2</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <TransactionStatus error={state.error} success={state.success} />

          <button
            onClick={handleSwap}
            disabled={!stacksConnected || state.isProcessing || !state.inputAmount || !state.outputAmount}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-2xl shadow-purple-500/30 dark:shadow-purple-500/50 hover:shadow-purple-500/50 dark:hover:shadow-purple-500/70 hover:scale-[1.02] active:scale-[0.98]"
          >
            {state.isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : !stacksConnected ? (
              'Connect Wallet'
            ) : state.gaslessMode && !stacksPublicKey ? (
              <span onClick={async (e) => {
                e.preventDefault();
                await recoverPublicKey();
              }} className="flex items-center gap-2 cursor-pointer w-full justify-center h-full">
                Verify Wallet (Enable Gasless)
              </span>
            ) : (
              <>
                <ArrowDownUp className="w-5 h-5" />
                Swap Tokens
              </>
            )}
          </button>
        </div>

        {/* Info Footer */}
        <div className="mt-6 pt-6 text-xs text-center space-y-1" style={{
          borderTop: `1px solid var(--border-color)`,
          color: 'var(--text-secondary)'
        }}>
          <div className="flex items-center justify-center gap-8 opacity-70">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              AMM Protocol
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              L2 Settlement
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
