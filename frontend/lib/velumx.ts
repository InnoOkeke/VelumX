import { getConfig } from './config';

/**
 * VelumX SDK Wrapper
 * This handles secure sponsorship requests through our server-side proxy.
 * It allows developers to report dynamic fees per transaction.
 */
class VelumXFrontendClient {
    private baseUrl: string = '/api/velumx/proxy';

    /**
     * Request gas sponsorship for a transaction
     * @param txHex The raw transaction hex
     * @param feeAmount Optional: The specific fee (in 6-decimal units) collected by the dApp
     * @param userId Optional: The developer's unique userId for derived wallet management
     */
    async sponsor(txHex: string, userId?: string, feeAmount?: string): Promise<any> {
        const response = await fetch(`${this.baseUrl}/api/v1/broadcast`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                txHex,
                userId,
                feeAmount // Dynamically reported fee for the dashboard
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'VelumX Sponsorship Failed');
        }
        return data;
    }
}

let clientInstance: VelumXFrontendClient | null = null;

export function getVelumXClient() {
    if (!clientInstance) {
        clientInstance = new VelumXFrontendClient();
    }
    return clientInstance;
}
