/**
 * LiquidityInterface Component
 * UI for adding and removing liquidity from AMM pools
 */

'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '../lib/hooks/useWallet';
import { useConfig } from '../lib/config';
import { Plus, Minus, Loader2, AlertCircle, CheckCircle, Zap, Info } from 'lucide-react';
import { formatUnits, parseUnits } from 'viem';

interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
}

interface LiquidityState {
  mode: 'add' | 'remove';
  tokenA: Token | null;
  tokenB: Token | null;
  amountA: string;
  amountB: string;
  lpTokenAmount: string;
  gaslessMode: boolean;
  isProcessing: boolean;
  error: string | null;
  success: string | null;
  poolExists: boolean;
  userLpBalance: string;
  poolShare: string;
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

export function LiquidityInterface() {
  const { stacksAddress, stacksConnected, balances, fetchBalances } = useWallet();
  const config = useConfig();

  const [tokens] = useState<Token[]>(DEFAULT_TOKENS);
  const [state, setState] = useState<LiquidityState>({
    mode: 'add',
    tokenA: DEFAULT_TOKENS[0],
    tokenB: DEFAULT_TOKENS[1],
    amountA: '',
    amountB: '',
    lpTokenAmount: '',
    gaslessMode: true,
    isProcessing: false,
    error: null,
    success: null,
    poolExists: false,
    userLpBalance: '0',
    poolShare: '0',
  });

  // Fetch pool info when tokens change
  useEffect(() => {
    if (state.tokenA && state.tokenB && stacksAddress) {
      fetchPoolInfo();
    }
  }, [state.tokenA, state.tokenB, stacksAddress]);

  // Calculate optimal ratio when adding liquidity
  useEffect(() => {
    if (state.mode === 'add' && state.amountA && state.poolExists) {
      calculateOptimalAmountB();
    }
  }, [state.amountA, state.mode, state.poolExists]);

  const fetchPoolInfo = async () => {
    // TODO: Fetch pool reserves and user LP balance from contract
    // For now, set placeholder values
    setState(prev => ({
      ...prev,
      poolExists: false, // Will be true once pool is created
      userLpBalance: '0',
      poolShare: '0',
    }));
  };

  const calculateOptimalAmountB = () => {
    // TODO: Calculate optimal amount B based on pool ratio
    // For now, use 1:2 ratio (1 USDCx = 2 STX)
    const amountB = (parseFloat(state.amountA) * 2).toFixed(6);
    setState(prev => ({ ...prev, amountB }));
  };

  const handleAddLiquidity = async () => {
    if (!stacksAddress || !state.tokenA || !state.tokenB) {
      setState(prev => ({ ...prev, error: 'Please connect wallet and select tokens' }));
      return;
    }

    if (!state.amountA || !state.amountB || parseFloat(state.amountA) <= 0 || parseFloat(state.amountB) <= 0) {
      setState(prev => ({ ...prev, error: 'Please enter valid amounts' }));
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, error: null, success: null }));

