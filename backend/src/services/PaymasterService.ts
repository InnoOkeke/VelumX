/**
 * Paymaster Service
 * Handles gasless transactions by sponsoring STX fees in exchange for USDCx
 */

import { getConfig } from '../config';
import { logger, logPaymasterOperation, logRelayerBalance } from '../utils/logger';
import { ExchangeRates, FeeEstimate } from '@shared/types';
import {
  makeContractCall,
  broadcastTransaction,
  sponsorTransaction,
  deserializeTransaction,
  AnchorMode,
  PostConditionMode,
  getAddressFromPrivateKey,
} from '@stacks/transactions';
import { STACKS_TESTNET, createNetwork } from '@stacks/network';
import { generateWallet, generateNewAccount } from '@stacks/wallet-sdk';
import { fetchWithRetry } from '../utils/fetch';
import { withCache, CACHE_KEYS } from '../cache/redis';

export class PaymasterService {
  private config = getConfig();
  private cachedRates: ExchangeRates | null = null;
  private ratesCacheExpiry = 0;
  private readonly RATES_CACHE_DURATION = 300000; // 5 minutes
  private cachedRelayerKey: string | null = null;
  private relayerNonce: bigint | null = null;
  private static lastSponsorshipTime = 0;
  private static isCircuitBroken = false;
  private static circuitBreakEndTime = 0;

  // Multi-Account logic
  private relayerAccounts: { address: string; privateKey: string; index: number; nonce: bigint | null }[] = [];
  private readonly NUM_RELAYERS = 5;

  /**
   * Fetches current exchange rates (STX/USD, USDC/USD)
   * Caches rates for 5 minutes to reduce API calls
   */
  async getExchangeRates(): Promise<ExchangeRates> {
    // Return cached rates if still valid
    if (this.cachedRates && Date.now() < this.ratesCacheExpiry) {
      logger.debug('Using cached exchange rates', {
        rates: this.cachedRates,
        expiresIn: this.ratesCacheExpiry - Date.now(),
      });
      return this.cachedRates;
    }

    logger.info('Fetching fresh exchange rates');

    try {
      // Fetch STX/USD rate
      const stxToUsd = await this.fetchStxPrice();

      // USDC is pegged to USD, so it's always ~1.0
      const usdcToUsd = 1.0;

      const rates: ExchangeRates = {
        stxToUsd,
        usdcToUsd,
        timestamp: Date.now(),
      };

      // Cache the rates
      this.cachedRates = rates;
      this.ratesCacheExpiry = Date.now() + this.RATES_CACHE_DURATION;

      logger.info('Exchange rates fetched successfully', { rates });

      return rates;
    } catch (error) {
      logger.error('Failed to fetch exchange rates', { error });

      // If we have cached rates (even expired), use them as fallback
      if (this.cachedRates) {
        logger.warn('Using expired cached rates as fallback', {
          rates: this.cachedRates,
        });
        return this.cachedRates;
      }

      // Default fallback rates
      const fallbackRates: ExchangeRates = {
        stxToUsd: 0.5, // Conservative estimate
        usdcToUsd: 1.0,
        timestamp: Date.now(),
      };

      logger.warn('Using fallback exchange rates', { rates: fallbackRates });
      return fallbackRates;
    }
  }

  /**
   * Estimates gas fee for a transaction
   * Returns fee in both STX and USDCx
   */
  async estimateFee(estimatedGasInStx: bigint): Promise<FeeEstimate> {
    logger.info('Estimating transaction fee', {
      estimatedGasInStx: estimatedGasInStx.toString(),
    });

    const rates = await this.getExchangeRates();

    // Calculate USDCx equivalent with markup
    const gasInStxFloat = Number(estimatedGasInStx) / 1_000_000; // Convert micro STX to STX
    const gasInUsd = gasInStxFloat * rates.stxToUsd;
    const gasInUsdcWithMarkup = gasInUsd * (1 + this.config.paymasterMarkup / 100);
    const gasInUsdcx = BigInt(Math.ceil(gasInUsdcWithMarkup * 1_000_000)); // Convert to micro USDCx

    const estimate: FeeEstimate = {
      gasInStx: estimatedGasInStx,
      gasInUsdcx,
      stxToUsd: rates.stxToUsd,
      usdcToUsd: rates.usdcToUsd,
      markup: this.config.paymasterMarkup,
      estimatedAt: Date.now(),
      validUntil: Date.now() + 60000, // Valid for 1 minute
    };

    logger.info('Fee estimate calculated', {
      gasInStx: estimate.gasInStx.toString(),
      gasInUsdcx: estimate.gasInUsdcx.toString(),
      markup: estimate.markup,
    });

    return estimate;
  }

