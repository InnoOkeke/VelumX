// Deploy Swap Contract to Stacks Testnet
// Uses manual network configuration to resolve SDK version conflicts

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
    console.error('Please ensure RELAYER_SEED_PHRASE and RELAYER_STACKS_ADDRESS are set in .env');
    process.exit(1);
}

// Manually define network to avoid version mismatch issues
const network = {
    version: 128, // TransactionVersion.Testnet
    chainId: 2147483648, // ChainID.Testnet
    coreApiUrl: 'https://api.testnet.hiro.so',
    bnsApiUrl: 'https://api.testnet.hiro.so',
    broadcastApiUrl: 'https://api.testnet.hiro.so/v2/transactions',
    transferApiUrl: 'https://api.testnet.hiro.so/v2/transfers',
    accountApiUrl: 'https://api.testnet.hiro.so/v2/accounts',
    contractApiUrl: 'https://api.testnet.hiro.so/v2/contracts',
    infoApiUrl: 'https://api.testnet.hiro.so/v2/info',
};

async function deploy() {
    try {
        console.log("🚀 Deploying Swap Contract to Stacks Testnet\n");
        
        console.log("Step 1: Generating wallet...");
        const wallet = await generateWallet({ secretKey: SEED_PHRASE, password: '' });
        const account = wallet.accounts[0];
        console.log("Testnet Address:", TESTNET_ADDRESS);

        let privateKey = account.stxPrivateKey;
        // Ensure private key has 01 compression byte if missing
        if (privateKey.length === 64) {
            privateKey += '01';
        }
        console.log("Key length:", privateKey.length);

        console.log("\nStep 2: Reading swap contract...");
        const contractPath = path.join(__dirname, '../stacks-contracts/contracts/swap-contract.clar');
        const codeBody = fs.readFileSync(contractPath, 'utf8');
        console.log("Contract bytes:", codeBody.length);

        // Get nonce
        console.log("\nStep 3: Fetching nonce...");
        const nonceRes = await fetch(`https://api.testnet.hiro.so/extended/v1/address/${TESTNET_ADDRESS}/nonces`);
        const nonceData = await nonceRes.json();
        console.log("Nonce:", nonceData.possible_next_nonce);

        console.log("\nStep 4: Building transaction...");
        const tx = await makeContractDeploy({
            contractName: 'swap-contract-v12',
            codeBody: codeBody,
            senderKey: privateKey,
            network: network,
            anchorMode: AnchorMode.Any,
            postConditionMode: PostConditionMode.Allow,
            fee: 500000n, // 0.5 STX fee (higher for larger contract)
            nonce: BigInt(nonceData.possible_next_nonce)
        });
        console.log("Transaction built!");

        console.log("\nStep 5: Broadcasting...");
        const serialized = tx.serialize();
        console.log("Serialized bytes:", serialized.length);

        const response = await fetch('https://api.testnet.hiro.so/v2/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: serialized
        });

        const result = await response.text();
        console.log("Status:", response.status);
        console.log("Result:", result.slice(0, 300));

        if (response.ok) {
            const txid = result.replace(/"/g, '');
            console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log("✅ SUCCESS - Swap Contract Deployed!");
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log("📋 Transaction ID:", txid);
            console.log("🔗 Explorer:", "https://explorer.hiro.so/txid/" + txid + "?chain=testnet");
            console.log("📍 Contract Address:", TESTNET_ADDRESS + ".swap-contract-v12");
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
            
            console.log("⏳ Waiting for confirmation (10-20 minutes)...");
            console.log("💡 Check status at the explorer link above\n");
            
            console.log("📝 Next Steps:");
            console.log("1. Wait for transaction confirmation");
            console.log("2. Update backend/.env:");
            console.log(`   STACKS_SWAP_CONTRACT_ADDRESS=${TESTNET_ADDRESS}.swap-contract-v12`);
            console.log("3. Update frontend/.env.local:");
            console.log(`   NEXT_PUBLIC_STACKS_SWAP_CONTRACT_ADDRESS=${TESTNET_ADDRESS}.swap-contract-v12`);
            console.log("4. Begin Phase 2 backend integration\n");
            
            // Save deployment info
            const deploymentInfo = {
                txid: txid,
                contractAddress: `${TESTNET_ADDRESS}.swap-contract-v12`,
                deployerAddress: TESTNET_ADDRESS,
                network: 'testnet',
                timestamp: new Date().toISOString(),
                explorerUrl: `https://explorer.hiro.so/txid/${txid}?chain=testnet`,
            };
            
            const outputPath = path.join(__dirname, 'swap-deployment-info.json');
            fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
            console.log('💾 Deployment info saved to:', outputPath, '\n');
            
        } else {
            console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log("❌ DEPLOYMENT FAILED");
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            try {
                const err = JSON.parse(result);
                console.log("Reason:", err.reason);
                console.log("Reason Data:", JSON.stringify(err.reason_data, null, 2));
            } catch (e) {
                console.log("Raw error:", result);
            }
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        }
    } catch (e) {
        console.log("\n❌ ERROR:", e.message);
        console.log(e.stack);
    }
}

deploy();
