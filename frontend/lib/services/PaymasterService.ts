/**
 * Paymaster Service
 * Refactored to use the @velumx/sdk for production-grade relaying.
 */

import { getBackendConfig } from '@/lib/backend/config';
import { logger } from '@/lib/backend/logger';
import { ExchangeRates, FeeEstimate } from '@/shared/types';
import { VelumXClient } from '@velumx/sdk';
import { fetchWithRetry } from '@/lib/backend/fetch';

export class PaymasterService {
    private config = getBackendConfig();
    private velumxClient: VelumXClient;
    private cachedRates: ExchangeRates | null = null;
    private ratesCacheExpiry = 0;
    private readonly RATES_CACHE_DURATION = 60000;

    constructor() {
        this.velumxClient = new VelumXClient({
            coreApiUrl: this.config.stacksRpcUrl,
            network: 'testnet',
            paymasterUrl: this.config.velumxRelayerUrl.endsWith('/api/v1')
                ? this.config.velumxRelayerUrl
                : `${this.config.velumxRelayerUrl}/api/v1`,
            apiKey: this.config.velumxApiKey,
        });
    }

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
        try {
            const estimate = await this.velumxClient.estimateFee({
                estimatedGas: Number(estimatedGasInStx)
            });

            return {
                gasInStx: estimatedGasInStx,
                gasInUsdcx: BigInt(estimate.maxFeeUSDCx),
                stxToUsd: 0,
                usdcToUsd: 1.0,
                markup: this.config.paymasterMarkup,
                estimatedAt: Date.now(),
                validUntil: Date.now() + 60000,
            };
        } catch (err) {
            logger.warn('VelumX SDK Estimate failed, falling back to local calculation');
        }

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

    async sponsorTransaction(userTransaction: string | any, userAddress: string, estimatedFee: bigint, payload: string = "00"): Promise<string> {
        logger.info('Requesting Sponsorship via VelumX SDK', { userAddress, estimatedFee: estimatedFee.toString() });

        try {
            let result;
            // Detect if it's a raw Stacks transaction hex (longer than signature)
            // or a standard transaction object/intent
            if (typeof userTransaction === 'string' && userTransaction.length > 256) {
                logger.info('Detected Raw Stacks Transaction, using Native Sponsorship');
                result = await this.velumxClient.submitRawTransaction(userTransaction);
            } else {
                logger.info('Using Intent-based sponsorship (v4)');
                result = await this.velumxClient.submitIntent({
                    target: userAddress,
                    payload: payload.startsWith('0x') ? payload.substring(2) : payload,
                    maxFeeUSDCx: estimatedFee.toString(),
                    nonce: Date.now(), // Fallback if not provided, though intent signing usually uses smart wallet nonce
                    signature: typeof userTransaction === 'string' ? userTransaction : '0'.repeat(128)
                });
            }

            logger.info('VelumX Sponsorship successful', { txid: result.txid, userAddress });
            return result.txid;

        } catch (error: any) {
            logger.error('Sponsorship via SDK failed', { userAddress, error: error.message });
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

let instance: PaymasterService | null = null;

export function getPaymasterService(): PaymasterService {
    if (!instance) {
        instance = new PaymasterService();
    }
    return instance;
}
