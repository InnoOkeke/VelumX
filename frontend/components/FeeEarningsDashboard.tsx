/**
 * Fee Earnings Dashboard Component
 * Displays detailed fee earnings breakdown, projections, and tax reporting
 * Validates Requirements: 7.1, 7.2, 7.3, 7.5
 */

'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '../lib/hooks/useWallet';
import { useConfig } from '../lib/config';
import {
  DollarSign,
  TrendingUp,
  Calendar,
  Download,
  Loader2,
  AlertCircle,
  Info,
  BarChart3,
  PieChart,
  FileText
} from 'lucide-react';

interface FeeEarnings {
  userAddress: string;
  poolId: string;
  totalEarnings: number;
  dailyEarnings: number;
  weeklyEarnings: number;
  monthlyEarnings: number;
  annualizedReturn: number;
}

interface FeeHistory {
  id: string;
  userAddress: string;
  poolId: string;
  amountUSD: number;
  transactionHash?: string;
  blockHeight?: number;
  timestamp: Date;
}

interface FeeProjection {
  poolId: string;
  projectedDaily: number;
  projectedWeekly: number;
  projectedMonthly: number;
  projectedAnnual: number;
  confidence: number;
}

interface DashboardState {
  earnings: FeeEarnings[];
  history: FeeHistory[];
  projections: { [poolId: string]: FeeProjection };
  selectedTimeframe: 'daily' | 'weekly' | 'monthly' | 'annual';
  selectedYear: number;
  isLoading: boolean;
  error: string | null;
  showExportModal: boolean;
}

