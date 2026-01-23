/**
 * PoolItem Component
 * Single pool row in list
 */

'use client';

import React from 'react';
import { BarChart3 } from 'lucide-react';

interface PoolItemProps {
    pool: any;
    analytics: any;
    onSelect: (pool: any) => void;
    onViewAnalytics: (pool: any) => void;
    formatCurrency: (val: number) => string;
    formatPercentage: (val: number) => string;
}

export function PoolItem({
    pool,
    analytics,
    onSelect,
    onViewAnalytics,
    formatCurrency,
    formatPercentage
}: PoolItemProps) {
    return (
        <div
            onClick={() => onSelect(pool)}
            className="p-6 cursor-pointer transition-all border-b group"
            style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-color)'
            }}
        >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Pool Info */}
                <div className="flex items-center gap-4">
                    <div className="flex items-center -space-x-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center text-white font-bold text-lg shadow-lg border-2 border-white dark:border-gray-900 group-hover:scale-110 transition-transform duration-300">
                            {pool.tokenA.symbol.charAt(0)}
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-white font-bold text-lg shadow-lg border-2 border-white dark:border-gray-900 group-hover:scale-110 transition-transform duration-300 z-10">
                            {pool.tokenB.symbol.charAt(0)}
                        </div>
                    </div>
                    <div>
                        <h4 className="font-bold text-xl transition-colors" style={{ color: 'var(--text-primary)' }}>
                            {pool.tokenA.symbol} / {pool.tokenB.symbol}
                        </h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {pool.tokenA.name} • {pool.tokenB.name}
                        </p>
                    </div>
                </div>

                {/* Pool Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-left md:text-right flex-1 md:flex-none">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-secondary)' }}>
                            TVL
                        </p>
                        <p className="font-mono font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                            {formatCurrency(analytics?.tvl || pool.tvl)}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-secondary)' }}>
                            APR
                        </p>
                        <p className="font-mono font-bold text-lg text-green-500">
                            {formatPercentage(analytics?.apr || pool.apr)}
                        </p>
                    </div>
                    <div className="hidden sm:block">
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-secondary)' }}>
                            24h Vol
                        </p>
                        <p className="font-mono font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                            {formatCurrency(analytics?.volume24h || pool.volume24h)}
                        </p>
                    </div>

                    <div className="flex items-center justify-end">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onViewAnalytics(pool);
                            }}
                            className="p-3 rounded-xl transition-all hover:bg-gray-100 dark:hover:bg-gray-800"
                            style={{ color: 'var(--text-secondary)' }}
                            title="View Statistics"
                        >
                            <BarChart3 className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
