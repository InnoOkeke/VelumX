import {
    makeContractCall,
    broadcastTransaction,
    AnchorMode,
    PostConditionMode,
    fetchNonce,
    getAddressFromPrivateKey,
    principalCV,
    boolCV,
} from '@stacks/transactions';
import { generateWallet } from '@stacks/wallet-sdk';
import { STACKS_MAINNET } from '@stacks/network';
import { readFileSync } from 'fs';
import { join } from 'path';

async function authorizeMasterRelayer() {
    console.log("🛡️ Authorizing Master Relayer on Mainnet...");

    // Load Mainnet credentials
    const tomlPath = join('..', 'contracts', 'settings', 'Mainnet.toml');
    const tomlContent = readFileSync(tomlPath, 'utf8');
    const mnemonicMatch = tomlContent.match(/mnemonic\s*=\s*"(.*)"/);
    if (!mnemonicMatch || !mnemonicMatch[1]) throw new Error("Mnemonic for Mainnet not found");
    const mnemonic: string = mnemonicMatch[1];
    const network = STACKS_MAINNET;

    const wallet = await generateWallet({
        secretKey: mnemonic,
        password: '',
    });
    const account = wallet.accounts[0];
    if (!account) throw new Error("No account found for given mnemonic");
    const privateKey = account.stxPrivateKey;
    const address = getAddressFromPrivateKey(privateKey, "mainnet");

    const contractAddress = address; 
    const contractName = 'universal-paymaster-v1';

    console.log(`Relayer: ${address}`);
    console.log(`Contract: ${contractAddress}.${contractName}`);

    const nonce = await fetchNonce({ address, network });
    console.log(`Nonce: ${nonce}`);

    const txOptions = {
        contractAddress,
        contractName,
        functionName: 'set-relayer-status',
        functionArgs: [principalCV(address), boolCV(true)],
        senderKey: privateKey,
        network,
        nonce,
        fee: 2000n, // Incremental fee for Mainnet
        postConditionMode: PostConditionMode.Allow,
        anchorMode: AnchorMode.Any,
    };

    try {
        const transaction = await makeContractCall(txOptions);
        const response = await broadcastTransaction({ transaction, network });

        if ('error' in response) {
            console.error("❌ Authorization failed:", response.error);
            if (response.reason) console.error("Reason:", response.reason);
        } else {
            console.log("✅ Authorization TX broadcasted successfully.");
            console.log("🔗 TXID:", response.txid);
        }
    } catch (e: any) {
        console.error("❌ Error:", e.message);
    }
}

authorizeMasterRelayer();
