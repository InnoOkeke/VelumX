/**
 * SwapInterface Component
 * UI for swapping tokens on Stacks with gasless support
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
  inputToken: string;
  outputToken: string;
  inputAmount: string;
  outputAmount: string;
  priceImpact: number;
  route: string[];
  estimatedFee: string;
  validUntil: number;
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
}

export function SwapInterface() {
  const { stacksAddress, stacksConnected, balances } = useWallet();
  const config = useConfig();

  const [tokens, setTokens] = useState<Token[]>([]);
  const [state, setState] = useState<SwapState>({
    inputToken: null,
    outputToken: null,
    inputAmount: '',
    outputAmount: '',
    gaslessMode: true,
    isProcessing: false,
    isFetchingQuote: false,
    error: null,
    success: null,
    quote: null,
    slippage: 0.5, // 0.5% default
  });

  // Fetch supported tokens on mount
  useEffect(() => {
    fetchTokens();
  }, []);

  // Fetch quote when input changes
  useEffect(() => {
    if (state.inputToken && state.outputToken && state.inputAmount && parseFloat(state.inputAmount) > 0) {
      const timer = setTimeout(() => {
        fetchQuote();
      }, 500); // Debounce
      return () => clearTimeout(timer);
    } else {
      setState(prev => ({ ...prev, outputAmount: '', quote: null }));
    }
  }, [state.inputToken, state.outputToken, state.inputAmount]);

  const fetchTokens = async () => {
    try {
      const response = await fetch(`${config.backendUrl}/api/swap/tokens`);
      const data = await response.json();
      
      if (data.success) {
        setTokens(data.data);
        // Set default tokens
        setState(prev => ({
          ...prev,
          inputToken: data.data.find((t: Token) => t.symbol === 'USDCx') || data.data[0],
          outputToken: data.data.find((t: Token) => t.symbol === 'STX') || data.data[1],
        }));
      }
    } catch (error) {
      console.error('Failed to fetch tokens:', error);
    }
  };

  const fetchQuote = async () => {
    if (!state.inputToken || !state.outputToken || !state.inputAmount) return;

    setState(prev => ({ ...prev, isFetchingQuote: true, error: null }));

    try {
      const inputAmount = parseUnits(state.inputAmount, state.inputToken.decimals);

      const response = await fetch(`${config.backendUrl}/api/swap/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputToken: state.inputToken.address,
          outputToken: state.outputToken.address,
          inputAmount: inputAmount.toString(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        const quote = data.data;
        const outputAmount = formatUnits(BigInt(quote.outputAmount), state.outputToken.decimals);
        
        setState(prev => ({
          ...prev,
          outputAmount,
          quote,
          isFetchingQuote: false,
        }));
      } else {
        setState(prev => ({
          ...prev,
          error: data.error || 'Failed to get quote',
          isFetchingQuote: false,
        }));
      }
    } catch (error) {
      console.error('Failed to fetch quote:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to get quote',
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
      setState(prev => ({ ...prev, error: 'Please wait for quote to load' }));
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, error: null, success: null }));

    try {
      // Use Velar SDK to execute swap
      const { VelarSDK } = await import('@velarprotocol/velar-sdk');
      const sdk = new VelarSDK();
      
      const swapInstance = await sdk.getSwapInstance({
        account: stacksAddress,
        inToken: state.inputToken.symbol,
        outToken: state.outputToken.symbol,
      });

      // Execute the swap with the SDK
      const result = await swapInstance.swap({
        amount: parseFloat(state.inputAmount),
        slippage: state.slippage,
      });

      setState(prev => ({
        ...prev,
        isProcessing: false,
        success: `Swap initiated! Transaction ID: ${result.txId || 'pending'}`,
        inputAmount: '',
        outputAmount: '',
        quote: null,
      }));
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
          <button className="p-2 rounded-lg transition-colors group hover:bg-gray-100 dark:hover:bg-gray-800">
            <Settings className="w-5 h-5 group-hover:rotate-90 transition-all" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

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
            <div className="flex-1 text-4xl font-mono min-w-0" style={{ color: 'var(--text-secondary)' }}>
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
                <span className="text-purple-600 dark:text-purple-400">{(parseFloat(state.outputAmount) / parseFloat(state.inputAmount)).toFixed(6)}</span>{' '}
                {state.outputToken?.symbol}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--text-secondary)' }}>Price Impact</span>
              <span className={`font-semibold ${state.quote.priceImpact > 1 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
                {state.quote.priceImpact > 1 ? '⚠ ' : '✓ '}{state.quote.priceImpact.toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--text-secondary)' }}>Route</span>
              <span className="text-xs font-mono text-blue-600 dark:text-blue-400">{state.quote.route.map(r => r.split('.').pop()).join(' → ')}</span>
            </div>
            {state.gaslessMode && (
              <div className="flex justify-between items-center pt-2" style={{ borderTop: `1px solid var(--border-color)` }}>
                <span style={{ color: 'var(--text-secondary)' }}>Fee (USDCx)</span>
                <span className="font-mono text-yellow-600 dark:text-yellow-400">{formatUnits(BigInt(state.quote.estimatedFee), 6)}</span>
              </div>
            )}
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
          <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-lg p-4 mb-6">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">{state.error}</p>
          </div>
        )}

        {/* Success Message */}
        {state.success && (
          <div className="flex items-start gap-3 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30 rounded-lg p-4 mb-6">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-700 dark:text-green-300">{state.success}</p>
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
            Powered by ALEX DEX
          </p>
          <p>Slippage tolerance: {state.slippage}%</p>
        </div>
      </div>
    </div>
  );
}
