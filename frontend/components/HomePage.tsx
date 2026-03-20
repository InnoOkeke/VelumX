/**
 * HomePage Component
 * Professional DeFi Interface
 */

'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Sidebar } from './Sidebar';
import { NotificationContainer } from './NotificationContainer';
import { PoolBrowser } from './PoolBrowser';
import { TransactionHistory } from './TransactionHistory';
import { Shield, Zap, Repeat, UserCircle, LogOut } from 'lucide-react';
import { useAuth } from './providers/AuthContext';
import { AuthModal } from './auth/AuthModal';

// Dynamically import interfaces to resolve Turbopack module factory issues with Stacks libraries
const BridgeInterface = dynamic(() => import('./BridgeInterface').then(mod => mod.BridgeInterface), { ssr: false });
const SwapInterface = dynamic(() => import('./SwapInterface').then(mod => mod.SwapInterface), { ssr: false });
const LiquidityInterface = dynamic(() => import('./LiquidityInterface').then(mod => mod.LiquidityInterface), { ssr: false });

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'bridge' | 'swap' | 'liquidity' | 'pools' | 'history'>('bridge');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { user, profile, signOut, loading: authLoading } = useAuth();

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

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
    <div className="min-h-screen flex mesh-gradient transition-colors duration-300" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <NotificationContainer />

      {/* Mobile Menu Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col ml-0 md:ml-64 min-h-screen transition-all duration-300">
        {/* Top Header - Kept for mobile or simple layout */}
        <header className="sticky top-0 z-40 w-full backdrop-blur-2xl px-4 md:px-8 flex h-16 items-center justify-between md:justify-end" style={{ borderBottom: `1px solid var(--border-color)`, backgroundColor: 'rgba(var(--bg-surface-rgb), 0.7)' }}>
          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <div className="space-y-1.5">
              <span className={`block w-6 h-0.5 bg-current transition-transform duration-300 ${isMobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`} style={{ backgroundColor: 'var(--text-primary)' }} />
              <span className={`block w-6 h-0.5 bg-current transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-0' : ''}`} style={{ backgroundColor: 'var(--text-primary)' }} />
              <span className={`block w-6 h-0.5 bg-current transition-transform duration-300 ${isMobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} style={{ backgroundColor: 'var(--text-primary)' }} />
            </div>
          </button>

          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-[10px] font-bold text-white uppercase tracking-wider">{user.email?.split('@')[0]}</span>
                  <span className="text-[9px] text-slate-400 font-medium">Social Account</span>
                </div>
                <button 
                  onClick={signOut}
                  className="p-2 rounded-lg bg-slate-800/50 border border-slate-700 hover:bg-rose-500/10 hover:border-rose-500/50 transition-all group"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4 text-slate-400 group-hover:text-rose-500" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/20"
              >
                <UserCircle className="w-4 h-4" />
                SIGN IN
              </button>
            )}
            
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-bold text-green-500">Stacks Testnet API: Online</span>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 lg:px-12 py-12 max-w-7xl mx-auto w-full">
          {/* Hero Section - Reduced for internal pages */}
          <div className="mb-12 relative">
            <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 opacity-20 dark:opacity-10 pointer-events-none">
              <div className="w-[500px] h-[500px] bg-purple-600 rounded-full blur-[120px] opacity-20"></div>
            </div>

            <div className="flex flex-col gap-2 relative z-10">
              <h1 className="text-4xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
              </h1>
              <p className="text-lg font-light leading-relaxed max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
                {activeTab === 'bridge' && "Securely move your assets across ecosystems with VelumX's robust bridging protocol."}
                {activeTab === 'swap' && "Trade tokens instantly at the best market rates using our peer-to-peer liquidity protocol."}
                {activeTab === 'liquidity' && "Provide liquidity to earn trading fees and help stabilize the decentralized ecosystem."}
                {activeTab === 'pools' && "Discover and analyze high-yield opportunities across our verified liquidity pools."}
                {activeTab === 'history' && "Track your recent activity and transaction status in real-time."}
              </p>
            </div>
          </div>

          {/* Tab Content */}
          <div className="relative z-10 mb-16">
            <div className="vellum-shadow-xl rounded-[2.5rem] overflow-hidden border" style={{
              backgroundColor: 'rgba(var(--bg-surface-rgb), 0.9)',
              borderColor: 'var(--border-color)',
              backdropFilter: 'blur(40px)'
            }}>
              {activeTab === 'bridge' && <BridgeInterface />}
              {activeTab === 'swap' && <SwapInterface />}
              {activeTab === 'liquidity' && <LiquidityInterface />}
              {activeTab === 'pools' && <PoolBrowser />}
              {activeTab === 'history' && <TransactionHistory />}
            </div>
          </div>

          {/* Secondary Info Grid - Only shown on bridge/swap for focus */}
          {(activeTab === 'bridge' || activeTab === 'swap') && (
            <div className="grid md:grid-cols-3 gap-6 mb-16 opacity-80 hover:opacity-100 transition-opacity duration-500">
              <div className="rounded-2xl p-6 transition-all duration-300" style={{
                backgroundColor: 'var(--bg-surface)',
                border: `1px solid var(--border-color)`
              }}>
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center mb-4">
                  <Shield className="h-5 w-5 text-purple-600" />
                </div>
                <h3 className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Bank-Grade</h3>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Fully audited non-custodial smart contracts.</p>
              </div>

              <div className="rounded-2xl p-6 transition-all duration-300" style={{
                backgroundColor: 'var(--bg-surface)',
                border: `1px solid var(--border-color)`
              }}>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4">
                  <Zap className="h-5 w-5 text-blue-600" />
                </div>
                <h3 className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Instant Finality</h3>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Fast transactions powered by Bitcoin L2.</p>
              </div>

              <div className="rounded-2xl p-6 transition-all duration-300" style={{
                backgroundColor: 'var(--bg-surface)',
                border: `1px solid var(--border-color)`
              }}>
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center mb-4">
                  <Repeat className="h-5 w-5 text-green-600" />
                </div>
                <h3 className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Gasless UX</h3>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Pay network fees directly with stablecoins.</p>
              </div>
            </div>
          )}
        </main>

        <footer className="mt-auto px-8 py-6 backdrop-blur-xl" style={{ borderTop: `1px solid var(--border-color)`, backgroundColor: 'var(--bg-surface)' }}>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            <p>© 2024 VelumX Lab • Professional DeFi Infrastructure</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-purple-500 transition-colors">Documentation</a>
              <a href="#" className="hover:text-purple-500 transition-colors">Status</a>
              <a href="#" className="hover:text-purple-500 transition-colors">Privacy Policy</a>
            </div>
          </div>
        </footer>
        {/* Auth Modal Overlay */}
      {showAuthModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowAuthModal(false)} />
          <div className="relative w-full max-w-md animate-in fade-in zoom-in duration-300">
            <AuthModal />
            <button 
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {user && !showAuthModal && (
        <div className="fixed bottom-8 right-8 z-40 animate-in slide-in-from-right duration-500">
          <div className="bg-slate-900/90 backdrop-blur-xl border border-indigo-500/30 rounded-2xl p-4 shadow-2xl shadow-indigo-500/20 max-w-xs">
            <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2">Connected Wallets</h4>
            <div className="space-y-2">
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-500 uppercase font-semibold">Ethereum</span>
                <span className="text-[11px] text-white font-mono truncate">{profile?.eth_address || 'Generating...'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-500 uppercase font-semibold">Stacks</span>
                <span className="text-[11px] text-white font-mono truncate">{profile?.stx_address || 'Generating...'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
