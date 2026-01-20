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
} from 'lucide-react';

export default function HomePage() {
  const { ethereumConnected, stacksConnected } = useWallet();
  const [activeTab, setActiveTab] = useState<'bridge' | 'swap' | 'history'>('bridge');

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-purple-500/30">
      {/* Notification Container */}
      <NotificationContainer />
      
      <nav className="flex items-center justify-between px-8 py-6 border-b border-white/10 glass-effect backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <img src="/velumx-icon.svg" alt="VelumX" className="w-10 h-10" />
          <div>
            <span className="text-xl font-bold tracking-tight">VelumX</span>
            <span className="ml-2 text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-500/30">
              Testnet
            </span>
          </div>
        </div>
        <WalletButton />
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <img src="/velumx-logo.svg" alt="VelumX Logo" className="w-32 h-32" />
          </div>
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            Gas-Free DeFi on Bitcoin L2
          </h1>
          <p className="text-xl text-white/60 max-w-2xl mx-auto">
            VelumX is a Gas-Abstraction protocol that makes USDCx truly native on Stacks. 
            Bridge, swap, and transact without ever needing STX for gas fees.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:border-purple-500/50 transition-all">
            <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mb-4">
              <ArrowLeftRight className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-lg font-bold mb-2">Bridge Assets</h3>
            <p className="text-sm text-white/60">
              Seamlessly transfer USDC between Ethereum Sepolia and Stacks testnet
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:border-blue-500/50 transition-all">
            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="text-lg font-bold mb-2">Gasless Transactions</h3>
            <p className="text-sm text-white/60">
              Pay transaction fees with USDCx instead of STX on Stacks
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:border-green-500/50 transition-all">
            <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center mb-4">
              <TrendingUp className="w-6 h-6 text-green-400" />
            </div>
            <h3 className="text-lg font-bold mb-2">Earn Yield</h3>
            <p className="text-sm text-white/60">
              One-click yield farming with DeFi protocols on Stacks
            </p>
          </div>
        </div>

        {!ethereumConnected && !stacksConnected && (
          <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border border-purple-500/20 rounded-2xl p-8 text-center">
            <Send className="w-16 h-16 text-purple-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Get Started</h2>
            <p className="text-white/60 mb-6">
              Connect your Ethereum (Rabby/MetaMask) and Stacks (Xverse/Leather/Hiro) wallets to start bridging
            </p>
            <div className="flex items-center justify-center gap-4">
              <div className="flex items-center gap-2 text-sm text-white/40">
                <div className={`w-3 h-3 rounded-full ${ethereumConnected ? 'bg-green-400' : 'bg-white/20'}`} />
                Ethereum
              </div>
              <div className="flex items-center gap-2 text-sm text-white/40">
                <div className={`w-3 h-3 rounded-full ${stacksConnected ? 'bg-green-400' : 'bg-white/20'}`} />
                Stacks
              </div>
            </div>
          </div>
        )}

        {(ethereumConnected || stacksConnected) && (
          <div>
            {/* Tabs */}
            <div className="flex justify-center mb-8">
              <div className="inline-flex bg-white/5 rounded-full p-1 border border-white/10">
                <button
                  onClick={() => setActiveTab('bridge')}
                  className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium transition-all ${
                    activeTab === 'bridge'
                      ? 'bg-white text-black'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  Bridge
                </button>
                <button
                  onClick={() => setActiveTab('swap')}
                  className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium transition-all ${
                    activeTab === 'swap'
                      ? 'bg-white text-black'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  <Repeat className="w-4 h-4" />
                  Swap
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium transition-all ${
                    activeTab === 'history'
                      ? 'bg-white text-black'
                      : 'text-white/60 hover:text-white'
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
      </main>

      <footer className="border-t border-white/10 py-8 mt-16">
        <div className="max-w-6xl mx-auto px-6 text-center text-sm text-white/40">
          <p>VelumX Bridge - Powered by Circle xReserve and Stacks</p>
          <p className="mt-2">Testnet Only - Not for Production Use</p>
        </div>
      </footer>
    </div>
  );
}
