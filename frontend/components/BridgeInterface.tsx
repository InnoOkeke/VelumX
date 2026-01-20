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
  } = useWallet();

  const config = useConfig();

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
    <div className="glass-effect border border-white/10 rounded-3xl p-6 md:p-8 max-w-lg mx-auto shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
          Bridge Assets
        </h2>
        <div className="text-xs px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30">
          {state.direction === 'eth-to-stacks' ? 'ETH → Stacks' : 'Stacks → ETH'}
        </div>
      </div>

      {/* From Section */}
      <div className="bg-gradient-to-br from-purple-900/20 to-black/40 rounded-2xl p-5 mb-3 border border-purple-500/20 hover:border-purple-500/40 transition-all">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-white/50 uppercase tracking-wide">From</span>
          <span className="text-xs text-white/50">
            Balance: <span className="text-white/70 font-mono">{parseFloat(sourceBalance).toFixed(4)}</span> {sourceToken}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={state.amount}
            onChange={(e) => setState(prev => ({ ...prev, amount: e.target.value, error: null }))}
            placeholder="0.00"
            className="flex-1 bg-transparent text-3xl md:text-4xl font-mono outline-none text-white placeholder:text-white/20"
            disabled={state.isProcessing}
          />
          <div className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2.5 rounded-xl shadow-lg">
            <span className="font-bold text-sm">{sourceToken}</span>
          </div>
        </div>
        <button
          onClick={() => setState(prev => ({ ...prev, amount: sourceBalance }))}
          className="text-xs text-purple-400 hover:text-purple-300 mt-2 font-semibold transition-colors"
          disabled={state.isProcessing}
        >
          MAX
        </button>
      </div>

      {/* Switch Direction Button */}
      <div className="flex justify-center -my-2 relative z-10">
        <button
          onClick={switchDirection}
          disabled={state.isProcessing}
          className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 border-2 border-white/20 rounded-full p-3 transition-all disabled:opacity-50 shadow-lg hover:shadow-purple-500/50 hover:scale-110"
        >
          <ArrowDownUp className="w-5 h-5" />
        </button>
      </div>

      {/* To Section */}
      <div className="bg-gradient-to-br from-blue-900/20 to-black/40 rounded-2xl p-5 mb-6 border border-blue-500/20">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-white/50 uppercase tracking-wide">To</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 text-3xl md:text-4xl font-mono text-white/60">
            {state.amount || '0.00'}
          </div>
          <div className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2.5 rounded-xl shadow-lg">
            <span className="font-bold text-sm">{destToken}</span>
          </div>
        </div>
      </div>

      {/* Gasless Mode Toggle (only for Stacks → Ethereum) */}
      {state.direction === 'stacks-to-eth' && (
        <div className="bg-gradient-to-r from-green-500/10 via-yellow-500/10 to-green-500/10 border border-green-500/30 rounded-xl p-4 mb-6 hover:border-green-500/50 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-green-500 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-black" />
              </div>
              <div>
                <span className="font-semibold text-sm">Gasless Mode</span>
                <p className="text-xs text-white/50">Pay with USDCx</p>
              </div>
            </div>
            <button
              onClick={() => setState(prev => ({ ...prev, gaslessMode: !prev.gaslessMode }))}
              className={`relative w-14 h-7 rounded-full transition-all ${
                state.gaslessMode ? 'bg-gradient-to-r from-green-500 to-green-600 shadow-lg shadow-green-500/50' : 'bg-white/20'
              }`}
              disabled={state.isProcessing}
            >
              <div
                className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform shadow-lg ${
                  state.gaslessMode ? 'translate-x-7' : ''
                }`}
              />
            </button>
          </div>
          {state.gaslessMode && state.feeEstimate && (
            <div className="mt-3 pt-3 border-t border-green-500/20 text-sm text-white/70">
              <span className="text-white/50">Fee:</span> <span className="font-mono">{parseFloat(state.feeEstimate.usdcx).toFixed(4)}</span> USDCx
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {state.error && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 animate-pulse">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-200">{state.error}</p>
        </div>
      )}

      {/* Success Message */}
      {state.success && (
        <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-6">
          <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-200">{state.success}</p>
        </div>
      )}

      {/* Bridge Button */}
      <button
        onClick={handleBridge}
        disabled={!isConnected || state.isProcessing || !state.amount}
        className="w-full bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 hover:from-purple-500 hover:via-blue-500 hover:to-purple-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
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
      <div className="mt-6 pt-6 border-t border-white/10 text-xs text-white/40 text-center space-y-1">
        <p className="flex items-center justify-center gap-2">
          <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse"></span>
          Bridging typically takes 5-10 minutes
        </p>
        <p>You'll receive {destToken} on the destination chain</p>
      </div>
    </div>
  );
}
