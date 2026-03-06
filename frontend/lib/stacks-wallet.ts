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
        console.log('VelumX Smart Wallet Fetch Result:', JSON.stringify(result, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
        if (result.type === 'some' || result.type === 'optionalSome' || result.type === 9 || result.type === 'optional') {
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
        senderAddress: contractAddress, // Use deployer address as sender for read-only calls
        network,
    };

    try {
        const result = await fetchCallReadOnlyFunction(options);
        console.log('VelumX Smart Wallet Nonce Raw Result:', JSON.stringify(result, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));

        // Extract the nonce value from potentially nested Clarity types
        // Contract returns: (ok uint) which can be represented as:
        // { type: 'ok'/'responseOk'/7, value: { type: 'uint'/1, value: bigint|string } }
        let extracted: any = result;

        // Unwrap ok/response wrapper
        if (extracted.type === 'ok' || extracted.type === 'responseOk' || extracted.type === 7 || extracted.type === 10) {
            extracted = extracted.value || (extracted as any).data;
        }

        // Now extract the uint value
        if (extracted && typeof extracted === 'object') {
            // Could be { type: 'uint', value: 0n } or { type: 1, value: '0' }
            const rawVal = extracted.value !== undefined ? extracted.value : extracted;
            const parsed = Number(rawVal);
            console.log('VelumX Smart Wallet Nonce parsed:', parsed);
            return isNaN(parsed) ? 0 : parsed;
        }

        // Direct numeric value
        const directParsed = Number(extracted);
        console.log('VelumX Smart Wallet Nonce (direct):', directParsed);
        return isNaN(directParsed) ? 0 : directParsed;
    } catch (error) {
        console.error('Error fetching nonce from smart wallet:', error);
        return 0;
    }
}
