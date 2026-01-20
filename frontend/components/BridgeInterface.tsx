/**
 * BridgeInterface Component
 * Main UI for bridging USDC between Ethereum and Stacks
 */

'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '../lib/hooks/useWallet';
import { useConfig, USDC_ABI, XRESERVE_ABI } from '../lib/config';
import { createWalletClient, createPublicClient, custom, http, parseUnits, formatUnits } from 'viem';
import { sepolia } from 'viem/chains';
import { ArrowDownUp, Loader2, AlertCircle, CheckCircle, Zap } from 'lucide-react';

type BridgeDirection = 'eth-to-stacks' | 'stacks-to-eth';

interface BridgeState {
  amount: string;
  direction: BridgeDirection;
  gaslessMode: boolean;
  isProcessing: boolean;
  error: string | null;
  success: string | null;
  feeEstimate: {
    stx: string;
    usdcx: string;
  } | null;
}

export function BridgeInterface() {
  const {
    ethereumAddress,
    ethereumConnected,
    stacksAddress,
    stacksConnected,
    balances,
    fetchBalances,
  } = useWallet();

  const config = useConfig();

  // Fetch balances when component mounts or wallets connect
  useEffect(() => {
    if ((ethereumConnected || stacksConnected) && fetchBalances) {
      fetchBalances();
    }
  }, [ethereumConnected, stacksConnected]);

  const [state, setState] = useState<BridgeState>({
    amount: '',
    direction: 'eth-to-stacks',
    gaslessMode: false,
    isProcessing: false,
    error: null,
    success: null,
    feeEstimate: null,
  });

  // Validate amount
  const validateAmount = (amount: string): string | null => {
    if (!amount || amount === '0') {
      return 'Please enter an amount';
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return 'Invalid amount';
    }

    // Check balance
    if (state.direction === 'eth-to-stacks') {
      const usdcBalance = parseFloat(balances.usdc);
      if (numAmount > usdcBalance) {
        return 'Insufficient USDC balance';
      }
    } else {
      const usdcxBalance = parseFloat(balances.usdcx);
      if (numAmount > usdcxBalance) {
        return 'Insufficient USDCx balance';
      }
    }

    return null;
  };

  // Fetch fee estimate for gasless mode
  const fetchFeeEstimate = async () => {
    if (!state.gaslessMode || state.direction !== 'stacks-to-eth') return;

    try {
      const response = await fetch(`${config.backendUrl}/api/paymaster/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estimatedGasInStx: '100000', // Estimated gas cost in microSTX
        }),
      });

      const data = await response.json();
      if (data.success) {
        setState(prev => ({
          ...prev,
          feeEstimate: {
            stx: formatUnits(BigInt(data.data.gasInStx), 6),
            usdcx: formatUnits(BigInt(data.data.gasInUsdcx), 6),
          },
        }));
      }
    } catch (error) {
      console.error('Failed to fetch fee estimate:', error);
    }
  };

  // Fetch fee estimate when gasless mode changes
  useEffect(() => {
    if (state.gaslessMode && state.direction === 'stacks-to-eth') {
      fetchFeeEstimate();
    } else {
      setState(prev => ({ ...prev, feeEstimate: null }));
    }
  }, [state.gaslessMode, state.direction]);

  // Switch direction
  const switchDirection = () => {
    setState(prev => ({
      ...prev,
      direction: prev.direction === 'eth-to-stacks' ? 'stacks-to-eth' : 'eth-to-stacks',
      error: null,
      success: null,
      gaslessMode: false,
    }));
  };

  // Encode Stacks address to bytes32
  const encodeStacksAddress = (address: string): `0x${string}` => {
    // Simple encoding: pad with zeros (production would use proper c32 decoding)
    // For testnet demo, we'll use a placeholder encoding
    const paddedAddress = address.padEnd(64, '0');
    return `0x${Buffer.from(paddedAddress).toString('hex').slice(0, 64)}` as `0x${string}`;
  };

  // Encode Ethereum address to bytes32
  const encodeEthereumAddress = (address: string): Buffer => {
    // Remove 0x prefix and pad to 32 bytes
    const cleanAddress = address.replace('0x', '');
    const paddedAddress = '0'.repeat(24) + cleanAddress;
    return Buffer.from(paddedAddress, 'hex');
  };

  // Handle Ethereum to Stacks deposit
  const handleEthToStacks = async () => {
    if (!ethereumAddress || !stacksAddress) {
      setState(prev => ({ ...prev, error: 'Please connect both wallets' }));
      return;
    }

    const validationError = validateAmount(state.amount);
    if (validationError) {
      setState(prev => ({ ...prev, error: validationError }));
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, error: null, success: null }));

    try {
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom((window as any).ethereum),
      });

      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(),
      });

      const amountInMicroUsdc = parseUnits(state.amount, 6);

      // Step 1: Check allowance
      const allowance = await publicClient.readContract({
        address: config.ethereumUsdcAddress as `0x${string}`,
        abi: USDC_ABI,
        functionName: 'allowance',
        args: [ethereumAddress as `0x${string}`, config.ethereumXReserveAddress as `0x${string}`],
      });

      // Step 2: Approve if needed
      if ((allowance as bigint) < amountInMicroUsdc) {
        const approveHash = await walletClient.writeContract({
          address: config.ethereumUsdcAddress as `0x${string}`,
          abi: USDC_ABI,
          functionName: 'approve',
          args: [config.ethereumXReserveAddress as `0x${string}`, amountInMicroUsdc],
          account: ethereumAddress as `0x${string}`,
        });

        // Wait for approval
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // Step 3: Deposit to xReserve
      const recipientBytes32 = encodeStacksAddress(stacksAddress);
      
      const depositHash = await walletClient.writeContract({
        address: config.ethereumXReserveAddress as `0x${string}`,
        abi: XRESERVE_ABI,
        functionName: 'depositToRemote',
        args: [
          amountInMicroUsdc,
          config.stacksDomainId,
          recipientBytes32,
          config.ethereumUsdcAddress as `0x${string}`,
          parseUnits('1', 6), // Max fee: 1 USDC
          '0x' as `0x${string}`, // Empty hook data
        ],
        account: ethereumAddress as `0x${string}`,
      });

      // Step 4: Submit to monitoring service
      await fetch(`${config.backendUrl}/api/transactions/monitor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: depositHash,
          type: 'deposit',
          sourceTxHash: depositHash,
          sourceChain: 'ethereum',
          destinationChain: 'stacks',
          amount: state.amount,
          sender: ethereumAddress,
          recipient: stacksAddress,
          status: 'pending',
          timestamp: Date.now(),
        }),
      });

      setState(prev => ({
        ...prev,
        isProcessing: false,
        success: `Deposit initiated! Transaction: ${depositHash}`,
        amount: '',
      }));
    } catch (error) {
      console.error('Deposit error:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: (error as Error).message || 'Failed to process deposit',
      }));
    }
  };

  // Handle Stacks to Ethereum withdrawal
  const handleStacksToEth = async () => {
    if (!ethereumAddress || !stacksAddress) {
      setState(prev => ({ ...prev, error: 'Please connect both wallets' }));
      return;
    }

    const validationError = validateAmount(state.amount);
    if (validationError) {
      setState(prev => ({ ...prev, error: validationError }));
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, error: null, success: null }));

    try {
      // Dynamic imports for Stacks libraries
      const { openContractCall } = await import('@stacks/connect');
      const { STACKS_TESTNET } = await import('@stacks/network');
      const { uintCV, bufferCV, PostConditionMode } = await import('@stacks/transactions');
      
      const amountInMicroUsdc = parseUnits(state.amount, 6);
      const recipientBytes = encodeEthereumAddress(ethereumAddress);

      // Determine which contract and function to call
      const contractAddress = state.gaslessMode 
        ? config.stacksPaymasterAddress.split('.')[0]
        : config.stacksUsdcxProtocolAddress.split('.')[0];
      
      const contractName = state.gaslessMode
        ? config.stacksPaymasterAddress.split('.')[1]
        : config.stacksUsdcxProtocolAddress.split('.')[1];

      const functionName = state.gaslessMode ? 'withdraw-gasless' : 'burn';
      
      const functionArgs = state.gaslessMode
        ? [
            uintCV(Number(amountInMicroUsdc)),
            uintCV(Number(parseUnits(state.feeEstimate?.usdcx || '0', 6))),
            bufferCV(recipientBytes),
          ]
        : [
            uintCV(Number(amountInMicroUsdc)),
            uintCV(0), // native-domain: 0 for Ethereum
            bufferCV(recipientBytes),
          ];

      await new Promise<string>((resolve, reject) => {
        openContractCall({
          contractAddress,
          contractName,
          functionName,
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
            
            // Submit to monitoring service
            await fetch(`${config.backendUrl}/api/transactions/monitor`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: txId,
                type: 'withdrawal',
                sourceTxHash: txId,
                sourceChain: 'stacks',
                destinationChain: 'ethereum',
                amount: state.amount,
                sender: stacksAddress,
                recipient: ethereumAddress,
                status: 'pending',
                timestamp: Date.now(),
                isGasless: state.gaslessMode,
                gasFeeInUsdcx: state.feeEstimate?.usdcx,
              }),
            });

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
        success: 'Withdrawal initiated! Check transaction history for status.',
        amount: '',
      }));
    } catch (error) {
      console.error('Withdrawal error:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: (error as Error).message || 'Failed to process withdrawal',
      }));
    }
  };

  // Handle bridge submission
  const handleBridge = async () => {
    if (state.direction === 'eth-to-stacks') {
      await handleEthToStacks();
    } else {
      await handleStacksToEth();
    }
  };

  const isConnected = state.direction === 'eth-to-stacks' 
    ? ethereumConnected && stacksConnected
    : stacksConnected && ethereumConnected;

  const sourceBalance = state.direction === 'eth-to-stacks' ? balances.usdc : balances.usdcx;
  const sourceToken = state.direction === 'eth-to-stacks' ? 'USDC' : 'USDCx';
  const destToken = state.direction === 'eth-to-stacks' ? 'USDCx' : 'USDC';

  return (
    <div className="max-w-lg mx-auto">
      <div className="rounded-3xl vellum-shadow transition-all duration-300" style={{ 
        backgroundColor: 'var(--bg-surface)', 
        border: `1px solid var(--border-color)`,
        padding: '2rem'
      }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Bridge Assets
          </h2>
          <div className="text-xs px-3 py-1.5 rounded-full font-semibold" style={{
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            color: '#8B5CF6',
            border: '1px solid rgba(139, 92, 246, 0.2)'
          }}>
            {state.direction === 'eth-to-stacks' ? 'ETH → Stacks' : 'Stacks → ETH'}
          </div>
        </div>

        {/* From Section */}
        <div className="rounded-2xl p-6 hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-300" style={{
          border: `2px solid var(--border-color)`,
          backgroundColor: 'var(--bg-surface)'
        }}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>From</span>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Balance: <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{parseFloat(sourceBalance).toFixed(4)}</span> {sourceToken}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="number"
              value={state.amount}
              onChange={(e) => setState(prev => ({ ...prev, amount: e.target.value, error: null }))}
              placeholder="0.00"
              className="flex-1 bg-transparent text-4xl font-mono outline-none placeholder:opacity-30 min-w-0"
              style={{ color: 'var(--text-primary)' }}
              disabled={state.isProcessing}
            />
            <div className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-purple-700 dark:from-purple-500 dark:to-purple-600 px-6 py-3.5 rounded-2xl shadow-lg shadow-purple-500/50 flex-shrink-0">
              <span className="font-bold text-sm text-white">{sourceToken}</span>
            </div>
          </div>
          <button
            onClick={() => setState(prev => ({ ...prev, amount: sourceBalance }))}
            className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 mt-4 font-bold transition-colors"
            disabled={state.isProcessing}
          >
            MAX
          </button>
        </div>

        {/* Switch Direction Button */}
        <div className="flex justify-center my-4 relative z-10">
          <button
            onClick={switchDirection}
            disabled={state.isProcessing}
            className="rounded-full p-3 transition-all disabled:opacity-50 hover:border-purple-600 dark:hover:border-purple-400 shadow-lg"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: `2px solid var(--border-color)`
            }}
          >
            <ArrowDownUp className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* To Section */}
        <div className="rounded-2xl p-6 mb-6" style={{
          border: `2px solid var(--border-color)`,
          backgroundColor: 'var(--bg-surface)'
        }}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>To</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1 text-4xl font-mono min-w-0" style={{ color: 'var(--text-secondary)' }}>
              {state.amount || '0.00'}
            </div>
            <div className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 px-6 py-3.5 rounded-2xl shadow-lg shadow-blue-500/50 flex-shrink-0">
              <span className="font-bold text-sm text-white">{destToken}</span>
            </div>
          </div>
        </div>

        {/* Gasless Mode Toggle (only for Stacks → Ethereum) */}
        {state.direction === 'stacks-to-eth' && (
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
            {state.gaslessMode && state.feeEstimate && (
              <div className="mt-4 pt-4 text-sm" style={{ 
                borderTop: `1px solid var(--border-color)`,
                color: 'var(--text-primary)'
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>Fee:</span> <span className="font-mono font-semibold">{parseFloat(state.feeEstimate.usdcx).toFixed(4)}</span> USDCx
              </div>
            )}
          </div>
        )}

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

        {/* Bridge Button */}
        <button
          onClick={handleBridge}
          disabled={!isConnected || state.isProcessing || !state.amount}
          className="w-full bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 dark:from-purple-600 dark:via-blue-600 dark:to-purple-600 hover:from-purple-700 hover:via-blue-700 hover:to-purple-700 text-white font-bold py-4 rounded-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-2xl shadow-purple-500/30 dark:shadow-purple-500/50 hover:shadow-purple-500/50 dark:hover:shadow-purple-500/70 hover:scale-[1.02] active:scale-[0.98] light:ghost-button light:text-purple-700"
        >
          {state.isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : !isConnected ? (
            'Connect Both Wallets'
          ) : (
            <>
              <ArrowDownUp className="w-5 h-5" />
              Bridge {sourceToken}
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
            Bridging typically takes 5-10 minutes
          </p>
          <p>You'll receive {destToken} on the destination chain</p>
        </div>
      </div>
    </div>
  );
}
