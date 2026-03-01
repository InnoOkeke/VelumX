import {
    makeContractDeploy,
    broadcastTransaction,
    AnchorMode,
    PostConditionMode,
    fetchNonce,
    getAddressFromPrivateKey,
    ClarityVersion,
} from '@stacks/transactions';
import { generateWallet } from '@stacks/wallet-sdk';
import { STACKS_TESTNET } from '@stacks/network';
import { readFileSync } from 'fs';
import { join } from 'path';

const tomlPath = join('..', 'contracts', 'settings', 'Testnet.toml');
const tomlContent = readFileSync(tomlPath, 'utf8');
const mnemonicMatch = tomlContent.match(/mnemonic\s*=\s*"(.*)"/);
if (!mnemonicMatch || !mnemonicMatch[1]) throw new Error("Mnemonic not found in Testnet.toml");
const mnemonic: string = mnemonicMatch[1];
const network = STACKS_TESTNET;

const contracts = [
    { name: 'paymaster-module-v3', path: 'contracts/paymaster-module-v3.clar' },
    { name: 'smart-wallet-v3', path: 'contracts/smart-wallet-v3.clar' },
];

async function deploy() {
    console.log("Starting deployment to Testnet...");

    const wallet = await generateWallet({
        secretKey: mnemonic,
        password: '',
    });
    const account = wallet.accounts[0];
    if (!account) throw new Error("No account found in wallet");
    const privateKey = account.stxPrivateKey;

    // Explicitly use testnet network for address derivation
    const address = getAddressFromPrivateKey(privateKey, "testnet");
    console.log(`Derived Address: ${address}`);

    let nonce = await fetchNonce({ address, network });
    console.log(`Starting nonce: ${nonce}`);

    for (const contract of contracts) {
        console.log(`Deploying ${contract.name}...`);
        try {
            // Force ASCII and LF newlines to prevent SIP-003 errors
            const rawCode = readFileSync(join('..', 'contracts', contract.path));
            const code = rawCode.toString('ascii').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

            const txOptions = {
                contractName: contract.name,
                codeBody: code,
                senderKey: privateKey,
                network,
                nonce,
                fee: 100000n, // Fixed fee to bypass estimation
                clarityVersion: ClarityVersion.Clarity2,
                anchorMode: AnchorMode.Any,
                postConditionMode: PostConditionMode.Allow,
            };

            const transaction = await makeContractDeploy(txOptions as any);
            const broadcastResponse = await broadcastTransaction({ transaction, network });

            if ('error' in broadcastResponse) {
                console.error(`Error broadcasting ${contract.name}: ${broadcastResponse.error}`);
                if (broadcastResponse.reason) console.error(`Reason: ${broadcastResponse.reason}`);
                // If it's a nonce issue, we might want to refresh, but for now we stop
                break;
            } else {
                console.log(`Successfully broadcasted ${contract.name}. TXID: ${broadcastResponse.txid}`);
                nonce = nonce + 1n; // Increment nonce for next contract
            }

            // Small delay to let the node process
            await new Promise(r => setTimeout(r, 2000));

        } catch (error: any) {
            console.error(`Failed to deploy ${contract.name}: ${error.message}`);
            break;
        }
    }
    console.log("Deployment process finished.");
}

deploy().catch(console.error);
