/**
 * WalletConnector Component
 * UI for connecting Ethereum (Rabby, MetaMask) and Stacks (Xverse, Leather, Hiro) wallets
 */

'use client';

import { useState } from 'react';
import { useWallet, EthereumWalletType, StacksWalletType } from '../lib/hooks/useWallet';
import { Wallet, X, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

interface WalletConnectorProps {
  onClose?: () => void;
}

export function WalletConnector({ onClose }: WalletConnectorProps) {
  const {
    ethereumAddress,
    ethereumConnected,
    ethereumWalletType,
    stacksAddress,
    stacksConnected,
    stacksWalletType,
    balances,
    isConnecting,
    isFetchingBalances,
    connectEthereum,
    disconnectEthereum,
    connectStacks,
    disconnectStacks,
    getAvailableWallets,
  } = useWallet();

  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ethereum' | 'stacks'>('ethereum');

  const availableWallets = getAvailableWallets();

  const handleConnectEthereum = async (walletType: EthereumWalletType) => {
    setError(null);
    try {
      await connectEthereum(walletType);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleConnectStacks = async (walletType?: StacksWalletType) => {
    setError(null);
    try {
      await connectStacks(walletType);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatBalance = (balance: string, decimals: number = 4) => {
    const num = parseFloat(balance);
    return num.toFixed(decimals);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-900 to-black border border-white/10 rounded-2xl max-w-md w-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Wallet className="w-6 h-6 text-purple-400" />
            <h2 className="text-xl font-bold">Connect Wallet</h2>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setActiveTab('ethereum')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'ethereum'
                ? 'text-white border-b-2 border-purple-500'
                : 'text-white/50 hover:text-white/70'
            }`}
          >
            Ethereum (Sepolia)
          </button>
          <button
            onClick={() => setActiveTab('stacks')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'stacks'
                ? 'text-white border-b-2 border-purple-500'
                : 'text-white/50 hover:text-white/70'
            }`}
          >
            Stacks (Testnet)
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}

          {activeTab === 'ethereum' && (
            <div className="space-y-4">
              {ethereumConnected ? (
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <span className="text-sm font-medium text-green-200">
                      Connected with {ethereumWalletType}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">Address:</span>
                      <span className="font-mono">{formatAddress(ethereumAddress!)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">ETH Balance:</span>
                      <span className="font-mono">
                        {isFetchingBalances ? (
                          <Loader2 className="w-4 h-4 animate-spin inline" />
                        ) : (
                          `${formatBalance(balances.eth)} ETH`
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">USDC Balance:</span>
                      <span className="font-mono">
                        {isFetchingBalances ? (
                          <Loader2 className="w-4 h-4 animate-spin inline" />
                        ) : (
                          `${formatBalance(balances.usdc, 2)} USDC`
                        )}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={disconnectEthereum}
                    className="w-full py-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded-lg text-sm font-medium transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {availableWallets.ethereum.length === 0 ? (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                      <p className="text-sm text-yellow-200">
                        No Ethereum wallet detected. Please install{' '}
                        <a
                          href="https://rabby.io"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-yellow-100"
                        >
                          Rabby
                        </a>{' '}
                        or{' '}
                        <a
                          href="https://metamask.io"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-yellow-100"
                        >
                          MetaMask
                        </a>
                        .
                      </p>
                    </div>
                  ) : (
                    availableWallets.ethereum.map((wallet) => (
                      <button
                        key={wallet}
                        onClick={() => handleConnectEthereum(wallet)}
                        disabled={isConnecting}
                        className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                            <Wallet className="w-5 h-5" />
                          </div>
                          <span className="font-medium capitalize">{wallet}</span>
                        </div>
                        {isConnecting && (
                          <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'stacks' && (
            <div className="space-y-4">
              {stacksConnected ? (
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <span className="text-sm font-medium text-green-200">
                      Connected with {stacksWalletType}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">Address:</span>
                      <span className="font-mono">{formatAddress(stacksAddress!)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">STX Balance:</span>
                      <span className="font-mono">
                        {isFetchingBalances ? (
                          <Loader2 className="w-4 h-4 animate-spin inline" />
                        ) : (
                          `${formatBalance(balances.stx)} STX`
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">USDCx Balance:</span>
                      <span className="font-mono">
                        {isFetchingBalances ? (
                          <Loader2 className="w-4 h-4 animate-spin inline" />
                        ) : (
                          `${formatBalance(balances.usdcx, 2)} USDCx`
                        )}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={disconnectStacks}
                    className="w-full py-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded-lg text-sm font-medium transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-white/60 mb-4">
                    Connect with any Stacks wallet. We support Xverse, Leather, and Hiro.
                  </p>
                  {(['xverse', 'leather', 'hiro'] as StacksWalletType[]).map((wallet) => (
                    <button
                      key={wallet}
                      onClick={() => handleConnectStacks(wallet)}
                      disabled={isConnecting}
                      className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
                          <Wallet className="w-5 h-5" />
                        </div>
                        <span className="font-medium capitalize">{wallet}</span>
                      </div>
                      {isConnecting && (
                        <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10">
          <p className="text-xs text-white/40 text-center">
            By connecting, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}
