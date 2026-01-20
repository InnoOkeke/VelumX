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
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Bridge</h2>
        <div className="text-sm text-white/60">
          {state.direction === 'eth-to-stacks' ? 'Ethereum → Stacks' : 'Stacks → Ethereum'}
        </div>
      </div>

      {/* From Section */}
      <div className="bg-black/40 rounded-2xl p-6 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-white/60">From</span>
          <span className="text-sm text-white/60">
            Balance: {parseFloat(sourceBalance).toFixed(4)} {sourceToken}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="number"
            value={state.amount}
            onChange={(e) => setState(prev => ({ ...prev, amount: e.target.value, error: null }))}
            placeholder="0.00"
            className="flex-1 bg-transparent text-3xl font-mono outline-none"
            disabled={state.isProcessing}
          />
          <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-xl">
            <span className="font-bold">{sourceToken}</span>
          </div>
        </div>
        <button
          onClick={() => setState(prev => ({ ...prev, amount: sourceBalance }))}
          className="text-sm text-purple-400 hover:text-purple-300 mt-2"
          disabled={state.isProcessing}
        >
          Max
        </button>
      </div>

      {/* Switch Direction Button */}
      <div className="flex justify-center -my-2 relative z-10">
        <button
          onClick={switchDirection}
          disabled={state.isProcessing}
          className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-full p-3 transition-all disabled:opacity-50"
        >
          <ArrowDownUp className="w-5 h-5" />
        </button>
      </div>

      {/* To Section */}
      <div className="bg-black/40 rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-white/60">To</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1 text-3xl font-mono text-white/60">
            {state.amount || '0.00'}
          </div>
          <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-xl">
            <span className="font-bold">{destToken}</span>
          </div>
        </div>
      </div>

      {/* Gasless Mode Toggle (only for Stacks → Ethereum) */}
      {state.direction === 'stacks-to-eth' && (
        <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/20 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-green-400" />
              <span className="font-medium">Gasless Mode</span>
            </div>
            <button
              onClick={() => setState(prev => ({ ...prev, gaslessMode: !prev.gaslessMode }))}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                state.gaslessMode ? 'bg-green-500' : 'bg-white/20'
              }`}
              disabled={state.isProcessing}
            >
              <div
                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  state.gaslessMode ? 'translate-x-6' : ''
                }`}
              />
            </button>
          </div>
          {state.gaslessMode && state.feeEstimate && (
            <div className="mt-3 text-sm text-white/60">
              Fee: {parseFloat(state.feeEstimate.usdcx).toFixed(4)} USDCx
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {state.error && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-200">{state.error}</p>
        </div>
      )}

      {/* Success Message */}
      {state.success && (
        <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-6">
          <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-200">{state.success}</p>
        </div>
      )}

      {/* Bridge Button */}
      <button
        onClick={handleBridge}
        disabled={!isConnected || state.isProcessing || !state.amount}
        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {state.isProcessing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Processing...
          </>
        ) : !isConnected ? (
          'Connect Wallets'
        ) : (
          `Bridge ${sourceToken}`
        )}
      </button>

      {/* Info */}
      <div className="mt-6 text-xs text-white/40 text-center">
        <p>Bridging typically takes 5-10 minutes</p>
        <p className="mt-1">You'll receive {destToken} on the destination chain</p>
      </div>
    </div>
  );
}
