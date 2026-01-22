/**
 * LiquidityInterface Component
 * UI for adding and removing liquidity from AMM pools
 */

'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '../lib/hooks/useWallet';
import { useConfig } from '../lib/config';
import { Plus, Minus, Loader2, AlertCircle, CheckCircle, Zap, Info, Search, X, BarChart3 } from 'lucide-react';
import { formatUnits, parseUnits } from 'viem';
import { fetchCallReadOnlyFunction, cvToJSON, principalCV } from '@stacks/transactions';
import { PoolAnalytics } from './PoolAnalytics';
import { PositionDashboard } from './PositionDashboard';

interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoUrl?: string;
  priceUSD?: number;
}

interface Pool {
  id: string;
  tokenA: Token;
  tokenB: Token;
  reserveA: bigint;
  reserveB: bigint;
  totalSupply: bigint;
  tvl: number;
  volume24h: number;
  apr: number;
  feeEarnings24h: number;
  createdAt: Date;
  lastUpdated: Date;
}

interface PoolAnalytics {
  poolId: string;
  tvl: number;
  volume24h: number;
  volume7d: number;
  apr: number;
  feeEarnings24h: number;
  priceChange24h: number;
}

interface LiquidityState {
  mode: 'add' | 'remove';
  tokenA: Token | null;
  tokenB: Token | null;
  amountA: string;
  amountB: string;
  lpTokenAmount: string;
  gaslessMode: boolean;
  isProcessing: boolean;
  error: string | null;
  success: string | null;
  poolExists: boolean;
  userLpBalance: string;
  poolShare: string;
  showImportModal: boolean;
  importAddress: string;
  importingToken: 'A' | 'B' | null;
  // Enhanced pool discovery features
  showPoolBrowser: boolean;
  availablePools: Pool[];
  filteredPools: Pool[];
  poolSearchQuery: string;
  poolSortBy: 'tvl' | 'apr' | 'volume' | 'name';
  poolSortOrder: 'asc' | 'desc';
  selectedPoolForSwap: Pool | null;
  loadingPools: boolean;
  poolAnalytics: { [poolId: string]: PoolAnalytics };
  showPoolAnalytics: boolean;
  // Position dashboard
  activeTab: 'liquidity' | 'positions';
}

// Default tokens for testnet
const DEFAULT_TOKENS: Token[] = [
  {
    symbol: 'USDCx',
    name: 'USDC (xReserve)',
    address: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx',
    decimals: 6,
  },
  {
    symbol: 'STX',
    name: 'Stacks',
    address: 'STX',
    decimals: 6,
  },
];