export function FeeEarningsDashboard() {
  const { stacksAddress, stacksConnected } = useWallet();
  const config = useConfig();

  const [state, setState] = useState<DashboardState>({
    earnings: [],
    history: [],
    projections: {},
    selectedTimeframe: 'monthly',
    selectedYear: new Date().getFullYear(),
    isLoading: false,
    error: null,
    showExportModal: false,
  });

  // Fetch fee earnings on mount and when address changes
  useEffect(() => {
    if (stacksConnected && stacksAddress) {
      fetchFeeEarnings();
    }
  }, [stacksConnected, stacksAddress]);

  /**
   * Fetch fee earnings from backend API
   * Validates Requirement 7.1: Track accumulated fees per position in real-time
   */
  const fetchFeeEarnings = async () => {
    if (!stacksAddress) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Fetch earnings for all user positions
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
        throw new Error(`Failed to fetch fee earnings: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.data && Array.isArray(data.data)) {
        const positions = data.data;

        // Extract fee earnings from positions
        const earnings: FeeEarnings[] = (positions || []).map((pos: any) => ({
          userAddress: stacksAddress,
          poolId: pos.poolId,
          totalEarnings: pos.feeEarnings || 0,
          dailyEarnings: (pos.feeEarnings || 0) / 30, // Estimate
          weeklyEarnings: (pos.feeEarnings || 0) / 4, // Estimate
          monthlyEarnings: pos.feeEarnings || 0,
          annualizedReturn: pos.annualizedReturn || 0,
        }));

        setState(prev => ({
          ...prev,
          earnings,
          isLoading: false,
        }));

        // Fetch detailed history and projections
        await fetchFeeHistory();
        await fetchFeeProjections(earnings);
      } else {
        setState(prev => ({
          ...prev,
          earnings: [],
          isLoading: false,
        }));
      }
    } catch (error) {
      console.error('Failed to fetch fee earnings:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: `Failed to load fee earnings: ${(error as Error).message}`,
      }));
    }
  };

  /**
   * Fetch fee history
   * Validates Requirement 7.2: Provide daily, weekly, and monthly fee earnings breakdowns
   */
  const fetchFeeHistory = async () => {
    if (!stacksAddress) return;

    try {
      const response = await fetch(
        `${config.backendUrl}/api/liquidity/fees/history/${stacksAddress}?timeframe=30d`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data && Array.isArray(data.data)) {
          setState(prev => ({
            ...prev,
            history: data.data.map((h: any) => ({
              ...h,
              timestamp: new Date(h.timestamp),
            })),
          }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch fee history:', error);
    }
  };

  /**
   * Fetch fee projections
   * Validates Requirement 7.3: Calculate annualized returns based on current fee rates
   */
  const fetchFeeProjections = async (earnings: FeeEarnings[]) => {
    const projections: { [poolId: string]: FeeProjection } = {};

    for (const earning of earnings) {
      try {
        const response = await fetch(
          `${config.backendUrl}/api/liquidity/fees/projection/${earning.poolId}?amount=1000`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            projections[earning.poolId] = data.data;
          }
        }
      } catch (error) {
        console.error(`Failed to fetch projection for pool ${earning.poolId}:`, error);
      }
    }

    setState(prev => ({ ...prev, projections }));
  };

  /**
   * Export tax report
   * Validates Requirement 7.5: Provide exportable fee earnings data with transaction details
   */
  const exportTaxReport = async () => {
    if (!stacksAddress) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch(
        `${config.backendUrl}/api/liquidity/fees/tax-report/${stacksAddress}?year=${state.selectedYear}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to generate tax report: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.data) {
        // Convert to CSV format
        const csvContent = generateCSV(data.data);

        // Download file
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fee-earnings-${state.selectedYear}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        setState(prev => ({
          ...prev,
          isLoading: false,
          showExportModal: false,
        }));
      } else {
        throw new Error(data.error || 'Failed to generate tax report');
      }
    } catch (error) {
      console.error('Failed to export tax report:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: `Failed to export tax report: ${(error as Error).message}`,
      }));
    }
  };

  /**
   * Generate CSV content from tax report data
   */
  const generateCSV = (taxReport: any): string => {
    const headers = ['Date', 'Pool ID', 'Amount (USD)', 'Transaction Hash', 'Block Height'];
    const rows: string[][] = [headers];

    if (taxReport && Array.isArray(taxReport.positions)) {
      taxReport.positions.forEach((position: any) => {
        if (position && Array.isArray(position.transactions)) {
          position.transactions.forEach((tx: any) => {
            rows.push([
              new Date(tx.timestamp).toLocaleDateString(),
              tx.poolId,
              tx.amountUSD.toFixed(2),
              tx.transactionHash || 'N/A',
              tx.blockHeight?.toString() || 'N/A',
            ]);
          });
        }
      });
    }

    return rows.map(row => row.join(',')).join('\n');
  };

  /**
   * Calculate total earnings for selected timeframe
   */
  const getTotalEarnings = (): number => {
    return state.earnings.reduce((sum, earning) => {
      switch (state.selectedTimeframe) {
        case 'daily':
          return sum + earning.dailyEarnings;
        case 'weekly':
          return sum + earning.weeklyEarnings;
        case 'monthly':
          return sum + earning.monthlyEarnings;
        case 'annual':
          return sum + earning.totalEarnings * 12; // Estimate annual
        default:
          return sum + earning.monthlyEarnings;
      }
    }, 0);
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
    return `${value.toFixed(2)}%`;
  };

  if (!stacksConnected) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{
        backgroundColor: 'var(--bg-surface)',
        border: `1px solid var(--border-color)`,
      }}>
        <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-50" style={{ color: 'var(--text-secondary)' }} />
        <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          Connect Wallet
        </h3>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Connect your wallet to view fee earnings
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Fee Earnings Dashboard
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Track your liquidity provision earnings and projections
          </p>
        </div>
        <button
          onClick={() => setState(prev => ({ ...prev, showExportModal: true }))}
          className="px-4 py-2 rounded-lg font-semibold transition-all bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2"
          disabled={state.isLoading || state.earnings.length === 0}
        >
          <Download className="w-4 h-4" />
          Export Report
        </button>
      </div>

      {/* Error Message */}
      {state.error && (
        <div className="flex items-start gap-3 bg-red-50 border-2 border-red-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 font-medium">{state.error}</p>
        </div>
      )}

      {/* Loading State */}
      {state.isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        </div>
      )}

      {/* Main Content */}
      {!state.isLoading && state.earnings.length > 0 && (
        <>
          {/* Timeframe Selector */}
          <div className="flex gap-2">
            {(['daily', 'weekly', 'monthly', 'annual'] as const).map((timeframe) => (
              <button
                key={timeframe}
                onClick={() => setState(prev => ({ ...prev, selectedTimeframe: timeframe }))}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${state.selectedTimeframe === timeframe
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                style={state.selectedTimeframe !== timeframe ? { color: 'var(--text-secondary)' } : {}}
              >
                {timeframe.charAt(0).toUpperCase() + timeframe.slice(1)}
              </button>
            ))}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Total Earnings */}
            <div className="rounded-2xl p-6" style={{
              backgroundColor: 'var(--bg-surface)',
              border: `1px solid var(--border-color)`,
            }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Total Earnings
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {state.selectedTimeframe}
                  </p>
                </div>
              </div>
              <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {formatCurrency(getTotalEarnings())}
              </p>
            </div>

            {/* Average APR */}
            <div className="rounded-2xl p-6" style={{
              backgroundColor: 'var(--bg-surface)',
              border: `1px solid var(--border-color)`,
            }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Average APR
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Across all positions
                  </p>
                </div>
              </div>
              <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {formatPercentage(
                  state.earnings.reduce((sum, e) => sum + e.annualizedReturn, 0) /
                  (state.earnings.length || 1)
                )}
              </p>
            </div>

            {/* Active Positions */}
            <div className="rounded-2xl p-6" style={{
              backgroundColor: 'var(--bg-surface)',
              border: `1px solid var(--border-color)`,
            }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                  <PieChart className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Active Positions
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Earning fees
                  </p>
                </div>
              </div>
              <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {state.earnings.length}
              </p>
            </div>
          </div>

          {/* Detailed Breakdown */}
          <div className="rounded-2xl p-6" style={{
            backgroundColor: 'var(--bg-surface)',
            border: `1px solid var(--border-color)`,
          }}>
            <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Earnings by Position
            </h3>
            <div className="space-y-4">
              {state.earnings.map((earning) => {
                const projection = state.projections[earning.poolId];
                return (
                  <div
                    key={earning.poolId}
                    className="rounded-xl p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all"
                    style={{ border: `1px solid var(--border-color)` }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          Pool: {earning.poolId.substring(0, 20)}...
                        </p>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          APR: {formatPercentage(earning.annualizedReturn)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                          {formatCurrency(
                            state.selectedTimeframe === 'daily' ? earning.dailyEarnings :
                              state.selectedTimeframe === 'weekly' ? earning.weeklyEarnings :
                                state.selectedTimeframe === 'monthly' ? earning.monthlyEarnings :
                                  earning.totalEarnings * 12
                          )}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {state.selectedTimeframe} earnings
                        </p>
                      </div>
                    </div>

                    {/* Projection */}
                    {projection && (
                      <div className="rounded-lg p-3 mt-3" style={{
                        backgroundColor: 'rgba(139, 92, 246, 0.05)',
                        border: `1px solid var(--border-color)`,
                      }}>
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                              Projected Earnings (for $1,000 investment)
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                              <div>Daily: {formatCurrency(projection.projectedDaily)}</div>
                              <div>Weekly: {formatCurrency(projection.projectedWeekly)}</div>
                              <div>Monthly: {formatCurrency(projection.projectedMonthly)}</div>
                              <div>Annual: {formatCurrency(projection.projectedAnnual)}</div>
                            </div>
                            <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                              Confidence: {formatPercentage(projection.confidence * 100)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Fee History */}
          {state.history.length > 0 && (
            <div className="rounded-2xl p-6" style={{
              backgroundColor: 'var(--bg-surface)',
              border: `1px solid var(--border-color)`,
            }}>
              <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                Recent Fee Collections
              </h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {state.history.slice(0, 20).map((fee) => (
                  <div
                    key={fee.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all"
                    style={{ border: `1px solid var(--border-color)` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
                        <DollarSign className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                          {formatCurrency(fee.amountUSD)}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {fee.timestamp.toLocaleDateString()} {fee.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    {fee.transactionHash && (
                      <a
                        href={`https://explorer.stacks.co/txid/${fee.transactionHash}?chain=testnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-purple-600 dark:text-purple-400 hover:underline"
                      >
                        View Tx
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty State */}
      {!state.isLoading && state.earnings.length === 0 && (
        <div className="rounded-2xl p-12 text-center" style={{
          backgroundColor: 'var(--bg-surface)',
          border: `1px solid var(--border-color)`,
        }}>
          <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-50" style={{ color: 'var(--text-secondary)' }} />
          <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            No Fee Earnings Yet
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Add liquidity to pools to start earning fees from swaps
          </p>
        </div>
      )}

      {/* Export Modal */}
      {state.showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="rounded-2xl max-w-md w-full p-6 shadow-2xl" style={{
            backgroundColor: 'var(--bg-surface)',
            border: `1px solid var(--border-color)`,
          }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                  Export Tax Report
                </h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Download fee earnings for tax reporting
                </p>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Select Year
              </label>
              <select
                value={state.selectedYear}
                onChange={(e) => setState(prev => ({ ...prev, selectedYear: parseInt(e.target.value) }))}
                className="w-full px-4 py-3 rounded-xl outline-none transition-all"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  border: `2px solid var(--border-color)`,
                  color: 'var(--text-primary)',
                }}
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setState(prev => ({ ...prev, showExportModal: false }))}
                className="flex-1 px-4 py-3 rounded-xl font-semibold transition-all bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                style={{ color: 'var(--text-secondary)' }}
                disabled={state.isLoading}
              >
                Cancel
              </button>
              <button
                onClick={exportTaxReport}
                className="flex-1 px-4 py-3 rounded-xl font-semibold transition-all bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center gap-2"
                disabled={state.isLoading}
              >
                {state.isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Export CSV
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
