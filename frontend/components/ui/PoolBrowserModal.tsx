/**
 * PoolBrowserModal Component
 */

'use client';

import React from 'react';
import { Search, Loader2, ArrowUpDown, RefreshCw } from 'lucide-react';
import { Modal } from './Modal';
import { PoolItem } from './PoolItem';

interface PoolBrowserModalProps {
    isOpen: boolean;
    onClose: () => void;
    state: any;
    setState: (val: any) => void;
    fetchAvailablePools: () => void;
    selectPoolFromBrowser: (pool: any) => void;
    formatCurrency: (val: number) => string;
    formatPercentage: (val: number) => string;
}

export function PoolBrowserModal({
    isOpen,
    onClose,
    state,
    setState,
    fetchAvailablePools,
    selectPoolFromBrowser,
    formatCurrency,
    formatPercentage
}: PoolBrowserModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Verified Liquidity Pools"
            maxWidth="max-w-4xl"
        >
            <div className="space-y-6">
                {/* Search and Sort */}
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 opacity-40" style={{ color: 'var(--text-secondary)' }} />
                        <input
                            type="text"
                            value={state.poolSearchQuery}
                            onChange={(e) => setState((prev: any) => ({ ...prev, poolSearchQuery: e.target.value }))}
                            placeholder="Search by token name or symbol..."
                            className="w-full pl-12 pr-4 py-4 rounded-2xl outline-none transition-all"
                            style={{
                                backgroundColor: 'var(--bg-primary)',
                                border: `2px solid var(--border-color)`,
                                color: 'var(--text-primary)'
                            }}
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setState((prev: any) => ({ ...prev, poolSortOrder: state.poolSortOrder === 'asc' ? 'desc' : 'asc' }))}
                            className="px-6 py-4 rounded-2xl font-bold flex items-center gap-2 transition-all hover:bg-gray-100 dark:hover:bg-gray-800"
                            style={{ border: `1px solid var(--border-color)`, color: 'var(--text-secondary)' }}
                        >
                            <ArrowUpDown className="w-4 h-4" />
                            {state.poolSortOrder === 'asc' ? 'Low' : 'High'} APR
                        </button>
                        <button
                            onClick={fetchAvailablePools}
                            disabled={state.loadingPools}
                            className="p-4 rounded-2xl transition-all hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                            style={{ border: `1px solid var(--border-color)`, color: 'var(--text-secondary)' }}
                        >
                            <RefreshCw className={`w-5 h-5 ${state.loadingPools ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Pool List */}
                <div className="rounded-[2rem] overflow-hidden border custom-scrollbar" style={{ borderColor: 'var(--border-color)', maxHeight: '50vh' }}>
                    {state.loadingPools ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
                            <p className="text-sm font-bold tracking-widest uppercase opacity-50" style={{ color: 'var(--text-secondary)' }}>Indexing Pools...</p>
                        </div>
                    ) : state.filteredPools.length === 0 ? (
                        <div className="text-center py-20">
                            <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-6">
                                <Search className="w-10 h-10 opacity-20" />
                            </div>
                            <h4 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>No pools indexed</h4>
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Try adjusting your search or check back later.</p>
                        </div>
                    ) : (
                        <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                            {Array.isArray(state.filteredPools) && state.filteredPools.map((pool: any) => (
                                <PoolItem
                                    key={pool.id}
                                    pool={pool}
                                    analytics={state.poolAnalytics?.[pool.id]}
                                    onSelect={selectPoolFromBrowser}
                                    onViewAnalytics={(p) => setState((prev: any) => ({ ...prev, selectedPoolForSwap: p, showPoolAnalytics: true }))}
                                    formatCurrency={formatCurrency}
                                    formatPercentage={formatPercentage}
                                />
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between pt-4 opacity-50">
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                        Showing {state.filteredPools.length} verified pools
                    </p>
                    <button
                        onClick={onClose}
                        className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:scale-105 transition-transform"
                    >
                        Go back to interface
                    </button>
                </div>
            </div>
        </Modal>
    );
}
