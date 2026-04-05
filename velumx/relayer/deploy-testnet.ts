import {
    makeContractDeploy,
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
import { STACKS_TESTNET } from '@stacks/network';
import { readFileSync } from 'fs';
import { join } from 'path';

async function deployToTestnet() {
    console.log("📡 Starting deployment to Stacks TESTNET...");

    const clarityCode = readFileSync(join('..', 'contracts', 'contracts', 'universal-paymaster-v1.clar'), 'utf8');
    
    // Load Testnet credentials
    const tomlPath = join('..', 'contracts', 'settings', 'Testnet.toml');
    const tomlContent = readFileSync(tomlPath, 'utf8');
    const mnemonicMatch = tomlContent.match(/mnemonic\s*=\s*"(.*)"/);
    if (!mnemonicMatch || !mnemonicMatch[1]) throw new Error("Mnemonic for Testnet not found");
    const mnemonic: string = mnemonicMatch[1];
    const network = STACKS_TESTNET;

    const wallet = await generateWallet({
        secretKey: mnemonic,
        password: '',
    });
    const account = wallet.accounts[0];
    if (!account) throw new Error("No account found for given mnemonic");
    const privateKey = account.stxPrivateKey;
    const address = getAddressFromPrivateKey(privateKey, "testnet");

    console.log(`📡 Deployer Address: ${address}`);

    const nonce = await fetchNonce({ address, network });
    console.log(`📡 Initial Nonce: ${nonce}`);

    // 1. Deploy Contract
    console.log("🚀 Broadcasting Contract Deployment...");
    const deployTxOptions = {
        contractName: 'universal-paymaster-v1',
        codeBody: clarityCode,
        senderKey: privateKey,
        network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
        nonce: nonce,
        fee: 10000n, // 0.01 STX (Increasing for Testnet)
    };

    const deployTx = await makeContractDeploy(deployTxOptions);
    const deployResponse = await broadcastTransaction({ transaction: deployTx, network });

    if ('error' in deployResponse) {
        console.error("❌ Deployment failed:", deployResponse.error);
        if (deployResponse.reason) console.error("Reason:", deployResponse.reason);
        return;
    }
    console.log("✅ Contract Deployment broadcasted. TXID:", deployResponse.txid);

    // 2. Authorize Master Relayer (Increment Nonce)
    console.log("🛡️ Broadcasting Authorization for Master Relayer...");
    const authTxOptions = {
        contractAddress: address,
        contractName: 'universal-paymaster-v1',
        functionName: 'set-relayer-status',
        functionArgs: [principalCV(address), boolCV(true)],
        senderKey: privateKey,
        network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
        nonce: nonce + 1n,
        fee: 1000n, // 0.001 STX
    };

    const authTx = await makeContractCall(authTxOptions);
    const authResponse = await broadcastTransaction({ transaction: authTx, network });

    if ('error' in authResponse) {
        console.error("❌ Authorization failed:", authResponse.error);
    } else {
        console.log("✅ Authorization broadcasted. TXID:", authResponse.txid);
    }

    console.log("🏁 Testnet deployment process finished.");
}

deployToTestnet();
