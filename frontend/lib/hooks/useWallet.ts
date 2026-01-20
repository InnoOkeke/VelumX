/**
 * Wallet Management Hook
 * Handles multiple EVM wallets (Rabby, MetaMask, etc.) and Stacks wallets (Xverse, Leather, Hiro)
 */

import { useState, useEffect, useCallback } from 'react';
import { createWalletClient, createPublicClient, custom, http, formatUnits } from 'viem';
import { sepolia } from 'viem/chains';
import { AppConfig, UserSession } from '@stacks/connect';
import { STACKS_TESTNET } from '@stacks/network';
import { useConfig, USDC_ABI, TOKEN_DECIMALS } from '../config';

export type EthereumWalletType = 'rabby' | 'metamask' | 'injected';
export type StacksWalletType = 'xverse' | 'leather' | 'hiro';

export interface WalletBalances {
  eth: string;
  usdc: string;
  stx: string;
  usdcx: string;
}

export interface WalletState {
  // Ethereum
  ethereumAddress: string | null;
  ethereumConnected: boolean;
  ethereumChainId: number | null;
  ethereumWalletType: EthereumWalletType | null;
  
  // Stacks
  stacksAddress: string | null;
  stacksConnected: boolean;
  stacksWalletType: StacksWalletType | null;
  
  // Balances
  balances: WalletBalances;
  
  // Loading states
  isConnecting: boolean;
  isFetchingBalances: boolean;
}

const STORAGE_KEY = 'velumx_wallet_state';

// Initialize Stacks session only on client side
let appConfig: any = null;
let userSession: any = null;

if (typeof window !== 'undefined') {
  const { AppConfig, UserSession } = require('@stacks/connect');
  appConfig = new AppConfig(['store_write', 'publish_data']);
  userSession = new UserSession({ appConfig });
}

// Detect available Ethereum wallets
function detectEthereumWallets() {
  if (typeof window === 'undefined') return [];
  
  const wallets: EthereumWalletType[] = [];
  const ethereum = (window as any).ethereum;
  
  if (!ethereum) return wallets;
  
  // Rabby detection
  if (ethereum.isRabby) {
    wallets.push('rabby');
  }
  // MetaMask detection
  else if (ethereum.isMetaMask && !ethereum.isRabby) {
    wallets.push('metamask');
  }
  // Generic injected wallet
  else {
    wallets.push('injected');
  }
  
  return wallets;
}

// Get Ethereum provider for specific wallet
function getEthereumProvider(walletType?: EthereumWalletType) {
  if (typeof window === 'undefined') return null;
  
  const ethereum = (window as any).ethereum;
  if (!ethereum) return null;
  
  // If no specific wallet requested, return default
  if (!walletType) return ethereum;
  
  // For Rabby and MetaMask, they override the default provider
  // So we can just return ethereum if it matches
  if (walletType === 'rabby' && ethereum.isRabby) return ethereum;
  if (walletType === 'metamask' && ethereum.isMetaMask) return ethereum;
  
  return ethereum;
}