    try {
      // TODO: Implement actual add-liquidity contract call
      setState(prev => ({
        ...prev,
        isProcessing: false,
        success: `Liquidity added! You would receive LP tokens. Please deploy the swap contract first.`,
        amountA: '',
        amountB: '',
      }));

      // Refresh balances
      if (fetchBalances) {
        setTimeout(() => {
          fetchBalances();
          fetchPoolInfo();
        }, 3000);
      }
    } catch (error) {
      console.error('Add liquidity error:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: (error as Error).message || 'Failed to add liquidity',
      }));
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!stacksAddress || !state.tokenA || !state.tokenB) {
      setState(prev => ({ ...prev, error: 'Please connect wallet and select tokens' }));
      return;
    }

    if (!state.lpTokenAmount || parseFloat(state.lpTokenAmount) <= 0) {
      setState(prev => ({ ...prev, error: 'Please enter valid LP token amount' }));
      return;
    }

    if (parseFloat(state.lpTokenAmount) > parseFloat(state.userLpBalance)) {
      setState(prev => ({ ...prev, error: 'Insufficient LP token balance' }));
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, error: null, success: null }));

    try {
      // TODO: Implement actual remove-liquidity contract call
      setState(prev => ({
        ...prev,
        isProcessing: false,
        success: `Liquidity removed! You would receive ${state.amountA} ${state.tokenA?.symbol} and ${state.amountB} ${state.tokenB?.symbol}`,
        lpTokenAmount: '',
        amountA: '',
        amountB: '',
      }));

      // Refresh balances
      if (fetchBalances) {
        setTimeout(() => {
          fetchBalances();
          fetchPoolInfo();
        }, 3000);
      }
    } catch (error) {
      console.error('Remove liquidity error:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: (error as Error).message || 'Failed to remove liquidity',
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
            Liquidity
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setState(prev => ({ ...prev, mode: 'add', error: null, success: null }))}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                state.mode === 'add'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              style={state.mode !== 'add' ? { color: 'var(--text-secondary)' } : {}}
            >
              <Plus className="w-4 h-4 inline mr-1" />
              Add
            </button>
            <button
              onClick={() => setState(prev => ({ ...prev, mode: 'remove', error: null, success: null }))}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                state.mode === 'remove'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              style={state.mode !== 'remove' ? { color: 'var(--text-secondary)' } : {}}
            >
              <Minus className="w-4 h-4 inline mr-1" />
              Remove
            </button>
          </div>
        </div>

        {/* Pool Info */}
        {state.poolExists && (
          <div className="rounded-xl p-4 mb-6" style={{
            border: `1px solid var(--border-color)`,
            backgroundColor: 'rgba(139, 92, 246, 0.05)'
          }}>
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Your Position
                </p>
                <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <div className="flex justify-between">
                    <span>LP Tokens:</span>
                    <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{parseFloat(state.userLpBalance).toFixed(6)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pool Share:</span>
                    <span className="font-semibold text-purple-600 dark:text-purple-400">{state.poolShare}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {state.mode === 'add' ? (
          <>
            {/* Token A Input */}
            <div className="rounded-2xl p-6 mb-4 hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-300" style={{
              border: `2px solid var(--border-color)`,
              backgroundColor: 'var(--bg-surface)'
            }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Token A</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Balance: <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{parseFloat(getBalance(state.tokenA)).toFixed(4)}</span>
                </span>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  value={state.amountA}
                  onChange={(e) => setState(prev => ({ ...prev, amountA: e.target.value, error: null }))}
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-4xl font-mono outline-none placeholder:opacity-30 min-w-0"
                  style={{ color: 'var(--text-primary)' }}
                  disabled={state.isProcessing}
                />
                <select
                  value={state.tokenA?.symbol || ''}
                  onChange={(e) => {
                    const token = tokens.find(t => t.symbol === e.target.value);
                    setState(prev => ({ ...prev, tokenA: token || null }));
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
                onClick={() => setState(prev => ({ ...prev, amountA: getBalance(state.tokenA) }))}
                className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 mt-4 font-bold transition-colors"
                disabled={state.isProcessing}
              >
                MAX
              </button>
            </div>

            {/* Plus Icon */}
            <div className="flex justify-center my-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{
                backgroundColor: 'var(--bg-surface)',
                border: `2px solid var(--border-color)`
              }}>
                <Plus className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
              </div>
            </div>

            {/* Token B Input */}
            <div className="rounded-2xl p-6 mb-6 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-300" style={{
              border: `2px solid var(--border-color)`,
              backgroundColor: 'var(--bg-surface)'
            }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Token B</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Balance: <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{parseFloat(getBalance(state.tokenB)).toFixed(4)}</span>
                </span>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  value={state.amountB}
                  onChange={(e) => setState(prev => ({ ...prev, amountB: e.target.value, error: null }))}
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-4xl font-mono outline-none placeholder:opacity-30 min-w-0"
                  style={{ color: 'var(--text-primary)' }}
                  disabled={state.isProcessing || state.poolExists}
                />
                <select
                  value={state.tokenB?.symbol || ''}
                  onChange={(e) => {
                    const token = tokens.find(t => t.symbol === e.target.value);
                    setState(prev => ({ ...prev, tokenB: token || null }));
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
              <button
                onClick={() => setState(prev => ({ ...prev, amountB: getBalance(state.tokenB) }))}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mt-4 font-bold transition-colors"
                disabled={state.isProcessing || state.poolExists}
              >
                MAX
              </button>
            </div>
          </>
        ) : (
          <>
            {/* LP Token Input for Remove */}
            <div className="rounded-2xl p-6 mb-6 hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-300" style={{
              border: `2px solid var(--border-color)`,
              backgroundColor: 'var(--bg-surface)'
            }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>LP Tokens</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Balance: <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{parseFloat(state.userLpBalance).toFixed(6)}</span>
                </span>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  value={state.lpTokenAmount}
                  onChange={(e) => setState(prev => ({ ...prev, lpTokenAmount: e.target.value, error: null }))}
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-4xl font-mono outline-none placeholder:opacity-30 min-w-0"
                  style={{ color: 'var(--text-primary)' }}
                  disabled={state.isProcessing}
                />
                <div className="flex-shrink-0 bg-gradient-to-r from-purple-600 to-purple-700 dark:from-purple-500 dark:to-purple-600 px-6 py-3.5 rounded-2xl font-bold shadow-lg shadow-purple-500/50">
                  <span className="text-white text-sm">LP</span>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setState(prev => ({ ...prev, lpTokenAmount: (parseFloat(state.userLpBalance) * 0.25).toFixed(6) }))}
                  className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-bold transition-colors"
                  disabled={state.isProcessing}
                >
                  25%
                </button>
                <button
                  onClick={() => setState(prev => ({ ...prev, lpTokenAmount: (parseFloat(state.userLpBalance) * 0.5).toFixed(6) }))}
                  className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-bold transition-colors"
                  disabled={state.isProcessing}
                >
                  50%
                </button>
                <button
                  onClick={() => setState(prev => ({ ...prev, lpTokenAmount: (parseFloat(state.userLpBalance) * 0.75).toFixed(6) }))}
                  className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-bold transition-colors"
                  disabled={state.isProcessing}
                >
                  75%
                </button>
                <button
                  onClick={() => setState(prev => ({ ...prev, lpTokenAmount: state.userLpBalance }))}
                  className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-bold transition-colors"
                  disabled={state.isProcessing}
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Expected Output */}
            {state.lpTokenAmount && parseFloat(state.lpTokenAmount) > 0 && (
              <div className="rounded-xl p-4 mb-6" style={{
                border: `1px solid var(--border-color)`,
                backgroundColor: 'var(--bg-surface)'
              }}>
                <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                  You will receive:
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span style={{ color: 'var(--text-secondary)' }}>{state.tokenA?.symbol}</span>
                    <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{state.amountA || '0.00'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span style={{ color: 'var(--text-secondary)' }}>{state.tokenB?.symbol}</span>
                    <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{state.amountB || '0.00'}</span>
                  </div>
                </div>
              </div>
            )}
          </>
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

        {/* Action Button */}
        <button
          onClick={state.mode === 'add' ? handleAddLiquidity : handleRemoveLiquidity}
          disabled={!stacksConnected || state.isProcessing || (state.mode === 'add' ? (!state.amountA || !state.amountB) : !state.lpTokenAmount)}
          className="w-full bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 dark:from-purple-600 dark:via-blue-600 dark:to-purple-600 hover:from-purple-700 hover:via-blue-700 hover:to-purple-700 text-white font-bold py-4 rounded-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-2xl shadow-purple-500/30 dark:shadow-purple-500/50 hover:shadow-purple-500/50 dark:hover:shadow-purple-500/70 hover:scale-[1.02] active:scale-[0.98]"
        >
          {state.isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : !stacksConnected ? (
            'Connect Stacks Wallet'
          ) : state.mode === 'add' ? (
            <>
              <Plus className="w-5 h-5" />
              Add Liquidity
            </>
          ) : (
            <>
              <Minus className="w-5 h-5" />
              Remove Liquidity
            </>
          )}
        </button>

        {/* Info */}
        <div className="mt-6 pt-6 text-xs text-center space-y-1" style={{ 
          borderTop: `1px solid var(--border-color)`,
          color: 'var(--text-secondary)'
        }}>
          <p className="flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 bg-purple-600 dark:bg-purple-400 rounded-full dark:animate-pulse-glow animate-slide-progress"></span>
            Earn 0.3% fees on all swaps
          </p>
          <p>LP tokens represent your share of the pool</p>
        </div>
      </div>
    </div>
  );
}
