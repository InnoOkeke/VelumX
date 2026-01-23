/**
 * Mint VEX Tokens
 * Usage: node mint-vex.js <recipient_address> [amount]
 */

require('dotenv').config();

const {
    makeContractCall,
    broadcastTransaction,
    AnchorMode,
    PostConditionMode,
    uintCV,
    principalCV,
    getAddressFromPrivateKey,
    TransactionVersion,
} = require('@stacks/transactions');
const { StacksTestnet } = require('@stacks/network');

const NETWORK = new StacksTestnet();
const DEPLOYER_PRIVATE_KEY = process.env.STACKS_PRIVATE_KEY;

if (!DEPLOYER_PRIVATE_KEY) {
    console.error('❌ Error: STACKS_PRIVATE_KEY not set');
    process.exit(1);
}

const DEPLOYER_ADDRESS = getAddressFromPrivateKey(DEPLOYER_PRIVATE_KEY, TransactionVersion.Testnet);

async function mintTokens() {
    const args = process.argv.slice(2);
    const recipient = args[0];
    const amountConfig = args[1] ? parseInt(args[1]) : 1000; // Default 1000 VEX

    if (!recipient) {
        console.error('❌ Usage: node mint-vex.js <recipient_address> [amount]');
        process.exit(1);
    }

    // Contract Principal
    // Trying to resolve contract name from config or default 'velumx-token' if not found
    // For now, assuming standard naming
    const contractName = 'velumx-token';
    const contractAddress = DEPLOYER_ADDRESS;

    const amountMicro = amountConfig * 1000000; // 6 decimals

    console.log(`🚀 Minting ${amountConfig} VEX to ${recipient}...`);
    console.log(`Contract: ${contractAddress}.${contractName}`);

    const txOptions = {
        contractAddress: contractAddress,
        contractName: contractName,
        functionName: 'mint',
        functionArgs: [
            uintCV(amountMicro),
            principalCV(recipient),
        ],
        senderKey: DEPLOYER_PRIVATE_KEY,
        validateWithAbi: true,
        network: NETWORK,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
    };

    try {
        const transaction = await makeContractCall(txOptions);
        const broadcastResponse = await broadcastTransaction(transaction, NETWORK);

        if (broadcastResponse.error) {
            console.error('❌ Broadcast failed:', broadcastResponse.error);
        } else {
            console.log('✅ Mint transaction broadcasted!');
            console.log('Tx ID:', broadcastResponse.txid);
            console.log(`Explorer: https://explorer.hiro.so/txid/${broadcastResponse.txid}?chain=testnet`);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

mintTokens();
