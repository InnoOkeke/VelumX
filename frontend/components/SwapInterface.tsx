/**
 * SwapInterface Component
 * UI for swapping tokens on Stacks using our AMM swap contract
 */

'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '../lib/hooks/useWallet';
import { useConfig } from '../lib/config';
import { ArrowDownUp, Loader2, Settings, Repeat } from 'lucide-react';
import { formatUnits, parseUnits } from 'viem';
import { getStacksTransactions, getStacksNetwork, getStacksCommon, getStacksConnect } from '../lib/stacks-loader';
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

export function SwapInterface() {
  const { stacksAddress, stacksConnected, balances, fetchBalances } = useWallet();
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



  // Fetch quote when input changes
  useEffect(() => {
    if (state.inputToken && state.outputToken && state.inputAmount && parseFloat(state.inputAmount) > 0) {
      const timer = setTimeout(() => {
        fetchQuote();
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setState(prev => ({ ...prev, outputAmount: '', quote: null }));
    }
  }, [state.inputToken, state.outputToken, state.inputAmount]);

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

    try {
      // Common Stacks libraries
      const transactions = await getStacksTransactions() as any;
      const networkModule = await getStacksNetwork() as any;
      const common = await getStacksCommon() as any;
      const connect = await getStacksConnect() as any;

      if (!transactions || !networkModule || !common || !connect) throw new Error('Stacks libraries not loaded');

      let network;
      if (networkModule.StacksTestnet) {
        try {
          network = new networkModule.StacksTestnet();
        } catch (e) {
          network = networkModule.STACKS_TESTNET;
        }
      } else if (networkModule.STACKS_TESTNET) {
        network = networkModule.STACKS_TESTNET;
      }

      if (!network) throw new Error('Could not load Stacks network configuration');

      const amountInMicro = parseUnits(state.inputAmount, state.inputToken.decimals);
      const minAmountOutMicro = parseUnits(
        (parseFloat(state.outputAmount) * (1 - state.slippage / 100)).toFixed(6),
        state.outputToken.decimals
      );

      const isInputStx = state.inputToken.symbol === 'STX';
      const isOutputStx = state.outputToken.symbol === 'STX';
      const useGasless = state.gaslessMode;

      const [contractAddress, contractName] = (useGasless
        ? config.stacksPaymasterAddress
        : config.stacksSwapContractAddress).split('.');

      let functionName = 'swap';
      let functionArgs = [];
      const gasFee = 10000;

      if (isInputStx) {
        functionName = useGasless ? 'swap-stx-to-token-gasless' : 'swap-stx-to-token';
        const tokenOutParts = state.outputToken.address.split('.');
        functionArgs = [
          transactions.contractPrincipalCV(tokenOutParts[0], tokenOutParts[1]),
          transactions.uintCV(Number(amountInMicro)),
          transactions.uintCV(Number(minAmountOutMicro)),
        ];
        if (useGasless) functionArgs.push(transactions.uintCV(gasFee));
      } else if (isOutputStx) {
        functionName = useGasless ? 'swap-token-to-stx-gasless' : 'swap-token-to-stx';
        const tokenInParts = state.inputToken.address.split('.');
        functionArgs = [
          transactions.contractPrincipalCV(tokenInParts[0], tokenInParts[1]),
          transactions.uintCV(Number(amountInMicro)),
          transactions.uintCV(Number(minAmountOutMicro)),
        ];
        if (useGasless) functionArgs.push(transactions.uintCV(gasFee));
      } else if (useGasless) {
        functionName = 'swap-gasless';
        const tokenInParts = state.inputToken.address.split('.');
        const tokenOutParts = state.outputToken.address.split('.');
        functionArgs = [
          transactions.contractPrincipalCV(tokenInParts[0], tokenInParts[1]),
          transactions.contractPrincipalCV(tokenOutParts[0], tokenOutParts[1]),
          transactions.uintCV(Number(amountInMicro)),
          transactions.uintCV(Number(minAmountOutMicro)),
          transactions.uintCV(gasFee),
        ];
      } else {
        functionName = 'swap';
        const tokenInParts = state.inputToken.address.split('.');
        const tokenOutParts = state.outputToken.address.split('.');
        functionArgs = [
          transactions.contractPrincipalCV(tokenInParts[0], tokenInParts[1]),
          transactions.contractPrincipalCV(tokenOutParts[0], tokenOutParts[1]),
          transactions.uintCV(Number(amountInMicro)),
          transactions.uintCV(Number(minAmountOutMicro)),
        ];
      }

      if (useGasless) {
        // Step 1: Build unsigned sponsored transaction
        const tx = await transactions.makeContractCall({
          contractAddress,
          contractName,
          functionName,
          functionArgs,
          senderAddress: stacksAddress,
          network: network,
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
        // Standard flow
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
          setSlippage={(val) => setState(prev => ({ ...prev, slippage: val }))}
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
            setAmount={(val) => setState(prev => ({ ...prev, inputAmount: val, error: null }))}
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
            setEnabled={(val) => setState(prev => ({ ...prev, gaslessMode: val }))}
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