  /**
   * Constructs and submits a sponsored transaction
   * Relayer pays STX gas, user pays USDCx
   */
  async sponsorTransaction(
    userTransaction: string | any,
    userAddress: string,
    estimatedFee: bigint
  ): Promise<string> {
    logPaymasterOperation('sponsor_transaction', userAddress, {
      estimatedFee: estimatedFee.toString(),
    });

    try {
      // Initialize relayer accounts if not done
      if (this.relayerAccounts.length === 0) {
        if (this.config.relayerSeedPhrase) {
          logger.info(`Deriving ${this.NUM_RELAYERS} relayer accounts from seed`);

          // Generate base wallet (Index 0)
          let wallet = await generateWallet({
            secretKey: this.config.relayerSeedPhrase,
            password: '',
          });

          // push index 0
          const address0 = getAddressFromPrivateKey(wallet.accounts[0].stxPrivateKey, 'testnet');
          this.relayerAccounts.push({
            address: address0,
            privateKey: wallet.accounts[0].stxPrivateKey,
            index: 0,
            nonce: null
          });

          // Derive indices 1..4
          for (let i = 1; i < this.NUM_RELAYERS; i++) {
            wallet = generateNewAccount(wallet); // Adds next account to wallet
            const newAccount = wallet.accounts[i];
            const newAddress = getAddressFromPrivateKey(newAccount.stxPrivateKey, 'testnet');
            this.relayerAccounts.push({
              address: newAddress,
              privateKey: newAccount.stxPrivateKey,
              index: i,
              nonce: null
            });
          }

          // Log ALL derived addresses for funding
          logger.info('*** MULTI-ACCOUNT RELAYER CONFIGURATION ***');
          this.relayerAccounts.forEach(acc => {
            logger.info(`Relayer [${acc.index}]: ${acc.address}`);
          });
          logger.info('*** PLEASE FUND THESE ADDRESSES TO BYPASS CONGESTION ***');

        } else {
          // Single private key fallback
          this.relayerAccounts.push({
            address: this.config.relayerStacksAddress,
            privateKey: this.config.relayerPrivateKey,
            index: 0,
            nonce: null
          });
          logger.warn('Single private key provided. Round-robin disabled. Congestion may block service.');
        }
      }

      // Check circuit breaker
      if (PaymasterService.isCircuitBroken) {
        if (Date.now() < PaymasterService.circuitBreakEndTime) {
          const waitTime = Math.ceil((PaymasterService.circuitBreakEndTime - Date.now()) / 1000);
          throw new Error(`Relayer mempool congested. Please wait ${waitTime}s before retrying.`);
        }
        PaymasterService.isCircuitBroken = false;
      }

      // Mandatory throttling: min 5s between sponsorships to prevent mempool bursts
      const now = Date.now();
      const timeSinceLast = now - PaymasterService.lastSponsorshipTime;
      const MIN_DELAY = 5000;
      if (timeSinceLast < MIN_DELAY) {
        const wait = MIN_DELAY - timeSinceLast;
        logger.info(`Applying mandatory throttling, waiting ${wait}ms`);
        await new Promise(resolve => setTimeout(resolve, wait));
      }
      PaymasterService.lastSponsorshipTime = Date.now();

      const MAX_RELAYER_ATTEMPTS = 3;
      const failedRelayers: string[] = [];
      let lastError: any = null;

      for (let relayerAttempt = 0; relayerAttempt < MAX_RELAYER_ATTEMPTS; relayerAttempt++) {
        try {
          // Select best relayer (excluding ones that failed this session)
          const bestRelayer = await this.getBestRelayer(failedRelayers);

          // Check relayer balance (using the selected one)
          await this.checkRelayerBalance(bestRelayer.address);

          // Validate user has sufficient USDCx balance
          const hasSufficientBalance = await this.validateUserBalance(
            userAddress,
            estimatedFee
          );

          if (!hasSufficientBalance) {
            throw new Error('User has insufficient USDCx balance to pay fee');
          }

          // If userTransaction is a string (hex), deserialize it
          let txObj = userTransaction;
          if (typeof userTransaction === 'string') {
            try {
              txObj = deserializeTransaction(userTransaction);
            } catch (error) {
              logger.error('Failed to deserialize transaction', { error, tx: userTransaction });
              throw new Error('Invalid transaction data. Deserialization failed.');
            }
          }

          // Configure network object with our RPC URL
          const network = createNetwork({
            network: STACKS_TESTNET,
            client: { baseUrl: this.config.stacksRpcUrl },
          });

          // Force Testnet version and add legacy properties to prevent "Unexpected transactionVersion undefined"
          // This is critical because STACKS_TESTNET import might be incomplete or SDK versions might mismatch
          const networkAny = network as any;
          networkAny.transactionVersion = 128; // Standard Testnet version
          networkAny.version = 128;            // Legacy support
          networkAny.chainId = 0x80000000;     // Testnet ChainId
          networkAny.isMainnet = () => false;  // Helper

          // Fetch nonce if not tracked or reset
          if (this.relayerNonce === null) {
            logger.info('Fetching fresh relayer nonce from network');
            try {
              const response = await fetchWithRetry(
                `${this.config.stacksRpcUrl}/extended/v1/address/${this.config.relayerStacksAddress}/nonces`
              );
              const data: any = await response.json();
              this.relayerNonce = BigInt(data.possible_next_nonce);
            } catch (nonceError) {
              logger.error('Failed to fetch relayer nonce', { error: nonceError });
              // Fallback - will attempt auto-fetch if passed as undefined
            }
          }

          const currentNonce = this.relayerNonce;
          if (this.relayerNonce !== null) {
            this.relayerNonce++; // Optimistically increment for next call
          }

          logger.debug('Sponsoring transaction', {
            rpcUrl: this.config.stacksRpcUrl,
            nonce: currentNonce?.toString() || 'auto',
            txVersion: network.transactionVersion
          });

          // Normalize relayer private key (32 bytes required for some SDK operations)
          const relayerPrivateKey = bestRelayer.privateKey.length === 66
            ? bestRelayer.privateKey.substring(0, 64)
            : bestRelayer.privateKey;

          // Sponsor the transaction with relayer's private key
          const sponsoredTx = await sponsorTransaction({
            transaction: txObj,
            sponsorPrivateKey: relayerPrivateKey,
            fee: 50000n, // 0.05 STX sponsor fee
            sponsorNonce: currentNonce || undefined,
            network,
          });

          logger.debug('Transaction sponsored, broadcasting...', {
            txid: sponsoredTx.txid()
          });

          // Broadcast the sponsored transaction with retries
          let broadcastResponse: any;
          let lastBroadcastError: any;
          const MAX_BROADCAST_RETRIES = 3;

          for (let attempt = 1; attempt <= MAX_BROADCAST_RETRIES; attempt++) {
            try {
              logger.debug(`Broadcasting sponsored transaction (attempt ${attempt}/${MAX_BROADCAST_RETRIES})`, {
                txid: sponsoredTx.txid()
              });

              broadcastResponse = await broadcastTransaction({ transaction: sponsoredTx, network });

              if (!('error' in broadcastResponse)) {
                break; // Success
              }

              lastBroadcastError = broadcastResponse;

              // Specific check for BadNonce - reset our tracker so it refetches
              if (broadcastResponse.reason === 'BadNonce' || (broadcastResponse.error && broadcastResponse.error.includes('Nonce'))) {
                logger.warn('BadNonce detected, resetting relayer nonce tracker');
                this.relayerNonce = null;
              }

              logger.warn(`Broadcast attempt ${attempt} failed`, {
                error: broadcastResponse.error,
                reason: broadcastResponse.reason,
                txid: sponsoredTx.txid()
              });

              // Wait before retry if it's a transient node error
              if (attempt < MAX_BROADCAST_RETRIES) {
                let delay = 2000 * attempt;

                // Special handling for TooMuchChaining - back off more aggressively
                if (broadcastResponse.reason === 'TooMuchChaining' || (broadcastResponse.error && broadcastResponse.error.includes('TooMuchChaining'))) {
                  logger.warn('TooMuchChaining detected, increasing retry delay');
                  delay = 10000 * attempt; // 10s, 20s, 30s...
                }

                await new Promise(resolve => setTimeout(resolve, delay));
              }
            } catch (broadError) {
              lastBroadcastError = broadError;
              logger.error(`Broadcast exception (attempt ${attempt})`, {
                error: broadError instanceof Error ? broadError.message : String(broadError),
                txid: sponsoredTx.txid()
              });

              if (attempt < MAX_BROADCAST_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
              }
            }
          }

          // If we hit TooMuchChaining after all retries, add to failed list and retry logic
          if (errorMsg.includes('TooMuchChaining')) {
            logger.warn(`Relayer ${bestRelayer.address} is congested (TooMuchChaining), switching...`);
            failedRelayers.push(bestRelayer.address);
            lastError = new Error(errorMsg);
            this.relayerNonce = null; // Reset nonce tracking
            continue; // Try next relayer
          }

          logger.error('Final broadcast failure', {
            error: errorMsg,
            details: lastBroadcastError,
            txid: sponsoredTx.txid()
          });
          throw new Error(errorMsg);
        }

      const txid = broadcastResponse.txid;

        logger.info('Transaction sponsored and broadcast successfully', {
          txid,
          userAddress,
          explorerUrl: `https://explorer.hiro.so/txid/${txid}?chain=testnet`,
        });

        return txid;
      } catch (attemptError: any) {
        // Catch errors from within the loop (like balance checks or sponsorship failures)
        const errMsg = attemptError.message || String(attemptError);
        lastError = attemptError;

        if (errMsg.includes('TooMuchChaining') || errMsg.includes('ConflictingNonceInMempool') || errMsg.includes('BadNonce')) {
          logger.warn(`Relayer attempt ${relayerAttempt + 1} failed with retryable error: ${errMsg}`);
          // If we have a relayer address in context (we should), exclude it
          // Since 'bestRelayer' is block-scoped, we might not have it here easily if it failed before assignment
          // But usually it fails during broadcast.
          // If it failed at 'getBestRelayer' or 'checkRelayerBalance', we might not need to exclude.
          continue;
        }
        throw attemptError;
      }
    } // End of retry loop

  // If we exhausted all retries
  throw lastError || new Error('All relayer attemps failed');
  }

