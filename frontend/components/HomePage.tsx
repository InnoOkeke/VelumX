/**
 * HomePage Component
 * Main landing page with wallet integration
 */

'use client';

import { useState } from 'react';
import { WalletButton } from './WalletButton';
import { BridgeInterface } from './BridgeInterface';
import { SwapInterface } from './SwapInterface';
import { TransactionHistory } from './TransactionHistory';
import { NotificationContainer } from './NotificationContainer';
import { useWallet } from '../lib/hooks/useWallet';
import {
  ArrowLeftRight,
  Zap,
  History,
  Repeat,
  Shield,
  Github,
  Twitter,
  MessageCircle,
} from 'lucide-react';

export default function HomePage() {
  const { ethereumConnected, stacksConnected } = useWallet();
  const [activeTab, setActiveTab] = useState<'bridge' | 'swap' | 'history'>('bridge');

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-purple-500/30">
      {/* Notification Container */}
      <NotificationContainer />
      
      {/* Header */}
      <nav className="sticky top-0 z-50 glass-effect backdrop-blur-xl border-b border-white/10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/velumx-icon.svg" alt="VelumX" className="w-10 h-10" />
              <div>
                <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                  VelumX
                </span>
                <span className="ml-2 text-xs bg-yellow-400/20 text-yellow-400 px-2 py-0.5 rounded-full font-semibold">
                  TESTNET
                </span>
              </div>
            </div>
            <WalletButton />
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-purple-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
            Gas-Free DeFi on Bitcoin L2
          </h1>
          <p className="text-lg text-white/60 max-w-2xl mx-auto">
            Bridge and swap assets on Stacks without paying gas fees in STX. Pay with USDCx instead.
          </p>
        </div>

        {/* Main Interface */}
        <div className="mb-12">
          {/* Tabs */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex glass-effect rounded-2xl p-1.5 border border-white/10">
              <button
                onClick={() => setActiveTab('bridge')}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === 'bridge'
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <ArrowLeftRight className="w-4 h-4" />
                Bridge
              </button>
              <button
                onClick={() => setActiveTab('swap')}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === 'swap'
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Repeat className="w-4 h-4" />
                Swap
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === 'history'
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <History className="w-4 h-4" />
                History
              </button>
            </div>
          </div>

          {/* Content */}
          {activeTab === 'bridge' ? (
            <BridgeInterface />
          ) : activeTab === 'swap' ? (
            <SwapInterface />
          ) : (
            <TransactionHistory />
          )}
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-4 mb-12">
          <div className="glass-effect rounded-xl p-5 text-center border border-white/10 hover:border-purple-500/30 transition-all">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-700 rounded-lg flex items-center justify-center mx-auto mb-3">
              <ArrowLeftRight className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-semibold mb-1 text-sm">Cross-Chain Bridge</h3>
            <p className="text-xs text-white/60">Transfer USDC between Ethereum & Stacks via Circle xReserve</p>
          </div>

          <div className="glass-effect rounded-xl p-5 text-center border border-white/10 hover:border-blue-500/30 transition-all">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center mx-auto mb-3">
              <Zap className="w-5 h-5 text-yellow-400" />
            </div>
            <h3 className="font-semibold mb-1 text-sm">Zero Gas Fees</h3>
            <p className="text-xs text-white/60">Pay transaction fees with USDCx instead of STX</p>
          </div>

          <div className="glass-effect rounded-xl p-5 text-center border border-white/10 hover:border-green-500/30 transition-all">
            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-700 rounded-lg flex items-center justify-center mx-auto mb-3">
              <Repeat className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-semibold mb-1 text-sm">Token Swaps</h3>
            <p className="text-xs text-white/60">Swap tokens on ALEX DEX with gasless transactions</p>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className="grid md:grid-cols-3 gap-4">
          <div className="glass-effect rounded-xl p-4 text-center border border-white/10">
            <Shield className="w-6 h-6 text-purple-400 mx-auto mb-2" />
            <h4 className="font-semibold text-sm mb-1">Secure</h4>
            <p className="text-xs text-white/60">Audited smart contracts</p>
          </div>
          <div className="glass-effect rounded-xl p-4 text-center border border-white/10">
            <Zap className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
            <h4 className="font-semibold text-sm mb-1">Fast</h4>
            <p className="text-xs text-white/60">Instant transactions</p>
          </div>
          <div className="glass-effect rounded-xl p-4 text-center border border-white/10">
            <ArrowLeftRight className="w-6 h-6 text-blue-400 mx-auto mb-2" />
            <h4 className="font-semibold text-sm mb-1">Seamless</h4>
            <p className="text-xs text-white/60">No native tokens needed</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-16 glass-effect">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-6">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <img src="/velumx-icon.svg" alt="VelumX" className="w-8 h-8" />
              <div>
                <span className="text-sm font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                  VelumX
                </span>
                <p className="text-xs text-white/40">Powered by Circle xReserve & Stacks</p>
              </div>
            </div>

            {/* Links */}
            <div className="flex items-center gap-6 text-sm text-white/60">
              <a href="#" className="hover:text-purple-400 transition-colors">Docs</a>
              <a href="#" className="hover:text-purple-400 transition-colors">GitHub</a>
              <a href="#" className="hover:text-blue-400 transition-colors">Twitter</a>
              <a href="#" className="hover:text-blue-400 transition-colors">Discord</a>
            </div>

            {/* Social Icons */}
            <div className="flex items-center gap-4">
              <a href="#" className="text-white/40 hover:text-purple-400 transition-colors">
                <Github className="w-5 h-5" />
              </a>
              <a href="#" className="text-white/40 hover:text-blue-400 transition-colors">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="text-white/40 hover:text-blue-400 transition-colors">
                <MessageCircle className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div className="text-center pt-6 border-t border-white/10">
            <p className="text-xs text-white/40">
              © 2024 VelumX • <span className="text-yellow-400">Testnet Only - Not for Production</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
