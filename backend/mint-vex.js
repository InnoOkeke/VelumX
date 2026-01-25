require('dotenv').config();
const { generateWallet } = require('@stacks/wallet-sdk');
const {
    makeContractCall,
    AnchorMode,
    PostConditionMode,
    uintCV,
    principalCV,
    getAddressFromPrivateKey,
} = require('@stacks/transactions');

// Polyfill fetch if needed (Node 18+ has it, but just in case)
const fetchFn = global.fetch || require('node-fetch');

const { STACKS_TESTNET } = require('@stacks/network');

// Network Config
const NETWORK = STACKS_TESTNET;
// NETWORK.coreApiUrl is already set in the constant usually, but let's override if needed or trust it.
// Actually STACKS_TESTNET is usually an object. Let's see if we need to modify it.
// The script sets coreApiUrl manually.



async function broadcast(tx) {
    const serialized = tx.serialize();
    const body = typeof serialized === 'string' ? Buffer.from(serialized, 'hex') : serialized;

    const response = await fetchFn('https://api.testnet.hiro.so/v2/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: body
    });
    const result = await response.text();
    return { status: response.status, ok: response.ok, result };
}

async function mintTokens() {
    try {
        console.log('Script started');
        const args = process.argv.slice(2);
        const recipient = args[0];
        const amountConfig = args[1] ? parseInt(args[1]) : 1000;

        if (!recipient) {
            console.error('Usage: node mint-vex.js <recipient>');
            process.exit(1);
        }

        const deployerAddress = process.env.RELAYER_STACKS_ADDRESS;
        if (!deployerAddress) throw new Error('RELAYER_STACKS_ADDRESS missing');

        console.log('Deployer:', deployerAddress);

        // Fetch Nonce
        const nonceRes = await fetchFn(`https://api.testnet.hiro.so/extended/v1/address/${deployerAddress}/nonces`);
        if (!nonceRes.ok) throw new Error('Failed to fetch nonce');
        const nonceData = await nonceRes.json();
        const nonce = BigInt(nonceData.possible_next_nonce);
        console.log('Nonce:', nonce);

        const amountMicro = amountConfig * 1000000;

        // Private Key
        let privateKey = process.env.RELAYER_PRIVATE_KEY;
        if (!privateKey) throw new Error('RELAYER_PRIVATE_KEY missing');
        if (privateKey.length === 64) privateKey += '01';

        const txOptions = {
            contractAddress: process.env.STACKS_VEX_ADDRESS.split('.')[0],
            contractName: process.env.STACKS_VEX_ADDRESS.split('.')[1],
            functionName: 'mint',
            functionArgs: [uintCV(amountMicro), principalCV(recipient)],
            senderKey: privateKey,
            validateWithAbi: false,
            network: NETWORK,
            anchorMode: AnchorMode.Any,
            postConditionMode: PostConditionMode.Allow,
            fee: 50000n,
            nonce: nonce,
        };


        const transaction = await makeContractCall(txOptions);
        const broadcastResponse = await broadcast(transaction);

        if (!broadcastResponse.ok) {
            console.error('Broadcast failed:', broadcastResponse.result);
        } else {
            const txid = broadcastResponse.result.replace(/"/g, '');
            console.log('Success TX:', txid);
            console.log(`https://explorer.hiro.so/txid/${txid}?chain=testnet`);
        }

    } catch (e) {
        console.error('CRASH:', e);
    }
}

mintTokens();