  /**
   * Validates that user has sufficient USDCx balance for fee
   */
  async validateUserBalance(
    userAddress: string,
    requiredFee: bigint
  ): Promise<boolean> {
    const cacheKey = `user:balance:${userAddress}`;

    return withCache(cacheKey, async () => {
      logger.debug('Validating user USDCx balance', {
        userAddress,
        requiredFee: requiredFee.toString(),
      });

      try {
        // Query USDCx contract for user's balance
        const response = await fetchWithRetry(
          `${this.config.stacksRpcUrl}/extended/v1/address/${userAddress}/balances`
        );

        const data: any = await response.json();

        // Find USDCx token balance - Stacks API keys are "principal::asset_name"
        // We look for a key that starts with our contract address
        const usdcxKey = Object.keys(data.fungible_tokens || {}).find(
          key => key.startsWith(`${this.config.stacksUsdcxAddress}::`) || key === this.config.stacksUsdcxAddress
        );

        const usdcxToken = usdcxKey ? data.fungible_tokens[usdcxKey] : null;
        const userBalance = usdcxToken ? BigInt(usdcxToken.balance) : BigInt(0);

        const hasSufficientBalance = userBalance >= requiredFee;

        logger.info('User balance validation result', {
          userAddress,
          userBalance: userBalance.toString(),
          requiredFee: requiredFee.toString(),
          hasSufficientBalance,
        });

        return hasSufficientBalance;
      } catch (error) {
        logger.error('Failed to validate user balance', {
          userAddress,
          error: (error as Error).message,
        });
        return false;
      }
    }, 30); // 30 second cache for user balance
  }

