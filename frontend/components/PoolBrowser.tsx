/**
 * PoolBrowser Component
 * Displays all available liquidity pools with statistics
 */

'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '../lib/hooks/useWallet';
import { useConfig } from '../lib/config';
import { TrendingUp, Droplets, BarChart3, Plus, ExternalLink, Loader2 } from 'lucide-react';
import { formatUnits } from 'viem';

interface Pool {
  id: string;
  tokenA: {
    symbol: string;
    address: string;
    reserve: string;
  };
  tokenB: {
    symbol: string;
    address: string;
    reserve: string;
  };
  tvl: string;
  volume24h: string;
  apy: string;
  fee: string;
  userLpBalance: string;
  userPoolShare: string;
}

interface PoolBrowserState {
  pools: Pool[];
  isLoading: boolean;
  error: string | null;
  sortBy: 'tvl' | 'volume' | 'apy';
  filterToken: string;
}

export function PoolBrowser() {
  const { stacksAddress, stacksConnected } = useWallet();
  const config = useConfig();

  const [state, setState] = useState<PoolBrowserState>({
    pools: [],
    isLoading: true,
    error: null,
    sortBy: 'tvl',
    filterToken: 'all',
  });

  useEffect(() => {
    fetchPools();
  }, [stacksAddress]);

  const fetchPools = async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch(`${config.backendUrl}/api/liquidity/pools`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch pools: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.data && Array.isArray(data.data)) {
        const pools: Pool[] = data.data.map((pool: any) => ({
          id: pool.id,
          tokenA: {
            symbol: pool.tokenA.symbol,
            address: pool.tokenA.address,
            reserve: pool.tokenA.reserve || '0',
          },
          tokenB: {
            symbol: pool.tokenB.symbol,
            address: pool.tokenB.address,
            reserve: pool.tokenB.reserve || '0',
          },
          tvl: pool.tvl || '0',
          volume24h: pool.volume24h || '0',
          apy: pool.apr || '0',
          fee: '0.3', // Standard fee for now
          userLpBalance: '0',
          userPoolShare: '0',
        }));

        setState(prev => ({
          ...prev,
          pools: pools,
          isLoading: false,
        }));
      } else {
        setState(prev => ({
          ...prev,
          pools: [],
          isLoading: false,
        }));
      }
    } catch (error) {
      console.error('Failed to fetch pools:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to load live pools. Showing placeholder data for preview.',
        isLoading: false,
        pools: [],
      }));
    }
  };

  const sortedPools = Array.isArray(state.pools) ? [...state.pools].sort((a, b) => {
    switch (state.sortBy) {
      case 'tvl':
        return parseFloat(b.tvl) - parseFloat(a.tvl);
      case 'volume':
        return parseFloat(b.volume24h) - parseFloat(a.volume24h);
      case 'apy':
        return parseFloat(b.apy) - parseFloat(a.apy);
      default:
        return 0;
    }
  }) : [];

  const filteredPools = state.filterToken === 'all'
    ? sortedPools
    : sortedPools.filter(pool =>
      pool.tokenA.symbol === state.filterToken || pool.tokenB.symbol === state.filterToken
    );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="rounded-3xl vellum-shadow transition-all duration-300" style={{
        backgroundColor: 'var(--bg-surface)',
        border: `1px solid var(--border-color)`,
        padding: '2rem'
      }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              Liquidity Pools
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Provide liquidity and earn trading fees
            </p>
          </div>
          <button
            onClick={() => window.location.href = '#liquidity'}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-all duration-300 flex items-center gap-2 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-105"
          >
            <Plus className="w-5 h-5" />
            New Position
          </button>
        </div>

        {/* Filters and Sort */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setState(prev => ({ ...prev, sortBy: 'tvl' }))}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${state.sortBy === 'tvl'
                ? 'bg-purple-600 text-white'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              style={state.sortBy !== 'tvl' ? {
                backgroundColor: 'rgba(var(--bg-primary-rgb), 0.5)',
                color: 'var(--text-primary)',
                border: `1px solid var(--border-color)`
              } : {}}
            >
              <Droplets className="w-4 h-4 inline mr-1" />
              TVL
            </button>
            <button
              onClick={() => setState(prev => ({ ...prev, sortBy: 'volume' }))}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${state.sortBy === 'volume'
                ? 'bg-purple-600 text-white'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              style={state.sortBy !== 'volume' ? {
                backgroundColor: 'rgba(var(--bg-primary-rgb), 0.5)',
                color: 'var(--text-primary)',
                border: `1px solid var(--border-color)`
              } : {}}
            >
              <BarChart3 className="w-4 h-4 inline mr-1" />
              Volume
            </button>
            <button
              onClick={() => setState(prev => ({ ...prev, sortBy: 'apy' }))}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${state.sortBy === 'apy'
                ? 'bg-purple-600 text-white'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              style={state.sortBy !== 'apy' ? {
                backgroundColor: 'rgba(var(--bg-primary-rgb), 0.5)',
                color: 'var(--text-primary)',
                border: `1px solid var(--border-color)`
              } : {}}
            >
              <TrendingUp className="w-4 h-4 inline mr-1" />
              APY
            </button>
          </div>

          <select
            value={state.filterToken}
            onChange={(e) => setState(prev => ({ ...prev, filterToken: e.target.value }))}
            className="px-4 py-2 rounded-lg text-sm font-semibold outline-none cursor-pointer transition-all hover:bg-gray-100 dark:hover:bg-gray-800"
            style={{
              backgroundColor: 'rgba(var(--bg-primary-rgb), 0.5)',
              color: 'var(--text-primary)',
              border: `1px solid var(--border-color)`
            }}
          >
            <option value="all">All Tokens</option>
            <option value="USDCx">USDCx</option>
            <option value="STX">STX</option>
          </select>
        </div>

        {/* Loading State */}
        {state.isLoading && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-12 h-12 animate-spin text-purple-600 dark:text-purple-400 mb-4" />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading pools...</p>
          </div>
        )}

        {/* Error State */}
        {state.error && (
          <div className="rounded-xl p-6 text-center" style={{
            border: `1px solid var(--border-color)`,
            backgroundColor: 'rgba(239, 68, 68, 0.05)'
          }}>
            <p className="text-sm text-red-600 font-medium">{state.error}</p>
            <button
              onClick={fetchPools}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all"
            >
              Retry
            </button>
          </div>
        )}

        {/* Pools List */}
        {!state.isLoading && !state.error && (
          <div className="space-y-4">
            {filteredPools.length === 0 ? (
              <div className="rounded-xl p-12 text-center" style={{
                border: `1px solid var(--border-color)`,
                backgroundColor: 'var(--bg-surface)'
              }}>
                <Droplets className="w-16 h-16 mx-auto mb-4 opacity-30" style={{ color: 'var(--text-secondary)' }} />
                <p className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  No pools found
                </p>
                <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                  Be the first to create a liquidity pool!
                </p>
                <button
                  onClick={() => window.location.href = '#liquidity'}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-all duration-300 inline-flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Create Pool
                </button>
              </div>
            ) : (
              (filteredPools || []).map(pool => (
                <div
                  key={pool.id}
                  className="rounded-2xl p-6 hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-300 cursor-pointer"
                  style={{
                    border: `2px solid var(--border-color)`,
                    backgroundColor: 'var(--bg-surface)'
                  }}
                  onClick={() => window.location.href = `#liquidity?pool=${pool.id}`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                          {pool.tokenA.symbol.charAt(0)}
                        </div>
                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-lg -ml-3">
                          {pool.tokenB.symbol.charAt(0)}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                          {pool.tokenA.symbol} / {pool.tokenB.symbol}
                        </h3>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {pool.fee}% fee tier
                        </p>
                      </div>
                    </div>
                    <ExternalLink className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>TVL</p>
                      <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                        ${parseFloat(pool.tvl).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>24h Volume</p>
                      <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                        ${parseFloat(pool.volume24h).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>APY</p>
                      <p className="text-lg font-bold text-green-600 dark:text-green-400">
                        {pool.apy}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Your Position</p>
                      <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                        {parseFloat(pool.userLpBalance) > 0 ? `${parseFloat(pool.userPoolShare).toFixed(2)}%` : '-'}
                      </p>
                    </div>
                  </div>

                  {parseFloat(pool.userLpBalance) > 0 && (
                    <div className="mt-4 pt-4" style={{ borderTop: `1px solid var(--border-color)` }}>
                      <div className="flex items-center justify-between text-sm">
                        <span style={{ color: 'var(--text-secondary)' }}>Your LP Tokens:</span>
                        <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {parseFloat(pool.userLpBalance).toFixed(6)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Info */}
        <div className="mt-6 pt-6 text-xs text-center space-y-1" style={{
          borderTop: `1px solid var(--border-color)`,
          color: 'var(--text-secondary)'
        }}>
          <p className="flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 bg-purple-600 dark:bg-purple-400 rounded-full dark:animate-pulse-glow animate-slide-progress"></span>
            Powered by VelumX AMM
          </p>
          <p>APY is calculated based on 24h trading volume and fees</p>
        </div>
      </div>
    </div>
  );
}
