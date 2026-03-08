import { getStacksConnect, getStacksTransactions, getNetworkInstance } from './stacks-loader';
import { getConfig } from './config';
import { getVelumXClient } from './velumx';

/**
 * Registers the user's account with a smart wallet in the factory.
 * This transaction is sponsored by the VelumX Relayer.
 */
export async function registerSmartWallet(ownerAddress: string): Promise<{ txid: string } | null> {
    const config = getConfig();
    const network = await getNetworkInstance();
    const connectLib = await getStacksConnect();
    const { openContractCall } = connectLib;

    if (!openContractCall) {
        throw new Error('Stacks Connect not properly initialized');
    }

    const transactions = await getStacksTransactions();
    const { Cl } = transactions as any;

    const [factoryAddress, factoryName] = config.stacksWalletFactoryAddress.split('.');

    return new Promise((resolve, reject) => {
        openContractCall({
            contractAddress: factoryAddress,
            contractName: factoryName,
            functionName: 'register-wallet',
            functionArgs: [Cl.principal(config.stacksSmartWalletAddress)],
            network,
            sponsored: true,
            onFinish: async (data: any) => {
                console.log('VelumX: Registration transaction signed (v8 suite):', data);

                try {
                    const velumx = getVelumXClient();
                    const result = await velumx.submitRawTransaction(data.txRaw);
                    resolve({ txid: result.txid });
                } catch (error) {
                    console.error('Error broadcasting registration:', error);
                    reject(error);
                }
            },
            onCancel: () => {
                console.log('Registration cancelled');
                resolve(null);
            },
        });
    });
}
