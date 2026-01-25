/**
 * PoolAnalytics Component
 * Displays comprehensive pool analytics including charts and historical data
 */

'use client';

import { useState, useEffect } from 'react';
import { useConfig } from '../lib/config';
import { TrendingUp, TrendingDown, BarChart3, PieChart, Activity, DollarSign, Percent, Clock, Info, Loader2 } from 'lucide-react';

interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoUrl?: string;
  priceUSD?: number;
}

interface Pool {
  id: string;
  tokenA: Token;
  tokenB: Token;
  reserveA: bigint;
  reserveB: bigint;
  totalSupply: bigint;
  tvl: number;
  volume24h: number;
  apr: number;
  feeEarnings24h: number;
  createdAt: Date;
  lastUpdated: Date;
}

interface HistoricalDataPoint {
  timestamp: Date;
  tvl: number;
  volume: number;
  price: number;
  fees: number;
}

interface LiquidityDepth {
  bids: PriceLevel[];
  asks: PriceLevel[];
}

interface PriceLevel {
  price: number;
  liquidity: number;
  priceImpact: number;
}

interface PoolAnalytics {
  poolId: string;
  tvl: number;
  volume24h: number;
  volume7d: number;
  apr: number;
  feeEarnings24h: number;
  priceChange24h: number;
  liquidityDepth: LiquidityDepth;
  historicalData: HistoricalDataPoint[];
}

interface PoolAnalyticsProps {
  pool: Pool;
  onClose: () => void;
}

