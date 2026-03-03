import { VelumXClient } from '@velumx/sdk';
import { getConfig } from './config';

/**
 * Shared VelumX Client for Frontend
 * Points to our internal Next.js API proxy which ensures
 * correct network and relayer configuration.
 */
let client: VelumXClient | null = null;

export function getVelumXClient() {
    if (!client) {
        const config = getConfig();
        const coreApiUrl = config.stacksNetwork === 'mainnet'
            ? 'https://api.mainnet.hiro.so'
            : 'https://api.testnet.hiro.so';

        // Use the direct relayer URL from environment variables for true integration.
        // Fallback to the SDK's default hosted relayer if no custom URL is provided.
        const paymasterUrl = process.env.NEXT_PUBLIC_VELUMX_RELAYER_URL || 'https://relayer.velumx.com/api/v1';

        client = new VelumXClient({
            coreApiUrl,
            paymasterUrl,
            network: config.stacksNetwork,
            apiKey: process.env.NEXT_PUBLIC_VELUMX_API_KEY
        });

    }
    return client;
}
