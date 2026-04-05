/**
 * SwapInterface Component
 * UI for swapping tokens on Stacks using our AMM swap contract
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/lib/hooks/useWallet';
import { useConfig, getConfig } from '@/lib/config';
import { ArrowDownUp, Settings, Info, Loader2, AlertTriangle, Wallet } from 'lucide-react';
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

// Default tokens for testnet
const DEFAULT_TOKENS: Token[] = [
  {
    symbol: 'STX',
    name: 'Stacks',
    address: 'STX',
    decimals: 6,
    assetName: 'stx',
  },
  {
    symbol: 'USDCx',
    name: 'USDC (xReserve)',
    address: getConfig().stacksUsdcxAddress, // Use dynamic config address
    decimals: 6,
    assetName: 'usdcx',
  },
  {
    symbol: 'VEX',
    name: 'VelumX Token',
    address: 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.vextoken-v1', // Will be filled from config
    decimals: 6,
    assetName: 'vex', // Assumed asset name for VEX
  },
];



export function SwapInterface() {
  const { stacksAddress, stacksConnected, balances, fetchBalances, stacksPublicKey, recoverPublicKey } = useWallet();
  const config = useConfig();

  const getBalance = (token: Token | null): string => {
    if (!token) return '0';
    if (token.symbol === 'USDCx') return balances.usdcx;
    if (token.symbol === 'STX') return balances.stx;
    if (token.symbol === 'VEX') return balances.vex || '0';
    return '0';
  };

  const [tokens, setTokens] = useState<Token[]>(DEFAULT_TOKENS);
  const [state, setState] = useState<SwapState>({
    inputToken: DEFAULT_TOKENS[1], // USDCx
    outputToken: DEFAULT_TOKENS[2], // VEX
    inputAmount: '',
    outputAmount: '',
    gaslessMode: true,
    selectedGasToken: DEFAULT_TOKENS[1], // DEFAULT to USDCx for Gas
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
    const fetchAlexTokens = async () => {
      try {
        const { AlexSDK } = await import('alex-sdk');
        const alex = new AlexSDK();
        const alexTokens = await alex.getTokens();
        
        // Map ALEX tokens to our Token interface
        const mappedTokens: Token[] = alexTokens.map((t: any) => ({
          symbol: t.symbol,
          name: t.name || t.symbol,
          address: t.id,
          decimals: t.decimals || 6,
          logoUrl: t.icon,
        }));

        // Merge with our internal tokens (USDCx, VEX)
        setTokens(prev => {
          const unique = [...prev];
          mappedTokens.forEach(mt => {
            if (!unique.find(ut => ut.symbol === mt.symbol)) {
              unique.push(mt);
            }
          });
          return unique;
        });
      } catch (e) {
        console.error("Swap: Failed to fetch ALEX tokens", e);
      }
    };
    
    fetchAlexTokens();
  }, [config.stacksVexAddress]);

  const fetchQuote = async () => {
    if (!state.inputToken || !state.outputToken || !state.inputAmount) return;

    setState(prev => ({ ...prev, isFetchingQuote: true, error: null }));

    try {
      // Lazy load AlexSDK to optimize bundle size
      const { AlexSDK, Currency } = await import('alex-sdk');
      const alex = new AlexSDK();

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

      if (estimate && (estimate.maxFee || estimate.maxFeeUSDCx)) {
        const fee = estimate.maxFee || estimate.maxFeeUSDCx;
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
        // Use the simple gasless service with sponsored transactions
        const { executeSimpleGaslessSwap } = await import('@/lib/helpers/simple-gasless-swap');
        
        const minAmountOut = (parseFloat(state.outputAmount) * (1 - state.slippage / 100)).toFixed(6);
        
        const txid = await executeSimpleGaslessSwap({
          userAddress: stacksAddress,
          tokenIn: state.inputToken.symbol === 'STX' ? 'token-wstx' : state.inputToken.address,
          tokenOut: state.outputToken.symbol === 'STX' ? 'token-wstx' : state.outputToken.address,
          amountIn: state.inputAmount,
          minOut: minAmountOut,
          feeToken: state.selectedGasToken?.address, // Universal Gas Token
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
        <div className="flex items-center justify-between mb-6">
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

        <SettingsPanel
          slippage={state.slippage}
          setSlippage={(val: number) => setState(prev => ({ ...prev, slippage: val }))}
          isOpen={state.showSettings}
        />

        {/* Suggested Pairs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setState(prev => ({ ...prev, inputToken: tokens[1], outputToken: tokens[2] }))}
            className="text-[10px] font-bold px-3 py-1.5 rounded-full border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 transition-all text-blue-600 dark:text-blue-400"
          >
            USDCx/VEX
          </button>
          <button
            onClick={() => setState(prev => ({ ...prev, inputToken: tokens[0], outputToken: tokens[1] }))}
            className="text-[10px] font-bold px-3 py-1.5 rounded-full border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 transition-all text-purple-600 dark:text-purple-400"
          >
            STX/USDCx
          </button>
        </div>

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
            <div className="mt-4 p-4 rounded-2xl bg-purple-500/5 border border-purple-500/10 active:border-purple-500/30 transition-all">
              <label className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 mb-2 block">
                Pay Gas With
              </label>
              <div className="flex items-center justify-between">
                <select
                  value={state.selectedGasToken?.symbol}
                  onChange={(e) => {
                    const token = tokens.find(t => t.symbol === e.target.value);
                    if (token) setState(prev => ({ ...prev, selectedGasToken: token }));
                  }}
                  className="bg-transparent text-sm font-bold focus:outline-none cursor-pointer"
                >
                  {tokens.filter(t => t.symbol !== 'STX').map(t => (
                    <option key={t.symbol} value={t.symbol} className="bg-white dark:bg-gray-900">
                      {t.symbol} (Balance: {getBalance(t)})
                    </option>
                  ))}
                </select>
                <span className="text-xs font-mono opacity-60">
                   Fee: {state.gasFee} {state.selectedGasToken?.symbol}
                </span>
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
