/**
 * AddLiquidityForm Component
 */

'use client';

import React from 'react';
import { Settings, Plus, Loader2, Droplets } from 'lucide-react';
import { TokenInput } from './TokenInput';
import { SettingsPanel } from './SettingsPanel';
import { TransactionStatus } from './TransactionStatus';

interface AddLiquidityFormProps {
    state: any;
    setState: (val: any) => void;
    tokens: any[];
    getBalance: (token: any) => string;
    handleAddLiquidity: () => void;
    stacksConnected: boolean;
    openPoolBrowser: () => void;
}

export function AddLiquidityForm({
    state,
    setState,
    tokens,
    getBalance,
    handleAddLiquidity,
    stacksConnected,
    openPoolBrowser
}: AddLiquidityFormProps) {
    return (
        <div className="p-8 md:p-10">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                        Add Liquidity
                    </h2>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Provide assets to earn trading fees</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={openPoolBrowser}
                        className="p-3 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all text-blue-600 dark:text-blue-400"
                        title="Browse Pools"
                    >
                        <Droplets className="w-6 h-6" />
                    </button>
                    <button
                        onClick={() => setState((prev: any) => ({ ...prev, showSettings: !prev.showSettings }))}
                        className={`p-3 rounded-2xl transition-all duration-300 ${state.showSettings ? 'bg-purple-500/10 text-purple-600 rotate-90' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                        style={{ color: state.showSettings ? '' : 'var(--text-secondary)' }}
                    >
                        <Settings className="w-6 h-6" />
                    </button>
                </div>
            </div>

            <SettingsPanel
                slippage={state.slippage}
                setSlippage={(val) => setState((prev: any) => ({ ...prev, slippage: val }))}
                isOpen={state.showSettings}
            />

            <div>
                <TokenInput
                    label="First Token"
                    amount={state.amountA}
                    setAmount={(val) => setState((prev: any) => ({ ...prev, amountA: val, error: null }))}
                    token={state.tokenA}
                    setToken={(t) => setState((prev: any) => ({ ...prev, tokenA: t }))}
                    tokens={tokens}
                    balance={getBalance(state.tokenA)}
                    isProcessing={state.isProcessing}
                    onMax={() => setState((prev: any) => ({ ...prev, amountA: getBalance(state.tokenA) }))}
                    variant="purple"
                />

                <div className="flex justify-center my-4 relative z-10">
                    <div className="rounded-full p-3 shadow-lg" style={{
                        backgroundColor: 'var(--bg-surface)',
                        border: `2px solid var(--border-color)`
                    }}>
                        <Plus className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
                    </div>
                </div>

                <TokenInput
                    label="Second Token"
                    amount={state.amountB}
                    setAmount={(val) => setState((prev: any) => ({ ...prev, amountB: val, error: null }))}
                    token={state.tokenB}
                    setToken={(t) => setState((prev: any) => ({ ...prev, tokenB: t }))}
                    tokens={tokens}
                    balance={getBalance(state.tokenB)}
                    isProcessing={state.isProcessing}
                    onMax={() => setState((prev: any) => ({ ...prev, amountB: getBalance(state.tokenB) }))}
                    variant="blue"
                />
            </div>

            <div className="mt-8">


                <TransactionStatus error={state.error} success={state.success} />

                <button
                    onClick={handleAddLiquidity}
                    disabled={!stacksConnected || state.isProcessing || !state.amountA || !state.amountB}
                    className="w-full h-16 bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 hover:from-purple-700 hover:via-blue-700 hover:to-purple-700 text-white font-bold text-lg rounded-2xl transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-3 shadow-2xl shadow-purple-500/20"
                >
                    {state.isProcessing ? (
                        <>
                            <Loader2 className="w-6 h-6 animate-spin" />
                            Transaction pending...
                        </>
                    ) : !stacksConnected ? (
                        'Connect wallet to proceed'
                    ) : (
                        <>
                            <Droplets className="w-5 h-5" />
                            Supply Liquidity
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
