/**
 * Mint VEX Tokens (Backend Script)
 * Usage: node mint-vex.js <recipient_address> [amount]
 */

require('dotenv').config();
const { generateWallet } = require('@stacks/wallet-sdk');
const {
    makeContractCall,
    AnchorMode,
    PostConditionMode,
    uintCV,
    principalCV,
    TransactionVersion,
} = require('@stacks/transactions');

// Manual Network Config
const NETWORK = {
    version: 128,
    chainId: 2147483648,
    coreApiUrl: 'https://api.testnet.hiro.so',
    broadcastApiUrl: 'https://api.testnet.hiro.so/v2/transactions',
};

const SEED_PHRASE = process.env.RELAYER_SEED_PHRASE;

if (!SEED_PHRASE) {
    console.error('❌ Error: RELAYER_SEED_PHRASE environment variable not set');
    process.exit(1);
}

// Manual Broadcast Function
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

async function mintTokens() {
    const args = process.argv.slice(2);
    const recipient = args[0];
    const amountConfig = args[1] ? parseInt(args[1]) : 1000; // Default 1000 VEX

    if (!recipient) {
        console.error('❌ Usage: node mint-vex.js <recipient_address> [amount]');
        process.exit(1);
    }

    // Generate wallet from seed
    const wallet = await generateWallet({ secretKey: SEED_PHRASE, password: '' });
    const account = wallet.accounts[0];
    let privateKey = account.stxPrivateKey;
    if (privateKey.length === 64) privateKey += '01';

    const { getAddressFromPrivateKey } = require('@stacks/transactions');
    const deployerAddress = getAddressFromPrivateKey(privateKey, TransactionVersion.Testnet);

    // Fetch Nonce manually
    const nonceRes = await fetch(`https://api.testnet.hiro.so/extended/v1/address/${deployerAddress}/nonces`);
    const nonceData = await nonceRes.json();
    console.log(`Nonce: ${nonceData.possible_next_nonce}`);

    const contractAddressString = process.env.STACKS_VEX_ADDRESS;
    const targetContract = contractAddressString || `${deployerAddress}.velumx-token`;

    const amountMicro = amountConfig * 1000000; // 6 decimals

    console.log(`🚀 Minting ${amountConfig} VEX to ${recipient}...`);
    console.log(`Using Sender: ${deployerAddress}`);
    console.log(`Contract: ${targetContract}`);

    const txOptions = {
        contractAddress: targetContract.split('.')[0],
        contractName: targetContract.split('.')[1],
        functionName: 'mint',
        functionArgs: [
            uintCV(amountMicro),
            principalCV(recipient),
        ],
        senderKey: privateKey,
        validateWithAbi: false, // SKIP VALIDATION
        network: NETWORK,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
        fee: 50000n, // MANUAL FEE
        nonce: BigInt(nonceData.possible_next_nonce), // MANUAL NONCE
    };

    try {
        const transaction = await makeContractCall(txOptions);
        // Use manual broadcast
        const broadcastResponse = await broadcast(transaction);

        if (!broadcastResponse.ok) {
            console.error('❌ Broadcast failed:', broadcastResponse.result);
        } else {
            const txid = broadcastResponse.result.replace(/"/g, '');
            console.log('✅ Mint transaction broadcasted!');
            console.log('Tx ID:', txid);
            console.log(`Explorer: https://explorer.hiro.so/txid/${txid}?chain=testnet`);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

mintTokens();
