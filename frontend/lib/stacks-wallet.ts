import { Cl, cvToString, ReadOnlyFunctionOptions } from '@stacks/transactions';
import { getNetworkInstance, getStacksTransactions } from './stacks-loader';
import { getConfig } from './config';

/**
 * Fetches the user's smart wallet address from the factory
 */
export async function getSmartWalletAddress(ownerAddress: string): Promise<string | null> {
    const config = getConfig();
    const network = await getNetworkInstance();
    const { fetchCallReadOnlyFunction } = await getStacksTransactions();

    const [contractAddress, contractName] = config.stacksWalletFactoryAddress.split('.');

    const options: ReadOnlyFunctionOptions = {
        contractAddress,
        contractName,
        functionName: 'get-wallet',
        functionArgs: [Cl.principal(ownerAddress)],
        senderAddress: ownerAddress,
        network,
    };

    try {
        const result = await fetchCallReadOnlyFunction(options);
        console.log('VelumX Smart Wallet Fetch Result:', result);
        if (result.type === 'some' || result.type === 'optionalSome' || result.type === 9) {
            const value = result.value || (result as any).data;
            const address = cvToString(value);
            console.log('VelumX Smart Wallet Address resolved to:', address);
            return address;
        }
        return null;
    } catch (error) {
        console.error('Error fetching smart wallet from factory:', error);
        return null;
    }
}

/**
 * Fetches the current nonce for a smart wallet
 */
export async function getSmartWalletNonce(walletAddress: string): Promise<number> {
    const network = await getNetworkInstance();
    const { fetchCallReadOnlyFunction } = await getStacksTransactions();

    const [contractAddress, contractName] = walletAddress.split('.');

    const options: ReadOnlyFunctionOptions = {
        contractAddress,
        contractName,
        functionName: 'get-nonce',
        functionArgs: [],
        senderAddress: walletAddress,
        network,
    };

    try {
        const result = await fetchCallReadOnlyFunction(options);
        if (result.type === 'ok' || result.type === 'responseOk' || result.type === 10) {
            const value = result.value || (result as any).data;
            return Number((value as any).value || value);
        }
        return 0;
    } catch (error) {
        console.error('Error fetching nonce from smart wallet:', error);
        return 0;
    }
}
