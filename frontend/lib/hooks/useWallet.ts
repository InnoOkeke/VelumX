/**
 * Wallet Management Hook
 * Handles multiple EVM wallets (Rabby, MetaMask, etc.) and Stacks wallets (Xverse, Leather, Hiro)
 */

import { useState, useEffect, useCallback } from 'react';
import { createWalletClient, createPublicClient, custom, http, formatUnits } from 'viem';
import { sepolia } from 'viem/chains';
import { connect, isConnected, getLocalStorage, showConnect } from '@stacks/connect';
import { validateStacksAddress } from '@stacks/transactions';
import { useConfig, USDC_ABI, TOKEN_DECIMALS } from '../config';

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

// Validate Stacks address and ensure it's testnet
function assertTestnetAddress(address: string) {
  if (!address || !address.startsWith('ST') || !validateStacksAddress(address)) {
    throw new Error('Please connect a valid STX testnet address');
  }
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
      vex: '0',
    },
    isConnecting: false,
    isFetchingBalances: false,
  });

  // Fetch Ethereum balances
  const fetchEthereumBalances = useCallback(async (address: string) => {
    if (!address) return;

    try {
      // Create public client with specific RPC URL to avoid rate limits
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(config.ethereumRpcUrl),
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

      const formattedEth = formatUnits(ethBalance, TOKEN_DECIMALS.eth);
      const formattedUsdc = formatUnits(usdcBalance as bigint, TOKEN_DECIMALS.usdc);

      setState(prev => ({
        ...prev,
        balances: {
          ...prev.balances,
          eth: formattedEth,
          usdc: formattedUsdc,
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
      // Use Stacks testnet API URL directly
      const apiUrl = 'https://api.testnet.hiro.so';

      // Fetch all balances in a single request (STX + fungible tokens)
      const response = await fetch(
        `${apiUrl}/extended/v1/address/${address}/balances`
      );
      const data = await response.json();

      // Extract STX balance
      const stxBalance = BigInt(data.stx.balance);

      // Extract USDCx balance (SIP-010 token) from same response
      // Use fuzzy lookup: find any token that starts with the contract address
      // Stacks API uses "contract.name::token-unit-name" format
      const fungibleTokens = data.fungible_tokens || {};
      const usdcxKey = Object.keys(fungibleTokens).find(key => key.startsWith(config.stacksUsdcxAddress));
      const usdcxToken = usdcxKey ? fungibleTokens[usdcxKey] : null;
      const usdcxBalance = usdcxToken ? BigInt(usdcxToken.balance) : BigInt(0);

      const vexKey = Object.keys(fungibleTokens).find(key => key.startsWith(config.stacksVexAddress));
      const vexToken = vexKey ? fungibleTokens[vexKey] : null;
      const vexBalance = vexToken ? BigInt(vexToken.balance) : BigInt(0);

      setState(prev => ({
        ...prev,
        balances: {
          ...prev.balances,
          stx: formatUnits(stxBalance, TOKEN_DECIMALS.stx),
          usdcx: formatUnits(usdcxBalance, TOKEN_DECIMALS.usdcx),
          vex: formatUnits(vexBalance, TOKEN_DECIMALS.usdcx), // VEX also has 6 decimals
        },
      }));
    } catch (error) {
      console.error('Failed to fetch Stacks balances:', error);
    }
  }, [config.stacksUsdcxAddress, config.stacksVexAddress]);

  // Restore wallet state from localStorage and reconnect
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let mounted = true;

    const restoreState = async () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return;

        const parsed = JSON.parse(stored);
        const restoredEthAddress = parsed.ethereumAddress;
        const restoredStacksAddress = parsed.stacksAddress;

        // Verify Ethereum connection BEFORE setting state
        let ethConnected = false;
        if (restoredEthAddress && typeof window !== 'undefined') {
          const ethereum = (window as any).ethereum;
          if (ethereum) {
            try {
              const accounts = await ethereum.request({ method: 'eth_accounts' });
              if (accounts && accounts.length > 0 && accounts[0].toLowerCase() === restoredEthAddress.toLowerCase()) {
                ethConnected = true;
              }
            } catch (error) {
              console.error('Failed to verify Ethereum connection:', error);
            }
          }
        }

        // Check if Stacks wallet is still connected
        let stacksConnected = false;
        let stacksAddr = restoredStacksAddress;
        if (userSession && userSession.isUserSignedIn()) {
          const userData = userSession.loadUserData();
          stacksAddr = userData.profile.stxAddress.testnet;
          stacksConnected = true;
        }

        // Only update state once with verified data
        if (mounted) {
          setState(prev => ({
            ...prev,
            ethereumAddress: ethConnected ? restoredEthAddress : null,
            ethereumConnected: ethConnected,
            ethereumWalletType: ethConnected ? parsed.ethereumWalletType : null,
            ethereumChainId: ethConnected ? parsed.ethereumChainId : null,
            stacksAddress: stacksConnected ? stacksAddr : null,
            stacksConnected: stacksConnected,
            stacksWalletType: stacksConnected ? parsed.stacksWalletType : null,
          }));

          // Fetch balances immediately after state is set
          if (ethConnected && restoredEthAddress) {
            fetchEthereumBalances(restoredEthAddress);
          }
          if (stacksConnected && stacksAddr) {
            fetchStacksBalances(stacksAddr);
          }
        }
      } catch (error) {
        console.error('Failed to restore wallet state:', error);
        localStorage.removeItem(STORAGE_KEY);
      }
    };

    restoreState();

    return () => {
      mounted = false;
    };
  }, [fetchEthereumBalances, fetchStacksBalances]);

  // Fetch balances immediately when addresses are available
  useEffect(() => {
    if (state.ethereumAddress) {
      fetchEthereumBalances(state.ethereumAddress);
    }
  }, [state.ethereumAddress, fetchEthereumBalances]);

  useEffect(() => {
    if (state.stacksAddress) {
      fetchStacksBalances(state.stacksAddress);
    }
  }, [state.stacksAddress, fetchStacksBalances]);

  // Set up polling for balance updates (every 10 seconds)
  useEffect(() => {
    if (!state.ethereumAddress && !state.stacksAddress) return;

    const interval = setInterval(() => {
      if (state.ethereumAddress) {
        fetchEthereumBalances(state.ethereumAddress);
      }
      if (state.stacksAddress) {
        fetchStacksBalances(state.stacksAddress);
      }
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(interval);
  }, [state.ethereumAddress, state.stacksAddress, fetchEthereumBalances, fetchStacksBalances]);

  // Set up Ethereum wallet event listeners for auto-detection
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        // User disconnected wallet
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
      } else {
        // User switched accounts or connected
        const newAddress = accounts[0];
        setState(prev => ({
          ...prev,
          ethereumAddress: newAddress,
          ethereumConnected: true,
        }));
        fetchEthereumBalances(newAddress);
      }
    };

    const handleChainChanged = () => {
      // Reload page on chain change to avoid state inconsistencies
      window.location.reload();
    };

    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('chainChanged', handleChainChanged);

    return () => {
      ethereum.removeListener('accountsChanged', handleAccountsChanged);
      ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, [fetchEthereumBalances]);

  // Monitor Stacks wallet session
  useEffect(() => {
    if (typeof window === 'undefined' || !userSession) return;

    const checkStacksSession = () => {
      if (userSession.isUserSignedIn()) {
        const userData = userSession.loadUserData();
        const stacksAddr = userData.profile.stxAddress.testnet;

        setState(prev => {
          // Only update if address changed
          if (prev.stacksAddress !== stacksAddr) {
            return {
              ...prev,
              stacksAddress: stacksAddr,
              stacksConnected: true,
            };
          }
          return prev;
        });
      } else if (state.stacksConnected) {
        // Session ended
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
      }
    };

    // Check session every 5 seconds
    const interval = setInterval(checkStacksSession, 5000);

    return () => clearInterval(interval);
  }, [state.stacksConnected]);

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
      fetchEthereumBalances(address);

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

  // Connect Stacks wallet using recommended showConnect pattern
  const connectStacks = useCallback(async (preferredWallet?: StacksWalletType) => {
    setState(prev => ({ ...prev, isConnecting: true }));

    try {
      return new Promise<string>((resolve, reject) => {
        showConnect({
          appDetails: {
            name: 'VelumX DEX',
            icon: typeof window !== 'undefined' ? window.location.origin + '/favicon.ico' : '',
          },
          onFinish: () => {
            if (userSession && userSession.isUserSignedIn()) {
              const userData = userSession.loadUserData();
              const address = userData.profile.stxAddress.testnet;

              // Validate address
              assertTestnetAddress(address);

              setState(prev => ({
                ...prev,
                stacksAddress: address,
                stacksConnected: true,
                stacksWalletType: preferredWallet || 'leather',
                isConnecting: false,
              }));

              // Fetch balances immediately
              fetchStacksBalances(address);
              resolve(address);
            } else {
              setState(prev => ({ ...prev, isConnecting: false }));
              reject(new Error('User signed in but session is invalid'));
            }
          },
          onCancel: () => {
            setState(prev => ({ ...prev, isConnecting: false }));
            reject(new Error('User cancelled connection'));
          },
          userSession: userSession
        });
      });
    } catch (error) {
      console.error('Stacks connection failed:', error);
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

  // Fetch all balances - uses stored addresses to avoid stale closure issues
  const fetchBalances = useCallback(async () => {
    // Get addresses - prefer state, fall back to localStorage for each independently
    let ethAddr = state.ethereumAddress;
    let stacksAddr = state.stacksAddress;

    // If either address is missing in state, try to get them from storage
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          // Only use storage value if state doesn't have it
          if (!ethAddr && parsed.ethereumAddress) {
            ethAddr = parsed.ethereumAddress;
          }
          if (!stacksAddr && parsed.stacksAddress) {
            stacksAddr = parsed.stacksAddress;
          }
        }
      } catch (e) {
        // Ignore storage errors
      }
    }

    if (!ethAddr && !stacksAddr) {
      console.log('🔍 No addresses found for balance fetch');
      return; // No addresses to fetch for
    }

    console.log(`🔍 Fetching balances for: ETH=${ethAddr || 'none'}, Stacks=${stacksAddr || 'none'}`);
    setState(prev => ({ ...prev, isFetchingBalances: true }));

    const promises = [];
    if (ethAddr) {
      promises.push(fetchEthereumBalances(ethAddr));
    }
    if (stacksAddr) {
      promises.push(fetchStacksBalances(stacksAddr));
    }

    try {
      await Promise.all(promises);
      console.log('✅ Balance fetch complete');
    } catch (error) {
      console.error('❌ Balance fetch failed:', error);
    } finally {
      setState(prev => ({ ...prev, isFetchingBalances: false }));
    }
  }, [state.ethereumAddress, state.stacksAddress, fetchEthereumBalances, fetchStacksBalances]);

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
