/**
 * PositionDashboard Component
 * Displays user's liquidity positions, portfolio summary, and transaction history
 * Validates Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '../lib/hooks/useWallet';
import { useConfig } from '../lib/config';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  DollarSign, 
  Percent, 
  Clock, 
  RefreshCw,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Activity,
  BarChart3,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoUrl?: string;
  priceUSD?: number;
}

interface LiquidityPosition {
  poolId: string;
  userAddress: string;
  lpTokenBalance: string;
  sharePercentage: number;
  tokenAAmount: string;
  tokenBAmount: string;
  currentValue: number;
  initialValue: number;
  impermanentLoss: number;
  feeEarnings: number;
  createdAt: Date;
  lastUpdated: Date;
  tokenA?: Token;
  tokenB?: Token;
}

interface PortfolioSummary {
  userAddress: string;
  totalValue: number;
  totalFeeEarnings: number;
  totalImpermanentLoss: number;
  totalReturns: number;
  positionCount: number;
  positions: LiquidityPosition[];
}

interface PositionHistory {
  id: string;
  userAddress: string;
  poolId: string;
  action: 'add' | 'remove';
  lpTokenAmount: string;
  tokenAAmount: string;
  tokenBAmount: string;
  valueUSD: number;
  transactionHash: string;
  blockHeight: number;
  timestamp: Date;
}

interface DashboardState {
  portfolio: PortfolioSummary | null;
  positions: LiquidityPosition[];
  history: PositionHistory[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  expandedPositions: Set<string>;
  selectedTimeframe: '24h' | '7d' | '30d' | 'all';
  showHistory: boolean;
}

export function PositionDashboard() {
  const { stacksAddress, stacksConnected } = useWallet();
  const config = useConfig();

  const [state, setState] = useState<DashboardState>({
    portfolio: null,
    positions: [],
    history: [],
    isLoading: false,
    isRefreshing: false,
    error: null,
    expandedPositions: new Set(),
    selectedTimeframe: '7d',
    showHistory: false,
  });

  // Fetch positions when wallet connects
  useEffect(() => {
    if (stacksConnected && stacksAddress) {
      fetchPositions();
    }
  }, [stacksConnected, stacksAddress]);

  /**
   * Fetch user positions and portfolio summary
   * Validates: Requirement 4.1 - Fetch all LP token balances across pools
   */
  const fetchPositions = async () => {
    if (!stacksAddress) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Fetch positions from backend API
      const response = await fetch(
        `${config.backendUrl}/api/liquidity/positions/${stacksAddress}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch positions: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.data) {
        const positions: LiquidityPosition[] = data.data.map((pos: any) => ({
          ...pos,
          createdAt: new Date(pos.createdAt),
          lastUpdated: new Date(pos.lastUpdated),
        }));

        // Calculate portfolio summary
        // Validates: Requirement 4.2 - Calculate current value, impermanent loss, and total earnings
        const portfolio: PortfolioSummary = {
          userAddress: stacksAddress,
          totalValue: positions.reduce((sum, pos) => sum + pos.currentValue, 0),
          totalFeeEarnings: positions.reduce((sum, pos) => sum + pos.feeEarnings, 0),
          totalImpermanentLoss: positions.reduce((sum, pos) => sum + pos.impermanentLoss, 0),
          totalReturns: positions.reduce(
            (sum, pos) => sum + (pos.currentValue - pos.initialValue + pos.feeEarnings),
            0
          ),
          positionCount: positions.length,
          positions,
        };

        setState(prev => ({
          ...prev,
          positions,
          portfolio,
          isLoading: false,
        }));
      } else {
        throw new Error(data.error || 'Failed to fetch positions');
      }
    } catch (error) {
      console.error('Failed to fetch positions:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: `Failed to load positions: ${(error as Error).message}`,
      }));
    }
  };

  /**
   * Fetch position history
   * Validates: Requirement 4.5 - Provide transaction history with timestamps and amounts
   */
  const fetchHistory = async () => {
    if (!stacksAddress) return;

    setState(prev => ({ ...prev, isRefreshing: true }));

    try {
      // Fetch history from backend API
      const response = await fetch(
        `${config.backendUrl}/api/liquidity/positions/${stacksAddress}/history`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch history: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.data) {
        const history: PositionHistory[] = data.data.map((tx: any) => ({
          ...tx,
          timestamp: new Date(tx.timestamp),
        }));

        setState(prev => ({
          ...prev,
          history,
          isRefreshing: false,
          showHistory: true,
        }));
      } else {
        throw new Error(data.error || 'Failed to fetch history');
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
      setState(prev => ({
        ...prev,
        isRefreshing: false,
        error: `Failed to load history: ${(error as Error).message}`,
      }));
    }
  };

  /**
   * Refresh all data
   */
  const handleRefresh = async () => {
    setState(prev => ({ ...prev, isRefreshing: true }));
    await fetchPositions();
    if (state.showHistory) {
      await fetchHistory();
    }
    setState(prev => ({ ...prev, isRefreshing: false }));
  };

  /**
   * Toggle position expansion
   */
  const togglePosition = (poolId: string) => {
    setState(prev => {
      const expanded = new Set(prev.expandedPositions);
      if (expanded.has(poolId)) {
        expanded.delete(poolId);
      } else {
        expanded.add(poolId);
      }
      return { ...prev, expandedPositions: expanded };
    });
  };

  /**
   * Format currency values
   */
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  /**
   * Format percentage values
   */
  const formatPercentage = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  /**
   * Format token amount
   */
  const formatTokenAmount = (amount: string, decimals: number = 6): string => {
    const value = Number(amount) / Math.pow(10, decimals);
    return value.toFixed(6);
  };

  /**
   * Format date
   */
  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  /**
   * Calculate return percentage
   */
  const calculateReturnPercentage = (position: LiquidityPosition): number => {
    if (position.initialValue === 0) return 0;
    const totalReturn = position.currentValue - position.initialValue + position.feeEarnings;
    return (totalReturn / position.initialValue) * 100;
  };

  // Show loading state
  if (!stacksConnected) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="rounded-3xl p-12 text-center" style={{
          backgroundColor: 'var(--bg-surface)',
          border: `1px solid var(--border-color)`,
        }}>
          <Wallet className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--text-secondary)' }} />
          <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Connect Your Wallet
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Connect your Stacks wallet to view your liquidity positions and portfolio
          </p>
        </div>
      </div>
    );
  }

  if (state.isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="rounded-3xl p-12 text-center" style={{
          backgroundColor: 'var(--bg-surface)',
          border: `1px solid var(--border-color)`,
        }}>
          <Loader2 className="w-16 h-16 mx-auto mb-4 animate-spin text-purple-600" />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Loading your positions...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Portfolio Dashboard
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Track your liquidity positions and earnings
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={state.isRefreshing}
          className="px-4 py-2 rounded-lg font-semibold transition-all bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${state.isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error Message */}
      {state.error && (
        <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300 font-medium">{state.error}</p>
        </div>
      )}

      {/* Portfolio Summary Cards */}
      {/* Validates: Requirement 4.4 - Show total portfolio value, daily/weekly/monthly returns */}
      {state.portfolio && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Value */}
          <div className="rounded-2xl p-6" style={{
            backgroundColor: 'var(--bg-surface)',
            border: `1px solid var(--border-color)`,
          }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Total Value
              </span>
              <DollarSign className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <p className="text-3xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              {formatCurrency(state.portfolio.totalValue)}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Across {state.portfolio.positionCount} position{state.portfolio.positionCount !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Total Returns */}
          <div className="rounded-2xl p-6" style={{
            backgroundColor: 'var(--bg-surface)',
            border: `1px solid var(--border-color)`,
          }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Total Returns
              </span>
              {state.portfolio.totalReturns >= 0 ? (
                <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
              )}
            </div>
            <p className={`text-3xl font-bold mb-1 ${
              state.portfolio.totalReturns >= 0 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-red-600 dark:text-red-400'
            }`}>
              {formatCurrency(state.portfolio.totalReturns)}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {state.portfolio.totalValue > 0 
                ? formatPercentage((state.portfolio.totalReturns / state.portfolio.totalValue) * 100)
                : '0.00%'}
            </p>
          </div>

          {/* Fee Earnings */}
          {/* Validates: Requirement 4.3 - Track accumulated fees since position creation */}
          <div className="rounded-2xl p-6" style={{
            backgroundColor: 'var(--bg-surface)',
            border: `1px solid var(--border-color)`,
          }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Fee Earnings
              </span>
              <Percent className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-3xl font-bold mb-1 text-blue-600 dark:text-blue-400">
              {formatCurrency(state.portfolio.totalFeeEarnings)}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              From trading fees
            </p>
          </div>

          {/* Impermanent Loss */}
          <div className="rounded-2xl p-6" style={{
            backgroundColor: 'var(--bg-surface)',
            border: `1px solid var(--border-color)`,
          }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Impermanent Loss
              </span>
              <Activity className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <p className={`text-3xl font-bold mb-1 ${
              state.portfolio.totalImpermanentLoss <= 0 
                ? 'text-orange-600 dark:text-orange-400' 
                : 'text-green-600 dark:text-green-400'
            }`}>
              {formatCurrency(Math.abs(state.portfolio.totalImpermanentLoss))}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {state.portfolio.totalImpermanentLoss <= 0 ? 'Loss' : 'Gain'} vs. holding
            </p>
          </div>
        </div>
      )}

      {/* Positions List */}
      <div className="rounded-3xl p-6" style={{
        backgroundColor: 'var(--bg-surface)',
        border: `1px solid var(--border-color)`,
      }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Your Positions
          </h2>
          <button
            onClick={() => fetchHistory()}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-all bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Clock className="w-4 h-4 inline mr-1" />
            View History
          </button>
        </div>

        {state.positions.length === 0 ? (
          <div className="text-center py-12">
            <PieChart className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--text-secondary)' }} />
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              No Positions Yet
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Add liquidity to a pool to start earning fees
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {state.positions.map((position) => {
              const isExpanded = state.expandedPositions.has(position.poolId);
              const returnPercentage = calculateReturnPercentage(position);
              const [tokenASymbol, tokenBSymbol] = position.poolId.split('-');

              return (
                <div
                  key={position.poolId}
                  className="rounded-xl transition-all"
                  style={{
                    border: `1px solid var(--border-color)`,
                    backgroundColor: isExpanded ? 'rgba(139, 92, 246, 0.05)' : 'transparent',
                  }}
                >
                  {/* Position Header */}
                  <div
                    onClick={() => togglePosition(position.poolId)}
                    className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-xl transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {/* Pool Icon */}
                        <div className="flex items-center -space-x-2">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-purple-700 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                            {tokenASymbol.charAt(0)}
                          </div>
                          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-600 to-blue-700 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                            {tokenBSymbol.charAt(0)}
                          </div>
                        </div>

                        {/* Pool Info */}
                        <div>
                          <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                            {tokenASymbol} / {tokenBSymbol}
                          </h3>
                          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {position.sharePercentage.toFixed(4)}% of pool
                          </p>
                        </div>
                      </div>

                      {/* Position Metrics */}
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                            Value
                          </p>
                          <p className="font-bold" style={{ color: 'var(--text-primary)' }}>
                            {formatCurrency(position.currentValue)}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                            Returns
                          </p>
                          <p className={`font-bold ${
                            returnPercentage >= 0 
                              ? 'text-green-600 dark:text-green-400' 
                              : 'text-red-600 dark:text-red-400'
                          }`}>
                            {formatPercentage(returnPercentage)}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                            Fees Earned
                          </p>
                          <p className="font-bold text-blue-600 dark:text-blue-400">
                            {formatCurrency(position.feeEarnings)}
                          </p>
                        </div>

                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
                        ) : (
                          <ChevronDown className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Position Details (Expanded) */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-4">
                      <div className="h-px" style={{ backgroundColor: 'var(--border-color)' }} />

                      {/* Detailed Metrics */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                            LP Tokens
                          </p>
                          <p className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {formatTokenAmount(position.lpTokenBalance)}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                            {tokenASymbol} Amount
                          </p>
                          <p className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {formatTokenAmount(position.tokenAAmount)}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                            {tokenBSymbol} Amount
                          </p>
                          <p className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {formatTokenAmount(position.tokenBAmount)}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                            Initial Value
                          </p>
                          <p className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {formatCurrency(position.initialValue)}
                          </p>
                        </div>
                      </div>

                      {/* Performance Breakdown */}
                      <div className="rounded-lg p-4" style={{
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        border: `1px solid rgba(139, 92, 246, 0.2)`,
                      }}>
                        <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                          Performance Breakdown
                        </h4>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span style={{ color: 'var(--text-secondary)' }}>Current Value:</span>
                            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                              {formatCurrency(position.currentValue)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span style={{ color: 'var(--text-secondary)' }}>Fee Earnings:</span>
                            <span className="font-semibold text-blue-600 dark:text-blue-400">
                              +{formatCurrency(position.feeEarnings)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span style={{ color: 'var(--text-secondary)' }}>Impermanent Loss:</span>
                            <span className={`font-semibold ${
                              position.impermanentLoss <= 0 
                                ? 'text-orange-600 dark:text-orange-400' 
                                : 'text-green-600 dark:text-green-400'
                            }`}>
                              {position.impermanentLoss <= 0 ? '' : '+'}{formatCurrency(position.impermanentLoss)}
                            </span>
                          </div>
                          <div className="h-px my-2" style={{ backgroundColor: 'var(--border-color)' }} />
                          <div className="flex items-center justify-between text-sm font-bold">
                            <span style={{ color: 'var(--text-primary)' }}>Total Return:</span>
                            <span className={
                              returnPercentage >= 0 
                                ? 'text-green-600 dark:text-green-400' 
                                : 'text-red-600 dark:text-red-400'
                            }>
                              {formatCurrency(position.currentValue - position.initialValue + position.feeEarnings)}
                              {' '}({formatPercentage(returnPercentage)})
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Position Info */}
                      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <span>Created: {formatDate(position.createdAt)}</span>
                        <span>Last Updated: {formatDate(position.lastUpdated)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Transaction History */}
      {/* Validates: Requirement 4.5 - Provide transaction history with timestamps and amounts */}
      {state.showHistory && (
        <div className="rounded-3xl p-6" style={{
          backgroundColor: 'var(--bg-surface)',
          border: `1px solid var(--border-color)`,
        }}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Transaction History
            </h2>
            <button
              onClick={() => setState(prev => ({ ...prev, showHistory: false }))}
              className="text-sm font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
            >
              Hide
            </button>
          </div>

          {state.history.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--text-secondary)' }} />
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                No Transaction History
              </h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Your liquidity transactions will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {state.history.map((tx) => {
                const [tokenASymbol, tokenBSymbol] = tx.poolId.split('-');
                const isAdd = tx.action === 'add';

                return (
                  <div
                    key={tx.id}
                    className="rounded-xl p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all"
                    style={{
                      border: `1px solid var(--border-color)`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {/* Action Icon */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          isAdd 
                            ? 'bg-green-100 dark:bg-green-900/30' 
                            : 'bg-red-100 dark:bg-red-900/30'
                        }`}>
                          {isAdd ? (
                            <ArrowUpRight className="w-5 h-5 text-green-600 dark:text-green-400" />
                          ) : (
                            <ArrowDownRight className="w-5 h-5 text-red-600 dark:text-red-400" />
                          )}
                        </div>

                        {/* Transaction Info */}
                        <div>
                          <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {isAdd ? 'Added' : 'Removed'} Liquidity
                          </h4>
                          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {tokenASymbol} / {tokenBSymbol} • {formatDate(tx.timestamp)}
                          </p>
                        </div>
                      </div>

                      {/* Transaction Details */}
                      <div className="text-right">
                        <p className="font-bold" style={{ color: 'var(--text-primary)' }}>
                          {formatCurrency(tx.valueUSD)}
                        </p>
                        <a
                          href={`https://explorer.stacks.co/txid/${tx.transactionHash}?chain=testnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 flex items-center gap-1 justify-end"
                        >
                          View on Explorer
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>

                    {/* Token Amounts */}
                    <div className="mt-3 pt-3 grid grid-cols-3 gap-4 text-xs" style={{
                      borderTop: `1px solid var(--border-color)`,
                    }}>
                      <div>
                        <p className="font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                          LP Tokens
                        </p>
                        <p className="font-mono" style={{ color: 'var(--text-primary)' }}>
                          {formatTokenAmount(tx.lpTokenAmount)}
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                          {tokenASymbol}
                        </p>
                        <p className="font-mono" style={{ color: 'var(--text-primary)' }}>
                          {formatTokenAmount(tx.tokenAAmount)}
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                          {tokenBSymbol}
                        </p>
                        <p className="font-mono" style={{ color: 'var(--text-primary)' }}>
                          {formatTokenAmount(tx.tokenBAmount)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
