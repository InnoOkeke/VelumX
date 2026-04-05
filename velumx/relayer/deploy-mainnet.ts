import {
    makeContractDeploy,
    makeContractCall,
    broadcastTransaction,
    AnchorMode,
    PostConditionMode,
    fetchNonce,
    getAddressFromPrivateKey,
    ClarityVersion,
    principalCV,
    boolCV,
} from '@stacks/transactions';
import { generateWallet } from '@stacks/wallet-sdk';
import { STACKS_MAINNET } from '@stacks/network';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load Mainnet credentials
const tomlPath = join('..', 'contracts', 'settings', 'Mainnet.toml');
const tomlContent = readFileSync(tomlPath, 'utf8');
const mnemonicMatch = tomlContent.match(/mnemonic\s*=\s*"(.*)"/);
if (!mnemonicMatch || !mnemonicMatch[1]) throw new Error("Mnemonic for Mainnet not found");
const mnemonic: string = mnemonicMatch[1];
const network = STACKS_MAINNET;

const contracts = [
    { name: 'universal-paymaster-v1', path: 'contracts/universal-paymaster-v1.clar' },
];

async function deployMainnet() {
    console.log("🚀 Starting deployment to Stacks MAINNET...");

    const wallet = await generateWallet({
        secretKey: mnemonic,
        password: '',
    });
    const account = wallet.accounts[0];
    if (!account) throw new Error("No account found in wallet");
    const privateKey = account.stxPrivateKey;

    const address = getAddressFromPrivateKey(privateKey, "mainnet");
    console.log(`📡 Deployer Address: ${address}`);

    let nonce = await fetchNonce({ address, network });
    console.log(`🔢 Current Nonce: ${nonce}`);

    // 1. Deploy Contract
    for (const contract of contracts) {
        console.log(`📦 Deploying ${contract.name}...`);
        try {
            const rawCode = readFileSync(join('..', 'contracts', contract.path));
            const code = rawCode.toString('ascii').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

            const txOptions = {
                contractName: contract.name,
                codeBody: code,
                senderKey: privateKey,
                network,
                nonce,
                fee: 500000n, 
                clarityVersion: ClarityVersion.Clarity3, 
                anchorMode: AnchorMode.Any,
                postConditionMode: PostConditionMode.Allow,
            };

            const transaction = await makeContractDeploy(txOptions as any);
            const broadcastResponse = await broadcastTransaction({ transaction, network });

            if ('error' in broadcastResponse) {
                console.error(`❌ Error broadcasting ${contract.name}: ${broadcastResponse.error}`);
                if (broadcastResponse.reason) console.error(`Reason: ${broadcastResponse.reason}`);
                return; 
            } else {
                console.log(`✅ Successfully broadcasted ${contract.name}.`);
                console.log(`🔗 TXID: ${broadcastResponse.txid}`);
                nonce = nonce + 1n;
            }

            // 2. Authorize the Master Relayer (The Deployer) in the Registry
            console.log(`🛡️ Authorizing Master Relayer: ${address}...`);
            const authTxOptions = {
                contractAddress: address,
                contractName: contract.name,
                functionName: 'set-relayer-status',
                functionArgs: [principalCV(address), boolCV(true)],
                senderKey: privateKey,
                network,
                nonce,
                fee: 1000n,
                postConditionMode: PostConditionMode.Allow,
                anchorMode: AnchorMode.Any,
            };

            const authTx = await makeContractCall(authTxOptions);
            const authResponse = await broadcastTransaction({ transaction: authTx, network });

            if ('error' in authResponse) {
                console.error(`❌ Failed to authorize Master Relayer: ${authResponse.error}`);
            } else {
                console.log(`✅ Master Relayer Authorization broadcasted. TXID: ${authResponse.txid}`);
                nonce = nonce + 1n;
            }

        } catch (error: any) {
            console.error(`❌ Deployment failed: ${error.message}`);
            break;
        }
    }
    console.log("🏁 Deployment process finished.");
}

deployMainnet().catch(console.error);