  /**
   * Validates that user has sufficient USDCx balance for fee
   */
  async validateUserBalance(
    userAddress: string,
    requiredFee: bigint
  ): Promise<boolean> {
    const cacheKey = `user:balance:${userAddress}`;

    return withCache(cacheKey, async () => {
      logger.debug('Validating user USDCx balance', {
        userAddress,
        requiredFee: requiredFee.toString(),
      });

      try {
        // Query USDCx contract for user's balance
        const response = await fetchWithRetry(
          `${this.config.stacksRpcUrl}/extended/v1/address/${userAddress}/balances`
        );

        const data: any = await response.json();

        // Find USDCx token balance - Stacks API keys are "principal::asset_name"
        // We look for a key that starts with our contract address
        const usdcxKey = Object.keys(data.fungible_tokens || {}).find(
          key => key.startsWith(`${this.config.stacksUsdcxAddress}::`) || key === this.config.stacksUsdcxAddress
        );

        const usdcxToken = usdcxKey ? data.fungible_tokens[usdcxKey] : null;
        const userBalance = usdcxToken ? BigInt(usdcxToken.balance) : BigInt(0);

        const hasSufficientBalance = userBalance >= requiredFee;

        logger.info('User balance validation result', {
          userAddress,
          userBalance: userBalance.toString(),
          requiredFee: requiredFee.toString(),
          hasSufficientBalance,
        });

        return hasSufficientBalance;
      } catch (error) {
        logger.error('Failed to validate user balance', {
          userAddress,
          error: (error as Error).message,
        });
        return false;
      }
    }); // 30 second cache for user balance
  }


