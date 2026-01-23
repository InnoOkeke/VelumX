/**
 * HomePage Component
 * Professional DeFi Interface
 */

'use client';

import { useState } from 'react';
import { WalletButton } from './WalletButton';
import { BridgeInterface } from './BridgeInterface';
import { SwapInterface } from './SwapInterface';
import { LiquidityInterface } from './LiquidityInterface';
import { PoolBrowser } from './PoolBrowser';
import { TransactionHistory } from './TransactionHistory';
import { NotificationContainer } from './NotificationContainer';
import { ArrowLeftRight, Zap, History, Repeat, Shield, Moon, Sun, Droplets, BarChart3 } from 'lucide-react';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'bridge' | 'swap' | 'liquidity' | 'pools' | 'history'>('bridge');
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Initialize dark mode from localStorage
  useState(() => {
    if (typeof window !== 'undefined') {
      const savedMode = localStorage.getItem('darkMode') === 'true';
      setIsDarkMode(savedMode);
      if (savedMode) {
        document.documentElement.classList.add('dark');
      }
    }
  });

  // Toggle dark mode
  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('darkMode', String(newMode));
    if (newMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <div className="min-h-screen mesh-gradient transition-colors duration-300" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <NotificationContainer />

      {/* Header */}
      <header className="sticky top-0 z-50 w-full backdrop-blur-2xl transition-all duration-300" style={{ borderBottom: `1px solid var(--border-color)`, backgroundColor: 'rgba(var(--bg-surface-rgb), 0.7)' }}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative glow-ring rounded-lg p-1">
                <img src="/velumx-icon.svg" alt="VelumX" className="h-7 w-7" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 bg-clip-text text-transparent">
                VelumX
              </span>
              <span className="ml-2 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
                TESTNET
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleDarkMode}
                className="p-2.5 rounded-xl transition-all duration-300 group hover:scale-110"
                style={{ backgroundColor: 'var(--bg-surface)', border: `1px solid var(--border-color)` }}
                aria-label="Toggle dark mode"
              >
                {isDarkMode ? (
                  <Sun className="h-5 w-5 text-yellow-500 group-hover:rotate-180 transition-transform duration-500" />
                ) : (
                  <Moon className="h-5 w-5 text-purple-600 group-hover:-rotate-12 transition-transform duration-300" />
                )}
              </button>
              <WalletButton />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12 relative">
          <div className="absolute inset-0 flex items-center justify-center opacity-20 dark:opacity-10">
            <div className="w-96 h-96 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full blur-3xl"></div>
          </div>
          <h1 className="relative text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
            <span className="bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 bg-clip-text text-transparent animate-gradient">
              The Future of
            </span>
            <br />
            <span style={{ color: 'var(--text-primary)' }}>Gasless DeFi</span>
          </h1>
          <p className="relative text-xl md:text-2xl max-w-3xl mx-auto font-light leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Bridge USDC. Swap tokens. Earn yield. All without buying native gas tokens—your stablecoins pay the way.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-2xl border border-gray-200/50 dark:border-gray-800/50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-1.5 shadow-xl shadow-purple-500/10 dark:shadow-purple-500/5 transition-all duration-300">
            <button
              onClick={() => setActiveTab('bridge')}
              className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all duration-300 ${activeTab === 'bridge'
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/50'
                : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
            >
              <ArrowLeftRight className="h-4 w-4" />
              Bridge
            </button>
            <button
              onClick={() => setActiveTab('swap')}
              className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all duration-300 ${activeTab === 'swap'
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/50'
                : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
            >
              <Repeat className="h-4 w-4" />
              Swap
            </button>
            <button
              onClick={() => setActiveTab('liquidity')}
              className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all duration-300 ${activeTab === 'liquidity'
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/50'
                : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
            >
              <Droplets className="h-4 w-4" />
              Liquidity
            </button>
            <button
              onClick={() => setActiveTab('pools')}
              className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all duration-300 ${activeTab === 'pools'
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/50'
                : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
            >
              <BarChart3 className="h-4 w-4" />
              Pools
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all duration-300 ${activeTab === 'history'
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/50'
                : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
            >
              <History className="h-4 w-4" />
              History
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="mb-16">
          {activeTab === 'bridge' && <BridgeInterface />}
          {activeTab === 'swap' && <SwapInterface />}
          {activeTab === 'liquidity' && <LiquidityInterface />}
          {activeTab === 'pools' && <PoolBrowser />}
          {activeTab === 'history' && <TransactionHistory />}
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <div className="group rounded-2xl vellum-shadow transition-all duration-300 hover:-translate-y-1 p-8" style={{
            backgroundColor: 'var(--bg-surface)',
            border: `1px solid var(--border-color)`
          }}>
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 dark:from-purple-600 dark:to-purple-700 mb-5 shadow-lg shadow-purple-500/50 group-hover:scale-110 transition-transform duration-300">
              <ArrowLeftRight className="h-7 w-7 text-white" />
            </div>
            <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Seamless Bridging</h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Move USDC between Ethereum and Stacks in under 10 minutes. Circle's xReserve ensures your funds are always safe.
            </p>
          </div>

          <div className="group rounded-2xl vellum-shadow transition-all duration-300 hover:-translate-y-1 p-8" style={{
            backgroundColor: 'var(--bg-surface)',
            border: `1px solid var(--border-color)`
          }}>
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 mb-5 shadow-lg shadow-blue-500/50 group-hover:scale-110 transition-transform duration-300">
              <Zap className="h-7 w-7 text-white" />
            </div>
            <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Stablecoin Gas</h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Stop juggling native tokens. VelumX accepts USDCx as gas—so you can trade without the friction.
            </p>
          </div>

          <div className="group rounded-2xl vellum-shadow transition-all duration-300 hover:-translate-y-1 p-8" style={{
            backgroundColor: 'var(--bg-surface)',
            border: `1px solid var(--border-color)`
          }}>
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 dark:from-green-600 dark:to-green-700 mb-5 shadow-lg shadow-green-500/50 group-hover:scale-110 transition-transform duration-300">
              <Repeat className="h-7 w-7 text-white" />
            </div>
            <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Instant Swaps</h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Our battle-tested AMM gives you the best rates with near-instant execution. DeFi the way it should be.
            </p>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center group">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 group-hover:scale-110 transition-transform duration-300" style={{
              backgroundColor: 'var(--bg-surface)',
              border: `1px solid var(--border-color)`
            }}>
              <Shield className="h-8 w-8 text-purple-600 dark:text-purple-400" />
            </div>
            <h4 className="font-bold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>Bank-Grade Security</h4>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Non-custodial contracts, fully audited</p>
          </div>
          <div className="text-center group">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 group-hover:scale-110 transition-transform duration-300" style={{
              backgroundColor: 'var(--bg-surface)',
              border: `1px solid var(--border-color)`
            }}>
              <Zap className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h4 className="font-bold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>Sub-Second Execution</h4>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Lightning-fast transactions on Stacks</p>
          </div>
          <div className="text-center group">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 group-hover:scale-110 transition-transform duration-300" style={{
              backgroundColor: 'var(--bg-surface)',
              border: `1px solid var(--border-color)`
            }}>
              <ArrowLeftRight className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h4 className="font-bold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>Zero Friction</h4>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No wallet hopping, no token juggling</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 backdrop-blur-xl transition-all duration-300" style={{
        borderTop: `1px solid var(--border-color)`,
        backgroundColor: 'var(--bg-surface)'
      }}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/velumx-icon.svg" alt="VelumX" className="h-6 w-6" />
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>VelumX</span>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Gasless DeFi on Bitcoin L2
              </span>
            </div>

            <div className="flex items-center gap-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <a href="#" className="hover:text-purple-600 dark:hover:text-purple-400 transition-colors font-medium">Docs</a>
              <a href="#" className="hover:text-purple-600 dark:hover:text-purple-400 transition-colors font-medium">GitHub</a>
              <a href="#" className="hover:text-purple-600 dark:hover:text-purple-400 transition-colors font-medium">Twitter</a>
              <a href="#" className="hover:text-purple-600 dark:hover:text-purple-400 transition-colors font-medium">Discord</a>
            </div>
          </div>

          <div className="text-center pt-6 mt-6" style={{ borderTop: `1px solid var(--border-color)` }}>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              © 2024 VelumX • <span className="text-orange-600 dark:text-orange-400 font-semibold">Testnet Beta - Not for Production</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
