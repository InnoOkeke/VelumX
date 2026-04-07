import { NetworkConfig, SponsorshipOptions, FeeEstimateResult, SponsorResult } from './types';

/**
 * VelumXClient — The core SDK for integrating VelumX gasless sponsorship.
 *
 * The SDK does NOT build transactions. That is the developer's responsibility.
 * The SDK's job:
 *   1. estimateFee()  — ask the relayer what the gas cost is in a chosen SIP-010 token
 *   2. sponsor()      — submit a signed Stacks tx hex to the relayer for STX fee sponsorship
 *
 * Integration pattern:
 *   const txHex = await myDexSDK.buildSwapTx({ ... });          // developer builds tx
 *   const { maxFee } = await velumx.estimateFee({ feeToken });  // VelumX estimates fee
 *   const { txid } = await velumx.sponsor(txHex, { feeToken, feeAmount: maxFee }); // VelumX sponsors
 */
export class VelumXClient {
    private config: NetworkConfig;
    private relayerUrl: string;

    constructor(config: NetworkConfig) {
        if (!config.apiKey && !config.paymasterUrl?.includes('/api/velumx/proxy')) {
            throw new Error(
                'VelumX: API Key is required. Get yours at the VelumX Developer Dashboard.'
            );
        }
        this.config = config;
        this.relayerUrl = config.paymasterUrl || 'https://api.velumx.xyz/api/v1';
    }

    /**
     * Estimate the gas fee for a transaction in a specific SIP-010 token.
     *
     * @param params.feeToken  - Contract principal of the token the user will pay gas with
     *                           e.g. 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx'
     * @param params.estimatedGas - Optional gas estimate (default: 150000)
     *
     * @returns maxFee (in micro units of feeToken), policy, estimatedGas
     *
     * @example
     * const { maxFee, policy } = await velumx.estimateFee({
     *   feeToken: 'SP120...usdcx',
     *   estimatedGas: 150000
     * });
     * // If policy === 'DEVELOPER_SPONSORS', maxFee will be "0" — user pays nothing
     */
    public async estimateFee(params: {
        feeToken: string;
        estimatedGas?: number;
    }): Promise<FeeEstimateResult> {
        const { feeToken, estimatedGas = 150000 } = params;

        const response = await fetch(`${this.relayerUrl}/estimate`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({
                intent: {
                    feeToken,
                    estimatedGas,
                    network: this.config.network
                }
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: response.statusText })) as any;
            throw new Error(`Fee estimation failed: ${err.error || err.message || response.statusText}`);
        }

        return response.json() as Promise<FeeEstimateResult>;
    }

    /**
     * Sponsor a signed Stacks transaction — the relayer pays the STX network fee.
     *
     * The developer builds and signs the transaction with `sponsored: true` using
     * @stacks/connect or @stacks/transactions. The raw tx hex is then passed here.
     *
     * @param txHex    - Raw signed transaction hex (from wallet or @stacks/transactions)
     * @param options  - Metadata: feeToken, feeAmount (in micro units), network, userId
     *
     * @returns txid and status
     *
     * @example
     * // Using @stacks/connect (browser wallet)
     * openContractCall({
     *   ...,
     *   sponsored: true,
     *   onFinish: async ({ txRaw }) => {
     *     const { txid } = await velumx.sponsor(txRaw, {
     *       feeToken: 'SP120...usdcx',
     *       feeAmount: maxFee
     *     });
     *   }
     * });
     *
     * @example
     * // Using @stacks/transactions (server-side or Node.js)
     * import { makeContractCall, sponsorTransaction } from '@stacks/transactions';
     * const tx = await makeContractCall({ ..., sponsored: true });
     * const serialized = bytesToHex(tx.serialize());
     * const { txid } = await velumx.sponsor(serialized, { feeToken, feeAmount });
     */
    public async sponsor(txHex: string, options?: SponsorshipOptions): Promise<SponsorResult> {
        const response = await fetch(`${this.relayerUrl}/broadcast`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({
                txHex,
                feeToken: options?.feeToken,
                feeAmount: options?.feeAmount,
                userId: options?.userId,
                network: options?.network || this.config.network
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: response.statusText })) as any;
            throw new Error(`Sponsorship failed: ${err.error || err.message || response.statusText}`);
        }

        return response.json() as Promise<SponsorResult>;
    }

    /**
     * Fetch the developer's relayer configuration.
     * Returns supported gas tokens and sponsorship policy for this API key.
     *
     * @example
     * const { supportedGasTokens, sponsorshipPolicy } = await velumx.getConfig();
     * // sponsorshipPolicy === 'DEVELOPER_SPONSORS' → user pays no gas
     * // supportedGasTokens → filter your gas token UI to only show these
     */
    public async getConfig(): Promise<{
        supportedGasTokens: string[];
        sponsorshipPolicy: 'DEVELOPER_SPONSORS' | 'USER_PAYS';
    }> {
        const response = await fetch(`${this.relayerUrl}/config`, {
            method: 'GET',
            headers: this.headers()
        });

        if (!response.ok) {
            return { supportedGasTokens: [], sponsorshipPolicy: 'USER_PAYS' };
        }

        return response.json();
    }

    private headers(): Record<string, string> {
        const h: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.config.apiKey && this.config.apiKey !== 'proxied') {
            h['x-api-key'] = this.config.apiKey;
        }
        return h;
    }
}
