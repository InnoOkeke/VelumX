import { SignedIntent, NetworkConfig } from './types';

export class SGALClient {
    private config: NetworkConfig;
    private relayerUrl: string;

    constructor(config: NetworkConfig) {
        this.config = config;
        // Default to a hosted relayer if not provided
        this.relayerUrl = config.paymasterUrl || 'https://sgal.velumx.com/api/v1';
    }

    /**
     * Get a fee estimation from the SGAL relayer for a specific intent
     */
    public async estimateFee(intent: any): Promise<{ maxFeeUSDCx: string, estimatedGas: number }> {
        try {
            const response = await fetch(`${this.relayerUrl}/estimate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ intent })
            });

            if (!response.ok) {
                throw new Error(`Fee estimation failed: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("SGAL Client Error (estimateFee):", error);
            throw error;
        }
    }

    /**
     * Submit a signed intent to the relayer for sponsorship and execution
     */
    public async submitIntent(signedIntent: SignedIntent): Promise<{ txid: string, status: string }> {
        try {
            const response = await fetch(`${this.relayerUrl}/sponsor`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ intent: signedIntent })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(`Intent sponsorship failed: ${errData.message || response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("SGAL Client Error (submitIntent):", error);
            throw error;
        }
    }
}
