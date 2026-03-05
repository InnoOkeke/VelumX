import { Cl, serializeCV, deserializeCV } from '@stacks/transactions';
import { getStacksConnect, getStacksTransactions, getNetworkInstance } from './stacks-loader';
import { getConfig } from './config';

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
                console.log('Registration transaction signed:', data);

                // The data.txRaw contains the hex we need to send to the relayer for sponsorship signing and broadcast
                try {
                    const response = await fetch(`${process.env.NEXT_PUBLIC_VELUMX_RELAYER_URL || 'http://localhost:4000'}/api/v1/broadcast`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ txHex: data.txRaw })
                    });

                    if (!response.ok) {
                        const errData = await response.json();
                        throw new Error(errData.error || 'Failed to broadcast sponsored transaction');
                    }

                    const result = await response.json();
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
