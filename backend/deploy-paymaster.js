// Deploy Paymaster Contract to Stacks Testnet
// Uses manual network configuration to resolve SDK version conflicts

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { generateWallet } = require('@stacks/wallet-sdk');
const {
    makeContractDeploy,
    broadcastTransaction,
    ClarityVersion,
    AnchorMode,
    PostConditionMode
} = require('@stacks/transactions');
const { STACKS_TESTNET } = require('@stacks/network');

// Load from environment variables
const SEED_PHRASE = process.env.RELAYER_SEED_PHRASE;
const TESTNET_ADDRESS = process.env.RELAYER_STACKS_ADDRESS;

if (!SEED_PHRASE || !TESTNET_ADDRESS) {
    console.error('❌ Error: Missing required environment variables');
    console.error('Please ensure RELAYER_SEED_PHRASE and RELAYER_STACKS_ADDRESS are set in .env');
    process.exit(1);
}

// Use official network configuration
const network = STACKS_TESTNET;

async function deploy() {
    try {
        console.log("🚀 Deploying Paymaster Contract to Stacks Testnet\n");

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

        console.log("\nStep 2: Reading paymaster contract...");
        const contractPath = path.join(__dirname, '../stacks-contracts/contracts/paymaster.clar');
        const codeBody = fs.readFileSync(contractPath, 'utf8');
        console.log("Contract bytes:", codeBody.length);

        // Get nonce
        console.log("\nStep 3: Fetching nonce...");
        const nonceRes = await fetch(`https://api.testnet.hiro.so/extended/v1/address/${TESTNET_ADDRESS}/nonces`);
        const nonceData = await nonceRes.json();
        console.log("Nonce:", nonceData.possible_next_nonce);

        console.log("\nStep 4: Building transaction...");
        const tx = await makeContractDeploy({
            contractName: 'paymaster-v9',
            codeBody: codeBody,
            senderKey: privateKey,
            network: network,
            clarityVersion: ClarityVersion.Clarity2,
            anchorMode: AnchorMode.Any,
            postConditionMode: PostConditionMode.Allow,
            fee: 200000n, // 0.2 STX fee
            nonce: BigInt(nonceData.possible_next_nonce)
        });
        console.log("Transaction built!");

        console.log("\nStep 5: Broadcasting...");
        const response = await broadcastTransaction({
            transaction: tx,
            network: network
        });

        console.log("Broadcast response:", JSON.stringify(response, null, 2));

        if (response.txid) {
            const txid = response.txid;
            console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log("✅ SUCCESS - Paymaster Contract Deployed!");
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log("📋 Transaction ID:", txid);
            console.log("🔗 Explorer:", "https://explorer.hiro.so/txid/0x" + txid + "?chain=testnet");
            console.log("📍 Contract Address:", TESTNET_ADDRESS + ".paymaster-v9");
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

            console.log("⏳ Waiting for confirmation (10-20 minutes)...");
            console.log("💡 Check status at the explorer link above\n");

            console.log("📝 Next Steps:");
            console.log("1. Wait for transaction confirmation");
            console.log("2. Update backend/.env:");
            console.log(`   STACKS_PAYMASTER_ADDRESS=${TESTNET_ADDRESS}.paymaster-v7`);
            console.log("3. Update frontend/.env.local:");
            console.log(`   NEXT_PUBLIC_STACKS_PAYMASTER_ADDRESS=${TESTNET_ADDRESS}.paymaster-v7`);
            console.log("4. Test gasless swaps with USDCx fees\n");

            // Save deployment info
            const deploymentInfo = {
                txid: txid,
                contractAddress: `${TESTNET_ADDRESS}.paymaster-v9`,
                deployerAddress: TESTNET_ADDRESS,
                network: 'testnet',
                timestamp: new Date().toISOString(),
                explorerUrl: `https://explorer.hiro.so/txid/${txid}?chain=testnet`,
            };

            const outputPath = path.join(__dirname, 'paymaster-deployment-info.json');
            fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
            console.log('💾 Deployment info saved to:', outputPath, '\n');

        } else {
            console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log("❌ DEPLOYMENT FAILED");
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log("Reason:", response.error);
            console.log("Reason Data:", JSON.stringify(response.reason_data || {}, null, 2));
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        }
    } catch (e) {
        console.log("\n❌ ERROR:", e.message);
        console.log(e.stack);
    }
}

deploy();
