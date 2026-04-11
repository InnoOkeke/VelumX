/**
 * Deploy velumx-sweep contract to Stacks Mainnet
 *
 * Usage:
 *   node deploy-velumx-sweep.js
 *
 * Requires:
 *   STACKS_PRIVATE_KEY in .env  (64-char hex, no 0x prefix)
 *
 * After deployment:
 *   Update SWEEP_CONTRACT in frontend/lib/helpers/batch-swap.ts
 *   with the printed contract address.
 */

require('dotenv').config();

const {
  makeContractDeploy,
  AnchorMode,
  PostConditionMode,
  getAddressFromPrivateKey,
  TransactionVersion,
} = require('@stacks/transactions');
const { StacksMainnet } = require('@stacks/network');
const fs   = require('fs');
const path = require('path');

const NETWORK       = new StacksMainnet();
const PRIVATE_KEY   = process.env.STACKS_PRIVATE_KEY || '';
const CONTRACT_NAME = 'velumx-sweep';

if (!PRIVATE_KEY) {
  console.error('❌  STACKS_PRIVATE_KEY not set in stacks-contracts/.env');
  console.error('    Copy .env.example → .env and fill in your key.');
  process.exit(1);
}

async function deploy() {
  const contractPath = path.join(__dirname, 'contracts', 'velumx-sweep.clar');
  const codeBody     = fs.readFileSync(contractPath, 'utf8');

  const deployerAddress = getAddressFromPrivateKey(PRIVATE_KEY, TransactionVersion.Mainnet);
  const contractAddress  = `${deployerAddress}.${CONTRACT_NAME}`;

  console.log('\n🚀  Deploying velumx-sweep to Stacks Mainnet');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Deployer :', deployerAddress);
  console.log('Contract :', contractAddress);
  console.log('Size     :', codeBody.length, 'bytes');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Fetch current nonce
  let nonce = 0;
  try {
    const res  = await fetch(`https://api.mainnet.hiro.so/v2/accounts/${deployerAddress}?proof=0`);
    const data = await res.json();
    nonce = parseInt(data.nonce ?? 0);
    console.log('Nonce    :', nonce);
  } catch (e) {
    console.warn('⚠️  Could not fetch nonce, defaulting to 0');
  }

  const tx = await makeContractDeploy({
    contractName:      CONTRACT_NAME,
    codeBody,
    senderKey:         PRIVATE_KEY,
    network:           NETWORK,
    anchorMode:        AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee:               100000, // 0.1 STX
    nonce,
  });

  console.log('📡  Broadcasting...\n');

  const txBytes = tx.serialize();
  const txBuf   = Buffer.isBuffer(txBytes) ? txBytes : Buffer.from(txBytes);
  console.log('TX size (bytes):', txBuf.length);

  const broadcastRes = await fetch('https://api.mainnet.hiro.so/v2/transactions', {
    method:  'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body:    txBuf,
  });

  const rawText = await broadcastRes.text();
  console.log('HTTP status:', broadcastRes.status);
  console.log('Raw response:', rawText);

  let result;
  try { result = JSON.parse(rawText); } catch { result = { error: rawText }; }

  if (!broadcastRes.ok || result.error) {
    console.error('❌  Broadcast failed:', result.error || result);
    if (result.reason)      console.error('    Reason :', result.reason);
    if (result.reason_data) console.error('    Data   :', JSON.stringify(result.reason_data, null, 2));
    process.exit(1);
  }

  const txid        = result.txid || result;
  const explorerUrl = `https://explorer.hiro.so/txid/${txid}?chain=mainnet`;

  console.log('\n✅  Transaction broadcast!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TXID     :', txid);
  console.log('Explorer :', explorerUrl);
  console.log('Contract :', contractAddress);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Save deployment record
  const info = {
    contractAddress,
    deployerAddress,
    txid,
    explorerUrl,
    network: 'mainnet',
    deployedAt: new Date().toISOString(),
  };
  const outPath = path.join(__dirname, 'velumx-sweep-deployment.json');
  fs.writeFileSync(outPath, JSON.stringify(info, null, 2));
  console.log('💾  Saved to:', outPath);

  console.log('\n📝  Next steps:');
  console.log(`    1. Wait for confirmation (~10 min): ${explorerUrl}`);
  console.log(`    2. Update SWEEP_CONTRACT in frontend/lib/helpers/batch-swap.ts:`);
  console.log(`       '${contractAddress}'`);
  console.log('    3. Redeploy / restart the frontend.\n');
}

deploy().catch(err => {
  console.error('💥  Fatal:', err.message || err);
  process.exit(1);
});
