/**
 * WalletButton Component
 * Compact wallet connection button for navbar
 */

'use client';

import { useState } from 'react';
import { useWallet } from '../lib/hooks/useWallet';
import { WalletConnector } from './WalletConnector';
import { Wallet, ChevronDown } from 'lucide-react';

export function WalletButton() {
  const {
    ethereumAddress,
    ethereumConnected,
    stacksAddress,
    stacksConnected,
    balances,
    disconnectAll,
  } = useWallet();

  const [showConnector, setShowConnector] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const isConnected = ethereumConnected || stacksConnected;

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const formatBalance = (balance: string) => {
    const num = parseFloat(balance);
    return num.toFixed(2);
  };

  if (!isConnected) {
    return (
      <>
        <button
          onClick={() => setShowConnector(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white px-5 py-2.5 rounded-full font-medium transition-all transform hover:scale-105 shadow-lg"
        >
          <Wallet size={18} />
          Connect Wallet
        </button>
        {showConnector && <WalletConnector onClose={() => setShowConnector(false)} />}
      </>
    );
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2.5 rounded-full transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-sm font-medium">
              {ethereumConnected && stacksConnected
                ? 'Both Connected'
                : ethereumConnected
                ? formatAddress(ethereumAddress!)
                : formatAddress(stacksAddress!)}
            </span>
          </div>
          <ChevronDown size={16} className="text-white/60" />
        </button>

        {showDropdown && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowDropdown(false)}
            />
            <div className="absolute right-0 mt-2 w-80 bg-gray-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
              {/* Ethereum Section */}
              {ethereumConnected && (
                <div className="p-4 border-b border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-white/60 uppercase font-semibold">
                      Ethereum (Sepolia)
                    </span>
                    <div className="w-2 h-2 bg-green-400 rounded-full" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">Address:</span>
                      <span className="font-mono">{formatAddress(ethereumAddress!)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">ETH:</span>
                      <span className="font-mono">{formatBalance(balances.eth)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">USDC:</span>
                      <span className="font-mono">{formatBalance(balances.usdc)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Stacks Section */}
              {stacksConnected && (
                <div className="p-4 border-b border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-white/60 uppercase font-semibold">
                      Stacks (Testnet)
                    </span>
                    <div className="w-2 h-2 bg-green-400 rounded-full" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">Address:</span>
                      <span className="font-mono">{formatAddress(stacksAddress!)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">STX:</span>
                      <span className="font-mono">{formatBalance(balances.stx)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">USDCx:</span>
                      <span className="font-mono">{formatBalance(balances.usdcx)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="p-4 space-y-2">
                {(!ethereumConnected || !stacksConnected) && (
                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      setShowConnector(true);
                    }}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Connect {!ethereumConnected ? 'Ethereum' : 'Stacks'}
                  </button>
                )}
                <button
                  onClick={() => {
                    disconnectAll();
                    setShowDropdown(false);
                  }}
                  className="w-full py-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded-lg text-sm font-medium transition-colors"
                >
                  Disconnect All
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {showConnector && <WalletConnector onClose={() => setShowConnector(false)} />}
    </>
  );
}
