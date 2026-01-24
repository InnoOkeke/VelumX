/**
 * LiquidityInterface Component
 * UI for adding and removing liquidity from AMM pools
 */

'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '../lib/hooks/useWallet';
import { useConfig } from '../lib/config';
import { Plus, Minus, Loader2, Info, Search, X, BarChart3, Settings, Droplets, Zap, CheckCircle, AlertCircle } from 'lucide-react';
import { formatUnits, parseUnits } from 'viem';
import { getStacksTransactions, getStacksNetwork, getStacksCommon, getStacksConnect } from '../lib/stacks-loader';
import { PoolAnalytics as PoolAnalyticsComp } from './PoolAnalytics';
import { PositionDashboard } from './PositionDashboard';
import { AddLiquidityForm } from './ui/AddLiquidityForm';
import { RemoveLiquidityForm } from './ui/RemoveLiquidityForm';
import { PoolBrowserModal } from './ui/PoolBrowserModal';
import { ImportTokenModal } from './ui/ImportTokenModal';
import { Modal } from './ui/Modal';

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
  // Settings
  showSettings: boolean;
  slippage: number;
}

// Default tokens for testnet
const DEFAULT_TOKENS: Token[] = [
  {
    symbol: 'STX',
    name: 'Stacks',
    address: 'STX',
    decimals: 6,
  },
  {
    symbol: 'USDCx',
    name: 'USDC (xReserve)',
    address: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx',
    decimals: 6,
  },
  {
    symbol: 'VEX',
    name: 'VelumX Token',
    address: 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.vextoken-v1', // Will be filled from config
    decimals: 6,
  },
];

const STX_SENTINEL = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';

// Helper to sort tokens matching the contract logic
const sortTokens = (tokenA: string, tokenB: string) => {
  const pA = tokenA === 'STX' ? STX_SENTINEL : tokenA;
  const pB = tokenB === 'STX' ? STX_SENTINEL : tokenB;
  return pA < pB ? { a: pA, b: pB, isReversed: false } : { a: pB, b: pA, isReversed: true };
};

