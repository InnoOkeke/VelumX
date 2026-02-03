/**
 * Paymaster Service
 * Handles gasless transactions by sponsoring STX fees in exchange for USDCx
 */

import { getConfig } from '../config';
import { logger, logPaymasterOperation, logRelayerBalance } from '../utils/logger';
import { ExchangeRates, FeeEstimate } from '@shared/types';
import { sponsorTransaction, deserializeTransaction } from '@stacks/transactions';
import { broadcastAndVerify } from '../utils/stacks';
import { fetchWithRetry } from '../utils/fetch';
import { stacksMintService } from './StacksMintService';

export class PaymasterService {
  private config = getConfig();
  private cachedRates: ExchangeRates | null = null;
  private ratesCacheExpiry = 0;
  private readonly RATES_CACHE_DURATION = 60000; // 1 minute

  async getExchangeRates(): Promise<ExchangeRates> {
    if (this.cachedRates && Date.now() < this.ratesCacheExpiry) return this.cachedRates;
    try {
      const stxToUsd = await this.fetchStxPrice();
      const rates: ExchangeRates = { stxToUsd, usdcToUsd: 1.0, timestamp: Date.now() };
      this.cachedRates = rates;
      this.ratesCacheExpiry = Date.now() + this.RATES_CACHE_DURATION;
      return rates;
    } catch (e) {
      if (this.cachedRates) return this.cachedRates;
      return { stxToUsd: 0.5, usdcToUsd: 1.0, timestamp: Date.now() };
    }
  }

  async estimateFee(estimatedGasInStx: bigint): Promise<FeeEstimate> {
    const rates = await this.getExchangeRates();
    const gasInStxFloat = Number(estimatedGasInStx) / 1_000_000;
    const gasInUsd = gasInStxFloat * rates.stxToUsd;
    const gasInUsdcWithMarkup = gasInUsd * (1 + this.config.paymasterMarkup / 100);
    const gasInUsdcx = BigInt(Math.ceil(gasInUsdcWithMarkup * 1_000_000));
    return {
      gasInStx: estimatedGasInStx,
      gasInUsdcx,
      stxToUsd: rates.stxToUsd,
      usdcToUsd: rates.usdcToUsd,
      markup: this.config.paymasterMarkup,
      estimatedAt: Date.now(),
      validUntil: Date.now() + 60000,
    };
  }

  /**
   * Sponsor transaction and broadcast with verification
   */
  async sponsorTransaction(userTransaction: string | any, userAddress: string, estimatedFee: bigint): Promise<string> {
    logPaymasterOperation('sponsor_transaction', userAddress, { estimatedFee: estimatedFee.toString() });

    // Validate user balance first
    const hasSufficientBalance = await this.validateUserBalance(userAddress, estimatedFee);
    if (!hasSufficientBalance) throw new Error('User has insufficient USDCx balance to pay fee');

    // Ensure account is funded with minimal STX if needed (Gas Drop)
    try {
      await stacksMintService.fundNewAccount(userAddress);
    } catch (fundingError) {
      logger.warn('Initial gas drop failed, but proceeding with sponsorship', { userAddress, error: fundingError });
    }

    try {
      let txObj = userTransaction;
      if (typeof userTransaction === 'string') {
        txObj = deserializeTransaction(userTransaction);
      }

      const sponsored = await sponsorTransaction({ transaction: txObj, sponsorPrivateKey: this.config.relayerPrivateKey, fee: 50000n, network: 'testnet' as any });

      // Broadcast and verify the transaction is known by the node
      const txid = await broadcastAndVerify(sponsored, 'testnet', { maxBroadcastRetries: 3, verifyRetries: 6 });

      logger.info('Transaction sponsored and broadcast successfully', { txid, userAddress });
      return txid;
    } catch (error: any) {
      logger.error('PaymasterService.sponsorTransaction failed', { userAddress, error: error.message || String(error) });
      throw error;
    }
  }

  async validateUserBalance(userAddress: string, requiredFee: bigint): Promise<boolean> {
    try {
      const resp = await fetchWithRetry(`${this.config.stacksRpcUrl}/extended/v1/address/${userAddress}/balances`);
      const data: any = await resp.json();
      const usdcxKey = Object.keys(data.fungible_tokens || {}).find(k => k.startsWith(`${this.config.stacksUsdcxAddress}::`) || k === this.config.stacksUsdcxAddress);
      const usdcxToken = usdcxKey ? data.fungible_tokens[usdcxKey] : null;
      const userBalance = usdcxToken ? BigInt(usdcxToken.balance) : BigInt(0);
      return userBalance >= requiredFee;
    } catch (error) {
      logger.error('Failed to validate user balance', { userAddress, error: (error as Error).message });
      return false;
    }
  }

  async checkRelayerBalance(): Promise<void> {
    try {
      const resp = await fetchWithRetry(`${this.config.stacksRpcUrl}/extended/v1/address/${this.config.relayerStacksAddress}/balances`);
      const data: any = await resp.json();
      const relayerBalance = BigInt(data.stx.balance);
      const threshold = this.config.minStxBalance;
      logRelayerBalance(relayerBalance, threshold);
      if (relayerBalance < threshold) throw new Error('Relayer balance too low to sponsor transactions');
    } catch (error) {
      logger.error('Failed to check relayer balance', { error: (error as Error).message });
      throw error;
    }
  }

  private async fetchStxPrice(): Promise<number> {
    try {
      const response = await fetchWithRetry('https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=usd', {}, { maxRetries: 2, timeout: 5000 });
      const data: any = await response.json();
      return data.blockstack?.usd || 0.5;
    } catch (error) {
      logger.warn('Using fallback STX price');
      return 0.5;
    }
  }

  clearRatesCache(): void {
    this.cachedRates = null;
    this.ratesCacheExpiry = 0;
  }

  /**
   * Warm up caches and prefetch data on startup
   */
  async warmup(): Promise<void> {
    try {
      await this.getExchangeRates();
      logger.info('PaymasterService warmup complete');
    } catch (e) {
      logger.warn('PaymasterService warmup failed', { error: (e as Error).message });
    }
  }
}

export const paymasterService = new PaymasterService();
