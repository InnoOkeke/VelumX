import { getConfig } from './config';

/**
 * VelumX SDK Wrapper for DeFi Frontend
 * This handles secure communication with the Relayer via our internal proxy.
 */
class VelumXFrontendClient {
    private baseUrl: string = '/api/velumx/proxy';

    /**
     * Get a fee estimation for a transaction
     */
    async estimateFee(params: { estimatedGas: number }): Promise<{ maxFeeUSDCx: string, estimatedGas: number }> {
        const response = await fetch(`${this.baseUrl}/estimate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'VelumX Fee Estimation Failed');
        }
        return data;
    }

    /**
     * Request gas sponsorship for a transaction
     * @param txHex The raw transaction hex
     * @param userId Optional: The developer's unique userId
     * @param feeAmount Optional: The specific fee collected by the dApp
     */
    async sponsor(txHex: string, userId?: string, feeAmount?: string): Promise<{ txid: string, status: string }> {
        const response = await fetch(`${this.baseUrl}/broadcast`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ txHex, userId, feeAmount })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'VelumX Sponsorship Failed');
        }
        return data as { txid: string, status: string };
    }
}

let clientInstance: VelumXFrontendClient | null = null;

export function getVelumXClient(): VelumXFrontendClient {
    if (!clientInstance) {
        clientInstance = new VelumXFrontendClient();
    }
    return clientInstance;
}
