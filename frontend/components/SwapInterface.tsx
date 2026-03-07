/**
 * SwapInterface Component
 * UI for swapping tokens on Stacks using our AMM swap contract
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/lib/hooks/useWallet';
import { useConfig, getConfig } from '@/lib/config';
import { ArrowDownUp, Settings, Info, Loader2, AlertTriangle, Wallet } from 'lucide-react';
import { formatUnits, parseUnits } from 'viem';
import { getStacksTransactions, getStacksNetwork, getStacksCommon, getStacksConnect, getNetworkInstance } from '@/lib/stacks-loader';
import { encodeStacksAddress, bytesToHex } from '@/lib/utils/address-encoding';
import { getVelumXClient } from '@/lib/velumx';
import { registerSmartWallet } from '@/lib/registration';
import { TokenInput } from './ui/TokenInput';
import { SettingsPanel } from './ui/SettingsPanel';
import { GaslessToggle } from './ui/GaslessToggle';
import { SwapDetails } from './ui/SwapDetails';
import { TransactionStatus } from './ui/TransactionStatus';

interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoUrl?: string;
  assetName?: string; // Explicit asset name for post-conditions
}

interface SwapQuote {
  amountOut: string;
  priceImpact: string;
  fee: string;
  rate: string;
}

interface SwapState {
  inputToken: Token | null;
  outputToken: Token | null;
  inputAmount: string;
  outputAmount: string;
  gaslessMode: boolean;
  isProcessing: boolean;
  isFetchingQuote: boolean;
  error: string | null;
  success: string | null;
  quote: SwapQuote | null;
  gasFeeUsdcx: string;
  slippage: number;
  showSettings: boolean;
  isRegistering: boolean;
}

// Default tokens for testnet
const DEFAULT_TOKENS: Token[] = [
  {
    symbol: 'STX',
    name: 'Stacks',
    address: 'STX',
    decimals: 6,
    assetName: 'stx',
  },
  {
    symbol: 'USDCx',
    name: 'USDC (xReserve)',
    address: getConfig().stacksUsdcxAddress, // Use dynamic config address
    decimals: 6,
    assetName: 'usdcx',
  },
  {
    symbol: 'VEX',
    name: 'VelumX Token',
    address: 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.vextoken-v1', // Will be filled from config
    decimals: 6,
    assetName: 'vex', // Assumed asset name for VEX
  },
];



export function SwapInterface() {
  const { stacksAddress, stacksConnected, balances, fetchBalances, stacksPublicKey, recoverPublicKey } = useWallet();
  const config = useConfig();

  const getBalance = (token: Token | null): string => {
    if (!token) return '0';
    if (token.symbol === 'USDCx') return balances.usdcx;
    if (token.symbol === 'STX') return balances.stx;
    if (token.symbol === 'VEX') return balances.vex || '0';
    return '0';
  };

  const [tokens, setTokens] = useState<Token[]>(DEFAULT_TOKENS);
  const [state, setState] = useState<SwapState>({
    inputToken: DEFAULT_TOKENS[1], // USDCx
    outputToken: DEFAULT_TOKENS[2], // VEX
    inputAmount: '',
    outputAmount: '',
    gaslessMode: true,
    isProcessing: false,
    isFetchingQuote: false,
    error: null,
    success: null,
    quote: null,
    gasFeeUsdcx: '0.2',
    slippage: 0.5,
    showSettings: false,
    isRegistering: false,
  });

  // Initialize tokens from config
  useEffect(() => {
    const updatedTokens = DEFAULT_TOKENS.map(t => {
      if (t.symbol === 'VEX') return { ...t, address: config.stacksVexAddress || 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.vextoken-v1' };
      return t;
    });
    setTokens(updatedTokens);

    // Update initial state tokens - Default to STX -> VEX
    setState(prev => ({
      ...prev,
      inputToken: updatedTokens[1], // USDCx
      outputToken: updatedTokens[2]  // VEX
    }));
  }, [config.stacksVexAddress]);

  const fetchQuote = async () => {
    if (!state.inputToken || !state.outputToken || !state.inputAmount) return;

    setState(prev => ({ ...prev, isFetchingQuote: true, error: null }));

    try {
      // Convert input amount to micro units
      const amountInMicro = parseUnits(state.inputAmount, state.inputToken.decimals);

      // Call backend to get quote from swap contract
      const response = await fetch(`${config.backendUrl}/api/swap/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputToken: state.inputToken.address,
          outputToken: state.outputToken.address,
          inputAmount: amountInMicro.toString(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch quote');
      }

      const data = await response.json();

      if (data.success && data.data) {
        // Convert output amount from micro units to display units
        const outputAmountFormatted = (Number(data.data.outputAmount) / Math.pow(10, state.outputToken.decimals)).toFixed(6);
        const feeFormatted = (Number(data.data.estimatedFee) / Math.pow(10, state.inputToken.decimals)).toFixed(6);
        const rate = (Number(data.data.outputAmount) / Number(data.data.inputAmount)).toFixed(6);

        setState(prev => ({
          ...prev,
          outputAmount: outputAmountFormatted,
          quote: {
            amountOut: outputAmountFormatted,
            priceImpact: data.data.priceImpact.toFixed(2),
            fee: feeFormatted,
            rate: rate,
          },
          isFetchingQuote: false,
        }));
      } else {
        throw new Error(data.error || 'Pool may not exist yet');
      }
    } catch (error) {
      console.error('Failed to fetch quote:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to get quote. Pool may not exist yet.',
        isFetchingQuote: false,
      }));
    }
  };

  // Fetch fee estimate for gasless mode
  const fetchFeeEstimate = useCallback(async () => {
    if (!state.gaslessMode) return;

    try {
      const velumxClient = getVelumXClient();
      const estimate = await velumxClient.estimateFee({
        estimatedGas: 100000 // Base gas estimate for swaps
      });

      console.log('Fee Estimate Response:', estimate);

      if (estimate && estimate.maxFeeUSDCx) {
        // Use the returned fee
        setState(prev => ({
          ...prev,
          gasFeeUsdcx: (Number(estimate.maxFeeUSDCx) / 1_000_000).toString(),
        }));
      } else {
        console.warn('Fee estimate failed or invalid data:', estimate);
      }
    } catch (error) {
      console.error('Failed to fetch fee estimate:', error);
      // Keep default 0.2 if failed
    }
  }, [state.gaslessMode, config.backendUrl]);

  // Fetch quote and fee estimate when input changes
  useEffect(() => {
    if (state.inputToken && state.outputToken && state.inputAmount && parseFloat(state.inputAmount) > 0) {
      const timer = setTimeout(() => {
        fetchQuote();
        if (state.gaslessMode) {
          fetchFeeEstimate();
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setState(prev => ({ ...prev, outputAmount: '', quote: null }));
    }
  }, [state.inputToken, state.outputToken, state.inputAmount, state.gaslessMode, fetchFeeEstimate]);



  const handleRegisterWallet = async () => {
    if (!stacksAddress) return;
    setState(prev => ({ ...prev, isRegistering: true, error: null }));
    try {
      const result = await registerSmartWallet(stacksAddress);
      if (result) {
        setState(prev => ({
          ...prev,
          isRegistering: false,
          success: `Registration submitted! TX: ${result.txid}. Please wait for confirmation.`,
          error: null
        }));
      } else {
        setState(prev => ({ ...prev, isRegistering: false }));
      }
    } catch (error: any) {
      setState(prev => ({ ...prev, isRegistering: false, error: error.message }));
    }
  };

  const switchTokens = () => {
    setState(prev => ({
      ...prev,
      inputToken: prev.outputToken,
      outputToken: prev.inputToken,
      inputAmount: prev.outputAmount,
      outputAmount: prev.inputAmount,
      quote: null,
    }));
  };

  const handleSwap = async () => {
    if (!stacksAddress || !state.inputToken || !state.outputToken) {
      setState(prev => ({ ...prev, error: 'Please connect wallet and select tokens' }));
      return;
    }

    if (!state.inputAmount || parseFloat(state.inputAmount) <= 0) {
      setState(prev => ({ ...prev, error: 'Please enter a valid amount' }));
      return;
    }

    if (!state.quote) {
      setState(prev => ({ ...prev, error: 'Please wait for quote' }));
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, error: null, success: null }));

    let sponsorData: any = null;

    try {
      const transactions = await getStacksTransactions() as any;
      console.log('Loaded Stacks Transactions:', {
        keys: Object.keys(transactions || {}),
        hasMakeStandard: !!transactions?.makeStandardFungiblePostCondition,
        hasCreateAsset: !!transactions?.createAssetInfo
      });

      const { AnchorMode, PostConditionMode, makeContractCall, makeUnsignedContractCall, Cl, Pc, FungibleConditionCode }: any = transactions;
      const networkModule = await getStacksNetwork() as any;
      const common = await getStacksCommon() as any;
      const connect = await getStacksConnect() as any;

      if (!transactions || !networkModule || !common || !connect) throw new Error('Stacks libraries not loaded');

      if (!Cl) throw new Error('Stacks Cl API not available in current SDK version');

      const network = await getNetworkInstance();

      console.log('Network Config Enforced:', {
        version: network.version,
        baseVersion: networkModule.StacksTestnet ? new networkModule.StacksTestnet().version : 'N/A'
      });

      const amountInMicro = parseUnits(state.inputAmount, state.inputToken!.decimals);
      // Defensive check for output amount
      const outAmtProp = state.outputAmount || '0';
      const minAmountOutMicro = parseUnits(
        (parseFloat(outAmtProp) * (1 - state.slippage / 100)).toFixed(6),
        state.outputToken!.decimals
      );

      const isInputStx = state.inputToken!.symbol === 'STX';
      const isOutputStx = state.outputToken!.symbol === 'STX';
      const useGasless = state.gaslessMode;

      const [contractAddress, contractName] = (useGasless
        ? config.stacksPaymasterAddress
        : config.stacksSwapContractAddress).split('.');

      // Helper to parse token address (format: contractAddress.contractName)
      const parseTokenAddress = (tokenAddr: string) => {
        const [addr, name] = tokenAddr.split('.');
        return { address: addr, name };
      };

      const getCP = (addr: string) => {
        const parts = addr.split('.');
        if (parts.length !== 2) throw new Error(`Invalid contract principal: ${addr}`);
        return Cl.contractPrincipal(parts[0], parts[1]);
      };

      let functionName = 'swap';
      let functionArgs = [];
      const gasFeeMicro = parseUnits(state.gasFeeUsdcx || '1.0', 6);

      if (isInputStx) {
        functionName = useGasless ? 'swap-stx-to-token-gasless' : 'swap-stx-to-token';
        // contractAddress is defined above
        functionArgs = [
          getCP(state.outputToken!.address),
          Cl.uint(amountInMicro.toString()),
          Cl.uint(minAmountOutMicro.toString()),
        ];
        if (useGasless) functionArgs.push(Cl.uint(gasFeeMicro.toString()));
      } else if (isOutputStx) {
        functionName = useGasless ? 'swap-token-to-stx-gasless' : 'swap-token-to-stx';
        functionArgs = [
          getCP(state.inputToken!.address),
          Cl.uint(amountInMicro.toString()),
          Cl.uint(minAmountOutMicro.toString()),
        ];
        if (useGasless) functionArgs.push(Cl.uint(gasFeeMicro.toString()));
      } else if (useGasless) {
        functionName = 'swap-gasless';
        functionArgs = [
          getCP(state.inputToken!.address),
          getCP(state.outputToken!.address),
          Cl.uint(amountInMicro.toString()),
          Cl.uint(minAmountOutMicro.toString()),
          Cl.uint(gasFeeMicro.toString()),
        ];
      } else {
        functionName = 'swap';
        functionArgs = [
          getCP(state.inputToken!.address),
          getCP(state.outputToken!.address),
          Cl.uint(amountInMicro.toString()),
          Cl.uint(minAmountOutMicro.toString()),
        ];
      }

      console.log('Stacks Swap Tx Params (Modern Cl):', {
        contractAddress,
        contractName,
        functionName,
        functionArgsLength: functionArgs.length,
        // Debug argument types
        argTypes: functionArgs.map((arg: any) => typeof arg),
        // Inspect principals if possible
        inputTokenAddr: state.inputToken?.address,
        outputTokenAddr: state.outputToken?.address,
        network: !!network,
        AnchorMode: !!AnchorMode,
        PostConditionMode: !!PostConditionMode,
        ClAvailable: !!Cl
      });

      if (functionArgs.some((arg: any) => !arg)) {
        throw new Error('Transaction arguments encoding failed');
      }

      const postConditions = [];

      // Helper to create safe fungible post-condition
      const createSafePostCondition = (address: string, amount: bigint, assetAddress: string, assetName: string) => {
        if (amount === BigInt(0)) return null;

        // Use Pc builder which is available in v7.3.1
        // Match BridgeInterface logic: pass full contract address and asset name
        return Pc.principal(address)
          .willSendEq(amount)
          .ft(assetAddress, assetName);
      };

      // Constraint 1: User sends input token
      if (isInputStx) {
        postConditions.push(
          Pc.principal(stacksAddress).willSendEq(amountInMicro).ustx()
        );
      } else {
        // Use explicit asset name if available, otherwise fallback to contract name
        const { name: contractName } = parseTokenAddress(state.inputToken.address);
        const assetAddress = state.inputToken.address;
        const assetName = state.inputToken.assetName || contractName;

        const pc = createSafePostCondition(stacksAddress!, amountInMicro, assetAddress, assetName);
        if (pc) postConditions.push(pc);
      }

      // Constraint 3: User sends USDCx fee if gasless
      if (useGasless) {
        const usdcxFullAddress = config.stacksUsdcxAddress;
        const usdcxAssetName = 'usdcx';

        // If input token is also USDCx, we must COMBINE the post-conditions
        if (state.inputToken!.address === usdcxFullAddress) {
          // Remove the previous USDCx post-condition (it was added in Constraint 1)
          if (postConditions.length > 0) postConditions.pop();

          const totalUsdcx = amountInMicro + gasFeeMicro;
          console.log(`Combining USDCx post-condition: ${amountInMicro} (swap) + ${gasFeeMicro} (fee) = ${totalUsdcx}`);

          const pc = createSafePostCondition(stacksAddress!, totalUsdcx, usdcxFullAddress, usdcxAssetName);
          if (pc) postConditions.push(pc);
        } else {
          // Input is NOT USDCx, so just add the fee post-condition
          const pc = createSafePostCondition(stacksAddress!, gasFeeMicro, usdcxFullAddress, usdcxAssetName);
          if (pc) postConditions.push(pc);
        }
      }

      console.log('Final PostConditions (JSON):', JSON.stringify(postConditions, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
        , 2));

      // Constraint 2: Contract sends output token (optional but good for safety)
      // We know the contract address.
      // Note: Contract principal in post-conditions must use the contract that is SENDING.
      // If the swap contract holds the tokens, it sends.
      // If it's a paymaster, maybe it doesn't hold them?
      // Assuming AMM pool holds funds.

      // In gasless mode, tokens are sent by the swap contract, not the paymaster.
      const poolPrincipal = Pc.principal(config.stacksSwapContractAddress);

      if (isOutputStx) {
        postConditions.push(
          poolPrincipal.willSendGte(minAmountOutMicro).ustx()
        );
      } else {
        const assetAddress = state.outputToken.address;
        const { name: contractName } = parseTokenAddress(assetAddress);
        const assetName = state.outputToken.assetName || contractName;

        postConditions.push(
          poolPrincipal.willSendGte(minAmountOutMicro).ft(assetAddress, assetName)
        );
      }

      if (useGasless) {
        const velumx = getVelumXClient();
        if (!velumx) throw new Error('VelumX SDK client initialization failed');

        // Step 1: Discover Smart Wallet and Sync State
        const { getSmartWalletAddress, getSmartWalletNonce } = await import('@/lib/stacks-wallet');

        let smartWalletAddress = await getSmartWalletAddress(stacksAddress);
        if (!smartWalletAddress) {
          throw new Error('No Smart Wallet found. Please click "Register Smart Wallet" below to setup your account.');
        }

        const currentNonce = await getSmartWalletNonce(smartWalletAddress);
        console.log('VelumX Swap: Detected Smart Wallet', { smartWalletAddress, currentNonce });

        // Step 2: Prepare Intent (v4 AA Model)
        const { listCV, serializeCV } = await import('@stacks/transactions');
        const feeMicro = parseUnits(state.gasFeeUsdcx || '0.2', 6);

        // Encode payload (serialized list of arguments)
        const payloadBuffer = serializeCV(listCV(functionArgs));
        const payloadHex = Buffer.from(payloadBuffer).toString('hex');

        const intent = {
          target: `${contractAddress}.${contractName}`,
          payload: payloadHex,
          maxFeeUSDCx: feeMicro.toString(),
          nonce: currentNonce,
        };

        console.log('VelumX Swap: Preparing SIP-018 intent (v4)', intent);

        const getProvider = () => {
          if (typeof window === 'undefined') return null;
          const win = window as any;
          return win.LeatherProvider || win.XverseProvider || win.xverse?.stacks || win.stx || win.StacksProvider || null;
        };

        const provider = getProvider();
        if (!provider || typeof provider.request !== 'function') {
          throw new Error('No compatible Stacks wallet found. Please install Leather or Xverse.');
        }

        // SIP-018 Structured Data Signing
        // We bypass @stacks/connect because it validates our v7 ClarityValues against its internal v6 types
        const { tupleCV, stringAsciiCV, uintCV, principalCV, bufferCV } = await import('@stacks/transactions');
        const signingCommon = await getStacksCommon() as any;

        const domainCV = tupleCV({
          name: stringAsciiCV("SGAL-Smart-Wallet"),
          version: stringAsciiCV("1.0.0"),
          "chain-id": uintCV(2147483648),
        });

        const messageCV = tupleCV({
          target: principalCV(intent.target),
          payload: bufferCV(signingCommon.hexToBytes(intent.payload)),
          "max-fee-usdcx": uintCV(intent.maxFeeUSDCx),
          nonce: uintCV(intent.nonce),
        });

        // Leather wallet's stx_signStructuredMessage expects hex-encoded serialized Clarity values
        // WITHOUT the '0x' prefix. Including '0x' causes the wallet to read byte 0x30 (ASCII '0')
        // as the Clarity type, triggering: "Cannot recognize Clarity Type: 48"
        const domainHex = Buffer.from(serializeCV(domainCV)).toString('hex');
        const messageHex = Buffer.from(serializeCV(messageCV)).toString('hex');

        let signResponse: any;
        try {
          signResponse = await provider.request('stx_signStructuredMessage', {
            domain: domainHex,
            message: messageHex,
          });
        } catch (error: any) {
          console.error('Swap SIP-018 signing failed:', error);
          throw new Error('Transaction signature rejected or not supported. Ensure your wallet is up to date.');
        }

        if (!signResponse) {
          throw new Error('Signature rejected or failed');
        }

        // Handle both Leather ({signature:...}) and raw JSON-RPC format ({result: {signature:...}})
        const signature = signResponse.signature || signResponse.result?.signature;
        if (!signature) {
          throw new Error('No signature returned from wallet');
        }

        const signedIntent = {
          ...intent,
          signature,
        };

        // Step 2: Submit to Relayer via VelumX SDK
        const result = await velumx.submitIntent(signedIntent);
        sponsorData = { success: true, data: { txid: result.txid } };
      } else {
        // Standard flow using modern request API
        const connect = await getStacksConnect() as any;
        if (!connect || !connect.request) throw new Error('Stacks request API not available');

        console.log('Stacks Swap Standard Tx Params (request API):', {
          contract: `${contractAddress}.${contractName}`,
          functionName,
          functionArgsLength: functionArgs.length,
          network: 'testnet'
        });

        await connect.request('stx_callContract', {
          contract: `${contractAddress}.${contractName}`,
          functionName,
          functionArgs,
          network: 'testnet',
          anchorMode: 'any',
          postConditionMode: 'deny',
          postConditions: postConditions, // Pass the same safety constraints
          appDetails: {
            name: 'VelumX DEX',
            icon: typeof window !== 'undefined' ? window.location.origin + '/favicon.ico' : '',
          },
        });
      }

      // Record transaction in history
      try {
        await fetch(`${config.backendUrl}/api/transactions/monitor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: `swap-${Date.now()}`,
            type: 'swap',
            sourceTxHash: (sponsorData as any)?.txid || 'pending',
            sourceChain: 'stacks',
            destinationChain: 'stacks',
            amount: state.inputAmount,
            stacksAddress: stacksAddress,
            inputToken: state.inputToken?.symbol,
            outputToken: state.outputToken?.symbol,
            status: 'complete', // Swaps are considered complete once submitted as they are single-chain
            currentStep: 'swap',
            timestamp: Date.now(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            retryCount: 0,
            isGasless: state.gaslessMode,
          }),
        });
      } catch (monitorError) {
        console.error('Failed to report transaction to monitor:', monitorError);
        // Don't fail the UI if monitoring reporting fails
      }

      setState(prev => ({
        ...prev,
        isProcessing: false,
        success: `Swap successful! You will receive approximately ${state.outputAmount} ${state.outputToken?.symbol}`,
        inputAmount: '',
        outputAmount: '',
        quote: null,
      }));

      // Refresh balances after successful transaction
      if (fetchBalances) {
        setTimeout(() => {
          fetchBalances();
        }, 3000);
      }
    } catch (error) {
      console.error('Swap error:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: (error as Error).message || 'Failed to execute swap',
      }));
    }
  };

  // Check if balances is in scope by moving getBalance usage inside component or ensure scope is correct


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
            Swap Interface
          </h2>
          <button
            onClick={() => setState(prev => ({ ...prev, showSettings: !prev.showSettings }))}
            className={`p-2 rounded-lg transition-all ${state.showSettings ? 'bg-purple-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            style={{ color: state.showSettings ? '' : 'var(--text-secondary)' }}
          >
            <Settings className={`w-5 h-5 ${state.showSettings ? 'animate-spin-slow' : ''}`} />
          </button>
        </div>

        <SettingsPanel
          slippage={state.slippage}
          setSlippage={(val: number) => setState(prev => ({ ...prev, slippage: val }))}
          isOpen={state.showSettings}
        />

        {/* Suggested Pairs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setState(prev => ({ ...prev, inputToken: tokens[1], outputToken: tokens[2] }))}
            className="text-[10px] font-bold px-3 py-1.5 rounded-full border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 transition-all text-blue-600 dark:text-blue-400"
          >
            USDCx/VEX
          </button>
          <button
            onClick={() => setState(prev => ({ ...prev, inputToken: tokens[0], outputToken: tokens[1] }))}
            className="text-[10px] font-bold px-3 py-1.5 rounded-full border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 transition-all text-purple-600 dark:text-purple-400"
          >
            STX/USDCx
          </button>
        </div>

        <div className="relative">
          <TokenInput
            label="Sell"
            amount={state.inputAmount}
            setAmount={(val: string) => setState(prev => ({ ...prev, inputAmount: val, error: null }))}
            token={state.inputToken}
            setToken={(t) => setState(prev => ({ ...prev, inputToken: t }))}
            tokens={tokens}
            balance={getBalance(state.inputToken)}
            isProcessing={state.isProcessing}
            onMax={() => setState(prev => ({ ...prev, inputAmount: getBalance(state.inputToken) }))}
            variant="purple"
          />

          {/* Switch Button */}
          <div className="flex justify-center my-4 relative z-10">
            <button
              onClick={switchTokens}
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

          <TokenInput
            label="Buy"
            amount={state.outputAmount}
            setAmount={() => { }}
            token={state.outputToken}
            setToken={(t) => setState(prev => ({ ...prev, outputToken: t }))}
            tokens={tokens}
            balance={getBalance(state.outputToken)}
            isProcessing={state.isProcessing}
            variant="blue"
          />
        </div>

        <div className="mt-6">
          <SwapDetails
            quote={state.quote}
            inputSymbol={state.inputToken?.symbol || ''}
            outputSymbol={state.outputToken?.symbol || ''}
            outputAmount={state.outputAmount}
            slippage={state.slippage}
          />

          <GaslessToggle
            enabled={state.gaslessMode}
            setEnabled={(val: boolean) => setState(prev => ({ ...prev, gaslessMode: val }))}
            disabled={state.isProcessing}
          />

          <TransactionStatus error={state.error} success={state.success} />

          <button
            onClick={handleSwap}
            disabled={!stacksConnected || state.isProcessing || !state.inputAmount || !state.outputAmount}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-2xl shadow-purple-500/30 dark:shadow-purple-500/50 hover:shadow-purple-500/50 dark:hover:shadow-purple-500/70 hover:scale-[1.02] active:scale-[0.98]"
          >
            {state.isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : !stacksConnected ? (
              'Connect Wallet'
            ) : state.gaslessMode && !stacksPublicKey ? (
              <span onClick={async (e) => {
                e.preventDefault();
                await recoverPublicKey();
              }} className="flex items-center gap-2 cursor-pointer w-full justify-center h-full">
                Verify Wallet (Enable Gasless)
              </span>
            ) : state.error?.includes('No Smart Wallet found') ? (
              <span onClick={(e) => {
                e.preventDefault();
                handleRegisterWallet();
              }} className="flex items-center gap-2 cursor-pointer w-full justify-center h-full">
                {state.isRegistering ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wallet className="w-5 h-5 text-green-400" />}
                {state.isRegistering ? 'Registering...' : 'Register Smart Wallet (Sponsored)'}
              </span>
            ) : (
              <>
                <ArrowDownUp className="w-5 h-5" />
                Swap Tokens
              </>
            )}
          </button>
        </div>

        {/* Info Footer */}
        <div className="mt-6 pt-6 text-xs text-center space-y-1" style={{
          borderTop: `1px solid var(--border-color)`,
          color: 'var(--text-secondary)'
        }}>
          <div className="flex items-center justify-center gap-8 opacity-70">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              AMM Protocol
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              L2 Settlement
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
