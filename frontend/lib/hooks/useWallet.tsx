/**
 * Wallet Management Hook & Provider
 * Handles multiple EVM wallets and Stacks wallets with global state persistence
 */

'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { createWalletClient, createPublicClient, custom, http, formatUnits } from 'viem';
import { sepolia } from 'viem/chains';
import { useConfig, USDC_ABI, TOKEN_DECIMALS } from '../config';
import { getStacksConnect, getStacksTransactions } from '../stacks-loader';

export type EthereumWalletType = 'rabby' | 'metamask' | 'injected';
export type StacksWalletType = 'xverse' | 'leather' | 'hiro';

export interface WalletBalances {
  eth: string;
  usdc: string;
  stx: string;
  usdcx: string;
  vex: string;
}

export interface WalletState {
  ethereumAddress: string | null;
  ethereumConnected: boolean;
  ethereumChainId: number | null;
  ethereumWalletType: EthereumWalletType | null;
  stacksAddress: string | null;
  stacksPublicKey?: string;
  stacksConnected: boolean;
  stacksWalletType: StacksWalletType | null;
  balances: WalletBalances;
  isConnecting: boolean;
  isFetchingBalances: boolean;
}

interface WalletContextType extends WalletState {
  connectEthereum: (preferredWallet?: EthereumWalletType) => Promise<string | undefined>;
  disconnectEthereum: () => void;
  connectStacks: (preferredWallet?: StacksWalletType) => Promise<string>;
  disconnectStacks: () => Promise<void>;
  disconnectAll: () => void;
  fetchBalances: () => Promise<void>;
  getAvailableWallets: () => { ethereum: EthereumWalletType[], stacks: StacksWalletType[] };
  switchEthereumNetwork: () => Promise<boolean>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const STORAGE_KEY = 'velumx_wallet_state';

// Detect available Ethereum wallets
function detectEthereumWallets() {
  if (typeof window === 'undefined') return [];
  const wallets: EthereumWalletType[] = [];
  const ethereum = (window as any).ethereum;
  if (!ethereum) return wallets;
  if (ethereum.isRabby) wallets.push('rabby');
  else if (ethereum.isMetaMask && !ethereum.isRabby) wallets.push('metamask');
  else wallets.push('injected');
  return wallets;
}

// Get Ethereum provider
function getEthereumProvider(walletType?: EthereumWalletType) {
  if (typeof window === 'undefined') return null;
  const ethereum = (window as any).ethereum;
  if (!ethereum) return null;
  return ethereum;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const config = useConfig();
  const [state, setState] = useState<WalletState>({
    ethereumAddress: null,
    ethereumConnected: false,
    ethereumChainId: null,
    ethereumWalletType: null,
    stacksAddress: null,
    stacksConnected: false,
    stacksWalletType: null,
    balances: { eth: '0', usdc: '0', stx: '0', usdcx: '0', vex: '0' },
    isConnecting: false,
    isFetchingBalances: false,
  });

  // Switch Ethereum network to Sepolia
  const switchEthereumNetwork = useCallback(async () => {
    if (typeof window === 'undefined') return false;
    const ethereum = (window as any).ethereum;
    if (!ethereum) return false;

    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${config.ethereumChainId.toString(16)}` }],
      });
      return true;
    } catch (switchError: any) {
      // Logic for adding network if it doesn't exist could go here
      console.error('Failed to switch network:', switchError);
      return false;
    }
  }, [config.ethereumChainId]);

  // Fetch Ethereum balances
  const fetchEthereumBalances = useCallback(async (address: string) => {
    if (!address) return;
    try {
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(config.ethereumRpcUrl),
      });
      const ethBalance = await publicClient.getBalance({ address: address as `0x${string}` });
      const usdcBalance = await publicClient.readContract({
        address: config.ethereumUsdcAddress as `0x${string}`,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      });

      setState(prev => ({
        ...prev,
        balances: {
          ...prev.balances,
          eth: formatUnits(ethBalance, TOKEN_DECIMALS.eth),
          usdc: formatUnits(usdcBalance as bigint, TOKEN_DECIMALS.usdc),
        },
      }));
    } catch (error) {
      console.error('Failed to fetch Ethereum balances:', error);
    }
  }, [config.ethereumUsdcAddress, config.ethereumRpcUrl]);

  // Fetch Stacks balances
  const fetchStacksBalances = useCallback(async (address: string) => {
    if (!address) return;
    try {
      const apiUrl = 'https://api.testnet.hiro.so';
      const response = await fetch(`${apiUrl}/extended/v1/address/${address}/balances`);

      let stxBalance = BigInt(0);
      let usdcxBalance = BigInt(0);
      let vexBalance = BigInt(0);

      if (response.ok) {
        const data = await response.json();
        stxBalance = BigInt(data.stx?.balance || 0);
        const fungibleTokens = data.fungible_tokens || {};
        const usdcxKey = Object.keys(fungibleTokens).find(key => key.startsWith(config.stacksUsdcxAddress));
        usdcxBalance = usdcxKey ? BigInt(fungibleTokens[usdcxKey].balance) : BigInt(0);
        const vexKey = Object.keys(fungibleTokens).find(key => key.startsWith(config.stacksVexAddress));
        vexBalance = vexKey ? BigInt(fungibleTokens[vexKey].balance) : BigInt(0);
      } else {
        // If 404 or other error, assume new account with 0 balance
        console.warn(`Stacks balance fetch returned ${response.status} for ${address}, assuming 0 balance`);
      }

      setState(prev => ({
        ...prev,
        balances: {
          ...prev.balances,
          stx: formatUnits(stxBalance, TOKEN_DECIMALS.stx),
          usdcx: formatUnits(usdcxBalance, TOKEN_DECIMALS.usdcx),
          vex: formatUnits(vexBalance, TOKEN_DECIMALS.usdcx),
        },
      }));
    } catch (error) {
      console.error('Failed to fetch Stacks balances:', error);
      // Even on error, ensure we don't leave the UI in a broken state
      setState(prev => ({
        ...prev,
        balances: {
          ...prev.balances,
          stx: prev.balances.stx || '0',
          usdcx: prev.balances.usdcx || '0',
          vex: prev.balances.vex || '0',
        },
      }));
    }
  }, [config.stacksUsdcxAddress, config.stacksVexAddress]);

  // Initial restoration
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      setState(prev => ({ ...prev, ...parsed }));
      if (parsed.ethereumAddress) fetchEthereumBalances(parsed.ethereumAddress);
      if (parsed.stacksAddress) fetchStacksBalances(parsed.stacksAddress);
    } catch (e) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [fetchEthereumBalances, fetchStacksBalances]);

  // Persistence
  useEffect(() => {
    const { balances, isConnecting, isFetchingBalances, ...toPersist } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
  }, [state]);

  // Listeners
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    ethereum.on('accountsChanged', (accounts: string[]) => {
      if (accounts.length === 0) {
        setState(prev => ({ ...prev, ethereumConnected: false, ethereumAddress: null }));
      } else {
        setState(prev => ({ ...prev, ethereumAddress: accounts[0], ethereumConnected: true }));
        fetchEthereumBalances(accounts[0]);
      }
    });

    ethereum.on('chainChanged', (chainId: string) => {
      setState(prev => ({ ...prev, ethereumChainId: parseInt(chainId, 16) }));
    });
  }, [fetchEthereumBalances]);

  const connectEthereum = useCallback(async (preferredWallet?: EthereumWalletType) => {
    const available = detectEthereumWallets();
    if (available.length === 0) throw new Error('No Ethereum wallet detected');
    const walletType = preferredWallet || available[0];
    const provider = getEthereumProvider(walletType);
    if (!provider) throw new Error('Provider not available');

    setState(prev => ({ ...prev, isConnecting: true }));
    try {
      const walletClient = createWalletClient({ chain: sepolia, transport: custom(provider) });
      const [address] = await walletClient.requestAddresses();
      const chainId = await walletClient.getChainId();

      if (chainId !== config.ethereumChainId) {
        const switched = await switchEthereumNetwork();
        if (!switched) throw new Error(`Please switch to Sepolia (Chain ID: ${config.ethereumChainId})`);
      }

      setState(prev => ({
        ...prev,
        ethereumAddress: address,
        ethereumConnected: true,
        ethereumChainId: chainId,
        ethereumWalletType: walletType,
        isConnecting: false,
      }));
      fetchEthereumBalances(address);
      return address;
    } catch (e) {
      setState(prev => ({ ...prev, isConnecting: false }));
      throw e;
    }
  }, [config.ethereumChainId, fetchEthereumBalances, switchEthereumNetwork]);

  const disconnectEthereum = useCallback(() => {
    setState(prev => ({
      ...prev,
      ethereumAddress: null,
      ethereumConnected: false,
      ethereumChainId: null,
      ethereumWalletType: null,
      balances: { ...prev.balances, eth: '0', usdc: '0' }
    }));
  }, []);

  const connectStacks = useCallback(async (preferredWallet?: StacksWalletType) => {
    setState(prev => ({ ...prev, isConnecting: true }));
    try {
      const connectLib = await getStacksConnect();
      if (!connectLib) throw new Error('Stacks library not available');
      return new Promise<string>((resolve, reject) => {
        connectLib.showConnect({
          appDetails: { name: 'VelumX DEX', icon: window.location.origin + '/favicon.ico' },
          onFinish: () => {
            const address = connectLib.getLocalStorage()?.addresses?.stx?.[0]?.address;
            const publicKey = connectLib.getLocalStorage()?.addresses?.stx?.[0]?.publicKey;
            if (address) {
              setState(prev => ({
                ...prev,
                stacksAddress: address,
                stacksPublicKey: publicKey,
                stacksConnected: true,
                stacksWalletType: preferredWallet || 'leather',
                isConnecting: false,
              }));
              fetchStacksBalances(address);
              resolve(address);
            } else reject(new Error('No address found'));
          },
          onCancel: () => {
            setState(prev => ({ ...prev, isConnecting: false }));
            reject(new Error('Cancelled'));
          }
        });
      });
    } catch (e) {
      setState(prev => ({ ...prev, isConnecting: false }));
      throw e;
    }
  }, [fetchStacksBalances]);

  const disconnectStacks = useCallback(async () => {
    const connectLib = await getStacksConnect();
    if (connectLib) connectLib.disconnect();
    setState(prev => ({
      ...prev,
      stacksAddress: null,
      stacksConnected: false,
      stacksWalletType: null,
      balances: { ...prev.balances, stx: '0', usdcx: '0' }
    }));
  }, []);

  const fetchBalances = useCallback(async () => {
    setState(prev => ({ ...prev, isFetchingBalances: true }));
    try {
      if (state.ethereumAddress) await fetchEthereumBalances(state.ethereumAddress);
      if (state.stacksAddress) await fetchStacksBalances(state.stacksAddress);
    } finally {
      setState(prev => ({ ...prev, isFetchingBalances: false }));
    }
  }, [state.ethereumAddress, state.stacksAddress, fetchEthereumBalances, fetchStacksBalances]);

  const value: WalletContextType = {
    ...state,
    connectEthereum,
    disconnectEthereum,
    connectStacks,
    disconnectStacks,
    disconnectAll: () => { disconnectEthereum(); disconnectStacks(); },
    fetchBalances,
    getAvailableWallets: () => ({
      ethereum: detectEthereumWallets(),
      stacks: ['xverse', 'leather', 'hiro'] as StacksWalletType[]
    }),
    switchEthereumNetwork
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
