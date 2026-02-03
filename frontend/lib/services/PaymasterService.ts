/**
 * Paymaster Service
 * Handles gasless transactions by sponsoring STX fees in exchange for USDCx
 */

import { getBackendConfig } from '../backend/config';
import { logger } from '../backend/logger';
import { ExchangeRates, FeeEstimate } from '@shared/types';
import { sponsorTransaction, deserializeTransaction } from '@stacks/transactions';
import { broadcastAndVerify } from '../backend/stacks';
import { fetchWithRetry } from '../backend/fetch';
import { stacksMintService } from './StacksMintService';

export class PaymasterService {
    private config = getBackendConfig();
    private cachedRates: ExchangeRates | null = null;
    private ratesCacheExpiry = 0;
    private readonly RATES_CACHE_DURATION = 60000;

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

    async sponsorTransaction(userTransaction: string | any, userAddress: string, estimatedFee: bigint): Promise<string> {
        logger.info('Sponsoring transaction', { userAddress, estimatedFee: estimatedFee.toString() });

        const hasSufficientBalance = await this.validateUserBalance(userAddress, estimatedFee);
        if (!hasSufficientBalance) throw new Error('User has insufficient USDCx balance to pay fee');

        try {
            await stacksMintService.fundNewAccount(userAddress);
        } catch (fundingError) {
            logger.warn('Initial gas drop failed, proceeding...', { userAddress });
        }

        try {
            let txObj = userTransaction;
            if (typeof userTransaction === 'string') txObj = deserializeTransaction(userTransaction);

            const sponsored = await sponsorTransaction({
                transaction: txObj,
                sponsorPrivateKey: this.config.relayerPrivateKey,
                fee: 50000n,
                network: 'testnet' as any
            });

            const txid = await broadcastAndVerify(sponsored, 'testnet' as any);
            logger.info('Sponsorship successful', { txid, userAddress });
            return txid;
        } catch (error: any) {
            logger.error('Sponsorship failed', { userAddress, error: error.message });
            throw error;
        }
    }

    async validateUserBalance(userAddress: string, requiredFee: bigint): Promise<boolean> {
        try {
            const resp = await fetchWithRetry(`${this.config.stacksRpcUrl}/extended/v1/address/${userAddress}/balances`);
            const data: any = await resp.json();
            const usdcxKey = Object.keys(data.fungible_tokens || {}).find(k => k.includes('usdcx'));
            const userBalance = usdcxKey ? BigInt(data.fungible_tokens[usdcxKey].balance) : 0n;
            return userBalance >= requiredFee;
        } catch (error) {
            return false;
        }
    }

    private async fetchStxPrice(): Promise<number> {
        try {
            const response = await fetchWithRetry('https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=usd', {}, { maxRetries: 2, timeout: 5000 });
            const data: any = await response.json();
            return data.blockstack?.usd || 0.5;
        } catch (error) {
            return 0.5;
        }
    }
}

export const paymasterService = new PaymasterService();
