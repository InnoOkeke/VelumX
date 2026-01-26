/**
 * BridgeInterface Component
 * Main UI for bridging USDC between Ethereum and Stacks
 */

'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '../lib/hooks/useWallet';
import { useConfig, USDC_ABI, XRESERVE_ABI } from '../lib/config';
import { createWalletClient, createPublicClient, custom, http, parseUnits, formatUnits } from 'viem';
import { Buffer } from 'buffer';
import { sepolia } from 'viem/chains';
import { Shield, ArrowRight, Loader2, Unplug, RefreshCw, ArrowDownUp, Zap, AlertCircle, CheckCircle } from 'lucide-react';
import { encodeStacksAddress, bytesToHex, encodeEthereumAddress as encodeEthereumAddressUtil } from '../lib/utils/address-encoding';
import { getStacksTransactions, getStacksNetwork, getStacksCommon, getStacksConnect } from '../lib/stacks-loader';

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
    ethereumChainId,
    balances,
    fetchBalances,
    isFetchingBalances,
    switchEthereumNetwork,
    stacksPublicKey,
    recoverPublicKey,
  } = useWallet();

  const config = useConfig();


  // Manual refresh handler
  const handleRefreshBalances = async () => {
    if (fetchBalances) {
      await fetchBalances();
    }
  };

  // Format time ago
  const getTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 10) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const [state, setState] = useState<BridgeState>({
    amount: '',
    direction: 'eth-to-stacks',
    gaslessMode: false,
    isProcessing: false,
    error: null,
    success: null,
    feeEstimate: null,
  });

  const [lastBalanceUpdate, setLastBalanceUpdate] = useState<number>(Date.now());

  // Update last balance update timestamp when balances change
  useEffect(() => {
    setLastBalanceUpdate(Date.now());
  }, [balances]);

  // Minimum bridge amounts per Stacks docs
  const MIN_BRIDGE_IN_TESTNET = 1; // 1 USDC for testnet peg-in
  const MIN_BRIDGE_OUT = 4.80;     // 4.80 USDCx for peg-out (covers bridge fees)

  // Validate amount
  const validateAmount = (amount: string): string | null => {
    if (!amount || amount === '0') {
      return 'Please enter an amount';
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return 'Invalid amount';
    }

    // Check minimum bridge amounts
    if (state.direction === 'eth-to-stacks') {
      if (numAmount < MIN_BRIDGE_IN_TESTNET) {
        return `Minimum deposit is ${MIN_BRIDGE_IN_TESTNET} USDC`;
      }
      const usdcBalance = parseFloat(balances.usdc);
      if (numAmount > usdcBalance) {
        return 'Insufficient USDC balance';
      }
    } else {
      if (numAmount < MIN_BRIDGE_OUT) {
        return `Minimum withdrawal is ${MIN_BRIDGE_OUT} USDCx (covers bridge fees)`;
      }
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

  // Auto-enable gasless mode if STX balance is low
  useEffect(() => {
    if (stacksConnected && balances.stx) {
      const stxBalance = parseFloat(balances.stx);
      if (stxBalance < 0.1) {
        setState(prev => ({ ...prev, gaslessMode: true }));
      }
    }
  }, [stacksConnected, balances.stx]);

  // Switch direction
  const switchDirection = () => {
    setState(prev => ({
      ...prev,
      direction: prev.direction === 'eth-to-stacks' ? 'stacks-to-eth' : 'eth-to-stacks',
      error: null,
      success: null,
      // Keep gaslessMode as is - usually if a user wants it for withdrawal, they want it to stay
    }));
  };


  // Encode Ethereum address to bytes32 for Stacks contract
  const encodeEthereumAddress = (address: string): Uint8Array => {
    const hex = encodeEthereumAddressUtil(address);
    // Defensive checks: ensure we have a hex string
    if (!hex || typeof hex !== 'string') {
      console.error('encodeEthereumAddressUtil returned invalid value', { address, hex });
      throw new Error('Invalid encoded hex for Ethereum address');
    }
    // Convert hex string to Uint8Array (remove 0x prefix)
    const hexWithoutPrefix = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (hexWithoutPrefix.length % 2 !== 0) {
      console.warn('Unexpected hex length when encoding ethereum address', { address, hex });
    }
    const bytes = new Uint8Array(hexWithoutPrefix.length / 2);
    for (let i = 0; i < hexWithoutPrefix.length; i += 2) {
      const byte = parseInt(hexWithoutPrefix.substring(i, i + 2), 16);
      if (Number.isNaN(byte)) {
        console.error('Failed to parse hex chunk while encoding ethereum address', { chunk: hexWithoutPrefix.substring(i, i + 2), address, hex });
        throw new Error('Invalid hex chunk while encoding ethereum address');
      }
      bytes[i / 2] = byte;
    }
    if (bytes.length !== 32) {
      console.warn('Encoded ethereum address length is unexpected', { address, bytesLength: bytes.length });
    }
    return bytes;
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

      // Step 3: Deposit to xReserve (Stacks official bridge)
      const recipientBytes32 = await encodeStacksAddress(stacksAddress);

      const depositHash = await walletClient.writeContract({
        address: config.ethereumXReserveAddress as `0x${string}`,
        abi: XRESERVE_ABI,
        functionName: 'depositToRemote',
        args: [
          amountInMicroUsdc,
          config.stacksDomainId,
          recipientBytes32,
          config.ethereumUsdcAddress as `0x${string}`,
          parseUnits('0', 6), // Max fee: 0 USDC (as per Stacks docs)
          '0x' as `0x${string}`, // Empty hook data
        ],
        account: ethereumAddress as `0x${string}`,
      });

      // Wait for transaction receipt to get message hash
      const receipt = await publicClient.waitForTransactionReceipt({ hash: depositHash });

      // Check if transaction was successful
      if (receipt.status === 'reverted') {
        throw new Error('Transaction failed - please check your USDC balance and try again');
      }

      // Extract message hash from xReserve transaction
      // For xReserve (Stacks official bridge), use transaction hash as message identifier
      // xReserve doesn't emit Circle's MessageSent event - it uses its own event system
      const messageHash = depositHash;

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
          ethereumAddress,
          stacksAddress,
          status: 'pending',
          currentStep: 'deposit',
          timestamp: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          retryCount: 0,
          isGasless: false,
          messageHash: messageHash || undefined,
        }),
      });

      setState(prev => ({
        ...prev,
        isProcessing: false,
        success: `Deposit initiated! Transaction: ${depositHash}`,
        amount: '',
      }));

      // Refresh balances after successful transaction
      if (fetchBalances) {
        setTimeout(() => {
          fetchBalances();
        }, 3000); // Wait 3 seconds for initial confirmation
      }
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
      // Common Stacks libraries
      const transactions = await getStacksTransactions() as any;
      const { AnchorMode, PostConditionMode, makeContractCall, makeUnsignedContractCall, Cl, Pc } = transactions;
      const networkModule = await getStacksNetwork() as any;
      const common = await getStacksCommon() as any;
      const connect = await getStacksConnect() as any;

      if (!transactions || !networkModule || !common || !connect) throw new Error('Stacks libraries not loaded');
      if (!Cl) throw new Error('Stacks Cl API not available in current SDK version');

      const network = new networkModule.StacksTestnet();
      // Explicitly force testnet version (128) to avoid "Could not parse 8 as TransactionVersion"
      // This handles cases where different SDK versions default differently
      network.version = 128; // TransactionVersion.Testnet (0x80)
      network.chainId = 2147483648; // ChainID.Testnet (0x80000000)

      if (!network) throw new Error('Could not load Stacks network configuration');

      const amountInMicroUsdc = parseUnits(state.amount, 6);
      const recipientBytes = ethereumAddress.startsWith('0x')
        ? common.hexToBytes(ethereumAddress.substring(2))
        : common.hexToBytes(ethereumAddress);

      if (!recipientBytes || recipientBytes.length === 0) {
        throw new Error('Failed to encode recipient address');
      }

      const useGasless = state.gaslessMode;

      // Determine which contract and function to call
      const contractParts = (useGasless
        ? config.stacksPaymasterAddress
        : config.stacksUsdcxProtocolAddress).split('.');

      if (contractParts.length !== 2) {
        throw new Error('Invalid bridge contract configuration');
      }

      const contractAddress = contractParts[0];
      const contractName = contractParts[1];
      const functionName = useGasless ? 'withdraw-gasless' : 'burn';

      if (useGasless && !state.feeEstimate) {
        throw new Error('Fee estimate not available. Cannot proceed with gasless transaction.');
      }

      const feeEstimateUsdcx = state.feeEstimate?.usdcx || '0';
      const functionArgs = useGasless
        ? [
          Cl.uint(amountInMicroUsdc.toString()),
          Cl.uint(parseUnits(feeEstimateUsdcx, 6).toString()),
          Cl.buffer(recipientBytes),
        ]
        : [
          Cl.uint(amountInMicroUsdc.toString()),
          Cl.uint("0"), // native-domain: 0 for Ethereum
          Cl.buffer(recipientBytes),
        ];

      console.log('Stacks Bridge Tx Params (Modern Cl):', {
        contractAddress,
        contractName,
        functionName,
        functionArgsLength: functionArgs.length,
        recipientBytesLen: recipientBytes.length,
        network: !!network,
        AnchorMode: !!AnchorMode,
        PostConditionMode: !!PostConditionMode,
        ClAvailable: !!Cl
      });

      if (functionArgs.some(arg => !arg)) {
        throw new Error('Transaction arguments encoding failed');
      }

      if (useGasless) {
        if (!makeUnsignedContractCall) throw new Error('SDK function makeUnsignedContractCall not available');
        const publicKey = stacksPublicKey || (window as any).xverse?.stacks?.publicKey || (window as any).LeatherProvider?.publicKey || undefined;

        // Create post-conditions
        const pc = (Pc as any).principal(stacksAddress!)
          .willSendEq(amountInMicroUsdc)
          // Fix: pass contract address and asset name separately, do not append suffix
          .ft(config.stacksUsdcxAddress, 'usdc-token');

        // Create transaction options
        const txOptions: any = {
          contractAddress,
          contractName,
          functionName,
          functionArgs,
          network,
          senderAddress: stacksAddress,
          anchorMode: AnchorMode?.Any || 0,
          postConditionMode: PostConditionMode?.Deny || 0x02, // Strict mode
          postConditions: [pc],
          sponsored: true,
          fee: 0, // Explicitly set fee to 0 to bypass strict estimation for sponsored txs
        };

        // Explicit Uint8Array conversion (Native Browser Safe)
        const toUint8Array = (input: Uint8Array | string): Uint8Array => {
          const bytes = typeof input === 'string' ? common.hexToBytes(input) : input;
          // Force copy to new clean Uint8Array to strip Buffer/Polyfill properties that confuse strict checks
          return new Uint8Array(bytes);
        };

        const recipientBytesNative = toUint8Array(recipientBytes);

        // Re-create args with Buffer (Uint8Array subclass) to satisfy strict SDK checks
        // The SDK's Cl.buffer might explicitly check for Buffer.isBuffer()
        const recipientBuffer = Buffer.from(recipientBytesNative);

        const safeFunctionArgs = [
          Cl.uint(amountInMicroUsdc.toString()),
          Cl.uint(parseUnits(feeEstimateUsdcx, 6).toString()),
          Cl.buffer(recipientBuffer),
        ];

        if (publicKey) {
          // Fix: Pass publicKey as hex string. The SDK handles string->bytes conversion internally 
          // and this avoids 'Uint8Array expected' errors due to polyfill mismatches.
          txOptions.publicKey = typeof publicKey === 'string' ? publicKey : bytesToHex(publicKey);
          txOptions.functionArgs = safeFunctionArgs; // Use safe args
        } else {
          console.error('Gasless Transaction Failed: Missing Public Key', {
            stacksAddress,
            walletStateKey: publicKey,
            windowXverseKey: (window as any).xverse?.stacks?.publicKey,
            windowLeatherKey: (window as any).LeatherProvider?.publicKey
          });
          throw new Error('Public key missing. Please disconnect and reconnect your Stacks wallet to enable gasless transactions.');
        }

        console.log('Stacks Bridge Tx Params (Uint8Array Native):', {
          pkType: txOptions.publicKey?.constructor?.name,
          recipientType: recipientBytesNative?.constructor?.name,
          fee: txOptions.fee,
        });

        const tx = await makeUnsignedContractCall(txOptions);

        // Defensive validation: ensure tx and serialize are present
        if (!tx) {
          console.error('makeContractCall returned falsy tx', { contractAddress, contractName, functionName, functionArgs });
          throw new Error('Failed to build transaction');
        }
        if (typeof (tx as any).serialize !== 'function') {
          console.error('Transaction object is missing serialize():', tx);
          throw new Error('Transaction serialization not available');
        }
        const serialized = (tx as any).serialize();
        if (!serialized) {
          console.error('serialize() returned falsy value', { serialized, tx });
          throw new Error('Transaction serialization failed');
        }

        // Use Buffer for hex conversion to avoid SDK's strict Uint8Array checks (dual package hazard)
        const txHex = bytesToHex(serialized);
        if (!txHex) throw new Error('Failed to convert transaction to hex');

        // Step 2: Request user signature via wallet RPC (without broadcast)
        const getProvider = () => {
          if (typeof window === 'undefined') return null;
          const win = window as any;
          // Robust provider detection for 2026+
          if (win.xverse?.stacks) return win.xverse.stacks;
          if (win.stx?.request) return win.stx;
          return win.StacksProvider || win.LeatherProvider || win.XverseProvider || null;
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

        let response;
        try {
          // Try standard EIP-1193 style request first
          response = await provider.request({
            method: 'stx_signTransaction',
            params: requestParams
          });
        } catch (error: any) {
          // Failover for Legacy Leather Provider which expects request('method', params)
          // Error code -32601 usually indicates method name was an object (interpreted as "[object Object]")
          // We must check both top-level code/message and nested JSON-RPC error object
          const code = error?.code || error?.error?.code;
          const message = error?.message || error?.error?.message;

          if (code === -32601 || message?.includes('is not supported')) {
            console.warn('Standard RPC request failed, trying legacy Leather signature...');
            response = await provider.request('stx_signTransaction', requestParams);
          } else {
            throw error;
          }
        }

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
            estimatedFee: parseUnits(state.feeEstimate?.usdcx || '0', 6).toString(),
          }),
        });

        const sponsorData = await sponsorResponse.json();
        if (!sponsorData.success) {
          throw new Error(sponsorData.message || 'Sponsorship failed');
        }

        const finalTxId = sponsorData.data.txid;

        // Submit to monitoring service
        await fetch(`${config.backendUrl}/api/transactions/monitor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: finalTxId,
            type: 'withdrawal',
            sourceTxHash: finalTxId,
            sourceChain: 'stacks',
            destinationChain: 'ethereum',
            amount: state.amount,
            sender: stacksAddress,
            recipient: ethereumAddress,
            status: 'pending',
            timestamp: Date.now(),
            isGasless: useGasless,
            gasFeeInUsdcx: state.feeEstimate?.usdcx,
          }),
        });
      } else {
        // Standard flow using modern request API
        const connect = await getStacksConnect() as any;
        if (!connect || !connect.request) throw new Error('Stacks request API not available');

        console.log('Stacks Bridge Standard Tx Params (request API):', {
          contract: `${contractAddress}.${contractName}`,
          functionName,
          functionArgsLength: functionArgs.length,
          network: 'testnet'
        });

        const response = await connect.request('stx_callContract', {
          contract: `${contractAddress}.${contractName}`,
          functionName,
          functionArgs,
          network: 'testnet',
          anchorMode: 'any',
          postConditionMode: 'allow',
          postConditions: [],
          appDetails: {
            name: 'VelumX Bridge',
            icon: typeof window !== 'undefined' ? window.location.origin + '/favicon.ico' : '',
          },
        });

        const finalTxId = response?.result?.txid;
        if (finalTxId) {
          // Submit to monitoring service
          await fetch(`${config.backendUrl}/api/transactions/monitor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: finalTxId,
              type: 'withdrawal',
              sourceTxHash: finalTxId,
              sourceChain: 'stacks',
              destinationChain: 'ethereum',
              amount: state.amount,
              sender: stacksAddress,
              recipient: ethereumAddress,
              status: 'pending',
              timestamp: Date.now(),
              isGasless: false,
            }),
          });
        }
      }

      setState(prev => ({
        ...prev,
        isProcessing: false,
        success: 'Withdrawal initiated! Check transaction history for status.',
        amount: '',
      }));

      // Refresh balances after successful transaction
      if (fetchBalances) {
        setTimeout(() => {
          fetchBalances();
        }, 3000); // Wait 3 seconds for initial confirmation
      }
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

  // Check if both wallets are connected based on addresses (more reliable than flags during restoration)
  const isConnected = state.direction === 'eth-to-stacks'
    ? (ethereumConnected || !!ethereumAddress) && (stacksConnected || !!stacksAddress)
    : (stacksConnected || !!stacksAddress) && (ethereumConnected || !!ethereumAddress);

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
            Cross-Chain Bridge
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
          border: `1px solid var(--border-color)`,
          backgroundColor: 'var(--bg-surface)'
        }}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>From</span>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Balance: {isFetchingBalances ? (
                  <Loader2 className="inline w-3 h-3 animate-spin ml-1" />
                ) : (
                  <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{parseFloat(sourceBalance).toFixed(4)}</span>
                )} {sourceToken}
              </span>
              <button
                onClick={handleRefreshBalances}
                disabled={isFetchingBalances}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                title={`Last updated ${getTimeAgo(lastBalanceUpdate)}`}
              >
                <RefreshCw className={`w-3 h-3 ${isFetchingBalances ? 'animate-spin' : ''}`} style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>
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
          border: `1px solid var(--border-color)`,
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
        {state.direction === 'stacks-to-eth' ? (
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
                className={`relative w-14 h-7 rounded-full transition-all duration-300 ${state.gaslessMode ? 'bg-green-600 shadow-lg shadow-green-500/20' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                disabled={state.isProcessing}
              >
                <div
                  className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${state.gaslessMode ? 'translate-x-7' : ''
                    }`}
                />
              </button>
            </div>
            {state.gaslessMode && !stacksPublicKey && (
              <div className="mt-2 mb-2 p-3 bg-red-500/10 rounded-lg flex flex-col gap-2">
                <p className="text-xs text-red-600 dark:text-red-400">Gasless transactions require verification.</p>
                <button
                  onClick={async (e) => {
                    e.preventDefault();
                    await recoverPublicKey();
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors w-full"
                >
                  Verify Wallet & Enable Gasless
                </button>
              </div>
            )}
            {state.gaslessMode && state.feeEstimate && stacksPublicKey && (
              <div className="mt-4 pt-4 text-sm" style={{
                borderTop: `1px solid var(--border-color)`,
                color: 'var(--text-primary)'
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>Fee:</span> <span className="font-mono font-semibold">{parseFloat(state.feeEstimate.usdcx).toFixed(4)}</span> USDCx
              </div>
            )}
          </div>
        ) : (
          /* eth-to-stacks direction */
          <div className="rounded-lg p-4 mb-6" style={{
            border: `1px solid var(--border-color)`,
            backgroundColor: 'rgba(16, 185, 129, 0.05)'
          }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{
                backgroundColor: 'rgba(59, 130, 246, 0.1)'
              }}>
                <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Sponsored Minting</span>
                  <span className="text-[10px] bg-blue-500/20 text-blue-600 px-1 rounded uppercase font-bold">Auto</span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Zero STX required to receive tokens on Stacks</p>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {state.error && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400 font-bold">{state.error}</p>
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
            Circle xReserve • 5-10 min confirmation
          </p>
          <p>Secure & trustless • Powered by USDC native bridging</p>
        </div>
      </div>
    </div>
  );
}
