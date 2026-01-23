/**
 * Dedicated Deployment Script for Swap Contract (V2) with STX Support
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { generateWallet } = require('@stacks/wallet-sdk');
const {
    makeContractDeploy,
    AnchorMode,
    PostConditionMode
} = require('@stacks/transactions');

// Load from environment variables
const SEED_PHRASE = process.env.RELAYER_SEED_PHRASE;
const TESTNET_ADDRESS = process.env.RELAYER_STACKS_ADDRESS;

if (!SEED_PHRASE || !TESTNET_ADDRESS) {
    console.error('❌ Error: Missing required environment variables');
    process.exit(1);
}

// Manually define network
const network = {
    version: 128,
    chainId: 2147483648,
    coreApiUrl: 'https://api.testnet.hiro.so',
    broadcastApiUrl: 'https://api.testnet.hiro.so/v2/transactions',
};

async function broadcast(tx) {
    const serialized = tx.serialize();
    const response = await fetch('https://api.testnet.hiro.so/v2/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: serialized
    });
    const result = await response.text();
    return { status: response.status, ok: response.ok, result };
}

async function deploy() {
    try {
        console.log("🚀 Deploying Swap V2 (Native STX Support)\n");

        const wallet = await generateWallet({ secretKey: SEED_PHRASE, password: '' });
        const account = wallet.accounts[0];
        let privateKey = account.stxPrivateKey;
        if (privateKey.length === 64) privateKey += '01';

        // Get nonce
        const nonceRes = await fetch(`https://api.testnet.hiro.so/extended/v1/address/${TESTNET_ADDRESS}/nonces`);
        const nonceData = await nonceRes.json();
        const nonce = BigInt(nonceData.possible_next_nonce);

        console.log(`Step 1: Reading swap contract...`);
        const swapPath = path.join(__dirname, '../stacks-contracts/contracts/swap-contract.clar');
        const swapCode = fs.readFileSync(swapPath, 'utf8');

        console.log(`Step 2: Building transaction (Nonce: ${nonce})...`);
        const swapTx = await makeContractDeploy({
            contractName: 'swap-contract-v15', // Incremented version
            codeBody: swapCode,
            senderKey: privateKey,
            network: network,
            anchorMode: AnchorMode.Any,
            postConditionMode: PostConditionMode.Allow,
            fee: 1000000n, // 1 STX fee for reliability
            nonce: nonce
        });

        console.log(`Step 3: Broadcasting...`);
        const res = await broadcast(swapTx);
        if (!res.ok) throw new Error(`Swap Deployment Failed: ${res.result}`);

        const txid = res.result.replace(/"/g, '');
        const contractAddress = `${TESTNET_ADDRESS}.swap-contract-v15`;

        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("✅ SUCCESS - Swap V2 Deployed!");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("📋 Transaction ID:", txid);
        console.log("📍 Contract Address:", contractAddress);
        console.log("🔗 Explorer:", `https://explorer.hiro.so/txid/${txid}?chain=testnet`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

        // Save deployment info
        const info = {
            txid,
            contractAddress,
            deployerAddress: TESTNET_ADDRESS,
            network: 'testnet',
            timestamp: new Date().toISOString(),
        };
        fs.writeFileSync(path.join(__dirname, 'swap-v2-deployment-info.json'), JSON.stringify(info, null, 2));

    } catch (e) {
        console.error("\n❌ FATAL ERROR:", e.message);
    }
}

deploy();
