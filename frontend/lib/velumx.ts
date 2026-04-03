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

        // Secure Proxy Integration:
        // Use our internal Next.js API route as the paymasterUrl.
        // This keeps the VELUMX_API_KEY hidden on the server.
        const paymasterUrl = '/api/velumx/proxy';

        client = new VelumXClient({
            coreApiUrl,
            paymasterUrl,
            network: config.stacksNetwork,
            apiKey: 'proxied' // Token value to satisfy SDK requirement (real key added by server)
        });

    }
    return client;
}
