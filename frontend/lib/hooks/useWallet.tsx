/**
 * Wallet Management Hook & Provider
 * Handles multiple EVM wallets and Stacks wallets with global state persistence
 */

'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { createWalletClient, createPublicClient, custom, http, formatUnits } from 'viem';
import { mainnet } from 'viem/chains';
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
  // Dynamic SIP-010 token balances keyed by contract principal
  [contractPrincipal: string]: string;
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
  recoverPublicKey: () => Promise<string | null>;
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

  // Switch Ethereum network to Mainnet
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
      console.error('Failed to switch network:', switchError);
      return false;
    }
  }, [config.ethereumChainId]);

  // Fetch Ethereum balances
  const fetchEthereumBalances = useCallback(async (address: string) => {
    if (!address) return;
    try {
      const publicClient = createPublicClient({
        chain: mainnet,
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

  // Fetch Stacks balances for both personal and smart wallet
  const fetchStacksBalances = useCallback(async (address: string) => {
    if (!address) return;
    try {
      const apiUrl = 'https://api.mainnet.hiro.so';
      
      // Fetch personal balances
      const response = await fetch(`${apiUrl}/extended/v1/address/${address}/balances`);

      if (!response.ok) {
        throw new Error('Failed to fetch balances');
      }

      const data = await response.json();
      const stx = BigInt(data.stx?.balance || 0);
      const fungibleTokens = data.fungible_tokens || {};

      // Known tokens by contract prefix
      const usdcxKey = Object.keys(fungibleTokens).find(key => key.startsWith(config.stacksUsdcxAddress));
      const usdcx = usdcxKey ? BigInt(fungibleTokens[usdcxKey].balance) : BigInt(0);
      const vexKey = Object.keys(fungibleTokens).find(key => key.startsWith(config.stacksVexAddress));
      const vex = vexKey ? BigInt(fungibleTokens[vexKey].balance) : BigInt(0);

      // Build a map of all fungible tokens keyed by contract principal (before '::')
      // e.g. 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex::token-alex' → stored as
      // 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex'
      const dynamicBalances: Record<string, string> = {};
      for (const [key, val] of Object.entries(fungibleTokens)) {
        const principal = key.split('::')[0];
        const rawBalance = (val as any).balance || '0';
        // Store in micro units as string — UI components divide by decimals themselves
        dynamicBalances[principal] = rawBalance;
      }

      setState(prev => ({
        ...prev,
        balances: {
          ...prev.balances,
          stx: formatUnits(stx, TOKEN_DECIMALS.stx),
          usdcx: formatUnits(usdcx, TOKEN_DECIMALS.usdcx),
          vex: formatUnits(vex, TOKEN_DECIMALS.usdcx),
          ...dynamicBalances,
        }
      }));
    } catch (error) {
      console.error('Failed to fetch Stacks balances:', error);
    }
  }, [config.stacksUsdcxAddress, config.stacksVexAddress]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      setState(prev => ({ ...prev, ...parsed }));
      if (parsed.ethereumAddress) fetchEthereumBalances(parsed.ethereumAddress);
      if (parsed.stacksAddress) {
        fetchStacksBalances(parsed.stacksAddress);
      }
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
      const walletClient = createWalletClient({ chain: mainnet, transport: custom(provider) });
      const [address] = await walletClient.requestAddresses();
      const chainId = await walletClient.getChainId();

      if (chainId !== config.ethereumChainId) {
        const switched = await switchEthereumNetwork();
        if (!switched) throw new Error(`Please switch to Ethereum Mainnet (Chain ID: ${config.ethereumChainId})`);
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
      // Use @stacks/connect v8 request API — always returns publicKey
      const { request: stacksRequest, connect: stacksConnect } = await import('@stacks/connect');

      // connect() triggers wallet selection + returns addresses with public keys
      const response = await stacksConnect({ forceWalletSelect: true }) as any;

      // response.addresses is an array of { address, publicKey }
      const addresses = response?.addresses || [];
      const stxEntry = addresses.find((a: any) =>
        a.address?.startsWith('SP') || a.address?.startsWith('ST')
      );

      if (!stxEntry?.address) throw new Error('No Stacks address returned from wallet');

      const address: string = stxEntry.address;
      const publicKey: string = stxEntry.publicKey || '';

      console.log('Stacks Wallet Connected:', { address, hasPublicKey: !!publicKey });

      if (!publicKey) {
        // Fallback: try stx_getAddresses which explicitly returns publicKey
        try {
          const addrResult = await stacksRequest('stx_getAddresses') as any;
          const stxAddr = (addrResult?.addresses || []).find((a: any) =>
            a.address?.startsWith('SP') || a.address?.startsWith('ST')
          );
          if (stxAddr?.publicKey) {
            console.log('Public key fetched via stx_getAddresses');
            setState(prev => ({
              ...prev,
              stacksAddress: address,
              stacksPublicKey: stxAddr.publicKey,
              stacksConnected: true,
              stacksWalletType: preferredWallet || 'leather',
              isConnecting: false,
            }));
            fetchStacksBalances(address);
            return address;
          }
        } catch (e) {
          console.warn('stx_getAddresses fallback failed:', e);
        }
        console.warn('Public key not available — sponsored transactions may not work');
      }

      setState(prev => ({
        ...prev,
        stacksAddress: address,
        stacksPublicKey: publicKey,
        stacksConnected: true,
        stacksWalletType: preferredWallet || 'leather',
        isConnecting: false,
      }));
      fetchStacksBalances(address);
      return address;
    } catch (e: any) {
      setState(prev => ({ ...prev, isConnecting: false }));
      if (e?.message?.toLowerCase().includes('cancel')) throw new Error('Cancelled');
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

  const recoverPublicKey = useCallback(async () => {
    if (!state.stacksAddress) throw new Error('Stacks wallet not connected');

    try {
      const { request: stacksRequest } = await import('@stacks/connect');

      // stx_getAddresses always returns publicKey in v8
      const result = await stacksRequest('stx_getAddresses') as any;
      const stxEntry = (result?.addresses || []).find((a: any) =>
        a.address === state.stacksAddress
      ) || (result?.addresses || [])[0];

      const publicKey = stxEntry?.publicKey || '';
      if (publicKey) {
        console.log('Recovered public key via stx_getAddresses');
        setState(prev => ({ ...prev, stacksPublicKey: publicKey }));
        return publicKey;
      }

      // Fallback: sign a message to extract public key
      const connectLib = await getStacksConnect();
      if (!connectLib) return null;
      const showSignMessage = connectLib.showSignMessage || connectLib.openSignatureRequestPopup;
      if (!showSignMessage) return null;

      return new Promise<string | null>((resolve) => {
        showSignMessage({
          message: 'Verify Account ownership to enable gasless transactions.',
          appDetails: { name: 'VelumX', icon: window.location.origin + '/favicon.ico' },
          onFinish: (data: any) => {
            const pk = data.publicKey;
            if (pk) {
              setState(prev => ({ ...prev, stacksPublicKey: pk }));
              resolve(pk);
            } else {
              resolve(null);
            }
          },
          onCancel: () => resolve(null),
        });
      });
    } catch (e) {
      console.error('Failed to recover public key:', e);
      return null;
    }
  }, [state.stacksAddress]);

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
    switchEthereumNetwork,
    recoverPublicKey
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
