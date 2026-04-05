import { SignedIntent, NetworkConfig, SponsorshipOptions } from './types';

export class VelumXClient {
    private config: NetworkConfig;
    private relayerUrl: string;

    constructor(config: NetworkConfig) {
        if (!config.apiKey && !config.paymasterUrl?.includes('/api/velumx/proxy')) {
            throw new Error("VelumX Client Error: API Key is required. Please obtain your key from the VelumX Developer Dashboard.");
        }
        this.config = config;
        // Default to a hosted relayer if not provided
        this.relayerUrl = config.paymasterUrl || 'https://relayer.velumx.com/api/v1';
    }

    /**
     * Get a fee estimation from the relayer for a specific intent
     */
    public async estimateFee(intent: any): Promise<{ maxFee: string, estimatedGas: number }> {
        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (this.config.apiKey && this.config.apiKey !== 'proxied') {
                headers['x-api-key'] = this.config.apiKey;
            }

            const response = await fetch(`${this.relayerUrl}/estimate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ 
                    intent: { 
                        ...intent, 
                        network: this.config.network 
                    } 
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: 'Unknown error' })) as any;
                throw new Error(`Fee estimation failed: ${errData.error || errData.message || response.statusText}`);
            }

            return await response.json() as { maxFee: string, estimatedGas: number };
        } catch (error) {
            console.error("VelumX Client Error (estimateFee):", error);
            throw error;
        }
    }

    /**
     * Submit a signed intent to the relayer for sponsorship and execution
     */
    public async submitIntent(signedIntent: SignedIntent): Promise<{ txid: string, status: string }> {
        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (this.config.apiKey && this.config.apiKey !== 'proxied') {
                headers['x-api-key'] = this.config.apiKey;
            }

            const response = await fetch(`${this.relayerUrl}/sponsor`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ 
                    intent: { 
                        ...signedIntent, 
                        network: this.config.network 
                    } 
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: 'Unknown error' })) as any;
                throw new Error(`Intent sponsorship failed: ${errData.error || errData.message || response.statusText}`);
            }

            return await response.json() as { txid: string, status: string };
        } catch (error) {
            console.error("VelumX Client Error (submitIntent):", error);
            throw error;
        }
    }

    /**
     * [New Recommended Method] Request sponsorship for a Stacks transaction
     * @param txHex The raw transaction hex
     * @param options Metadata like developer-reported fee and userId
     */
    public async sponsor(txHex: string, options?: SponsorshipOptions): Promise<{ txid: string, status: string }> {
        return this.submitRawTransaction(txHex, options);
    }

    /**
     * Submit a raw Stacks transaction hex for native sponsorship
     */
    public async submitRawTransaction(txHex: string, options?: SponsorshipOptions): Promise<{ txid: string, status: string }> {
        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (this.config.apiKey && this.config.apiKey !== 'proxied') {
                headers['x-api-key'] = this.config.apiKey;
            }

            const response = await fetch(`${this.relayerUrl}/broadcast`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ 
                    txHex,
                    userId: options?.userId,
                    feeAmount: options?.feeAmount,
                    network: this.config.network
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: 'Unknown error' })) as any;
                throw new Error(`Transaction broadcast failed: ${errData.error || errData.message || response.statusText}`);
            }

            return await response.json() as { txid: string, status: string };
        } catch (error) {
            console.error("VelumX Client Error (submitRawTransaction):", error);
            throw error;
        }
    }
}