export function PoolAnalytics({ pool, onClose }: PoolAnalyticsProps) {
  const config = useConfig();
  const [analytics, setAnalytics] = useState<PoolAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1d' | '7d' | '30d' | '90d'>('7d');
  const [selectedChart, setSelectedChart] = useState<'tvl' | 'volume' | 'price' | 'fees'>('tvl');

  useEffect(() => {
    fetchPoolAnalytics();
  }, [pool.id, selectedTimeframe]);

  const fetchPoolAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${config.backendUrl}/api/liquidity/analytics/${pool.id}?timeframe=${selectedTimeframe}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch analytics: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.data) {
        const analyticsData: PoolAnalytics = {
          ...data.data,
          historicalData: (data.data.historicalData || []).map((point: any) => ({
            ...point,
            timestamp: new Date(point.timestamp),
          })) || [],
        };
        setAnalytics(analyticsData);
      } else {
        throw new Error(data.error || 'Failed to fetch analytics');
      }
    } catch (error) {
      console.error('Failed to fetch pool analytics:', error);
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number): string => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    } else {
      return `$${value.toFixed(2)}`;
    }
  };

  const formatPercentage = (value: number): string => {
    return `${value.toFixed(2)}%`;
  };

  const formatNumber = (value: number): string => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(2)}K`;
    } else {
      return value.toFixed(2);
    }
  };

  const getChartData = () => {
    if (!analytics?.historicalData) return [];

    return (analytics.historicalData || []).map(point => ({
      timestamp: point.timestamp.toLocaleDateString(),
      value: selectedChart === 'tvl' ? point.tvl :
        selectedChart === 'volume' ? point.volume :
          selectedChart === 'price' ? point.price :
            point.fees
    }));
  };

  const getChartColor = () => {
    switch (selectedChart) {
      case 'tvl': return 'rgb(139, 92, 246)'; // Purple
      case 'volume': return 'rgb(59, 130, 246)'; // Blue
      case 'price': return 'rgb(16, 185, 129)'; // Green
      case 'fees': return 'rgb(245, 158, 11)'; // Yellow
      default: return 'rgb(139, 92, 246)';
    }
  };

  const calculatePriceImpact = (tradeSize: number): number => {
    if (!analytics?.liquidityDepth) return 0;

    // Simple price impact calculation based on liquidity depth
    const totalLiquidity = (analytics.liquidityDepth.bids || []).reduce((sum, level) => sum + level.liquidity, 0);
    if (totalLiquidity === 0) return 0;

    const impactPercentage = (tradeSize / totalLiquidity) * 100;
    return Math.min(impactPercentage, 50); // Cap at 50%
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl" style={{
        backgroundColor: 'var(--bg-surface)',
        border: `1px solid var(--border-color)`
      }}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-4">
            <div className="flex items-center -space-x-2">
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-600 to-purple-700 flex items-center justify-center text-white font-bold shadow-lg">
                {pool.tokenA.symbol.charAt(0)}
              </div>
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-600 to-blue-700 flex items-center justify-center text-white font-bold shadow-lg">
                {pool.tokenB.symbol.charAt(0)}
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {pool.tokenA.symbol} / {pool.tokenB.symbol}
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Pool Analytics & Performance
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="text-2xl" style={{ color: 'var(--text-secondary)' }}>×</span>
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600 dark:text-purple-400" />
              <span className="ml-3 text-lg" style={{ color: 'var(--text-primary)' }}>Loading analytics...</span>
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <div className="rounded-xl p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-red-700 dark:text-red-300 font-semibold">Failed to load analytics</p>
                <p className="text-red-600 dark:text-red-400 text-sm mt-2">{error}</p>
                <button
                  onClick={fetchPoolAnalytics}
                  className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : analytics ? (
            <>
              {/* Key Metrics */}
              <div className="p-6 border-b" style={{ borderColor: 'var(--border-color)' }}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="text-center">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <DollarSign className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Total Value Locked
                    </p>
                    <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {formatCurrency(analytics.tvl)}
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                      24h Volume
                    </p>
                    <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {formatCurrency(analytics.volume24h)}
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <Percent className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                      APR
                    </p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {formatPercentage(analytics.apr)}
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                      <Activity className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                      24h Fees
                    </p>
                    <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                      {formatCurrency(analytics.feeEarnings24h)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Chart Section */}
              <div className="p-6 border-b" style={{ borderColor: 'var(--border-color)' }}>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    Historical Performance
                  </h3>
                  <div className="flex gap-2">
                    {/* Chart Type Selector */}
                    <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid var(--border-color)` }}>
                      {[
                        { key: 'tvl', label: 'TVL', icon: DollarSign },
                        { key: 'volume', label: 'Volume', icon: BarChart3 },
                        { key: 'price', label: 'Price', icon: TrendingUp },
                        { key: 'fees', label: 'Fees', icon: Activity },
                      ].map(({ key, label, icon: Icon }) => (
                        <button
                          key={key}
                          onClick={() => setSelectedChart(key as any)}
                          className={`px-3 py-2 text-sm font-semibold transition-all flex items-center gap-1 ${selectedChart === key
                            ? 'bg-purple-600 text-white'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                          style={selectedChart !== key ? { color: 'var(--text-secondary)' } : {}}
                        >
                          <Icon className="w-4 h-4" />
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Timeframe Selector */}
                    <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid var(--border-color)` }}>
                      {[
                        { key: '1d', label: '1D' },
                        { key: '7d', label: '7D' },
                        { key: '30d', label: '30D' },
                        { key: '90d', label: '90D' },
                      ].map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => setSelectedTimeframe(key as any)}
                          className={`px-3 py-2 text-sm font-semibold transition-all ${selectedTimeframe === key
                            ? 'bg-purple-600 text-white'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                          style={selectedTimeframe !== key ? { color: 'var(--text-secondary)' } : {}}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Simple Chart Visualization */}
                <div className="h-64 rounded-xl p-4" style={{
                  backgroundColor: 'var(--bg-primary)',
                  border: `1px solid var(--border-color)`
                }}>
                  {analytics.historicalData.length > 0 ? (
                    <div className="h-full flex items-end justify-between gap-1">
                      {getChartData().slice(-20).map((point, index) => {
                        const chartData = getChartData();
                        const maxValue = chartData.length > 0 ? Math.max(...chartData.map(p => p.value)) : 0;
                        const height = maxValue > 0 ? (point.value / maxValue) * 100 : 0;
                        return (
                          <div key={index} className="flex-1 flex flex-col items-center">
                            <div
                              className="w-full rounded-t transition-all hover:opacity-80"
                              style={{
                                height: `${height}%`,
                                backgroundColor: getChartColor(),
                                minHeight: '4px',
                              }}
                              title={`${point.timestamp}: ${selectedChart === 'tvl' || selectedChart === 'volume' || selectedChart === 'fees'
                                ? formatCurrency(point.value)
                                : formatNumber(point.value)
                                }`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <p style={{ color: 'var(--text-secondary)' }}>No historical data available</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Pool Details */}
              <div className="p-6 border-b" style={{ borderColor: 'var(--border-color)' }}>
                <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                  Pool Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Reserves */}
                  <div className="rounded-xl p-4" style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: `1px solid var(--border-color)`
                  }}>
                    <h4 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                      Pool Reserves
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-r from-purple-600 to-purple-700 flex items-center justify-center text-white text-xs font-bold">
                            {pool.tokenA.symbol.charAt(0)}
                          </div>
                          <span style={{ color: 'var(--text-secondary)' }}>{pool.tokenA.symbol}</span>
                        </div>
                        <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {formatNumber(Number(pool.reserveA) / Math.pow(10, pool.tokenA.decimals))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-600 to-blue-700 flex items-center justify-center text-white text-xs font-bold">
                            {pool.tokenB.symbol.charAt(0)}
                          </div>
                          <span style={{ color: 'var(--text-secondary)' }}>{pool.tokenB.symbol}</span>
                        </div>
                        <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {formatNumber(Number(pool.reserveB) / Math.pow(10, pool.tokenB.decimals))}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Price Impact Calculator */}
                  <div className="rounded-xl p-4" style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: `1px solid var(--border-color)`
                  }}>
                    <h4 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                      Price Impact Calculator
                    </h4>
                    <div className="space-y-3">
                      {[1000, 5000, 10000, 50000].map(amount => (
                        <div key={amount} className="flex items-center justify-between">
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {formatCurrency(amount)} trade
                          </span>
                          <span className={`font-semibold ${calculatePriceImpact(amount) > 5
                            ? 'text-red-600 dark:text-red-400'
                            : calculatePriceImpact(amount) > 1
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-green-600 dark:text-green-400'
                            }`}>
                            {formatPercentage(calculatePriceImpact(amount))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Stats */}
              <div className="p-6">
                <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                  Additional Statistics
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 rounded-xl" style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: `1px solid var(--border-color)`
                  }}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                      7D Volume
                    </p>
                    <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                      {formatCurrency(analytics.volume7d)}
                    </p>
                  </div>
                  <div className="text-center p-4 rounded-xl" style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: `1px solid var(--border-color)`
                  }}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                      24h Price Change
                    </p>
                    <p className={`text-lg font-bold ${analytics.priceChange24h >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                      }`}>
                      {analytics.priceChange24h >= 0 ? '+' : ''}{formatPercentage(analytics.priceChange24h)}
                    </p>
                  </div>
                  <div className="text-center p-4 rounded-xl" style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: `1px solid var(--border-color)`
                  }}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Total Supply
                    </p>
                    <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                      {formatNumber(Number(pool.totalSupply) / Math.pow(10, 6))}
                    </p>
                  </div>
                  <div className="text-center p-4 rounded-xl" style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: `1px solid var(--border-color)`
                  }}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Pool Age
                    </p>
                    <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                      {Math.floor((Date.now() - pool.createdAt.getTime()) / (1000 * 60 * 60 * 24))}d
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}