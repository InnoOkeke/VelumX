import { SignedIntent, NetworkConfig } from './types';

export class VelumXClient {
    private config: NetworkConfig;
    private relayerUrl: string;

    constructor(config: NetworkConfig) {
        if (!config.apiKey) {
            throw new Error("VelumX Client Error: API Key is required. Please obtain your key from the VelumX Developer Dashboard.");
        }
        this.config = config;
        // Default to a hosted relayer if not provided
        this.relayerUrl = config.paymasterUrl || 'https://relayer.velumx.com/api/v1';
    }

    /**
     * Get a fee estimation from the SGAL relayer for a specific intent
     */
    public async estimateFee(intent: any): Promise<{ maxFeeUSDCx: string, estimatedGas: number }> {
        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (this.config.apiKey) {
                headers['x-api-key'] = this.config.apiKey;
            }

            const response = await fetch(`${this.relayerUrl}/estimate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ intent })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: 'Unknown error' })) as any;
                throw new Error(`Fee estimation failed: ${errData.error || errData.message || response.statusText}`);
            }

            return await response.json() as { maxFeeUSDCx: string, estimatedGas: number };
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
            if (this.config.apiKey) {
                headers['x-api-key'] = this.config.apiKey;
            }

            const response = await fetch(`${this.relayerUrl}/sponsor`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ intent: signedIntent })
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
     * Submit a raw Stacks transaction hex for native sponsorship
     */
    public async submitRawTransaction(txHex: string): Promise<{ txid: string, status: string }> {
        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (this.config.apiKey) {
                headers['x-api-key'] = this.config.apiKey;
            }

            const response = await fetch(`${this.relayerUrl}/broadcast`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ txHex })
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