export function useWallet() {
  const config = useConfig();
  
  const [state, setState] = useState<WalletState>({
    ethereumAddress: null,
    ethereumConnected: false,
    ethereumChainId: null,
    ethereumWalletType: null,
    stacksAddress: null,
    stacksConnected: false,
    stacksWalletType: null,
    balances: {
      eth: '0',
      usdc: '0',
      stx: '0',
      usdcx: '0',
    },
    isConnecting: false,
    isFetchingBalances: false,
  });

  // Restore wallet state from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const restoreState = async () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setState(prev => ({ ...prev, ...parsed }));
        }
        
        // Check if Stacks wallet is already connected
        if (userSession && userSession.isUserSignedIn()) {
          const userData = userSession.loadUserData();
          setState(prev => ({
            ...prev,
            stacksAddress: userData.profile.stxAddress.testnet,
            stacksConnected: true,
          }));
        }
      } catch (error) {
        console.error('Failed to restore wallet state:', error);
        // Clear corrupted state
        localStorage.removeItem(STORAGE_KEY);
      }
    };
    
    restoreState();
  }, []);

  // Persist wallet state to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const toPersist = {
        ethereumAddress: state.ethereumAddress,
        ethereumConnected: state.ethereumConnected,
        ethereumWalletType: state.ethereumWalletType,
        stacksAddress: state.stacksAddress,
        stacksConnected: state.stacksConnected,
        stacksWalletType: state.stacksWalletType,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
    } catch (error) {
      console.error('Failed to persist wallet state:', error);
    }
  }, [state.ethereumAddress, state.ethereumConnected, state.ethereumWalletType, state.stacksAddress, state.stacksConnected, state.stacksWalletType]);

  // Fetch Ethereum balances
  const fetchEthereumBalances = useCallback(async (address: string) => {
    if (!address) return;

    try {
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(),
      });

      // Fetch ETH balance
      const ethBalance = await publicClient.getBalance({
        address: address as `0x${string}`,
      });

      // Fetch USDC balance
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
  }, [config.ethereumUsdcAddress]);

  // Fetch Stacks balances
  const fetchStacksBalances = useCallback(async (address: string) => {
    if (!address) return;

    try {
      // Use Stacks testnet API URL directly
      const apiUrl = 'https://api.testnet.hiro.so';
      
      // Fetch STX balance
      const stxResponse = await fetch(
        `${apiUrl}/extended/v1/address/${address}/balances`
      );
      const stxData = await stxResponse.json();
      const stxBalance = BigInt(stxData.stx.balance);

      // Fetch USDCx balance (SIP-010 token)
      const usdcxResponse = await fetch(
        `${apiUrl}/extended/v1/address/${address}/balances`
      );
      const usdcxData = await usdcxResponse.json();
      
      // Find USDCx in fungible tokens
      const usdcxToken = usdcxData.fungible_tokens?.[config.stacksUsdcxAddress];
      const usdcxBalance = usdcxToken ? BigInt(usdcxToken.balance) : BigInt(0);

      setState(prev => ({
        ...prev,
        balances: {
          ...prev.balances,
          stx: formatUnits(stxBalance, TOKEN_DECIMALS.stx),
          usdcx: formatUnits(usdcxBalance, TOKEN_DECIMALS.usdcx),
        },
      }));
    } catch (error) {
      console.error('Failed to fetch Stacks balances:', error);
    }
  }, [config.stacksUsdcxAddress]);

  // Connect Ethereum wallet (Rabby, MetaMask, or any injected wallet)
  const connectEthereum = useCallback(async (preferredWallet?: EthereumWalletType) => {
    const availableWallets = detectEthereumWallets();
    
    if (availableWallets.length === 0) {
      throw new Error('No Ethereum wallet detected. Please install Rabby or MetaMask.');
    }

    // Use preferred wallet or first available
    const walletType = preferredWallet || availableWallets[0];
    const provider = getEthereumProvider(walletType);
    
    if (!provider) {
      throw new Error(`${walletType} wallet not available`);
    }

    setState(prev => ({ ...prev, isConnecting: true }));

    try {
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(provider),
      });

      const [address] = await walletClient.requestAddresses();
      const chainId = await walletClient.getChainId();

      // Verify correct network
      if (chainId !== config.ethereumChainId) {
        throw new Error(`Please switch to Sepolia testnet (Chain ID: ${config.ethereumChainId})`);
      }

      setState(prev => ({
        ...prev,
        ethereumAddress: address,
        ethereumConnected: true,
        ethereumChainId: chainId,
        ethereumWalletType: walletType,
        isConnecting: false,
      }));

      // Fetch balances immediately after connection
      setTimeout(() => {
        fetchEthereumBalances(address);
      }, 100);

      // Listen for account changes (only set up once)
      if (!provider._accountsChangedListenerSet) {
        provider._accountsChangedListenerSet = true;
        provider.on('accountsChanged', (accounts: string[]) => {
          if (accounts.length === 0) {
            // User disconnected from wallet
            setState(prev => ({
              ...prev,
              ethereumAddress: null,
              ethereumConnected: false,
              ethereumChainId: null,
              ethereumWalletType: null,
              balances: {
                ...prev.balances,
                eth: '0',
                usdc: '0',
              },
            }));
          } else if (accounts[0] !== address) {
            // User switched accounts
            setState(prev => ({ ...prev, ethereumAddress: accounts[0] }));
            fetchEthereumBalances(accounts[0]);
          }
        });

        // Listen for chain changes
        provider.on('chainChanged', () => {
          window.location.reload();
        });
      }

      return address;
    } catch (error) {
      setState(prev => ({ ...prev, isConnecting: false }));
      throw error;
    }
  }, [config.ethereumChainId, fetchEthereumBalances]);

  // Disconnect Ethereum wallet
  const disconnectEthereum = useCallback(() => {
    setState(prev => ({
      ...prev,
      ethereumAddress: null,
      ethereumConnected: false,
      ethereumChainId: null,
      ethereumWalletType: null,
      balances: {
        ...prev.balances,
        eth: '0',
        usdc: '0',
      },
    }));
  }, []);

  // Connect Stacks wallet (Xverse, Leather, or Hiro)
  const connectStacks = useCallback(async (preferredWallet?: StacksWalletType) => {
    if (!userSession) {
      throw new Error('Stacks wallet not available');
    }

    setState(prev => ({ ...prev, isConnecting: true }));

    try {
      // Try dynamic import first, fallback to require for dev environment
      let showConnectFn;
      try {
        const module = await import('@stacks/connect');
        showConnectFn = module.showConnect;
      } catch (importError) {
        // Fallback for development environment
        const { showConnect: sc } = require('@stacks/connect');
        showConnectFn = sc;
      }
      
      await new Promise<void>((resolve, reject) => {
        showConnectFn({
          appDetails: {
            name: 'VelumX Bridge',
            icon: typeof window !== 'undefined' ? window.location.origin + '/favicon.ico' : '',
          },
          redirectTo: '/',
          onFinish: () => {
            const userData = userSession.loadUserData();
            
            // Detect which wallet was used
            let detectedWallet: StacksWalletType = 'leather';
            if (typeof window !== 'undefined') {
              if ((window as any).XverseProviders) {
                detectedWallet = 'xverse';
              } else if ((window as any).LeatherProvider) {
                detectedWallet = 'leather';
              } else if ((window as any).HiroWalletProvider) {
                detectedWallet = 'hiro';
              }
            }
            
            setState(prev => ({
              ...prev,
              stacksAddress: userData.profile.stxAddress.testnet,
              stacksConnected: true,
              stacksWalletType: preferredWallet || detectedWallet,
              isConnecting: false,
            }));
            
            // Fetch balances immediately after connection
            setTimeout(() => {
              fetchStacksBalances(userData.profile.stxAddress.testnet);
            }, 100);
            
            resolve();
          },
          onCancel: () => {
            setState(prev => ({ ...prev, isConnecting: false }));
            reject(new Error('User cancelled connection'));
          },
          userSession,
        });
      });
    } catch (error) {
      setState(prev => ({ ...prev, isConnecting: false }));
      throw error;
    }
  }, [fetchStacksBalances]);

  // Disconnect Stacks wallet
  const disconnectStacks = useCallback(() => {
    if (userSession) {
      userSession.signUserOut();
    }
    setState(prev => ({
      ...prev,
      stacksAddress: null,
      stacksConnected: false,
      stacksWalletType: null,
      balances: {
        ...prev.balances,
        stx: '0',
        usdcx: '0',
      },
    }));
  }, []);

  // Fetch all balances
  const fetchBalances = useCallback(async () => {
    setState(prev => ({ ...prev, isFetchingBalances: true }));
    
    const promises = [];
    if (state.ethereumAddress) {
      promises.push(fetchEthereumBalances(state.ethereumAddress));
    }
    if (state.stacksAddress) {
      promises.push(fetchStacksBalances(state.stacksAddress));
    }
    
    await Promise.all(promises);
    
    setState(prev => ({ ...prev, isFetchingBalances: false }));
  }, [state.ethereumAddress, state.stacksAddress, fetchEthereumBalances, fetchStacksBalances]);

  // Auto-fetch balances when addresses change
  useEffect(() => {
    if (state.ethereumAddress || state.stacksAddress) {
      fetchBalances();
    }
  }, [state.ethereumAddress, state.stacksAddress]);

  // Disconnect all wallets
  const disconnectAll = useCallback(() => {
    disconnectEthereum();
    disconnectStacks();
  }, [disconnectEthereum, disconnectStacks]);

  // Get available wallets
  const getAvailableWallets = useCallback(() => {
    return {
      ethereum: detectEthereumWallets(),
      stacks: ['xverse', 'leather', 'hiro'] as StacksWalletType[], // All supported via @stacks/connect
    };
  }, []);

  return {
    ...state,
    connectEthereum,
    disconnectEthereum,
    connectStacks,
    disconnectStacks,
    disconnectAll,
    fetchBalances,
    getAvailableWallets,
  };
}
