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

        // Point to the internal /api/paymaster proxy
        // The SDK will append /estimate and /broadcast
        client = new VelumXClient({
            coreApiUrl,
            paymasterUrl: `${window.location.origin}/api/paymaster`,
            network: config.stacksNetwork
        });
    }
    return client;
}