export function LiquidityInterface() {
  const { stacksAddress, stacksConnected, balances, fetchBalances } = useWallet();
  const config = useConfig();

  const [tokens, setTokens] = useState<Token[]>(DEFAULT_TOKENS);
  const [state, setState] = useState<LiquidityState>({
    mode: 'add',
    tokenA: DEFAULT_TOKENS[0],
    tokenB: DEFAULT_TOKENS[1],
    amountA: '',
    amountB: '',
    lpTokenAmount: '',
    gaslessMode: true,
    isProcessing: false,
    error: null,
    success: null,
    poolExists: false,
    userLpBalance: '0',
    poolShare: '0',
    showImportModal: false,
    importAddress: '',
    importingToken: null,
    // Enhanced pool discovery features
    showPoolBrowser: false,
    availablePools: [],
    filteredPools: [],
    poolSearchQuery: '',
    poolSortBy: 'tvl',
    poolSortOrder: 'desc',
    selectedPoolForSwap: null,
    loadingPools: false,
    poolAnalytics: {},
    showPoolAnalytics: false,
    // Position dashboard
    activeTab: 'liquidity',
  });

  // Fetch available pools on component mount
  useEffect(() => {
    if (stacksConnected) {
      fetchAvailablePools();
    }
  }, [stacksConnected]);

  // Filter and sort pools when search query or sort options change
  useEffect(() => {
    filterAndSortPools();
  }, [state.availablePools, state.poolSearchQuery, state.poolSortBy, state.poolSortOrder]);

  // Fetch pool info when tokens change
  useEffect(() => {
    if (state.tokenA && state.tokenB && stacksAddress) {
      fetchPoolInfo();
    }
  }, [state.tokenA, state.tokenB, stacksAddress]);

  // Calculate optimal ratio when adding liquidity
  useEffect(() => {
    if (state.mode === 'add' && state.amountA && state.poolExists) {
      calculateOptimalAmountB();
    }
  }, [state.amountA, state.mode, state.poolExists]);

  /**
   * Fetch available pools from the backend API
   */
  const fetchAvailablePools = async () => {
    setState(prev => ({ ...prev, loadingPools: true, error: null }));

    try {
      // Fetch pools from the new pool discovery API
      const response = await fetch(`${config.backendUrl}/api/liquidity/pools`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch pools: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        const pools: Pool[] = data.data.map((pool: any) => ({
          id: pool.id,
          tokenA: {
            symbol: pool.tokenA.symbol,
            name: pool.tokenA.name,
            address: pool.tokenA.address,
            decimals: pool.tokenA.decimals,
            logoUrl: pool.tokenA.logoUrl,
            priceUSD: pool.tokenA.priceUSD,
          },
          tokenB: {
            symbol: pool.tokenB.symbol,
            name: pool.tokenB.name,
            address: pool.tokenB.address,
            decimals: pool.tokenB.decimals,
            logoUrl: pool.tokenB.logoUrl,
            priceUSD: pool.tokenB.priceUSD,
          },
          reserveA: BigInt(pool.reserveA || '0'),
          reserveB: BigInt(pool.reserveB || '0'),
          totalSupply: BigInt(pool.totalSupply || '0'),
          tvl: pool.tvl || 0,
          volume24h: pool.volume24h || 0,
          apr: pool.apr || 0,
          feeEarnings24h: pool.feeEarnings24h || 0,
          createdAt: new Date(pool.createdAt),
          lastUpdated: new Date(pool.lastUpdated),
        }));

        setState(prev => ({ 
          ...prev, 
          availablePools: pools,
          loadingPools: false,
        }));

        // Fetch analytics for each pool
        await fetchPoolAnalytics(pools);
      } else {
        throw new Error(data.error || 'Failed to fetch pools');
      }
    } catch (error) {
      console.error('Failed to fetch available pools:', error);
      setState(prev => ({ 
        ...prev, 
        loadingPools: false,
        error: `Failed to load pools: ${(error as Error).message}`,
      }));
    }
  };

  /**
   * Fetch analytics for multiple pools
   */
  const fetchPoolAnalytics = async (pools: Pool[]) => {
    try {
      const analyticsPromises = pools.map(async (pool) => {
        try {
          const response = await fetch(`${config.backendUrl}/api/liquidity/analytics/${pool.id}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
              return { poolId: pool.id, analytics: data.data };
            }
          }
          return null;
        } catch (error) {
          console.error(`Failed to fetch analytics for pool ${pool.id}:`, error);
          return null;
        }
      });

      const analyticsResults = await Promise.all(analyticsPromises);
      const analyticsMap: { [poolId: string]: PoolAnalytics } = {};

      analyticsResults.forEach(result => {
        if (result) {
          analyticsMap[result.poolId] = result.analytics;
        }
      });

      setState(prev => ({ 
        ...prev, 
        poolAnalytics: analyticsMap,
      }));
    } catch (error) {
      console.error('Failed to fetch pool analytics:', error);
    }
  };

  /**
   * Filter and sort pools based on search query and sort options
   */
  const filterAndSortPools = () => {
    let filtered = [...state.availablePools];

    // Apply search filter
    if (state.poolSearchQuery.trim()) {
      const query = state.poolSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(pool => 
        pool.tokenA.symbol.toLowerCase().includes(query) ||
        pool.tokenA.name.toLowerCase().includes(query) ||
        pool.tokenB.symbol.toLowerCase().includes(query) ||
        pool.tokenB.name.toLowerCase().includes(query) ||
        pool.id.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      switch (state.poolSortBy) {
        case 'tvl':
          aValue = a.tvl;
          bValue = b.tvl;
          break;
        case 'apr':
          aValue = a.apr;
          bValue = b.apr;
          break;
        case 'volume':
          aValue = a.volume24h;
          bValue = b.volume24h;
          break;
        case 'name':
          aValue = `${a.tokenA.symbol}-${a.tokenB.symbol}`;
          bValue = `${b.tokenA.symbol}-${b.tokenB.symbol}`;
          break;
        default:
          aValue = a.tvl;
          bValue = b.tvl;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return state.poolSortOrder === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        const numA = Number(aValue);
        const numB = Number(bValue);
        return state.poolSortOrder === 'asc' ? numA - numB : numB - numA;
      }
    });

    setState(prev => ({ ...prev, filteredPools: filtered }));
  };

  /**
   * Select a pool from the browser
   */
  const selectPoolFromBrowser = (pool: Pool) => {
    setState(prev => ({
      ...prev,
      tokenA: pool.tokenA,
      tokenB: pool.tokenB,
      selectedPoolForSwap: pool,
      showPoolBrowser: false,
      error: null,
    }));

    // Add tokens to the tokens list if they don't exist
    const newTokens = [...tokens];
    if (!newTokens.find(t => t.address === pool.tokenA.address)) {
      newTokens.push(pool.tokenA);
    }
    if (!newTokens.find(t => t.address === pool.tokenB.address)) {
      newTokens.push(pool.tokenB);
    }
    setTokens(newTokens);
  };

  /**
   * Format currency values
   */
  const formatCurrency = (value: number): string => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    } else {
      return `$${value.toFixed(2)}`;
    }
  };

  /**
   * Format percentage values
   */
  const formatPercentage = (value: number): string => {
    return `${value.toFixed(2)}%`;
  };

  const fetchPoolInfo = async () => {
    if (!state.tokenA || !state.tokenB || !stacksAddress) return;

    try {
      const [contractAddress, contractName] = config.stacksSwapContractAddress.split('.');

      // Get pool reserves
      const poolResult = await fetchCallReadOnlyFunction({
        contractAddress,
        contractName,
        functionName: 'get-pool-reserves',
        functionArgs: [
          principalCV(state.tokenA.address),
          principalCV(state.tokenB.address),
        ],
        network: 'testnet',
        senderAddress: stacksAddress,
      });

      const poolJson = cvToJSON(poolResult);
      
      if (poolJson.success && poolJson.value) {
        const poolData = poolJson.value.value;
        const reserveA = Number(poolData['reserve-a'].value);
        const reserveB = Number(poolData['reserve-b'].value);
        
        // Pool exists if reserves are non-zero
        const poolExists = reserveA > 0 && reserveB > 0;

        // Get user LP balance
        const lpResult = await fetchCallReadOnlyFunction({
          contractAddress,
          contractName,
          functionName: 'get-lp-balance',
          functionArgs: [
            principalCV(state.tokenA.address),
            principalCV(state.tokenB.address),
            principalCV(stacksAddress),
          ],
          network: 'testnet',
          senderAddress: stacksAddress,
        });

        const lpJson = cvToJSON(lpResult);
        const userLpBalance = lpJson.success && lpJson.value 
          ? (Number(lpJson.value.value) / Math.pow(10, 6)).toFixed(6)
          : '0';

        // Get pool share
        const shareResult = await fetchCallReadOnlyFunction({
          contractAddress,
          contractName,
          functionName: 'get-pool-share',
          functionArgs: [
            principalCV(state.tokenA.address),
            principalCV(state.tokenB.address),
            principalCV(stacksAddress),
          ],
          network: 'testnet',
          senderAddress: stacksAddress,
        });

        const shareJson = cvToJSON(shareResult);
        const poolShare = shareJson.success && shareJson.value
          ? (Number(shareJson.value.value.percentage.value) / 100).toFixed(2)
          : '0';

        setState(prev => ({
          ...prev,
          poolExists,
          userLpBalance,
          poolShare,
        }));
      } else {
        // Pool doesn't exist yet
        setState(prev => ({
          ...prev,
          poolExists: false,
          userLpBalance: '0',
          poolShare: '0',
        }));
      }
    } catch (error) {
      console.error('Failed to fetch pool info:', error);
      setState(prev => ({
        ...prev,
        poolExists: false,
        userLpBalance: '0',
        poolShare: '0',
      }));
    }
  };

  const calculateOptimalAmountB = async () => {
    if (!state.tokenA || !state.tokenB || !state.amountA || !state.poolExists) return;

    try {
      const [contractAddress, contractName] = config.stacksSwapContractAddress.split('.');

      // Get pool reserves
      const poolResult = await fetchCallReadOnlyFunction({
        contractAddress,
        contractName,
        functionName: 'get-pool-reserves',
        functionArgs: [
          principalCV(state.tokenA.address),
          principalCV(state.tokenB.address),
        ],
        network: 'testnet',
        senderAddress: stacksAddress || contractAddress,
      });

      const poolJson = cvToJSON(poolResult);
      
      if (poolJson.success && poolJson.value) {
        const poolData = poolJson.value.value;
        const reserveA = Number(poolData['reserve-a'].value);
        const reserveB = Number(poolData['reserve-b'].value);
        
        // Calculate optimal amount B based on pool ratio
        const amountAMicro = parseFloat(state.amountA) * Math.pow(10, state.tokenA.decimals);
        const amountBMicro = (amountAMicro * reserveB) / reserveA;
        const amountB = (amountBMicro / Math.pow(10, state.tokenB.decimals)).toFixed(6);
        
        setState(prev => ({ ...prev, amountB }));
      }
    } catch (error) {
      console.error('Failed to calculate optimal amount:', error);
    }
  };

  const handleAddLiquidity = async () => {
    if (!stacksAddress || !state.tokenA || !state.tokenB) {
      setState(prev => ({ ...prev, error: 'Please connect wallet and select tokens' }));
      return;
    }

    if (!state.amountA || !state.amountB || parseFloat(state.amountA) <= 0 || parseFloat(state.amountB) <= 0) {
      setState(prev => ({ ...prev, error: 'Please enter valid amounts' }));
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, error: null, success: null }));

    try {
      // Dynamic imports for Stacks libraries
      const { openContractCall } = await import('@stacks/connect');
      const { STACKS_TESTNET } = await import('@stacks/network');
      const { uintCV, contractPrincipalCV, PostConditionMode } = await import('@stacks/transactions');
      
      const amountAMicro = parseUnits(state.amountA, state.tokenA.decimals);
      const amountBMicro = parseUnits(state.amountB, state.tokenB.decimals);
      
      // Calculate minimum amounts with 0.5% slippage tolerance
      const minAmountAMicro = parseUnits((parseFloat(state.amountA) * 0.995).toFixed(6), state.tokenA.decimals);
      const minAmountBMicro = parseUnits((parseFloat(state.amountB) * 0.995).toFixed(6), state.tokenB.decimals);

      // Parse token addresses (format: PRINCIPAL.CONTRACT-NAME)
      const tokenAParts = state.tokenA.address.split('.');
      const tokenBParts = state.tokenB.address.split('.');

      const functionArgs = [
        contractPrincipalCV(tokenAParts[0], tokenAParts[1]), // token-a
        contractPrincipalCV(tokenBParts[0], tokenBParts[1]), // token-b
        uintCV(Number(amountAMicro)), // amount-a-desired
        uintCV(Number(amountBMicro)), // amount-b-desired
        uintCV(Number(minAmountAMicro)), // amount-a-min
        uintCV(Number(minAmountBMicro)), // amount-b-min
      ];

      await new Promise<string>((resolve, reject) => {
        openContractCall({
          contractAddress: config.stacksSwapContractAddress.split('.')[0],
          contractName: config.stacksSwapContractAddress.split('.')[1],
          functionName: state.gaslessMode ? 'add-liquidity-gasless' : 'add-liquidity',
          functionArgs,
          network: STACKS_TESTNET,
          postConditionMode: PostConditionMode.Allow,
          sponsored: state.gaslessMode,
          appDetails: {
            name: 'VelumX Bridge',
            icon: typeof window !== 'undefined' ? window.location.origin + '/favicon.ico' : '',
          },
          onFinish: async (data: any) => {
            const txId = data.txId;
            resolve(txId);
          },
          onCancel: () => {
            reject(new Error('User cancelled transaction'));
          },
        });
      });

      setState(prev => ({
        ...prev,
        isProcessing: false,
        success: `Liquidity added successfully! You received LP tokens.`,
        amountA: '',
        amountB: '',
      }));

      // Refresh balances and pool info
      if (fetchBalances) {
        setTimeout(() => {
          fetchBalances();
          fetchPoolInfo();
        }, 3000);
      }
    } catch (error) {
      console.error('Add liquidity error:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: (error as Error).message || 'Failed to add liquidity',
      }));
    }
  };

  // Calculate expected output when removing liquidity
  useEffect(() => {
    if (state.mode === 'remove' && state.lpTokenAmount && parseFloat(state.lpTokenAmount) > 0 && state.poolExists) {
      calculateRemoveAmounts();
    }
  }, [state.lpTokenAmount, state.mode, state.poolExists]);

  const calculateRemoveAmounts = async () => {
    if (!state.tokenA || !state.tokenB || !state.lpTokenAmount || !stacksAddress) return;

    try {
      const [contractAddress, contractName] = config.stacksSwapContractAddress.split('.');

      // Get pool reserves and total supply
      const poolResult = await fetchCallReadOnlyFunction({
        contractAddress,
        contractName,
        functionName: 'get-pool-reserves',
        functionArgs: [
          principalCV(state.tokenA.address),
          principalCV(state.tokenB.address),
        ],
        network: 'testnet',
        senderAddress: stacksAddress,
      });

      const poolJson = cvToJSON(poolResult);
      
      if (poolJson.success && poolJson.value) {
        const poolData = poolJson.value.value;
        const reserveA = Number(poolData['reserve-a'].value);
        const reserveB = Number(poolData['reserve-b'].value);
        const totalSupply = Number(poolData['total-supply'].value);
        
        // Calculate proportional amounts
        const lpAmountMicro = parseFloat(state.lpTokenAmount) * Math.pow(10, 6);
        const amountAMicro = (lpAmountMicro * reserveA) / totalSupply;
        const amountBMicro = (lpAmountMicro * reserveB) / totalSupply;
        
        const amountA = (amountAMicro / Math.pow(10, state.tokenA.decimals)).toFixed(6);
        const amountB = (amountBMicro / Math.pow(10, state.tokenB.decimals)).toFixed(6);
        
        setState(prev => ({ ...prev, amountA, amountB }));
      }
    } catch (error) {
      console.error('Failed to calculate remove amounts:', error);
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!stacksAddress || !state.tokenA || !state.tokenB) {
      setState(prev => ({ ...prev, error: 'Please connect wallet and select tokens' }));
      return;
    }

    if (!state.lpTokenAmount || parseFloat(state.lpTokenAmount) <= 0) {
      setState(prev => ({ ...prev, error: 'Please enter valid LP token amount' }));
      return;
    }

    if (parseFloat(state.lpTokenAmount) > parseFloat(state.userLpBalance)) {
      setState(prev => ({ ...prev, error: 'Insufficient LP token balance' }));
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, error: null, success: null }));

    try {
      // Dynamic imports for Stacks libraries
      const { openContractCall } = await import('@stacks/connect');
      const { STACKS_TESTNET } = await import('@stacks/network');
      const { uintCV, contractPrincipalCV, PostConditionMode } = await import('@stacks/transactions');
      
      const lpTokenAmountMicro = parseUnits(state.lpTokenAmount, 6); // LP tokens have 6 decimals
      
      // Calculate minimum amounts with 0.5% slippage tolerance
      const minAmountAMicro = parseUnits((parseFloat(state.amountA || '0') * 0.995).toFixed(6), state.tokenA.decimals);
      const minAmountBMicro = parseUnits((parseFloat(state.amountB || '0') * 0.995).toFixed(6), state.tokenB.decimals);

      // Parse token addresses (format: PRINCIPAL.CONTRACT-NAME)
      const tokenAParts = state.tokenA.address.split('.');
      const tokenBParts = state.tokenB.address.split('.');

      const functionArgs = [
        contractPrincipalCV(tokenAParts[0], tokenAParts[1]), // token-a
        contractPrincipalCV(tokenBParts[0], tokenBParts[1]), // token-b
        uintCV(Number(lpTokenAmountMicro)), // liquidity
        uintCV(Number(minAmountAMicro)), // amount-a-min
        uintCV(Number(minAmountBMicro)), // amount-b-min
      ];

      await new Promise<string>((resolve, reject) => {
        openContractCall({
          contractAddress: config.stacksSwapContractAddress.split('.')[0],
          contractName: config.stacksSwapContractAddress.split('.')[1],
          functionName: state.gaslessMode ? 'remove-liquidity-gasless' : 'remove-liquidity',
          functionArgs,
          network: STACKS_TESTNET,
          postConditionMode: PostConditionMode.Allow,
          sponsored: state.gaslessMode,
          appDetails: {
            name: 'VelumX Bridge',
            icon: typeof window !== 'undefined' ? window.location.origin + '/favicon.ico' : '',
          },
          onFinish: async (data: any) => {
            const txId = data.txId;
            resolve(txId);
          },
          onCancel: () => {
            reject(new Error('User cancelled transaction'));
          },
        });
      });

      setState(prev => ({
        ...prev,
        isProcessing: false,
        success: `Liquidity removed successfully! You received ${state.amountA} ${state.tokenA?.symbol} and ${state.amountB} ${state.tokenB?.symbol}`,
        lpTokenAmount: '',
        amountA: '',
        amountB: '',
      }));

      // Refresh balances and pool info
      if (fetchBalances) {
        setTimeout(() => {
          fetchBalances();
          fetchPoolInfo();
        }, 3000);
      }
    } catch (error) {
      console.error('Remove liquidity error:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: (error as Error).message || 'Failed to remove liquidity',
      }));
    }
  };

  const getBalance = (token: Token | null): string => {
    if (!token) return '0';
    if (token.symbol === 'USDCx') return balances.usdcx;
    if (token.symbol === 'STX') return balances.stx;
    return '0';
  };

  const openImportModal = (tokenSlot: 'A' | 'B') => {
    setState(prev => ({
      ...prev,
      showImportModal: true,
      importingToken: tokenSlot,
      importAddress: '',
      error: null,
    }));
  };

  const closeImportModal = () => {
    setState(prev => ({
      ...prev,
      showImportModal: false,
      importingToken: null,
      importAddress: '',
    }));
  };

  const validateStacksContractAddress = (address: string): boolean => {
    // Format: PRINCIPAL.CONTRACT-NAME
    const parts = address.split('.');
    if (parts.length !== 2) return false;
    
    // Check principal (address) format
    const principal = parts[0];
    if (!principal.match(/^(ST|SP)[0-9A-Z]{38,41}$/)) return false;
    
    // Check contract name format
    const contractName = parts[1];
    if (!contractName.match(/^[a-z][a-z0-9-]{0,39}$/)) return false;
    
    return true;
  };

  const handleImportToken = async () => {
    if (!state.importAddress.trim()) {
      setState(prev => ({ ...prev, error: 'Please enter a token address' }));
      return;
    }

    // Validate address format
    if (!validateStacksContractAddress(state.importAddress.trim())) {
      setState(prev => ({ 
        ...prev, 
        error: 'Invalid Stacks contract address. Format: PRINCIPAL.CONTRACT-NAME' 
      }));
      return;
    }

    // Check if token already exists
    const existingToken = tokens.find(t => t.address.toLowerCase() === state.importAddress.trim().toLowerCase());
    if (existingToken) {
      // Just select the existing token
      if (state.importingToken === 'A') {
        setState(prev => ({ ...prev, tokenA: existingToken }));
      } else {
        setState(prev => ({ ...prev, tokenB: existingToken }));
      }
      closeImportModal();
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, error: null }));

    try {
      // TODO: Fetch token metadata from contract (name, symbol, decimals)
      // For now, create a basic token entry
      const parts = state.importAddress.trim().split('.');
      const contractName = parts[1];
      
      const newToken: Token = {
        symbol: contractName.toUpperCase().substring(0, 6),
        name: contractName,
        address: state.importAddress.trim(),
        decimals: 6, // Default to 6 decimals
      };

      // Add to tokens list
      setTokens(prev => [...prev, newToken]);

      // Select the new token
      if (state.importingToken === 'A') {
        setState(prev => ({ ...prev, tokenA: newToken }));
      } else {
        setState(prev => ({ ...prev, tokenB: newToken }));
      }

      setState(prev => ({
        ...prev,
        isProcessing: false,
        success: `Token ${newToken.symbol} imported successfully!`,
      }));

      closeImportModal();

      // Clear success message after 3 seconds
      setTimeout(() => {
        setState(prev => ({ ...prev, success: null }));
      }, 3000);
    } catch (error) {
      console.error('Import token error:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: (error as Error).message || 'Failed to import token',
      }));
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setState(prev => ({ ...prev, activeTab: 'liquidity' }))}
          className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all ${
            state.activeTab === 'liquidity'
              ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
              : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
          style={state.activeTab !== 'liquidity' ? { color: 'var(--text-secondary)' } : {}}
        >
          Manage Liquidity
        </button>
        <button
          onClick={() => setState(prev => ({ ...prev, activeTab: 'positions' }))}
          className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all ${
            state.activeTab === 'positions'
              ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
              : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
          style={state.activeTab !== 'positions' ? { color: 'var(--text-secondary)' } : {}}
        >
          My Positions
        </button>
      </div>

      {/* Show Position Dashboard or Liquidity Interface based on active tab */}
      {state.activeTab === 'positions' ? (
        <PositionDashboard />
      ) : (
      <div className="rounded-3xl vellum-shadow transition-all duration-300" style={{ 
        backgroundColor: 'var(--bg-surface)', 
        border: `1px solid var(--border-color)`,
        padding: '2rem'
      }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Liquidity
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setState(prev => ({ ...prev, showPoolBrowser: true }))}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
              style={{ color: 'var(--text-secondary)' }}
              disabled={state.isProcessing}
            >
              <Search className="w-4 h-4 inline mr-1" />
              Browse Pools
            </button>
            <button
              onClick={() => setState(prev => ({ ...prev, mode: 'add', error: null, success: null }))}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                state.mode === 'add'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              style={state.mode !== 'add' ? { color: 'var(--text-secondary)' } : {}}
            >
              <Plus className="w-4 h-4 inline mr-1" />
              Add
            </button>
            <button
              onClick={() => setState(prev => ({ ...prev, mode: 'remove', error: null, success: null }))}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                state.mode === 'remove'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              style={state.mode !== 'remove' ? { color: 'var(--text-secondary)' } : {}}
            >
              <Minus className="w-4 h-4 inline mr-1" />
              Remove
            </button>
          </div>
        </div>

        {/* Pool Info */}
        {state.poolExists && (
          <div className="rounded-xl p-4 mb-6" style={{
            border: `1px solid var(--border-color)`,
            backgroundColor: 'rgba(139, 92, 246, 0.05)'
          }}>
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Your Position
                </p>
                <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <div className="flex justify-between">
                    <span>LP Tokens:</span>
                    <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{parseFloat(state.userLpBalance).toFixed(6)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pool Share:</span>
                    <span className="font-semibold text-purple-600 dark:text-purple-400">{state.poolShare}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Selected Pool Info */}
        {state.selectedPoolForSwap && (
          <div className="rounded-xl p-4 mb-6" style={{
            border: `1px solid var(--border-color)`,
            backgroundColor: 'rgba(16, 185, 129, 0.05)'
          }}>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Selected Pool: {state.selectedPoolForSwap.tokenA.symbol} / {state.selectedPoolForSwap.tokenB.symbol}
                  </p>
                  <button
                    onClick={() => setState(prev => ({ ...prev, showPoolAnalytics: true }))}
                    className="px-3 py-1 rounded-lg text-xs font-semibold transition-all bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex items-center gap-1"
                    disabled={state.isProcessing}
                  >
                    <BarChart3 className="w-3 h-3" />
                    Analytics
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <div className="flex justify-between">
                    <span>TVL:</span>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {formatCurrency(state.selectedPoolForSwap.tvl)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>APR:</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">
                      {formatPercentage(state.selectedPoolForSwap.apr)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>24h Volume:</span>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {formatCurrency(state.selectedPoolForSwap.volume24h)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>24h Fees:</span>
                    <span className="font-semibold text-purple-600 dark:text-purple-400">
                      {formatCurrency(state.selectedPoolForSwap.feeEarnings24h)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {state.mode === 'add' ? (
          <>
            {/* Token A Input */}
            <div className="rounded-2xl p-6 mb-4 hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-300" style={{
              border: `2px solid var(--border-color)`,
              backgroundColor: 'var(--bg-surface)'
            }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Token A</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Balance: <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{parseFloat(getBalance(state.tokenA)).toFixed(4)}</span>
                </span>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  value={state.amountA}
                  onChange={(e) => setState(prev => ({ ...prev, amountA: e.target.value, error: null }))}
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-4xl font-mono outline-none placeholder:opacity-30 min-w-0"
                  style={{ color: 'var(--text-primary)' }}
                  disabled={state.isProcessing}
                />
              <div className="flex items-center gap-2">
                <select
                  value={state.tokenA?.symbol || ''}
                  onChange={(e) => {
                    const token = tokens.find(t => t.symbol === e.target.value);
                    setState(prev => ({ ...prev, tokenA: token || null }));
                  }}
                  className="flex-shrink-0 bg-gradient-to-r from-purple-600 to-purple-700 dark:from-purple-500 dark:to-purple-600 hover:from-purple-700 hover:to-purple-800 text-white px-6 py-3.5 rounded-2xl font-bold outline-none cursor-pointer transition-all shadow-lg shadow-purple-500/50"
                  disabled={state.isProcessing}
                >
                  {tokens.map(token => (
                    <option key={token.symbol} value={token.symbol} className="bg-gray-900">
                      {token.symbol}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => openImportModal('A')}
                  className="p-3 rounded-xl transition-all hover:bg-purple-100 dark:hover:bg-purple-900/30"
                  style={{ border: `1px solid var(--border-color)` }}
                  title="Import custom token"
                  disabled={state.isProcessing}
                >
                  <Search className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </button>
              </div>
              </div>
              <button
                onClick={() => setState(prev => ({ ...prev, amountA: getBalance(state.tokenA) }))}
                className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 mt-4 font-bold transition-colors"
                disabled={state.isProcessing}
              >
                MAX
              </button>
            </div>

            {/* Plus Icon */}
            <div className="flex justify-center my-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{
                backgroundColor: 'var(--bg-surface)',
                border: `2px solid var(--border-color)`
              }}>
                <Plus className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
              </div>
            </div>

            {/* Token B Input */}
            <div className="rounded-2xl p-6 mb-6 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-300" style={{
              border: `2px solid var(--border-color)`,
              backgroundColor: 'var(--bg-surface)'
            }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Token B</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Balance: <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{parseFloat(getBalance(state.tokenB)).toFixed(4)}</span>
                </span>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  value={state.amountB}
                  onChange={(e) => setState(prev => ({ ...prev, amountB: e.target.value, error: null }))}
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-4xl font-mono outline-none placeholder:opacity-30 min-w-0"
                  style={{ color: 'var(--text-primary)' }}
                  disabled={state.isProcessing || state.poolExists}
                />
              <div className="flex items-center gap-2">
                <select
                  value={state.tokenB?.symbol || ''}
                  onChange={(e) => {
                    const token = tokens.find(t => t.symbol === e.target.value);
                    setState(prev => ({ ...prev, tokenB: token || null }));
                  }}
                  className="flex-shrink-0 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-3.5 rounded-2xl font-bold outline-none cursor-pointer transition-all shadow-lg shadow-blue-500/50"
                  disabled={state.isProcessing}
                >
                  {tokens.map(token => (
                    <option key={token.symbol} value={token.symbol} className="bg-gray-900">
                      {token.symbol}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => openImportModal('B')}
                  className="p-3 rounded-xl transition-all hover:bg-blue-100 dark:hover:bg-blue-900/30"
                  style={{ border: `1px solid var(--border-color)` }}
                  title="Import custom token"
                  disabled={state.isProcessing}
                >
                  <Search className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </button>
              </div>
              </div>
              <button
                onClick={() => setState(prev => ({ ...prev, amountB: getBalance(state.tokenB) }))}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mt-4 font-bold transition-colors"
                disabled={state.isProcessing || state.poolExists}
              >
                MAX
              </button>
            </div>
          </>
        ) : (
          <>
            {/* LP Token Input for Remove */}
            <div className="rounded-2xl p-6 mb-6 hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-300" style={{
              border: `2px solid var(--border-color)`,
              backgroundColor: 'var(--bg-surface)'
            }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>LP Tokens</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Balance: <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{parseFloat(state.userLpBalance).toFixed(6)}</span>
                </span>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  value={state.lpTokenAmount}
                  onChange={(e) => setState(prev => ({ ...prev, lpTokenAmount: e.target.value, error: null }))}
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-4xl font-mono outline-none placeholder:opacity-30 min-w-0"
                  style={{ color: 'var(--text-primary)' }}
                  disabled={state.isProcessing}
                />
                <div className="flex-shrink-0 bg-gradient-to-r from-purple-600 to-purple-700 dark:from-purple-500 dark:to-purple-600 px-6 py-3.5 rounded-2xl font-bold shadow-lg shadow-purple-500/50">
                  <span className="text-white text-sm">LP</span>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setState(prev => ({ ...prev, lpTokenAmount: (parseFloat(state.userLpBalance) * 0.25).toFixed(6) }))}
                  className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-bold transition-colors"
                  disabled={state.isProcessing}
                >
                  25%
                </button>
                <button
                  onClick={() => setState(prev => ({ ...prev, lpTokenAmount: (parseFloat(state.userLpBalance) * 0.5).toFixed(6) }))}
                  className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-bold transition-colors"
                  disabled={state.isProcessing}
                >
                  50%
                </button>
                <button
                  onClick={() => setState(prev => ({ ...prev, lpTokenAmount: (parseFloat(state.userLpBalance) * 0.75).toFixed(6) }))}
                  className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-bold transition-colors"
                  disabled={state.isProcessing}
                >
                  75%
                </button>
                <button
                  onClick={() => setState(prev => ({ ...prev, lpTokenAmount: state.userLpBalance }))}
                  className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-bold transition-colors"
                  disabled={state.isProcessing}
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Expected Output */}
            {state.lpTokenAmount && parseFloat(state.lpTokenAmount) > 0 && (
              <div className="rounded-xl p-4 mb-6" style={{
                border: `1px solid var(--border-color)`,
                backgroundColor: 'var(--bg-surface)'
              }}>
                <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                  You will receive:
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span style={{ color: 'var(--text-secondary)' }}>{state.tokenA?.symbol}</span>
                    <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{state.amountA || '0.00'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span style={{ color: 'var(--text-secondary)' }}>{state.tokenB?.symbol}</span>
                    <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{state.amountB || '0.00'}</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Gasless Mode Toggle */}
        <div className="rounded-lg p-4 mb-6" style={{
          border: `1px solid var(--border-color)`,
          backgroundColor: 'rgba(16, 185, 129, 0.05)'
        }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{
                backgroundColor: 'rgba(16, 185, 129, 0.1)'
              }}>
                <Zap className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Gasless Mode</span>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Pay fees in USDCx</p>
              </div>
            </div>
            <button
              onClick={() => setState(prev => ({ ...prev, gaslessMode: !prev.gaslessMode }))}
              className={`relative w-14 h-7 rounded-full transition-all ${
                state.gaslessMode ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-700'
              }`}
              disabled={state.isProcessing}
            >
              <div
                className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${
                  state.gaslessMode ? 'translate-x-7' : ''
                }`}
              />
            </button>
          </div>
        </div>

        {/* Error Message */}
        {state.error && (
          <div className="flex items-start gap-3 bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-6">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 font-medium">{state.error}</p>
          </div>
        )}

        {/* Success Message */}
        {state.success && (
          <div className="flex items-start gap-3 rounded-xl p-4 mb-6 border" style={{
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderColor: 'var(--success-color)',
            color: 'var(--success-color)'
          }}>
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--success-color)' }} />
            <p className="text-sm font-medium">{state.success}</p>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={state.mode === 'add' ? handleAddLiquidity : handleRemoveLiquidity}
          disabled={!stacksConnected || state.isProcessing || (state.mode === 'add' ? (!state.amountA || !state.amountB) : !state.lpTokenAmount)}
          className="w-full bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 dark:from-purple-600 dark:via-blue-600 dark:to-purple-600 hover:from-purple-700 hover:via-blue-700 hover:to-purple-700 text-white font-bold py-4 rounded-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-2xl shadow-purple-500/30 dark:shadow-purple-500/50 hover:shadow-purple-500/50 dark:hover:shadow-purple-500/70 hover:scale-[1.02] active:scale-[0.98]"
        >
          {state.isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : !stacksConnected ? (
            'Connect Stacks Wallet'
          ) : state.mode === 'add' ? (
            <>
              <Plus className="w-5 h-5" />
              Add Liquidity
            </>
          ) : (
            <>
              <Minus className="w-5 h-5" />
              Remove Liquidity
            </>
          )}
        </button>

        {/* Info */}
        <div className="mt-6 pt-6 text-xs text-center space-y-1" style={{ 
          borderTop: `1px solid var(--border-color)`,
          color: 'var(--text-secondary)'
        }}>
          <p className="flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 bg-purple-600 dark:bg-purple-400 rounded-full dark:animate-pulse-glow animate-slide-progress"></span>
            Earn 0.3% fees on all swaps
          </p>
          <p>LP tokens represent your share of the pool</p>
        </div>
      </div>
      )}

      {/* Pool Analytics Modal */}
      {state.showPoolAnalytics && state.selectedPoolForSwap && (
        <PoolAnalytics
          pool={state.selectedPoolForSwap}
          onClose={() => setState(prev => ({ ...prev, showPoolAnalytics: false }))}
        />
      )}

      {/* Pool Browser Modal */}
      {state.showPoolBrowser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="rounded-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden shadow-2xl" style={{
            backgroundColor: 'var(--bg-surface)',
            border: `1px solid var(--border-color)`
          }}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <div>
                <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  Browse Liquidity Pools
                </h3>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Select a pool to add or remove liquidity
                </p>
              </div>
              <button
                onClick={() => setState(prev => ({ ...prev, showPoolBrowser: false }))}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                disabled={state.loadingPools}
              >
                <X className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>

            {/* Search and Filter Controls */}
            <div className="p-6 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Search Input */}
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                    <input
                      type="text"
                      value={state.poolSearchQuery}
                      onChange={(e) => setState(prev => ({ ...prev, poolSearchQuery: e.target.value }))}
                      placeholder="Search pools by token name or symbol..."
                      className="w-full pl-10 pr-4 py-3 rounded-xl outline-none transition-all"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        border: `2px solid var(--border-color)`,
                        color: 'var(--text-primary)'
                      }}
                    />
                  </div>
                </div>

                {/* Sort Controls */}
                <div className="flex gap-2">
                  <select
                    value={state.poolSortBy}
                    onChange={(e) => setState(prev => ({ ...prev, poolSortBy: e.target.value as any }))}
                    className="px-4 py-3 rounded-xl outline-none transition-all"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      border: `2px solid var(--border-color)`,
                      color: 'var(--text-primary)'
                    }}
                  >
                    <option value="tvl">Sort by TVL</option>
                    <option value="apr">Sort by APR</option>
                    <option value="volume">Sort by Volume</option>
                    <option value="name">Sort by Name</option>
                  </select>
                  <button
                    onClick={() => setState(prev => ({ 
                      ...prev, 
                      poolSortOrder: prev.poolSortOrder === 'asc' ? 'desc' : 'asc' 
                    }))}
                    className="px-4 py-3 rounded-xl transition-all hover:bg-gray-100 dark:hover:bg-gray-800"
                    style={{ border: `2px solid var(--border-color)` }}
                  >
                    {state.poolSortOrder === 'asc' ? '↑' : '↓'}
                  </button>
                </div>
              </div>

              {/* Pool Count */}
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {state.loadingPools ? 'Loading pools...' : `${state.filteredPools.length} pools found`}
                </p>
                <button
                  onClick={fetchAvailablePools}
                  disabled={state.loadingPools}
                  className="text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-semibold transition-colors disabled:opacity-50"
                >
                  {state.loadingPools ? (
                    <>
                      <Loader2 className="w-4 h-4 inline mr-1 animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    'Refresh'
                  )}
                </button>
              </div>
            </div>

            {/* Pool List */}
            <div className="max-h-96 overflow-y-auto">
              {state.loadingPools ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-600 dark:text-purple-400" />
                </div>
              ) : state.filteredPools.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    No pools found
                  </p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {state.poolSearchQuery ? 'Try adjusting your search query' : 'No liquidity pools are available yet'}
                  </p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                  {state.filteredPools.map((pool) => {
                    const analytics = state.poolAnalytics[pool.id];
                    return (
                      <div
                        key={pool.id}
                        onClick={() => selectPoolFromBrowser(pool)}
                        className="p-6 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-all"
                      >
                        <div className="flex items-center justify-between">
                          {/* Pool Info */}
                          <div className="flex items-center gap-4">
                            <div className="flex items-center -space-x-2">
                              {/* Token A Logo */}
                              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-purple-700 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                                {pool.tokenA.symbol.charAt(0)}
                              </div>
                              {/* Token B Logo */}
                              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-600 to-blue-700 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                                {pool.tokenB.symbol.charAt(0)}
                              </div>
                            </div>
                            <div>
                              <h4 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                                {pool.tokenA.symbol} / {pool.tokenB.symbol}
                              </h4>
                              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                {pool.tokenA.name} • {pool.tokenB.name}
                              </p>
                            </div>
                          </div>

                          {/* Pool Metrics */}
                          <div className="flex items-center gap-6 text-right">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                                TVL
                              </p>
                              <p className="font-bold" style={{ color: 'var(--text-primary)' }}>
                                {formatCurrency(analytics?.tvl || pool.tvl)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                                APR
                              </p>
                              <p className="font-bold text-green-600 dark:text-green-400">
                                {formatPercentage(analytics?.apr || pool.apr)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                                24h Volume
                              </p>
                              <p className="font-bold" style={{ color: 'var(--text-primary)' }}>
                                {formatCurrency(analytics?.volume24h || pool.volume24h)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                                24h Fees
                              </p>
                              <p className="font-bold text-purple-600 dark:text-purple-400">
                                {formatCurrency(analytics?.feeEarnings24h || pool.feeEarnings24h)}
                              </p>
                            </div>
                            
                            {/* Analytics Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setState(prev => ({ 
                                  ...prev, 
                                  selectedPoolForSwap: pool,
                                  showPoolAnalytics: true 
                                }));
                              }}
                              className="px-3 py-2 rounded-lg text-xs font-semibold transition-all bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex items-center gap-1"
                              title="View detailed analytics"
                            >
                              <BarChart3 className="w-4 h-4" />
                              Analytics
                            </button>
                          </div>
                        </div>

                        {/* Additional Pool Info */}
                        <div className="mt-4 flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                          <div className="flex items-center gap-4">
                            <span>
                              Reserve A: {Number(pool.reserveA) / Math.pow(10, pool.tokenA.decimals)} {pool.tokenA.symbol}
                            </span>
                            <span>
                              Reserve B: {Number(pool.reserveB) / Math.pow(10, pool.tokenB.decimals)} {pool.tokenB.symbol}
                            </span>
                          </div>
                          <span>
                            Created: {pool.createdAt.toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center justify-between">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Click on a pool to select it for liquidity operations
                </p>
                <button
                  onClick={() => setState(prev => ({ ...prev, showPoolBrowser: false }))}
                  className="px-6 py-2 rounded-lg font-semibold transition-all hover:bg-gray-100 dark:hover:bg-gray-800"
                  style={{
                    border: `1px solid var(--border-color)`,
                    color: 'var(--text-secondary)'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Token Modal */}
      {state.showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="rounded-2xl max-w-md w-full p-6 shadow-2xl" style={{
            backgroundColor: 'var(--bg-surface)',
            border: `1px solid var(--border-color)`
          }}>
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Import Token
              </h3>
              <button
                onClick={closeImportModal}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                disabled={state.isProcessing}
              >
                <X className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>

            {/* Token Address Input */}
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Token Contract Address
              </label>
              <input
                type="text"
                value={state.importAddress}
                onChange={(e) => setState(prev => ({ ...prev, importAddress: e.target.value, error: null }))}
                placeholder="PRINCIPAL.CONTRACT-NAME"
                className="w-full px-4 py-3 rounded-xl outline-none transition-all font-mono text-sm"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  border: `2px solid var(--border-color)`,
                  color: 'var(--text-primary)'
                }}
                disabled={state.isProcessing}
                autoFocus
              />
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Example: ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.my-token
              </p>
            </div>

            {/* Warning */}
            <div className="rounded-lg p-3 mb-4" style={{
              backgroundColor: 'rgba(251, 191, 36, 0.1)',
              border: `1px solid rgba(251, 191, 36, 0.3)`
            }}>
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-700 dark:text-yellow-300">
                  Anyone can create a token with any name. Always verify the contract address before trading.
                </p>
              </div>
            </div>

            {/* Error Message */}
            {state.error && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 dark:text-red-300">{state.error}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={closeImportModal}
                className="flex-1 px-4 py-3 rounded-xl font-semibold transition-all hover:bg-gray-100 dark:hover:bg-gray-800"
                style={{
                  border: `1px solid var(--border-color)`,
                  color: 'var(--text-secondary)'
                }}
                disabled={state.isProcessing}
              >
                Cancel
              </button>
              <button
                onClick={handleImportToken}
                disabled={state.isProcessing || !state.importAddress.trim()}
                className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {state.isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Import
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
