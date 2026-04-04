import { VelumXClient } from '@velumx/sdk';
import { getConfig } from './config';

/**
 * VelumX SDK Integration for DeFi Frontend
 * This uses the official @velumx/sdk via a secure proxy.
 */
let clientInstance: VelumXClient | null = null;

export function getVelumXClient(): VelumXClient {
    if (!clientInstance) {
        const config = getConfig();
        clientInstance = new VelumXClient({
            network: config.stacksNetwork,
            coreApiUrl: config.stacksNetwork === 'mainnet' 
                ? 'https://api.mainnet.hiro.so' 
                : 'https://api.testnet.hiro.so',
            paymasterUrl: '/api/velumx/proxy'
        });
    }
    return clientInstance;
}
