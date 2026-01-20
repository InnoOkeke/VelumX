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
  Send,
  TrendingUp,
  Zap,
  History,
  Repeat,
  Shield,
  Rocket,
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
      
      {/* Beautiful Header */}
      <nav className="sticky top-0 z-50 glass-effect backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo Section */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <img 
                  src="/velumx-icon.svg" 
                  alt="VelumX" 
                  className="w-12 h-12 animate-float" 
                />
                <div className="absolute inset-0 blur-xl bg-purple-500/30 -z-10"></div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                    VelumX
                  </span>
                  <span className="text-xs bg-gradient-to-r from-yellow-400 to-yellow-600 text-black px-2 py-0.5 rounded-full font-bold">
                    TESTNET
                  </span>
                </div>
                <p className="text-xs text-white/50">Gas-Free DeFi on Bitcoin L2</p>
              </div>
            </div>

            {/* Wallet Button */}
            <WalletButton />
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16 relative">
          {/* Decorative Elements */}
          <div className="absolute top-0 left-1/4 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl -z-10"></div>
          <div className="absolute top-0 right-1/4 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl -z-10"></div>
          
          <div className="flex justify-center mb-8">
            <div className="relative">
              <img 
                src="/velumx-logo.svg" 
                alt="VelumX Logo" 
                className="w-40 h-40 animate-float" 
              />
              <div className="absolute inset-0 blur-2xl bg-gradient-to-r from-purple-500/40 to-blue-500/40 -z-10"></div>
            </div>
          </div>
          
          <h1 className="text-6xl font-bold mb-6 bg-gradient-to-r from-purple-400 via-blue-400 to-purple-400 bg-clip-text text-transparent animate-pulse-glow">
            Gas-Free DeFi on Bitcoin L2
          </h1>
          
          <p className="text-xl text-white/70 max-w-3xl mx-auto leading-relaxed">
            VelumX is a revolutionary Gas-Abstraction protocol that makes USDCx truly native on Stacks. 
            <span className="text-yellow-400 font-semibold"> Bridge, swap, and transact without ever needing STX for gas fees.</span>
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <div className="group relative overflow-hidden bg-gradient-to-br from-purple-900/20 to-purple-600/10 backdrop-blur-xl border border-purple-500/20 rounded-2xl p-8 hover:border-purple-500/50 transition-all hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all"></div>
            <div className="relative">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-700 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <ArrowLeftRight className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-white">Seamless Bridging</h3>
              <p className="text-sm text-white/70 leading-relaxed">
                Transfer USDC between Ethereum Sepolia and Stacks testnet with Circle's xReserve technology
              </p>
            </div>
          </div>

          <div className="group relative overflow-hidden bg-gradient-to-br from-blue-900/20 to-blue-600/10 backdrop-blur-xl border border-blue-500/20 rounded-2xl p-8 hover:border-blue-500/50 transition-all hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/20">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all"></div>
            <div className="relative">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Zap className="w-7 h-7 text-yellow-400" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-white">Gasless Transactions</h3>
              <p className="text-sm text-white/70 leading-relaxed">
                Pay transaction fees with USDCx instead of STX. No need to hold native tokens for gas
              </p>
            </div>
          </div>

          <div className="group relative overflow-hidden bg-gradient-to-br from-green-900/20 to-green-600/10 backdrop-blur-xl border border-green-500/20 rounded-2xl p-8 hover:border-green-500/50 transition-all hover:scale-105 hover:shadow-2xl hover:shadow-green-500/20">
            <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-2xl group-hover:bg-green-500/20 transition-all"></div>
            <div className="relative">
              <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-green-700 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <TrendingUp className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-white">DeFi Integration</h3>
              <p className="text-sm text-white/70 leading-relaxed">
                One-click yield farming and swaps with integrated DeFi protocols on Stacks
              </p>
            </div>
          </div>
        </div>

        {/* Connection Prompt */}
        {!ethereumConnected && !stacksConnected && (
          <div className="relative overflow-hidden bg-gradient-to-br from-purple-900/30 via-blue-900/30 to-purple-900/30 border border-purple-500/30 rounded-3xl p-12 text-center mb-16">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-blue-500/5 to-purple-500/5 animate-pulse"></div>
            <div className="relative">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full mb-6 animate-pulse-glow">
                <Send className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-3xl font-bold mb-4 bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                Ready to Get Started?
              </h2>
              <p className="text-white/70 mb-8 max-w-2xl mx-auto">
                Connect your Ethereum (Rabby/MetaMask) and Stacks (Xverse/Leather/Hiro) wallets to start bridging assets gas-free
              </p>
              <div className="flex items-center justify-center gap-8">
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full ${ethereumConnected ? 'bg-green-400 animate-pulse' : 'bg-white/20'}`} />
                  <span className="text-sm text-white/60 font-medium">Ethereum Wallet</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full ${stacksConnected ? 'bg-green-400 animate-pulse' : 'bg-white/20'}`} />
                  <span className="text-sm text-white/60 font-medium">Stacks Wallet</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Interface */}
        {(ethereumConnected || stacksConnected) && (
          <div>
            {/* Tabs */}
            <div className="flex justify-center mb-10">
              <div className="inline-flex glass-effect rounded-2xl p-1.5 border border-white/10">
                <button
                  onClick={() => setActiveTab('bridge')}
                  className={`flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === 'bridge'
                      ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/30'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  Bridge
                </button>
                <button
                  onClick={() => setActiveTab('swap')}
                  className={`flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === 'swap'
                      ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-blue-500/30'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Repeat className="w-4 h-4" />
                  Swap
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === 'history'
                      ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/30'
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
        )}

        {/* Trust Indicators */}
        <div className="mt-20 grid md:grid-cols-3 gap-6">
          <div className="glass-effect rounded-2xl p-6 text-center border border-white/10">
            <Shield className="w-8 h-8 text-purple-400 mx-auto mb-3" />
            <h4 className="font-semibold mb-2">Secure & Audited</h4>
            <p className="text-sm text-white/60">Built with industry-standard security practices</p>
          </div>
          <div className="glass-effect rounded-2xl p-6 text-center border border-white/10">
            <Rocket className="w-8 h-8 text-blue-400 mx-auto mb-3" />
            <h4 className="font-semibold mb-2">Lightning Fast</h4>
            <p className="text-sm text-white/60">Optimized for speed and efficiency</p>
          </div>
          <div className="glass-effect rounded-2xl p-6 text-center border border-white/10">
            <Zap className="w-8 h-8 text-yellow-400 mx-auto mb-3" />
            <h4 className="font-semibold mb-2">Zero Gas Fees</h4>
            <p className="text-sm text-white/60">Pay with USDCx, not STX</p>
          </div>
        </div>
      </main>

      {/* Beautiful Footer */}
      <footer className="border-t border-white/10 mt-20 glass-effect">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <img src="/velumx-icon.svg" alt="VelumX" className="w-10 h-10" />
                <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                  VelumX
                </span>
              </div>
              <p className="text-white/60 text-sm leading-relaxed max-w-md">
                The first Gas-Abstraction protocol on Stacks, enabling truly gasless DeFi experiences. 
                Powered by Circle xReserve and Stacks Bitcoin L2.
              </p>
            </div>

            {/* Links */}
            <div>
              <h5 className="font-semibold mb-4 text-white">Resources</h5>
              <ul className="space-y-2 text-sm text-white/60">
                <li><a href="#" className="hover:text-purple-400 transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-purple-400 transition-colors">API Reference</a></li>
                <li><a href="#" className="hover:text-purple-400 transition-colors">GitHub</a></li>
                <li><a href="#" className="hover:text-purple-400 transition-colors">Whitepaper</a></li>
              </ul>
            </div>

            {/* Community */}
            <div>
              <h5 className="font-semibold mb-4 text-white">Community</h5>
              <ul className="space-y-2 text-sm text-white/60">
                <li><a href="#" className="hover:text-blue-400 transition-colors">Twitter</a></li>
                <li><a href="#" className="hover:text-blue-400 transition-colors">Discord</a></li>
                <li><a href="#" className="hover:text-blue-400 transition-colors">Telegram</a></li>
                <li><a href="#" className="hover:text-blue-400 transition-colors">Blog</a></li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-white/40">
              © 2024 VelumX. All rights reserved. • <span className="text-yellow-400">Testnet Only</span>
            </p>
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
        </div>
      </footer>
    </div>
  );
}
