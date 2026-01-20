/**
 * SwapInterface Component
 * UI for swapping tokens on Stacks with gasless support
 */

'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '../lib/hooks/useWallet';
import { useConfig } from '../lib/config';
import { ArrowDownUp, Loader2, AlertCircle, CheckCircle, Zap, Settings } from 'lucide-react';
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

    setState(prev => ({ ...prev, isProcessing: true, error: null, success: null }));

    try {
      // For testnet demo, show success message
      // In production, this would call ALEX swap contracts via paymaster
      setState(prev => ({
        ...prev,
        isProcessing: false,
        success: 'Swap feature coming soon! This is a demo interface.',
        inputAmount: '',
        outputAmount: '',
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
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Swap</h2>
        <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Input Token */}
      <div className="bg-black/40 rounded-2xl p-6 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-white/60">From</span>
          <span className="text-sm text-white/60">
            Balance: {parseFloat(getBalance(state.inputToken)).toFixed(4)}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="number"
            value={state.inputAmount}
            onChange={(e) => setState(prev => ({ ...prev, inputAmount: e.target.value, error: null }))}
            placeholder="0.00"
            className="flex-1 bg-transparent text-3xl font-mono outline-none"
            disabled={state.isProcessing}
          />
          <select
            value={state.inputToken?.symbol || ''}
            onChange={(e) => {
              const token = tokens.find(t => t.symbol === e.target.value);
              setState(prev => ({ ...prev, inputToken: token || null }));
            }}
            className="bg-white/10 px-4 py-2 rounded-xl font-bold outline-none cursor-pointer"
            disabled={state.isProcessing}
          >
            {tokens.map(token => (
              <option key={token.symbol} value={token.symbol}>
                {token.symbol}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setState(prev => ({ ...prev, inputAmount: getBalance(state.inputToken) }))}
          className="text-sm text-purple-400 hover:text-purple-300 mt-2"
          disabled={state.isProcessing}
        >
          Max
        </button>
      </div>

      {/* Switch Button */}
      <div className="flex justify-center -my-2 relative z-10">
        <button
          onClick={switchTokens}
          disabled={state.isProcessing}
          className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-full p-3 transition-all disabled:opacity-50"
        >
          <ArrowDownUp className="w-5 h-5" />
        </button>
      </div>

      {/* Output Token */}
      <div className="bg-black/40 rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-white/60">To</span>
          {state.isFetchingQuote && (
            <span className="text-sm text-white/60 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Fetching quote...
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1 text-3xl font-mono text-white/60">
            {state.outputAmount || '0.00'}
          </div>
          <select
            value={state.outputToken?.symbol || ''}
            onChange={(e) => {
              const token = tokens.find(t => t.symbol === e.target.value);
              setState(prev => ({ ...prev, outputToken: token || null }));
            }}
            className="bg-white/10 px-4 py-2 rounded-xl font-bold outline-none cursor-pointer"
            disabled={state.isProcessing}
          >
            {tokens.map(token => (
              <option key={token.symbol} value={token.symbol}>
                {token.symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Quote Details */}
      {state.quote && (
        <div className="bg-black/20 rounded-xl p-4 mb-6 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-white/60">Rate</span>
            <span>
              1 {state.inputToken?.symbol} ≈{' '}
              {(parseFloat(state.outputAmount) / parseFloat(state.inputAmount)).toFixed(6)}{' '}
              {state.outputToken?.symbol}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">Price Impact</span>
            <span className={state.quote.priceImpact > 1 ? 'text-yellow-400' : 'text-green-400'}>
              {state.quote.priceImpact.toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">Route</span>
            <span className="text-xs">{state.quote.route.map(r => r.split('.').pop()).join(' → ')}</span>
          </div>
          {state.gaslessMode && (
            <div className="flex justify-between">
              <span className="text-white/60">Fee (USDCx)</span>
              <span>{formatUnits(BigInt(state.quote.estimatedFee), 6)}</span>
            </div>
          )}
        </div>
      )}

      {/* Gasless Mode Toggle */}
      <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/20 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-green-400" />
            <span className="font-medium">Gasless Mode</span>
          </div>
          <button
            onClick={() => setState(prev => ({ ...prev, gaslessMode: !prev.gaslessMode }))}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              state.gaslessMode ? 'bg-green-500' : 'bg-white/20'
            }`}
            disabled={state.isProcessing}
          >
            <div
              className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                state.gaslessMode ? 'translate-x-6' : ''
              }`}
            />
          </button>
        </div>
        <p className="text-sm text-white/60 mt-2">
          Pay fees in USDCx instead of STX
        </p>
      </div>

      {/* Error Message */}
      {state.error && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-200">{state.error}</p>
        </div>
      )}

      {/* Success Message */}
      {state.success && (
        <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-6">
          <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-200">{state.success}</p>
        </div>
      )}

      {/* Swap Button */}
      <button
        onClick={handleSwap}
        disabled={!stacksConnected || state.isProcessing || !state.inputAmount || !state.outputAmount}
        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {state.isProcessing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Processing...
          </>
        ) : !stacksConnected ? (
          'Connect Stacks Wallet'
        ) : (
          'Swap Tokens'
        )}
      </button>

      {/* Info */}
      <div className="mt-6 text-xs text-white/40 text-center">
        <p>Powered by ALEX DEX</p>
        <p className="mt-1">Slippage tolerance: {state.slippage}%</p>
      </div>
    </div>
  );
}
