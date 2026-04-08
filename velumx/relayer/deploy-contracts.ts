import {
    makeContractDeploy,
    AnchorMode,
    PostConditionMode,
    fetchNonce,
    getAddressFromPrivateKey,
    ClarityVersion,
} from '@stacks/transactions';
import { generateWallet } from '@stacks/wallet-sdk';
import { STACKS_MAINNET } from '@stacks/network';
import { readFileSync } from 'fs';
import { join } from 'path';

const tomlPath = join('..', 'contracts', 'settings', 'Mainnet.toml');
const tomlContent = readFileSync(tomlPath, 'utf8');
const mnemonicMatch = tomlContent.match(/mnemonic\s*=\s*"(.*)"/);
if (!mnemonicMatch || !mnemonicMatch[1]) throw new Error("Mnemonic not found in Mainnet.toml");
const mnemonic: string = mnemonicMatch[1];
const network = STACKS_MAINNET;

const contracts = [
    { name: 'simple-paymaster-v3', path: 'contracts/simple-paymaster-v3.clar' },
];

async function deploy() {
    console.log("Starting deployment to Mainnet...");

    const wallet = await generateWallet({
        secretKey: mnemonic,
        password: '',
    });
    const account = wallet.accounts[0];
    if (!account) throw new Error("No account found in wallet");
    // Use the key exactly as wallet-sdk provides it — consistent for both signing and address derivation
    const privateKey = account.stxPrivateKey;
    const address = getAddressFromPrivateKey(privateKey, "mainnet");
    console.log(`Derived Address: ${address}`);

    // Check balance before attempting deploy
    const balRes = await fetch(`https://api.hiro.so/v2/accounts/${address}?proof=0`);    if (balRes.ok) {
        const balData = await balRes.json();
        const stxBalance = Number(BigInt(balData.balance)) / 1_000_000;
        console.log(`STX Balance: ${stxBalance} STX`);
    }

    let nonce = await fetchNonce({ address, network });
    console.log(`Starting nonce: ${nonce}`);

    for (const contract of contracts) {
        console.log(`Deploying ${contract.name}...`);
        try {
            // Read contract, normalize line endings, strip any non-ASCII/non-printable chars
            const rawCode = readFileSync(join('..', 'contracts', contract.path));
            const code = rawCode
                .toString('utf8')
                .replace(/\r\n/g, '\n')
                .replace(/\r/g, '\n')
                // Replace smart quotes and other common non-ASCII with ASCII equivalents
                .replace(/[\u2018\u2019]/g, "'")
                .replace(/[\u201C\u201D]/g, '"')
                // Strip any remaining non-printable, non-ASCII characters
                .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');

            const txOptions = {
                contractName: contract.name,
                codeBody: code,
                senderKey: privateKey,
                network,
                nonce,
                fee: 200000n, // 2 STX - covers larger contracts
                clarityVersion: ClarityVersion.Clarity3,
                anchorMode: AnchorMode.Any,
                postConditionMode: PostConditionMode.Allow,
            };

            const transaction = await makeContractDeploy(txOptions as any);
            const serialized = transaction.serialize();
            // v7 serialize() returns a hex string — convert to binary buffer for broadcast
            const txBytes = Buffer.from(typeof serialized === 'string' ? serialized : Buffer.from(serialized).toString('hex'), 'hex');
            console.log('TX first bytes (hex):', txBytes.slice(0, 10).toString('hex'));
            console.log('TX length:', txBytes.length);
            // Broadcast manually to get the raw response for better error diagnosis
            const broadcastRes = await fetch('https://api.hiro.so/v2/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: Buffer.from(txBytes),
            });
            const rawText = await broadcastRes.text();
            console.log(`Broadcast response (${broadcastRes.status}):`, rawText);

            let broadcastResponse: any;
            try { broadcastResponse = JSON.parse(rawText); } catch { broadcastResponse = { error: rawText }; }

            if (broadcastResponse.error || broadcastResponse.reason) {
                if (broadcastResponse.reason === 'ContractAlreadyExists' || rawText.includes('ContractAlreadyExists')) {
                    console.log(`Skipping ${contract.name}: Already deployed.`);
                } else {
                    console.error(`Error broadcasting ${contract.name}:`, broadcastResponse);
                    break;
                }
            } else {
                console.log(`Successfully broadcasted ${contract.name}. TXID: ${broadcastResponse.txid}`);
                nonce = nonce + 1n;
            }

            // Small delay to let the node process
            await new Promise(r => setTimeout(r, 2000));

        } catch (error: any) {
            console.error(`Failed to deploy ${contract.name}: ${error.message}`);
            if (error.cause) console.error('Cause:', error.cause);
            break;
        }
    }
    console.log("Deployment process finished.");
}

deploy().catch(console.error);
