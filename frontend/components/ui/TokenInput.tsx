/**
 * TokenInput Component
 * Reusable token amount and selection input
 */

'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';

interface Token {
    symbol: string;
    name: string;
    address: string;
    decimals: number;
    logoUrl?: string;
    assetName?: string;
}

interface TokenInputProps {
    label: string;
    amount: string;
    setAmount: (val: string) => void;
    token: Token | null;
    setToken: (token: Token) => void;
    tokens: Token[];
    balance: string;
    isProcessing: boolean;
    onMax?: () => void;
    variant?: 'purple' | 'blue';
}

export function TokenInput({
    label,
    amount,
    setAmount,
    token,
    setToken,
    tokens,
    balance,
    isProcessing,
    onMax,
    variant = 'purple'
}: TokenInputProps) {
    const gradientClass = variant === 'purple'
        ? 'from-purple-600 to-purple-700 dark:from-purple-500 dark:to-purple-600 shadow-purple-500/50'
        : 'from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 shadow-blue-500/50';

    return (
        <div className="group rounded-2xl p-6 transition-all duration-300 relative"
            style={{
                border: `1px solid var(--border-color)`,
                backgroundColor: 'var(--bg-surface)',
            }}
        >

            <div className="flex items-center justify-between mb-6 relative z-10">
                <span className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>{label}</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Balance: <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{parseFloat(balance).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                </span>
            </div>
            <div className="flex items-center gap-6 relative z-10">
                <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 bg-transparent text-4xl font-mono outline-none placeholder:opacity-30 min-w-0"
                    style={{ color: 'var(--text-primary)' }}
                    disabled={isProcessing}
                />
                <div className="relative">
                    <select
                        value={token?.symbol || ''}
                        onChange={(e) => {
                            const selected = tokens.find(t => t.symbol === e.target.value);
                            if (selected) setToken(selected);
                        }}
                        className={`appearance-none bg-gradient-to-r ${gradientClass} text-white pl-5 pr-10 py-3 rounded-2xl font-bold outline-none cursor-pointer transition-all shadow-lg flex items-center gap-2 border-none`}
                        disabled={isProcessing}
                    >
                        {Array.isArray(tokens) && (tokens || []).map(t => (
                            <option key={t.symbol} value={t.symbol} className="text-black dark:text-white bg-white dark:bg-gray-900">
                                {t.symbol}
                            </option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white pointer-events-none" />
                </div>
            </div>
            {onMax && (
                <div className="flex justify-between items-center mt-6 relative z-10">
                    <button
                        onClick={onMax}
                        className={`text-[10px] font-black tracking-widest uppercase px-3 py-1.5 rounded-lg transition-all border ${variant === 'purple'
                            ? 'border-purple-500/20 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10'
                            : 'border-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10'
                            }`}
                        disabled={isProcessing}
                    >
                        MAX
                    </button>
                    {amount && parseFloat(amount) > 0 && token && (
                        <span className="text-[10px] font-bold opacity-40" style={{ color: 'var(--text-secondary)' }}>
                            ≈ ${(parseFloat(amount) * (token.address ? 1.5 : 2)).toFixed(2)} USD
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
