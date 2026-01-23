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
} from '@stacks/transactions';

export class PaymasterService {
  private config = getConfig();
  private cachedRates: ExchangeRates | null = null;
  private ratesCacheExpiry = 0;
  private readonly RATES_CACHE_DURATION = 60000; // 1 minute

  /**
   * Fetches current exchange rates (STX/USD, USDC/USD)
   * Caches rates for 1 minute to reduce API calls
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
      // Check relayer balance before sponsoring
      await this.checkRelayerBalance();

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

      logger.info('Sponsoring transaction', {
        userAddress,
        estimatedFee: estimatedFee.toString(),
      });

      // Sponsor the transaction with relayer's private key
      const sponsoredTx = await sponsorTransaction({
        transaction: txObj,
        sponsorPrivateKey: this.config.relayerPrivateKey,
        fee: 50000n, // 0.05 STX sponsor fee
        sponsorNonce: undefined, // Will be fetched automatically
        network: 'testnet',
      });

      // Broadcast the sponsored transaction
      const broadcastResponse = await broadcastTransaction(sponsoredTx, 'testnet');

      if (broadcastResponse.error) {
        logger.error('Failed to broadcast sponsored transaction', {
          error: broadcastResponse.error,
          reason: broadcastResponse.reason,
        });
        throw new Error(`Broadcast failed: ${broadcastResponse.error}`);
      }

      const txid = broadcastResponse.txid;

      logger.info('Transaction sponsored and broadcast successfully', {
        txid,
        userAddress,
        explorerUrl: `https://explorer.hiro.so/txid/${txid}?chain=testnet`,
      });

      return txid;
    } catch (error) {
      logger.error('Failed to sponsor transaction', {
        userAddress,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Validates that user has sufficient USDCx balance for fee
   */
  async validateUserBalance(
    userAddress: string,
    requiredFee: bigint
  ): Promise<boolean> {
    logger.debug('Validating user USDCx balance', {
      userAddress,
      requiredFee: requiredFee.toString(),
    });

    try {
      // Query USDCx contract for user's balance
      const response = await fetch(
        `${this.config.stacksRpcUrl}/extended/v1/address/${userAddress}/balances`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch balance: ${response.status}`);
      }

      const data: any = await response.json();

      // Find USDCx token balance
      const usdcxToken = data.fungible_tokens?.[this.config.stacksUsdcxAddress];
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
  }

  /**
   * Checks relayer's STX balance and alerts if below threshold
   */
  async checkRelayerBalance(): Promise<void> {
    try {
      // Query Stacks API for relayer's STX balance
      const response = await fetch(
        `${this.config.stacksRpcUrl}/extended/v1/address/${this.config.relayerStacksAddress}/balances`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch relayer balance: ${response.status}`);
      }

      const data: any = await response.json();
      const relayerBalance = BigInt(data.stx.balance);
      const threshold = this.config.minStxBalance;

      logRelayerBalance(relayerBalance, threshold);

      if (relayerBalance < threshold) {
        logger.error('Relayer STX balance below threshold!', {
          balance: relayerBalance.toString(),
          threshold: threshold.toString(),
          relayerAddress: this.config.relayerStacksAddress,
        });

        // Alert: Relayer needs funding
        throw new Error('Relayer balance too low to sponsor transactions');
      }

      logger.debug('Relayer balance check passed', {
        balance: relayerBalance.toString(),
        threshold: threshold.toString(),
      });
    } catch (error) {
      logger.error('Failed to check relayer balance', { error });
      throw error;
    }
  }

  /**
   * Fetches STX price from exchange API
   * @private
   */
  private async fetchStxPrice(): Promise<number> {
    try {
      // Using CoinGecko API as an example
      // In production, you might want to use multiple sources and average them
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=usd'
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

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
