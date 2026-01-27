/**
 * SwapInterface Component
 * UI for swapping tokens on Stacks using our AMM swap contract
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../lib/hooks/useWallet';
import { useConfig } from '../lib/config';
import { ArrowDownUp, Settings, Info, Loader2, AlertTriangle, Wallet } from 'lucide-react';
import { formatUnits, parseUnits } from 'viem';
import { getStacksTransactions, getStacksNetwork, getStacksCommon, getStacksConnect } from '../lib/stacks-loader';
import { encodeStacksAddress, bytesToHex } from '../lib/utils/address-encoding';
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
    address: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx',
    decimals: 6,
    assetName: 'usdc-token', // Correct asset name matching BridgeInterface
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

  const [tokens, setTokens] = useState<Token[]>(DEFAULT_TOKENS);
  const [state, setState] = useState<SwapState>({
    inputToken: DEFAULT_TOKENS[0], // STX
    outputToken: DEFAULT_TOKENS[1], // USDCx
    inputAmount: '',
    outputAmount: '',
    gaslessMode: true, // Default to true for gas abstraction
    isProcessing: false,
    isFetchingQuote: false,
    error: null,
    success: null,
    quote: null,
    gasFeeUsdcx: '1.0', // Default fallback
    slippage: 0.5,
    showSettings: false,
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
      inputToken: updatedTokens[0], // STX
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
      const response = await fetch(`${config.backendUrl}/api/paymaster/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estimatedGasInStx: '100000', // Base gas estimate for swaps
        }),
      });

      const data = await response.json();
      if (data.success) {
        setState(prev => ({
          ...prev,
          gasFeeUsdcx: (Number(data.data.gasInUsdcx) / 1_000_000).toString(),
        }));
      }
    } catch (error) {
      console.error('Failed to fetch fee estimate:', error);
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
      // Common Stacks libraries
      const transactions = await getStacksTransactions() as any;
      const { AnchorMode, PostConditionMode, makeContractCall, makeUnsignedContractCall, Cl, Pc }: any = transactions;
      const networkModule = await getStacksNetwork() as any;
      const common = await getStacksCommon() as any;
      const connect = await getStacksConnect() as any;

      if (!transactions || !networkModule || !common || !connect) throw new Error('Stacks libraries not loaded');
      if (!Cl) throw new Error('Stacks Cl API not available in current SDK version');

      // Use StacksTestnet class if available to ensure correct internal defaults
      let network;
      try {
        if (networkModule.StacksTestnet) {
          network = new networkModule.StacksTestnet();
          // Override URLs
          network.client = {
            baseUrl: 'https://api.testnet.hiro.so',
            fetch: (url: any, init: any) => fetch(url, init),
          };
          network.bnsLookupUrl = 'https://api.testnet.hiro.so';
          // Force Testnet version
          network.transactionVersion = 128;
          network.version = 128;
        }
      } catch (e) {
        console.warn('Failed to instantiate StacksTestnet, using fallback', e);
      }

      if (!network) {
        // Fallback: Verified StacksNetwork interface from @stacks/network v7.3.1
        network = {
          chainId: 0x80000000,
          transactionVersion: 128, // 0x80 (Testnet)
          peerNetworkId: 0x80000000,
          magicBytes: 'T2',
          bootAddress: 'ST3NBRSFKX0GM5NPS696X053153116C97F09804',
          addressVersion: {
            singleSig: 26, // 'P'
            multiSig: 21,  // 'M'
          },
          client: {
            baseUrl: 'https://api.testnet.hiro.so',
            fetch: (url: any, init: any) => fetch(url, init),
          },
          isMainnet: () => false,
          version: 128,
          bnsLookupUrl: 'https://api.testnet.hiro.so',
        };
      }

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
        network: !!network,
        AnchorMode: !!AnchorMode,
        PostConditionMode: !!PostConditionMode,
        ClAvailable: !!Cl
      });

      if (functionArgs.some((arg: any) => !arg)) {
        throw new Error('Transaction arguments encoding failed');
      }

      const postConditions = [];

      // Constraint 1: User sends input token
      if (isInputStx) {
        postConditions.push(
          Pc.principal(stacksAddress).willSendEq(amountInMicro).ustx()
        );
      } else {
        // Use explicit asset name if available, otherwise fallback to contract name
        const { name } = parseTokenAddress(state.inputToken.address);
        const assetId = state.inputToken.address;
        const assetName = state.inputToken.assetName || name;

        postConditions.push(
          Pc.principal(stacksAddress).willSendEq(amountInMicro).ft(assetId, assetName)
        );
      }

      // Constraint 3: User sends USDCx fee if gasless
      if (useGasless) {
        const usdcxAddress = config.stacksUsdcxAddress;
        const usdcxAssetName = 'usdcx';

        // If input token is also USDCx, we must COMBINE the post-conditions because 
        // willSendEq/willSendGte are aggregate limits per token per address.
        if (state.inputToken!.address === usdcxAddress) {
          // Remove the previous USDCx post-condition and add a combined one
          postConditions.pop();
          const totalUsdcx = amountInMicro + gasFeeMicro;
          postConditions.push(
            Pc.principal(stacksAddress).willSendEq(totalUsdcx).ft(usdcxAddress, usdcxAssetName)
          );
        } else {
          // Add a separate post-condition for the fee
          postConditions.push(
            Pc.principal(stacksAddress).willSendEq(gasFeeMicro).ft(usdcxAddress, usdcxAssetName)
          );
        }
      }

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
        const { name } = parseTokenAddress(state.outputToken.address);
        const assetId = state.outputToken.address;
        const assetName = state.outputToken.assetName || name;

        postConditions.push(
          poolPrincipal.willSendGte(minAmountOutMicro).ft(assetId, assetName)
        );
      }

      if (useGasless) {
        if (!makeUnsignedContractCall) throw new Error('SDK function makeUnsignedContractCall not available');
        const publicKey = stacksPublicKey || (window as any).xverse?.stacks?.publicKey || (window as any).LeatherProvider?.publicKey || undefined;

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
          postConditions, // Use generated post-conditions
          sponsored: true,
          fee: 0, // Explicitly set fee to 0 to bypass strict estimation for sponsored txs
        };



        if (publicKey) {
          // Fix: Pass publicKey as hex string. The SDK handles string->bytes conversion internally 
          // and this avoids 'Uint8Array expected' errors due to polyfill mismatches.
          txOptions.publicKey = typeof publicKey === 'string' ? publicKey : bytesToHex(publicKey);
        } else {
          console.error('Gasless Swap Failed: Missing Public Key', {
            stacksAddress,
            walletStateKey: publicKey,
            windowXverseKey: (window as any).xverse?.stacks?.publicKey,
            windowLeatherKey: (window as any).LeatherProvider?.publicKey
          });
          throw new Error('Public key missing. Please disconnect and reconnect your Stacks wallet to enable gasless transactions.');
        }

        console.log('Stacks Swap Tx Params (Uint8Array Native):', {
          pkType: txOptions.publicKey?.constructor?.name,
          fee: txOptions.fee,
        });

        const tx = await makeUnsignedContractCall(txOptions);

        // Defensive validation: ensure tx and serialize are present
        if (!tx) {
          console.error('makeContractCall returned falsy tx', { contractAddress, contractName, functionName, functionArgs });
          throw new Error('Failed to build transaction');
        }

        // Force correct transaction version for Testnet (128 / 0x80)
        // Stacks SDK v7 uses 'transactionVersion' for serialization
        const txAny = tx as any;
        txAny.transactionVersion = 128; // Standard Testnet version
        txAny.version = 128;            // Legacy/Alias
        if (txAny.chainId !== undefined) {
          txAny.chainId = 0x80000000; // Testnet ChainId
        }

        if (typeof (tx as any).serializeBytes !== 'function') {
          console.error('Transaction object is missing serializeBytes():', tx);
          throw new Error('Transaction serialization not available');
        }
        const serialized = (tx as any).serializeBytes();
        if (!serialized) {
          console.error('serializeBytes() returned falsy value', { serialized, tx });
          throw new Error('Transaction serialization failed');
        }

        const txHex = bytesToHex(serialized);
        console.log('Serialized Transaction Hex:', txHex);
        if (!txHex) throw new Error('Failed to convert transaction to hex');

        // Step 2: Request user signature via wallet RPC (without broadcast)
        const getProvider = () => {
          if (typeof window === 'undefined') return null;
          const win = window as any;

          // Fix Deprecation Warning: Prioritize LeatherProvider global
          if (win.LeatherProvider) return win.LeatherProvider;

          // Robust provider detection (Xverse, Hiro, etc.)
          if (win.xverse?.stacks) return win.xverse.stacks;
          if (win.stx?.request) return win.stx;
          return win.StacksProvider || win.XverseProvider || null;
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
          // Try EIP-1193 style request
          response = await provider.request({
            method: 'stx_signTransaction',
            params: requestParams
          });
        } catch (error: any) {
          // Failover for Legacy Leather signature
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
            estimatedFee: gasFeeMicro.toString(),
          }),
        });

        sponsorData = await sponsorResponse.json();

        if (!sponsorResponse.ok) {
          // Handle Congestion (429) specifically
          if (sponsorResponse.status === 429 && sponsorData.message?.includes('congested')) {
            throw new Error(sponsorData.message); // Will be caught below
          }
          throw new Error(sponsorData.message || 'Sponsorship failed');
        }
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

  const getBalance = (token: Token | null): string => {
    if (!token) return '0';
    if (token.symbol === 'USDCx') return balances.usdcx;
    if (token.symbol === 'STX') return balances.stx;
    if (token.symbol === 'VEX') return balances.vex || '0';
    return '0';
  };

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
            onClick={() => setState(prev => ({ ...prev, inputToken: tokens[0], outputToken: tokens[2] }))}
            className="text-[10px] font-bold px-3 py-1.5 rounded-full border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 transition-all text-purple-600 dark:text-purple-400"
          >
            STX/VEX
          </button>
          <button
            onClick={() => setState(prev => ({ ...prev, inputToken: tokens[1], outputToken: tokens[2] }))}
            className="text-[10px] font-bold px-3 py-1.5 rounded-full border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 transition-all text-blue-600 dark:text-blue-400"
          >
            USDCx/VEX
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
            className="w-full bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 dark:from-purple-600 dark:via-blue-600 dark:to-purple-600 hover:from-purple-700 hover:via-blue-700 hover:to-purple-700 text-white font-bold py-4 rounded-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-2xl shadow-purple-500/30 dark:shadow-purple-500/50 hover:shadow-purple-500/50 dark:hover:shadow-purple-500/70 hover:scale-[1.02] active:scale-[0.98]"
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
