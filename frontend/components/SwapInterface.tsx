/**
 * SwapInterface Component
 * UI for swapping tokens on Stacks using our AMM swap contract
 */

'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '../lib/hooks/useWallet';
import { useConfig } from '../lib/config';
import { ArrowDownUp, Loader2, AlertCircle, CheckCircle, Zap, Settings, Repeat } from 'lucide-react';
import { formatUnits, parseUnits } from 'viem';

interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoUrl?: string;
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
  isProcessing: boolean;
  isFetchingQuote: boolean;
  error: string | null;
  success: string | null;
  quote: SwapQuote | null;
  slippage: number;
  showSettings: boolean;
}

// Default tokens for testnet
const DEFAULT_TOKENS: Token[] = [
  {
    symbol: 'USDCx',
    name: 'USDC (xReserve)',
    address: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx',
    decimals: 6,
  },
  {
    symbol: 'STX',
    name: 'Stacks',
    address: 'STX',
    decimals: 6,
  },
];

export function SwapInterface() {
  const { stacksAddress, stacksConnected, balances, fetchBalances } = useWallet();
  const config = useConfig();

  const [tokens] = useState<Token[]>(DEFAULT_TOKENS);
  const [state, setState] = useState<SwapState>({
    inputToken: DEFAULT_TOKENS[0],
    outputToken: DEFAULT_TOKENS[1],
    inputAmount: '',
    outputAmount: '',
    gaslessMode: true,
    isProcessing: false,
    isFetchingQuote: false,
    error: null,
    success: null,
    quote: null,
    slippage: 0.5,
    showSettings: false,
  });

  // Fetch quote when input changes
  useEffect(() => {
    if (state.inputToken && state.outputToken && state.inputAmount && parseFloat(state.inputAmount) > 0) {
      const timer = setTimeout(() => {
        fetchQuote();
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setState(prev => ({ ...prev, outputAmount: '', quote: null }));
    }
  }, [state.inputToken, state.outputToken, state.inputAmount]);

  const fetchQuote = async () => {
    if (!state.inputToken || !state.outputToken || !state.inputAmount) return;

    setState(prev => ({ ...prev, isFetchingQuote: true, error: null }));

    try {
      // Convert input amount to micro units
      const amountInMicro = parseUnits(state.inputAmount, state.inputToken.decimals);

      // Call backend to get quote from swap contract
      const response = await fetch(`${config.backendUrl}/api/swap/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputToken: state.inputToken.address,
          outputToken: state.outputToken.address,
          inputAmount: amountInMicro.toString(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch quote');
      }

      const data = await response.json();

      if (data.success && data.data) {
        // Convert output amount from micro units to display units
        const outputAmountFormatted = (Number(data.data.outputAmount) / Math.pow(10, state.outputToken.decimals)).toFixed(6);
        const feeFormatted = (Number(data.data.estimatedFee) / Math.pow(10, state.inputToken.decimals)).toFixed(6);
        const rate = (Number(data.data.outputAmount) / Number(data.data.inputAmount)).toFixed(6);

        setState(prev => ({
          ...prev,
          outputAmount: outputAmountFormatted,
          quote: {
            amountOut: outputAmountFormatted,
            priceImpact: data.data.priceImpact.toFixed(2),
            fee: feeFormatted,
            rate: rate,
          },
          isFetchingQuote: false,
        }));
      } else {
        throw new Error(data.error || 'Pool may not exist yet');
      }
    } catch (error) {
      console.error('Failed to fetch quote:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to get quote. Pool may not exist yet.',
        isFetchingQuote: false,
      }));
    }
  };

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
      // Dynamic imports for Stacks libraries
      const { openContractCall } = await import('@stacks/connect');
      const { STACKS_TESTNET } = await import('@stacks/network');
      const { uintCV, contractPrincipalCV, PostConditionMode } = await import('@stacks/transactions');
      
      const amountInMicro = parseUnits(state.inputAmount, state.inputToken.decimals);
      const minAmountOutMicro = parseUnits(
        (parseFloat(state.outputAmount) * (1 - state.slippage / 100)).toFixed(6),
        state.outputToken.decimals
      );

      // Parse token addresses (format: PRINCIPAL.CONTRACT-NAME)
      const tokenInParts = state.inputToken.address.split('.');
      const tokenOutParts = state.outputToken.address.split('.');

      const functionArgs = [
        contractPrincipalCV(tokenInParts[0], tokenInParts[1]), // token-in
        contractPrincipalCV(tokenOutParts[0], tokenOutParts[1]), // token-out
        uintCV(Number(amountInMicro)), // amount-in
        uintCV(Number(minAmountOutMicro)), // min-amount-out
      ];

      await new Promise<string>((resolve, reject) => {
        openContractCall({
          contractAddress: config.stacksSwapContractAddress.split('.')[0],
          contractName: config.stacksSwapContractAddress.split('.')[1],
          functionName: state.gaslessMode ? 'swap-gasless' : 'swap',
          functionArgs,
          network: STACKS_TESTNET,
          postConditionMode: PostConditionMode.Allow,
          sponsored: state.gaslessMode,
          appDetails: {
            name: 'VelumX Bridge',
            icon: typeof window !== 'undefined' ? window.location.origin + '/favicon.ico' : '',
          },
          onFinish: async (data: any) => {
            const txId = data.txId;
            resolve(txId);
          },
          onCancel: () => {
            reject(new Error('User cancelled transaction'));
          },
        });
      });

      setState(prev => ({
        ...prev,
        isProcessing: false,
        success: `Swap successful! You will receive approximately ${state.outputAmount} ${state.outputToken?.symbol}`,
        inputAmount: '',
        outputAmount: '',
        quote: null,
      }));

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

  const getBalance = (token: Token | null): string => {
    if (!token) return '0';
    if (token.symbol === 'USDCx') return balances.usdcx;
    if (token.symbol === 'STX') return balances.stx;
    return '0';
  };

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
            Swap Tokens
          </h2>
          <button 
            onClick={() => setState(prev => ({ ...prev, showSettings: !prev.showSettings }))}
            className="p-2 rounded-lg transition-colors group hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Settings className={`w-5 h-5 transition-all ${state.showSettings ? 'rotate-90' : ''}`} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* Settings Panel */}
        {state.showSettings && (
          <div className="rounded-xl p-4 mb-6" style={{
            border: `1px solid var(--border-color)`,
            backgroundColor: 'var(--bg-surface)'
          }}>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold mb-2 block" style={{ color: 'var(--text-primary)' }}>
                  Slippage Tolerance
                </label>
                <div className="flex gap-2">
                  {[0.1, 0.5, 1.0].map(value => (
                    <button
                      key={value}
                      onClick={() => setState(prev => ({ ...prev, slippage: value }))}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                        state.slippage === value
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                      style={state.slippage !== value ? { color: 'var(--text-secondary)' } : {}}
                    >
                      {value}%
                    </button>
                  ))}
                  <input
                    type="number"
                    value={state.slippage}
                    onChange={(e) => setState(prev => ({ ...prev, slippage: parseFloat(e.target.value) || 0.5 }))}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 dark:bg-gray-800 outline-none"
                    style={{ color: 'var(--text-primary)' }}
                    step="0.1"
                    min="0.1"
                    max="50"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Input Token */}
        <div className="rounded-2xl p-6 hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-300" style={{
          border: `2px solid var(--border-color)`,
          backgroundColor: 'var(--bg-surface)'
        }}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>From</span>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Balance: <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{parseFloat(getBalance(state.inputToken)).toFixed(4)}</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="number"
              value={state.inputAmount}
              onChange={(e) => setState(prev => ({ ...prev, inputAmount: e.target.value, error: null }))}
              placeholder="0.00"
              className="flex-1 bg-transparent text-4xl font-mono outline-none placeholder:opacity-30 min-w-0"
              style={{ color: 'var(--text-primary)' }}
              disabled={state.isProcessing}
            />
            <select
              value={state.inputToken?.symbol || ''}
              onChange={(e) => {
                const token = tokens.find(t => t.symbol === e.target.value);
                setState(prev => ({ ...prev, inputToken: token || null }));
              }}
              className="flex-shrink-0 bg-gradient-to-r from-purple-600 to-purple-700 dark:from-purple-500 dark:to-purple-600 hover:from-purple-700 hover:to-purple-800 text-white px-6 py-3.5 rounded-2xl font-bold outline-none cursor-pointer transition-all shadow-lg shadow-purple-500/50"
              disabled={state.isProcessing}
            >
              {tokens.map(token => (
                <option key={token.symbol} value={token.symbol} className="bg-gray-900">
                  {token.symbol}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setState(prev => ({ ...prev, inputAmount: getBalance(state.inputToken) }))}
            className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 mt-4 font-bold transition-colors"
            disabled={state.isProcessing}
          >
            MAX
          </button>
        </div>

        {/* Switch Button */}
        <div className="flex justify-center my-4 relative z-10">
          <button
            onClick={switchTokens}
            disabled={state.isProcessing}
            className="rounded-full p-2 transition-all disabled:opacity-50 hover:border-purple-600 dark:hover:border-purple-400 shadow-lg"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: `2px solid var(--border-color)`
            }}
          >
            <ArrowDownUp className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* Output Token */}
        <div className="rounded-2xl p-6 mb-6" style={{
          border: `2px solid var(--border-color)`,
          backgroundColor: 'var(--bg-surface)'
        }}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>To</span>
            {state.isFetchingQuote && (
              <span className="text-xs text-blue-600 flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Fetching...
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1 text-4xl font-mono min-w-0" style={{ color: state.outputAmount ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              {state.outputAmount || '0.00'}
            </div>
            <select
              value={state.outputToken?.symbol || ''}
              onChange={(e) => {
                const token = tokens.find(t => t.symbol === e.target.value);
                setState(prev => ({ ...prev, outputToken: token || null }));
              }}
              className="flex-shrink-0 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-3.5 rounded-2xl font-bold outline-none cursor-pointer transition-all shadow-lg shadow-blue-500/50"
              disabled={state.isProcessing}
            >
              {tokens.map(token => (
                <option key={token.symbol} value={token.symbol} className="bg-gray-900">
                  {token.symbol}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quote Details */}
        {state.quote && (
          <div className="rounded-xl p-4 mb-6 space-y-2.5 text-sm" style={{
            border: `1px solid var(--border-color)`,
            backgroundColor: 'var(--bg-surface)'
          }}>
            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--text-secondary)' }}>Rate</span>
              <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                1 {state.inputToken?.symbol} ≈{' '}
                <span className="text-purple-600 dark:text-purple-400">{state.quote.rate}</span>{' '}
                {state.outputToken?.symbol}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--text-secondary)' }}>Price Impact</span>
              <span className={`font-semibold ${parseFloat(state.quote.priceImpact) > 1 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
                {parseFloat(state.quote.priceImpact) > 1 ? '⚠ ' : '✓ '}{state.quote.priceImpact}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--text-secondary)' }}>Fee (0.3%)</span>
              <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{state.quote.fee} {state.inputToken?.symbol}</span>
            </div>
            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--text-secondary)' }}>Minimum Received</span>
              <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                {(parseFloat(state.outputAmount) * (1 - state.slippage / 100)).toFixed(6)} {state.outputToken?.symbol}
              </span>
            </div>
          </div>
        )}

        {/* Gasless Mode Toggle */}
        <div className="rounded-lg p-4 mb-6" style={{
          border: `1px solid var(--border-color)`,
          backgroundColor: 'rgba(16, 185, 129, 0.05)'
        }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{
                backgroundColor: 'rgba(16, 185, 129, 0.1)'
              }}>
                <Zap className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Gasless Mode</span>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Pay fees in USDCx</p>
              </div>
            </div>
            <button
              onClick={() => setState(prev => ({ ...prev, gaslessMode: !prev.gaslessMode }))}
              className={`relative w-14 h-7 rounded-full transition-all ${
                state.gaslessMode ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-700'
              }`}
              disabled={state.isProcessing}
            >
              <div
                className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${
                  state.gaslessMode ? 'translate-x-7' : ''
                }`}
              />
            </button>
          </div>
        </div>

        {/* Error Message */}
        {state.error && (
          <div className="flex items-start gap-3 bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-6">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 font-medium">{state.error}</p>
          </div>
        )}

        {/* Success Message */}
        {state.success && (
          <div className="flex items-start gap-3 rounded-xl p-4 mb-6 border" style={{
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderColor: 'var(--success-color)',
            color: 'var(--success-color)'
          }}>
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--success-color)' }} />
            <p className="text-sm font-medium">{state.success}</p>
          </div>
        )}

        {/* Swap Button */}
        <button
          onClick={handleSwap}
          disabled={!stacksConnected || state.isProcessing || !state.inputAmount || !state.outputAmount}
          className="w-full bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 dark:from-purple-600 dark:via-blue-600 dark:to-purple-600 hover:from-purple-700 hover:via-blue-700 hover:to-purple-700 text-white font-bold py-4 rounded-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-2xl shadow-purple-500/30 dark:shadow-purple-500/50 hover:shadow-purple-500/50 dark:hover:shadow-purple-500/70 hover:scale-[1.02] active:scale-[0.98]"
        >
          {state.isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : !stacksConnected ? (
            'Connect Stacks Wallet'
          ) : (
            <>
              <Repeat className="w-5 h-5" />
              Swap Tokens
            </>
          )}
        </button>

        {/* Info */}
        <div className="mt-6 pt-6 text-xs text-center space-y-1" style={{ 
          borderTop: `1px solid var(--border-color)`,
          color: 'var(--text-secondary)'
        }}>
          <p className="flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 bg-blue-600 dark:bg-blue-400 rounded-full dark:animate-pulse-glow animate-slide-progress"></span>
            Powered by VelumX AMM
          </p>
          <p>Slippage tolerance: {state.slippage}%</p>
        </div>
      </div>
    </div>
  );
}
