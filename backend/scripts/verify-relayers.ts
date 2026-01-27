
import dotenv from 'dotenv';
import { generateWallet, generateNewAccount } from '@stacks/wallet-sdk';
import { getAddressFromPrivateKey } from '@stacks/transactions';
import path from 'path';

// Load env from backend root
dotenv.config({ path: path.join(__dirname, '../.env') });

const NUM_RELAYERS = 5;

import * as fs from 'fs';

// ... (existing imports)

async function main() {
    const seed = process.env.RELAYER_SEED_PHRASE;
    // ... (logic)

    let output = '';
    const log = (msg: string) => { console.log(msg); output += msg + '\n'; };

    log('Deriving relayer addresses from seed...');
    // ... (replace console.log with log)

    // ... (derivation loop)

    log('\n*** DERIVED RELAYER ADDRESSES AND BALANCES ***');
    for (const account of accounts) {
        try {
            const response = await fetch(`https://api.testnet.hiro.so/extended/v1/address/${account.address}/balances`);
            if (!response.ok) {
                log(`Relayer [${account.index}]: ${account.address} - Failed to fetch balance (${response.status})`);
                continue;
            }
            const data: any = await response.json();
            const stx = data.stx.balance;
            log(`Relayer [${account.index}]: ${account.address} - Balance: ${stx} microSTX`);
        } catch (err) {
            log(`Relayer [${account.index}]: ${account.address} - Error fetching balance`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    log('*********************************\n');

    fs.writeFileSync('relayers_balance_v3.txt', output);
}

main().catch(console.error);
