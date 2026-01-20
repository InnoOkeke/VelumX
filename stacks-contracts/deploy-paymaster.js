/**
 * Deploy Paymaster Contract to Stacks Testnet
 * This script deploys the paymaster contract and outputs the contract address
 */

const {
  makeContractDeploy,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  makeSTXTokenTransfer,
} = require('@stacks/transactions');
const { StacksTestnet } = require('@stacks/network');
const fs = require('fs');
const path = require('path');

// Configuration
const NETWORK = new StacksTestnet();
const DEPLOYER_KEY = process.env.STACKS_PRIVATE_KEY || '';

if (!DEPLOYER_KEY) {
  console.error('❌ Error: STACKS_PRIVATE_KEY environment variable not set');
  console.log('\nTo deploy, you need a Stacks testnet private key with STX balance.');
  console.log('Get testnet STX from: https://explorer.hiro.so/sandbox/faucet?chain=testnet\n');
  process.exit(1);
}

async function deployContract() {
  try {
    console.log('🚀 Starting Paymaster Contract Deployment to Stacks Testnet...\n');

    // Read contract source
    const contractPath = path.join(__dirname, 'contracts', 'paymaster.clar');
    const contractSource = fs.readFileSync(contractPath, 'utf8');
    
    console.log('📄 Contract loaded from:', contractPath);
    console.log('📏 Contract size:', contractSource.length, 'bytes\n');

    // Create contract deploy transaction
    const txOptions = {
      contractName: 'paymaster-v3',
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
      if (broadcastResponse.reason) {
        console.error('Reason:', broadcastResponse.reason);
      }
      process.exit(1);
    }

    console.log('\n✅ Contract deployed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Transaction ID:', broadcastResponse.txid);
    console.log('🔗 View on Explorer:', `https://explorer.hiro.so/txid/${broadcastResponse.txid}?chain=testnet`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Get deployer address from private key
    const { getAddressFromPrivateKey, TransactionVersion } = require('@stacks/transactions');
    const deployerAddress = getAddressFromPrivateKey(
      DEPLOYER_KEY,
      TransactionVersion.Testnet
    );

    const contractAddress = `${deployerAddress}.paymaster-v3`;
    
    console.log('📍 Contract Address:', contractAddress);
    console.log('\n⏳ Waiting for transaction confirmation (this may take 10-20 minutes)...');
    console.log('💡 You can check the status at the explorer link above\n');

    // Save deployment info
    const deploymentInfo = {
      txid: broadcastResponse.txid,
      contractAddress,
      deployerAddress,
      network: 'testnet',
      timestamp: new Date().toISOString(),
      explorerUrl: `https://explorer.hiro.so/txid/${broadcastResponse.txid}?chain=testnet`,
    };

    const outputPath = path.join(__dirname, 'deployment-info.json');
    fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
    console.log('💾 Deployment info saved to:', outputPath);

    console.log('\n📝 Next Steps:');
    console.log('1. Wait for transaction confirmation (~10-20 minutes)');
    console.log('2. Update backend config with contract address:', contractAddress);
    console.log('3. Update frontend config with contract address:', contractAddress);
    console.log('4. Fund the relayer address with STX for sponsoring transactions\n');

    return deploymentInfo;
  } catch (error) {
    console.error('❌ Deployment error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run deployment
deployContract()
  .then(() => {
    console.log('✨ Deployment script completed successfully!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