  /**
   * Selects the best relayer account based on mempool depth and balance
   */
  async getBestRelayer(excludeAddresses: string[] = []): Promise<{ address: string; privateKey: string; index: number; nonce: bigint | null }> {
    // Filter available accounts
    const availableAccounts = this.relayerAccounts.filter(acc => !excludeAddresses.includes(acc.address));

    if (availableAccounts.length === 0) {
      logger.warn('All relayers excluded or busy, resetting exclusion list');
      // If all excluded, fall back to any random one to try again
      return this.relayerAccounts[Math.floor(Math.random() * this.relayerAccounts.length)];
    }

    // If only one account available, return it
    if (availableAccounts.length === 1) return availableAccounts[0];

    // For multiple accounts, check mempool depth
    for (const account of availableAccounts) {
      const depth = await this.getMempoolDepth(account.address);
      if (depth < 15) { // Threshold
        logger.info(`Selected relayer ${account.index} with depth ${depth}`);
        return account;
      }
    }

    // If all congested, return the one with lowest depth or just random from available
    logger.warn('All available relayers congested, picking random as fallback');
    return availableAccounts[Math.floor(Math.random() * availableAccounts.length)];
  }

  /**
   * Checks relayer's STX balance and alerts if below threshold
   */
  async checkRelayerBalance(address?: string): Promise<void> {
    const targetAddress = address || this.config.relayerStacksAddress;
    const cacheKey = `relayer:balance:${targetAddress}`;

    // We cache the relayer balance check for 5 minutes since it's a large balance
    await withCache(cacheKey, async () => {
      try {
        // Query Stacks API for relayer's STX balance
        const response = await fetchWithRetry(
          `${this.config.stacksRpcUrl}/extended/v1/address/${targetAddress}/balances`
        );

        const data: any = await response.json();
        const relayerBalance = BigInt(data.stx.balance);
        const threshold = this.config.minStxBalance;

        logRelayerBalance(relayerBalance, threshold);

        if (relayerBalance < threshold) {
          logger.error('Relayer STX balance below threshold!', {
            balance: relayerBalance.toString(),
            threshold: threshold.toString(),
            relayerAddress: targetAddress,
          });

          // Alert: Relayer needs funding
          throw new Error('Relayer balance too low to sponsor transactions');
        }

        logger.debug('Relayer balance check passed', {
          balance: relayerBalance.toString(),
          threshold: threshold.toString(),
        });

        return true; // Needed for withCache
      } catch (error) {
        logger.error('Failed to check relayer balance', { error });
        throw error;
      }
    }, 300); // 5 minute cache
  }

  /**
   * Gets the number of pending transactions in the mempool for an address
   */
  async getMempoolDepth(address: string): Promise<number> {
    try {
      const response = await fetchWithRetry(
        `${this.config.stacksRpcUrl}/extended/v1/address/${address}/mempool?limit=1`
      );
      const data: any = await response.json();
      return data.total || 0;
    } catch (error) {
      logger.error('Failed to fetch mempool depth', { address, error });
      return 0; // Fallback to 0 so we don't block
    }
  }

  /**
   * Fetches STX price from exchange API
   * @private
   */
  private async fetchStxPrice(): Promise<number> {
    try {
      // Using CoinGecko API
      const response = await fetchWithRetry(
        'https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=usd',
        {},
        { maxRetries: 2, timeout: 5000 }
      );

      const data: any = await response.json();
      const stxPrice = data.blockstack?.usd;

      if (!stxPrice || typeof stxPrice !== 'number') {
        throw new Error('Invalid STX price data from API');
      }

      logger.debug('STX price fetched', { price: stxPrice });

      return stxPrice;
    } catch (error) {
      logger.error('Failed to fetch STX price from CoinGecko', { error });

      // Try alternative API or use fallback
      logger.warn('Using fallback STX price');
      return 0.5; // Conservative fallback
    }
  }

  /**
   * Warm up caches on startup
   */
  async warmup(): Promise<void> {
    logger.info('Warming up PaymasterService caches');
    try {
      await this.getExchangeRates();
      logger.info('PaymasterService cache warmup successful');
    } catch (error) {
      logger.warn('PaymasterService cache warmup failed', { error });
    }
  }

  /**
   * Clears the exchange rates cache
   * Useful for testing or forcing a refresh
   */
  clearRatesCache(): void {
    this.cachedRates = null;
    this.ratesCacheExpiry = 0;
    logger.debug('Exchange rates cache cleared');
  }
}

// Export singleton instance
export const paymasterService = new PaymasterService();
