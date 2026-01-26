/**
 * TransactionHistory Component
 * Display user's transaction history with filtering and sorting
 */

'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '../lib/hooks/useWallet';
import { useConfig } from '../lib/config';
import { TransactionMonitor } from './TransactionMonitor';
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  ArrowDownUp,
  Filter,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

// Define BridgeTransaction type locally
interface BridgeTransaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'swap' | 'add-liquidity' | 'remove-liquidity';
  sourceTxHash: string;
  destinationTxHash?: string;
  sourceChain: string;
  destinationChain: string;
  amount: string;
  sender: string;
  recipient: string;
  status: string;
  timestamp: number;
  inputToken?: string;
  outputToken?: string;
}

type FilterType = 'all' | 'deposit' | 'withdrawal' | 'swap' | 'liquidity';
type SortType = 'newest' | 'oldest' | 'amount';

export function TransactionHistory() {
  const { ethereumAddress, stacksAddress } = useWallet();
  const config = useConfig();

  const [transactions, setTransactions] = useState<BridgeTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortType>('newest');
  const [selectedTx, setSelectedTx] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const ITEMS_PER_PAGE = 10;

  // Fetch transactions
  const fetchTransactions = async (refresh = false) => {
    if (!ethereumAddress && !stacksAddress) return;

    if (refresh) {
      setLoading(true);
      setPage(0);
    }

    try {
      // Fetch from both addresses if available
      const addresses = [ethereumAddress, stacksAddress].filter(Boolean);
      const allTransactions: BridgeTransaction[] = [];

      for (const address of addresses) {
        const response = await fetch(
          `${config.backendUrl}/api/transactions/user/${address}?limit=${ITEMS_PER_PAGE}&offset=${page * ITEMS_PER_PAGE}`
        );
        const data = await response.json();

        if (data.success && data.data && Array.isArray(data.data.transactions)) {
          allTransactions.push(...data.data.transactions);
          setHasMore(data.data.hasMore);
        }
      }

      // Remove duplicates based on transaction ID
      const uniqueTxs = Array.from(
        new Map((allTransactions || []).map(tx => [tx.id, tx])).values()
      );

      setTransactions(uniqueTxs);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
      setError('Failed to load transaction history');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchTransactions();

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchTransactions();
    }, 30000);

    return () => clearInterval(interval);
  }, [ethereumAddress, stacksAddress, page]);

  // Filter transactions
  const filteredTransactions = transactions.filter(tx => {
    if (filter === 'all') return true;
    if (filter === 'liquidity') return tx.type === 'add-liquidity' || tx.type === 'remove-liquidity';
    return tx.type === filter;
  });

  // Sort transactions
  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    switch (sort) {
      case 'newest':
        return b.timestamp - a.timestamp;
      case 'oldest':
        return a.timestamp - b.timestamp;
      case 'amount':
        return parseFloat(b.amount) - parseFloat(a.amount);
      default:
        return 0;
    }
  });

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-400" />;
      default:
        return <Clock className="w-5 h-5 text-yellow-400" />;
    }
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      default:
        return 'text-yellow-400';
    }
  };

  // Format address
  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Get explorer URL
  const getExplorerUrl = (chain: string, hash: string): string => {
    if (chain === 'ethereum') {
      return `${config.ethereumExplorerUrl}/tx/${hash}`;
    } else {
      return `${config.stacksExplorerUrl}/txid/${hash}?chain=testnet`;
    }
  };

  if (selectedTx) {
    return (
      <div>
        <button
          onClick={() => setSelectedTx(null)}
          className="mb-4 text-sm text-purple-400 hover:text-purple-300 flex items-center gap-2"
        >
          ← Back to History
        </button>
        <TransactionMonitor txHash={selectedTx} onClose={() => setSelectedTx(null)} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="rounded-3xl vellum-shadow transition-all duration-300" style={{
        backgroundColor: 'var(--bg-surface)',
        border: `1px solid var(--border-color)`,
        padding: '2rem'
      }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Activity</h2>
          <button
            onClick={() => fetchTransactions(true)}
            disabled={loading}
            className="p-2 rounded-lg transition-colors disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Filter:</span>
          </div>
          <div className="flex gap-2">
            {(['all', 'deposit', 'withdrawal', 'swap', 'liquidity'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f
                  ? 'bg-purple-600 text-white'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                style={filter !== f ? {
                  backgroundColor: 'rgba(var(--bg-primary-rgb), 0.5)',
                  color: 'var(--text-primary)',
                  border: `1px solid var(--border-color)`
                } : {}}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Sort:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortType)}
              className="rounded-lg px-3 py-1.5 text-sm outline-none"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: `1px solid var(--border-color)`,
                color: 'var(--text-primary)'
              }}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="amount">Amount</option>
            </select>
          </div>
        </div>

        {/* Loading State */}
        {loading && transactions.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-4">
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && sortedTransactions.length === 0 && (
          <div className="text-center py-12">
            <ArrowDownUp className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
            <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>No transactions yet</p>
            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
              Bridge, swap, or provide liquidity to get started
            </p>
          </div>
        )}

        {/* Transaction List */}
        {sortedTransactions.length > 0 && (
          <div className="space-y-3">
            {(sortedTransactions || []).map((tx) => (
              <div
                key={tx.id}
                onClick={() => setSelectedTx(tx.id)}
                className="rounded-xl p-5 cursor-pointer transition-all group hover:-translate-y-0.5"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)'
                }}
              >
                <div className="flex items-start justify-between">
                  {/* Left Side */}
                  <div className="flex items-start gap-4">
                    {/* Status Icon */}
                    <div className="mt-1">{getStatusIcon(tx.status)}</div>

                    {/* Transaction Info */}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {tx.type === 'deposit' ? 'Bridge In' :
                            tx.type === 'withdrawal' ? 'Bridge Out' :
                              tx.type === 'swap' ? 'Swap' :
                                tx.type === 'add-liquidity' ? 'Add Liquidity' : 'Remove Liquidity'}
                        </span>
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {tx.type === 'deposit' ? 'ETH → STX' :
                            tx.type === 'withdrawal' ? 'STX → ETH' :
                              tx.type === 'swap' ? `${tx.inputToken} → ${tx.outputToken}` :
                                tx.type === 'add-liquidity' ? `${tx.inputToken}/${tx.outputToken}` : 'LP Token'}
                        </span>
                      </div>
                      <div className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                        <div>
                          From: <span className="font-mono">{formatAddress(tx.sender)}</span>
                        </div>
                        <div>
                          To: <span className="font-mono">{formatAddress(tx.recipient)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>{new Date(tx.timestamp).toLocaleDateString()}</span>
                          <span style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>•</span>
                          <span>{new Date(tx.timestamp).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Side */}
                  <div className="text-right">
                    <div className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                      {tx.amount} {tx.type === 'deposit' ? 'USDC' :
                        tx.type === 'withdrawal' ? 'USDCx' :
                          tx.type === 'swap' ? tx.inputToken :
                            tx.type === 'add-liquidity' ? tx.inputToken : 'LP'}
                    </div>
                    <div className={`text-sm font-semibold capitalize ${getStatusColor(tx.status)}`}>
                      {tx.status.replace('_', ' ')}
                    </div>
                    <a
                      href={getExplorerUrl(tx.sourceChain, tx.sourceTxHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 mt-2 font-medium"
                    >
                      View TX <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {hasMore && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={loading}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Load More
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
