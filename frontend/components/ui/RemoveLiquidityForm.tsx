/**
 * RemoveLiquidityForm Component
 */

'use client';

import React from 'react';
import { Settings, Minus, Loader2, ArrowLeft } from 'lucide-react';
import { SettingsPanel } from './SettingsPanel';
import { TransactionStatus } from './TransactionStatus';

interface RemoveLiquidityFormProps {
    state: any;
    setState: (val: any) => void;
    handleRemoveLiquidity: () => void;
    stacksConnected: boolean;
}

export function RemoveLiquidityForm({
    state,
    setState,
    handleRemoveLiquidity,
    stacksConnected
}: RemoveLiquidityFormProps) {
    return (
        <div className="p-8 md:p-10">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setState((prev: any) => ({ ...prev, mode: 'add' }))}
                        className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                    >
                        <ArrowLeft className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
                    </button>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                            Remove Liquidity
                        </h2>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Withdraw your assets from the pool</p>
                    </div>
                </div>
                <button
                    onClick={() => setState((prev: any) => ({ ...prev, showSettings: !prev.showSettings }))}
                    className={`p-3 rounded-2xl transition-all duration-300 ${state.showSettings ? 'bg-purple-500/10 text-purple-600 rotate-90' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                    style={{ color: state.showSettings ? '' : 'var(--text-secondary)' }}
                >
                    <Settings className="w-6 h-6" />
                </button>
            </div>

            <SettingsPanel
                slippage={state.slippage}
                setSlippage={(val) => setState((prev: any) => ({ ...prev, slippage: val }))}
                isOpen={state.showSettings}
            />

            <div className="rounded-2xl p-6 mb-6" style={{
                border: `2px solid var(--border-color)`,
                backgroundColor: 'var(--bg-surface)'
            }}>
                <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Amount to Remove</span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        Your balance: <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{state.userLpBalance} LP</span>
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    <input
                        type="number"
                        value={state.lpTokenAmount}
                        onChange={(e) => setState((prev: any) => ({ ...prev, lpTokenAmount: e.target.value, error: null }))}
                        placeholder="0.00"
                        className="flex-1 bg-transparent text-4xl font-mono outline-none placeholder:opacity-30 min-w-0"
                        style={{ color: 'var(--text-primary)' }}
                        disabled={state.isProcessing}
                    />
                    <div className="flex-shrink-0 bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-3.5 rounded-2xl font-bold text-white shadow-lg">
                        LP
                    </div>
                </div>
                <div className="flex gap-2 mt-6">
                    {[25, 50, 75, 100].map(pct => (
                        <button
                            key={pct}
                            onClick={() => {
                                const amount = pct === 100 ? state.userLpBalance : (parseFloat(state.userLpBalance) * pct / 100).toFixed(6);
                                setState((prev: any) => ({ ...prev, lpTokenAmount: amount }));
                            }}
                            className="flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all border hover:bg-purple-50 dark:hover:bg-purple-900/10 hover:border-purple-200 dark:hover:border-purple-800"
                            style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                            disabled={state.isProcessing}
                        >
                            {pct === 100 ? 'MAX' : `${pct}%`}
                        </button>
                    ))}
                </div>
            </div>

            {state.lpTokenAmount && parseFloat(state.lpTokenAmount) > 0 && (
                <div className="rounded-2xl p-6 mb-6" style={{
                    border: `1px solid var(--border-color)`,
                    backgroundColor: 'var(--bg-primary)'
                }}>
                    <p className="text-xs font-bold uppercase tracking-widest mb-4 opacity-50" style={{ color: 'var(--text-secondary)' }}>
                        Receiving Assets
                    </p>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center p-3 rounded-xl bg-gray-100 dark:bg-black/20">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-purple-600 text-[10px] flex items-center justify-center text-white font-bold">{state.tokenA?.symbol.charAt(0)}</div>
                                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{state.tokenA?.symbol}</span>
                            </div>
                            <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{state.amountA || '0.00'}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 rounded-xl bg-gray-100 dark:bg-black/20">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-blue-600 text-[10px] flex items-center justify-center text-white font-bold">{state.tokenB?.symbol.charAt(0)}</div>
                                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{state.tokenB?.symbol}</span>
                            </div>
                            <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{state.amountB || '0.00'}</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-8">
                <TransactionStatus error={state.error} success={state.success} />

                <button
                    onClick={handleRemoveLiquidity}
                    disabled={!stacksConnected || state.isProcessing || !state.lpTokenAmount}
                    className="w-full h-16 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white font-bold text-lg rounded-2xl transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-3 shadow-2xl shadow-red-500/20"
                >
                    {state.isProcessing ? (
                        <>
                            <Loader2 className="w-6 h-6 animate-spin" />
                            Withdrawing...
                        </>
                    ) : !stacksConnected ? (
                        'Connect wallet to withdraw'
                    ) : (
                        <>
                            <Minus className="w-5 h-5" />
                            Confirm Withdrawal
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
