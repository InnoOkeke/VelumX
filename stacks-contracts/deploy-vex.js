/**
 * Deploy VelumX Token (VEX) to Stacks Testnet
 */

require('dotenv').config();

const {
    makeContractDeploy,
    broadcastTransaction,
    AnchorMode,
    PostConditionMode,
    getAddressFromPrivateKey,
    TransactionVersion,
} = require('@stacks/transactions');
const { StacksTestnet } = require('@stacks/network');
const fs = require('fs');
const path = require('path');

// Configuration
const NETWORK = new StacksTestnet();
const DEPLOYER_KEY = process.env.STACKS_PRIVATE_KEY || '';

if (!DEPLOYER_KEY) {
    console.error('❌ Error: STACKS_PRIVATE_KEY environment variable not set');
    process.exit(1);
}

async function deployToken() {
    try {
        console.log('🚀 Starting VEX Token Deployment to Stacks Testnet...\n');

        // Read contract source
        const contractPath = path.join(__dirname, 'contracts', 'velumx-token.clar');
        const contractSource = fs.readFileSync(contractPath, 'utf8');

        const deployerAddress = getAddressFromPrivateKey(
            DEPLOYER_KEY,
            TransactionVersion.Testnet
        );

        // Create contract deploy transaction
        const txOptions = {
            contractName: 'velumx-token',
            codeBody: contractSource,
            senderKey: DEPLOYER_KEY,
            network: NETWORK,
            anchorMode: AnchorMode.Any,
            postConditionMode: PostConditionMode.Allow,
            fee: 50000n, // 0.05 STX fee
        };

        console.log('📝 Creating deployment transaction...');
        const transaction = await makeContractDeploy(txOptions);

        console.log('📡 Broadcasting transaction to testnet...');
        const broadcastResponse = await broadcastTransaction(transaction, NETWORK);

        if (broadcastResponse.error) {
            console.error('❌ Deployment failed:', broadcastResponse.error);
            process.exit(1);
        }

        console.log('\n✅ Token deployed successfully!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📋 Transaction ID:', broadcastResponse.txid);
        console.log('📍 Contract Address:', `${deployerAddress}.velumx-token`);
        console.log('🔗 View on Explorer:', `https://explorer.hiro.so/txid/${broadcastResponse.txid}?chain=testnet`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Save deployment info
        const deploymentInfo = {
            txid: broadcastResponse.txid,
            contractAddress: `${deployerAddress}.velumx-token`,
            deployerAddress,
            network: 'testnet',
            timestamp: new Date().toISOString(),
        };

        fs.writeFileSync(
            path.join(__dirname, 'vex-deployment-info.json'),
            JSON.stringify(deploymentInfo, null, 2)
        );

        return deploymentInfo;
    } catch (error) {
        console.error('❌ Deployment error:', error.message);
        process.exit(1);
    }
}

deployToken();