export function LiquidityInterface() {
  const { stacksAddress, stacksConnected, balances, fetchBalances } = useWallet();
  const config = useConfig();

  const [tokens, setTokens] = useState<Token[]>(DEFAULT_TOKENS);
  const [state, setState] = useState<LiquidityState>({
    mode: 'add',
    tokenA: DEFAULT_TOKENS[0], // STX
    tokenB: DEFAULT_TOKENS[1], // USDCx
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
    // Settings
    showSettings: false,
    slippage: 0.5
  });

  // Replaced STX address overwrite with static sentinel usage in contract calls

  // Initialize VEX token from config
  useEffect(() => {
    if (config.stacksVexAddress) {
      setTokens(prev => {
        if (!prev || !Array.isArray(prev)) return prev || [];
        return prev.map(t =>
          t.symbol === 'VEX' ? { ...t, address: config.stacksVexAddress } : t
        );
      });
    }
  }, [config.stacksVexAddress]);

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

      if (data.success && data.data && Array.isArray(data.data)) {
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
        setState(prev => ({
          ...prev,
          availablePools: [],
          loadingPools: false,
        }));
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
      if (!pools || !Array.isArray(pools)) return;
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

      if (!Array.isArray(analyticsResults)) return;

      analyticsResults.forEach(result => {
        if (result && typeof result === 'object' && 'poolId' in result) {
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
    let poolsToFilter = Array.isArray(state.availablePools) ? [...state.availablePools] : [];
    let filtered = poolsToFilter;

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
    if (Array.isArray(filtered)) {
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
        const transactions = await getStacksTransactions() as any;
        if (!transactions) return;

        const [contractAddress, contractName] = config.stacksSwapContractAddress.split('.');

        const { a, b } = sortTokens(state.tokenA.address, state.tokenB.address);

        // Get pool reserves
        const poolResult = await transactions.fetchCallReadOnlyFunction({
          contractAddress,
          contractName,
          functionName: 'get-pool-reserves',
          functionArgs: [
            transactions.principalCV(a),
            transactions.principalCV(b),
          ],
          network: 'testnet',
          senderAddress: stacksAddress,
        });

        const poolJson = transactions.cvToJSON(poolResult);

        if (poolJson.success && poolJson.value) {
          const poolData = poolJson.value.value;
          const rawReserveA = Number(poolData['reserve-a'].value);
          const rawReserveB = Number(poolData['reserve-b'].value);
          const totalSupply = Number(poolData['total-supply'].value);

          // Pool exists if reserves are non-zero
          const poolExists = rawReserveA > 0 && rawReserveB > 0;

          // Get user LP balance
          const lpResult = await transactions.fetchCallReadOnlyFunction({
            contractAddress,
            contractName,
            functionName: 'get-lp-balance',
            functionArgs: [
              transactions.principalCV(a),
              transactions.principalCV(b),
              transactions.principalCV(stacksAddress),
            ],
            network: 'testnet',
            senderAddress: stacksAddress,
          });

          const lpJson = transactions.cvToJSON(lpResult);
          const userLpBalanceRaw = lpJson.success && lpJson.value ? Number(lpJson.value.value) : 0;
          const userLpBalance = (userLpBalanceRaw / Math.pow(10, 6)).toFixed(6);

          // Local calculation of pool share percentage
          let poolShare = '0';
          if (totalSupply > 0 && userLpBalanceRaw > 0) {
            poolShare = ((userLpBalanceRaw / totalSupply) * 100).toFixed(2);
          }

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
        const transactions = await getStacksTransactions() as any;
        if (!transactions) return;

        const [contractAddress, contractName] = config.stacksSwapContractAddress.split('.');

        // Get pool reserves
        const poolResult = await transactions.fetchCallReadOnlyFunction({
          contractAddress,
          contractName,
          functionName: 'get-pool-reserves',
          functionArgs: [
            transactions.principalCV(state.tokenA.address),
            transactions.principalCV(state.tokenB.address),
          ],
          network: 'testnet',
          senderAddress: stacksAddress || contractAddress,
        });

        const poolJson = transactions.cvToJSON(poolResult);

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
        const transactions = await getStacksTransactions() as any;
        const network = await getStacksNetwork() as any;
        const common = await getStacksCommon() as any;
        if (!transactions || !network || !common) throw new Error('Stacks libraries not loaded');

        const amountAMicro = parseUnits(state.amountA, state.tokenA.decimals);
        const amountBMicro = parseUnits(state.amountB, state.tokenB.decimals);

        const slippageFactor = 1 - (state.slippage / 100);
        const minAmountAMicro = parseUnits((parseFloat(state.amountA) * slippageFactor).toFixed(6), state.tokenA.decimals);
        const minAmountBMicro = parseUnits((parseFloat(state.amountB) * slippageFactor).toFixed(6), state.tokenB.decimals);

        const isTokenAStx = state.tokenA.symbol === 'STX';
        const isTokenBStx = state.tokenB.symbol === 'STX';
        const isStxPool = isTokenAStx || isTokenBStx;
        const useGasless = state.gaslessMode;

        const contractAddress = useGasless
          ? config.stacksPaymasterAddress.split('.')[0]
          : config.stacksSwapContractAddress.split('.')[0];
        const contractName = useGasless
          ? config.stacksPaymasterAddress.split('.')[1]
          : config.stacksSwapContractAddress.split('.')[1];

        const gasFee = 10000;
        let functionName = 'add-liquidity';
        let functionArgs = [];

        if (isStxPool) {
          functionName = useGasless ? 'add-liquidity-stx-gasless' : 'add-liquidity-stx';
          const stxAmount = isTokenAStx ? amountAMicro : amountBMicro;
          const tokenAmount = isTokenAStx ? amountBMicro : amountAMicro;
          const stxMin = isTokenAStx ? minAmountAMicro : minAmountBMicro;
          const tokenMin = isTokenAStx ? minAmountBMicro : minAmountAMicro;
          const tokenToken = isTokenAStx ? state.tokenB : state.tokenA;
          if (!tokenToken) throw new Error('Token not found');
          const tokenParts = tokenToken.address.split('.');

          functionArgs = [
            transactions.contractPrincipalCV(tokenParts[0], tokenParts[1]),
            transactions.uintCV(stxAmount),
            transactions.uintCV(tokenAmount),
            transactions.uintCV(stxMin),
            transactions.uintCV(tokenMin),
          ];
          if (useGasless) functionArgs.push(transactions.uintCV(gasFee));
        } else if (useGasless) {
          functionName = 'add-liquidity-gasless';
          const tokenAParts = state.tokenA.address.split('.');
          const tokenBParts = state.tokenB.address.split('.');
          functionArgs = [
            transactions.contractPrincipalCV(tokenAParts[0], tokenAParts[1]),
            transactions.contractPrincipalCV(tokenBParts[0], tokenBParts[1]),
            transactions.uintCV(amountAMicro),
            transactions.uintCV(amountBMicro),
            transactions.uintCV(minAmountAMicro),
            transactions.uintCV(minAmountBMicro),
            transactions.uintCV(gasFee),
          ];
        } else {
          functionName = 'add-liquidity';
          const tokenAParts = state.tokenA.address.split('.');
          const tokenBParts = state.tokenB.address.split('.');
          functionArgs = [
            transactions.contractPrincipalCV(tokenAParts[0], tokenAParts[1]),
            transactions.contractPrincipalCV(tokenBParts[0], tokenBParts[1]),
            transactions.uintCV(amountAMicro),
            transactions.uintCV(amountBMicro),
            transactions.uintCV(minAmountAMicro),
            transactions.uintCV(minAmountBMicro),
          ];
        }

        if (useGasless) {
          const transactions = await getStacksTransactions() as any;
          const network = await getStacksNetwork() as any;
          const common = await getStacksCommon() as any;
          if (!transactions || !network || !common) throw new Error('Stacks libraries not loaded');

          // Step 1: Build unsigned sponsored transaction
          const tx = await transactions.makeContractCall({
            contractAddress: contractAddress,
            contractName: contractName,
            functionName: functionName,
            functionArgs: functionArgs,
            senderAddress: stacksAddress,
            network: network.STACKS_TESTNET,
            anchorMode: transactions.AnchorMode.Any,
            postConditionMode: 0x01 as any,
            postConditions: [],
            sponsored: true,
          } as any);

          const txHex = common.bytesToHex(tx.serialize() as any);

          // Step 2: Request user signature via wallet RPC (without broadcast)
          const getProvider = () => {
            if (typeof window === 'undefined') return null;
            const win = window as any;
            // Prefer universal injection, then specific ones
            const p = win.stx?.request ? win.stx : (win.StacksProvider || win.LeatherProvider || win.XverseProvider);
            return p && typeof p === 'object' ? p : null;
          };

          const provider = getProvider();
          if (!provider || typeof provider.request !== 'function') {
            throw new Error('No compatible Stacks wallet found. Please install Leather or Xverse.');
          }

          const requestParams = {
            transaction: txHex,
            broadcast: false,
            network: 'testnet',
          };

          const response = await provider.request({
            method: 'stx_signTransaction',
            params: requestParams
          });

          if (!response || !response.result || !response.result.transaction) {
            throw new Error('Wallet failed to sign the transaction. Please try again.');
          }

          const signedTxHex = response.result.transaction;

          // Step 3: send to backend relayer
          const sponsorResponse = await fetch(`${config.backendUrl}/api/paymaster/sponsor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transaction: signedTxHex,
              userAddress: stacksAddress,
              estimatedFee: gasFee.toString(),
            }),
          });

          const sponsorData = await sponsorResponse.json();
          if (!sponsorData.success) {
            throw new Error(sponsorData.message || 'Sponsorship failed');
          }
        } else {
          const network = await getStacksNetwork() as any;
          const connect = await getStacksConnect() as any;
          if (!network || !connect) throw new Error('Stacks libraries not loaded');

          // Step 2: Handle regular transaction (signed by user, self-broadcast)
          await new Promise<string>((resolve, reject) => {
            connect.openContractCall({
              contractAddress,
              contractName,
              functionName,
              functionArgs,
              network: network.STACKS_TESTNET as any,
              postConditionMode: 0x01 as any,
              sponsored: false,
              appDetails: {
                name: 'VelumX DEX',
                icon: typeof window !== 'undefined' ? window.location.origin + '/favicon.ico' : '',
              },
              onFinish: async (data: any) => {
                resolve(data.txId);
              },
              onCancel: () => {
                reject(new Error('User cancelled transaction'));
              },
            } as any);
          });
        }

        setState(prev => ({
          ...prev,
          isProcessing: false,
          success: `Liquidity added successfully!`,
          amountA: '',
          amountB: '',
        }));

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

    const calculateRemoveAmounts = async () => {
      if (!state.tokenA || !state.tokenB || !state.lpTokenAmount || !stacksAddress) return;

      try {
        const [contractAddress, contractName] = config.stacksSwapContractAddress.split('.');
        const { a, b, isReversed } = sortTokens(state.tokenA.address, state.tokenB.address);

        const transactions = await getStacksTransactions() as any;
        if (!transactions) return;

        const poolResult = await transactions.fetchCallReadOnlyFunction({
          contractAddress,
          contractName,
          functionName: 'get-pool-reserves',
          functionArgs: [
            transactions.principalCV(a),
            transactions.principalCV(b),
          ],
          network: 'testnet',
          senderAddress: stacksAddress,
        });

        const poolJson = transactions.cvToJSON(poolResult);

        if (poolJson.success && poolJson.value) {
          const poolData = poolJson.value.value;
          const reserveA = Number(poolData['reserve-a'].value);
          const reserveB = Number(poolData['reserve-b'].value);
          const totalSupply = Number(poolData['total-supply'].value);

          // UI tokenA matches contract token-a if not reversed
          const resA = isReversed ? reserveB : reserveA;
          const resB = isReversed ? reserveA : reserveB;

          const lpAmountMicro = parseFloat(state.lpTokenAmount) * Math.pow(10, 6);
          const amountAMicro = (lpAmountMicro * resA) / totalSupply;
          const amountBMicro = (lpAmountMicro * resB) / totalSupply;

          const amountA = (amountAMicro / Math.pow(10, state.tokenA.decimals)).toFixed(6);
          const amountB = (amountBMicro / Math.pow(10, state.tokenB.decimals)).toFixed(6);

          setState(prev => ({ ...prev, amountA, amountB }));
        }
      } catch (error) {
        console.error('Failed to calculate remove amounts:', error);
      }
    };

    useEffect(() => {
      if (state.mode === 'remove' && state.lpTokenAmount && parseFloat(state.lpTokenAmount) > 0 && state.poolExists) {
        calculateRemoveAmounts();
      }
    }, [state.lpTokenAmount, state.mode, state.poolExists]);

    const handleRemoveLiquidity = async () => {
      if (!stacksAddress || !state.tokenA || !state.tokenB) {
        setState(prev => ({ ...prev, error: 'Please connect wallet and select tokens' }));
        return;
      }

      if (!state.lpTokenAmount || parseFloat(state.lpTokenAmount) <= 0) {
        setState(prev => ({ ...prev, error: 'Please enter valid LP token amount' }));
        return;
      }

      setState(prev => ({ ...prev, isProcessing: true, error: null, success: null }));

      try {
        const transactions = await getStacksTransactions() as any;
        const network = await getStacksNetwork() as any;
        const common = await getStacksCommon() as any;
        if (!transactions || !network || !common) throw new Error('Stacks libraries not loaded');

        const lpTokenAmountMicro = parseUnits(state.lpTokenAmount, 6);
        const slippageFactor = 1 - (state.slippage / 100);
        const minAmountAMicro = parseUnits((parseFloat(state.amountA || '0') * slippageFactor).toFixed(6), state.tokenA.decimals);
        const minAmountBMicro = parseUnits((parseFloat(state.amountB || '0') * slippageFactor).toFixed(6), state.tokenB.decimals);

        const isTokenAStx = state.tokenA.symbol === 'STX';
        const isTokenBStx = state.tokenB.symbol === 'STX';
        const isStxPool = isTokenAStx || isTokenBStx;
        const gaslessMode = state.gaslessMode;

        const contractAddress = gaslessMode
          ? config.stacksPaymasterAddress.split('.')[0]
          : config.stacksSwapContractAddress.split('.')[0];
        const contractName = gaslessMode
          ? config.stacksPaymasterAddress.split('.')[1]
          : config.stacksSwapContractAddress.split('.')[1];

        const gasFee = gaslessMode ? 10000 : 0;

        let functionArgs = [];

        if (isStxPool) {
          const tokenToken = isTokenAStx ? state.tokenB : state.tokenA;
          if (!tokenToken) throw new Error('Token not found');
          const tokenParts = tokenToken.address.split('.');
          const minStx = isTokenAStx ? minAmountAMicro : minAmountBMicro;
          const minToken = isTokenAStx ? minAmountBMicro : minAmountAMicro;

          functionArgs = [
            transactions.contractPrincipalCV(tokenParts[0], tokenParts[1]),
            transactions.uintCV(lpTokenAmountMicro),
            transactions.uintCV(minStx),
            transactions.uintCV(minToken),
          ];
          if (gaslessMode) functionArgs.push(transactions.uintCV(gasFee));
        } else {
          const tokenAParts = state.tokenA.address.split('.');
          const tokenBParts = state.tokenB.address.split('.');
          functionArgs = gaslessMode
            ? [
              transactions.contractPrincipalCV(tokenAParts[0], tokenAParts[1]),
              transactions.contractPrincipalCV(tokenBParts[0], tokenBParts[1]),
              transactions.uintCV(lpTokenAmountMicro),
              transactions.uintCV(minAmountAMicro),
              transactions.uintCV(minAmountBMicro),
              transactions.uintCV(gasFee),
            ]
            : [
              transactions.contractPrincipalCV(tokenAParts[0], tokenAParts[1]),
              transactions.contractPrincipalCV(tokenBParts[0], tokenBParts[1]),
              transactions.uintCV(lpTokenAmountMicro),
              transactions.uintCV(minAmountAMicro),
              transactions.uintCV(minAmountBMicro),
            ];
        }

        if (gaslessMode) {
          const transactions = await getStacksTransactions() as any;
          const network = await getStacksNetwork() as any;
          const common = await getStacksCommon() as any;
          if (!transactions || !network || !common) throw new Error('Stacks libraries not loaded');

          // Step 1: Build unsigned sponsored transaction
          const tx = await transactions.makeContractCall({
            contractAddress: contractAddress,
            contractName: contractName,
            functionName: isStxPool ? 'remove-liquidity-stx-gasless' : 'remove-liquidity-gasless',
            functionArgs: functionArgs,
            senderAddress: stacksAddress,
            network: network.STACKS_TESTNET,
            anchorMode: transactions.AnchorMode.Any,
            postConditionMode: 0x01 as any,
            postConditions: [],
            sponsored: true,
          } as any);

          const txHex = common.bytesToHex(tx.serialize() as any);

          // Step 2: Request user signature via wallet RPC (without broadcast)
          const getProvider = () => {
            if (typeof window === 'undefined') return null;
            const win = window as any;
            // Prefer universal injection, then specific ones
            const p = win.stx?.request ? win.stx : (win.StacksProvider || win.LeatherProvider || win.XverseProvider);
            return p && typeof p === 'object' ? p : null;
          };

          const provider = getProvider();
          if (!provider || typeof provider.request !== 'function') {
            throw new Error('No compatible Stacks wallet found. Please install Leather or Xverse.');
          }

          const requestParams = {
            transaction: txHex,
            broadcast: false,
            network: 'testnet',
          };

          const response = await provider.request({
            method: 'stx_signTransaction',
            params: requestParams
          });

          if (!response || !response.result || !response.result.transaction) {
            throw new Error('Wallet failed to sign the transaction. Please try again.');
          }

          const signedTxHex = response.result.transaction;

          // Step 3: Send to backend relayer
          const sponsorResponse = await fetch(`${config.backendUrl}/api/paymaster/sponsor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transaction: signedTxHex,
              userAddress: stacksAddress,
              estimatedFee: gasFee.toString(),
            }),
          });
          const sponsorData = await sponsorResponse.json();
          if (!sponsorData.success) {
            throw new Error(sponsorData.message || 'Sponsorship failed');
          }
        } else {
          // Standard flow
          const network = await getStacksNetwork() as any;
          const connect = await getStacksConnect() as any;
          if (!network || !connect) throw new Error('Stacks libraries not loaded');

          await new Promise<string>((resolve, reject) => {
            connect.openContractCall({
              contractAddress,
              contractName,
              functionName: isStxPool ? 'remove-liquidity-stx' : 'remove-liquidity',
              functionArgs,
              network: network.STACKS_TESTNET as any,
              postConditionMode: 0x01 as any,
              sponsored: false,
              appDetails: {
                name: 'VelumX DEX',
                icon: typeof window !== 'undefined' ? window.location.origin + '/favicon.ico' : '',
              },
              onFinish: async (data: any) => {
                resolve(data.txId);
              },
              onCancel: () => {
                reject(new Error('User cancelled transaction'));
              },
            });
          });
        }

        setState(prev => ({
          ...prev,
          isProcessing: false,
          success: `Liquidity removed successfully!`,
          lpTokenAmount: '',
          amountA: '',
          amountB: '',
        }));

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
      if (token.symbol === 'VEX') return balances.vex || '0';
      return '0';
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
      const parts = address.split('.');
      if (parts.length !== 2) return false;
      const principal = parts[0];
      if (!principal.match(/^(ST|SP)[0-9A-Z]{38,41}$/)) return false;
      const contractName = parts[1];
      if (!contractName.match(/^[a-z][a-z0-9-]{0,39}$/)) return false;
      return true;
    };

    const handleImportToken = async () => {
      if (!state.importAddress.trim()) {
        setState(prev => ({ ...prev, error: 'Please enter a token address' }));
        return;
      }

      if (!validateStacksContractAddress(state.importAddress.trim())) {
        setState(prev => ({
          ...prev,
          error: 'Invalid Stacks contract address. Format: PRINCIPAL.CONTRACT-NAME'
        }));
        return;
      }

      const existingToken = tokens.find(t => t.address.toLowerCase() === state.importAddress.trim().toLowerCase());
      if (existingToken) {
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
        const parts = state.importAddress.trim().split('.');
        const contractName = parts[1];

        const newToken: Token = {
          symbol: contractName.toUpperCase().substring(0, 6),
          name: contractName,
          address: state.importAddress.trim(),
          decimals: 6,
        };

        setTokens(prev => [...prev, newToken]);

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
      <div className="max-w-4xl mx-auto py-8">
        {/* Analytics Modal */}
        {state.showPoolAnalytics && state.selectedPoolForSwap && (
          <PoolAnalyticsComp
            pool={state.selectedPoolForSwap}
            onClose={() => setState(prev => ({ ...prev, showPoolAnalytics: false }))}
          />
        )}

        {/* Interface Toggle */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-2xl gap-2">
            <button
              onClick={() => setState(prev => ({ ...prev, activeTab: 'liquidity' }))}
              className={`px-8 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${state.activeTab === 'liquidity'
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              style={state.activeTab !== 'liquidity' ? {
                backgroundColor: 'rgba(var(--bg-primary-rgb), 0.5)',
                color: 'var(--text-primary)',
                border: `1px solid var(--border-color)`
              } : {}}
            >
              Manage Pools
            </button>
            <button
              onClick={() => setState(prev => ({ ...prev, activeTab: 'positions' }))}
              className={`px-8 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${state.activeTab === 'positions'
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              style={state.activeTab !== 'positions' ? {
                backgroundColor: 'rgba(var(--bg-primary-rgb), 0.5)',
                color: 'var(--text-primary)',
                border: `1px solid var(--border-color)`
              } : {}}
            >
              My Positions
            </button>
          </div>
        </div>

        {state.activeTab === 'positions' ? (
          <div className="vellum-shadow-xl rounded-[2.5rem] bg-white dark:bg-gray-900 overflow-hidden border border-gray-200 dark:border-gray-800">
            <PositionDashboard />
          </div>
        ) : (
          <div className="grid lg:grid-cols-5 gap-8 items-start px-4">
            {/* Main Action Form */}
            <div className="lg:col-span-3 vellum-shadow-xl rounded-[2.5rem] overflow-hidden" style={{
              backgroundColor: 'var(--bg-surface)',
              border: `1px solid var(--border-color)`
            }}>
              {state.mode === 'add' ? (
                <AddLiquidityForm
                  state={state}
                  setState={setState}
                  tokens={tokens}
                  getBalance={getBalance}
                  handleAddLiquidity={handleAddLiquidity}
                  stacksConnected={stacksConnected}
                  openPoolBrowser={() => setState(prev => ({ ...prev, showPoolBrowser: true }))}
                />
              ) : (
                <RemoveLiquidityForm
                  state={state}
                  setState={setState}
                  handleRemoveLiquidity={handleRemoveLiquidity}
                  stacksConnected={stacksConnected}
                />
              )}
            </div>

            {/* Side Panels */}
            <div className="lg:col-span-2 space-y-6">
              {/* Pool Statistics Quick Look */}
              <div className="rounded-[2rem] p-8 vellum-shadow-lg" style={{
                backgroundColor: 'var(--bg-surface)',
                border: `1px solid var(--border-color)`
              }}>
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <Info className="w-5 h-5 text-purple-600" />
                  Pool Details
                </h3>

                {!state.poolExists ? (
                  <div className="text-center py-6">
                    <p className="text-sm italic opacity-50" style={{ color: 'var(--text-secondary)' }}>
                      Select a pool or enter token pairs to view details
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50">
                      <p className="text-xs font-bold uppercase tracking-widest opacity-40 mb-1">Your Share</p>
                      <p className="text-2xl font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{state.poolShare}%</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50">
                      <p className="text-xs font-bold uppercase tracking-widest opacity-40 mb-1">LP Balance</p>
                      <p className="text-xl font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{state.userLpBalance}</p>
                    </div>
                    <button
                      onClick={() => setState(prev => ({ ...prev, mode: state.mode === 'add' ? 'remove' : 'add' }))}
                      className="w-full py-4 rounded-2xl font-bold transition-all border border-purple-500/20 text-purple-600 dark:text-purple-400 hover:bg-purple-500/5"
                    >
                      {state.mode === 'add' ? 'Switch to Withdraw' : 'Switch to Deposit'}
                    </button>
                  </div>
                )}
              </div>

              {/* Helper Tips */}
              <div className="rounded-[2rem] p-8 bg-gradient-to-br from-purple-600/5 to-blue-600/5 border border-purple-100 dark:border-purple-900/20">
                <h4 className="font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Why provide liquidity?</h4>
                <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--text-secondary)' }}>
                  Liquidity providers earn a 0.3% fee on all trades proportional to their share of the pool.
                </p>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 flex-shrink-0" />
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Earn passive income from trading activity</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Contribute to DEX market stability</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pool Browser Modal */}
        <PoolBrowserModal
          isOpen={state.showPoolBrowser}
          onClose={() => setState(prev => ({ ...prev, showPoolBrowser: false }))}
          state={state}
          setState={setState}
          fetchAvailablePools={fetchAvailablePools}
          selectPoolFromBrowser={selectPoolFromBrowser}
          formatCurrency={formatCurrency}
          formatPercentage={formatPercentage}
        />

        {/* Import Token Modal */}
        <ImportTokenModal
          isOpen={state.showImportModal}
          onClose={closeImportModal}
          importAddress={state.importAddress}
          setImportAddress={(val) => setState(prev => ({ ...prev, importAddress: val, error: null }))}
          handleImportToken={handleImportToken}
          isProcessing={state.isProcessing}
          error={state.error}
        />
      </div>
    );
  }
