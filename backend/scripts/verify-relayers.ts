
import dotenv from 'dotenv';
import { generateWallet, generateNewAccount } from '@stacks/wallet-sdk';
import { getAddressFromPrivateKey } from '@stacks/transactions';
import path from 'path';

// Load env from backend root
dotenv.config({ path: path.join(__dirname, '../.env') });

const NUM_RELAYERS = 5;

async function main() {
    const seed = process.env.RELAYER_SEED_PHRASE;

    if (!seed) {
        console.error('Error: RELAYER_SEED_PHRASE not found in .env');
        process.exit(1);
    }

    console.log('Deriving relayer addresses from seed...');
    console.log('Seed found (starts with):', seed.substring(0, 10) + '...');

    try {
        // Generate base wallet (Index 0)
        let wallet = await generateWallet({
            secretKey: seed,
            password: '',
        });

        const accounts = [];

        // push index 0
        // FIX: Using 128 (Testnet) explicitly
        const address0 = getAddressFromPrivateKey(wallet.accounts[0].stxPrivateKey, 'testnet');
        accounts.push({
            index: 0,
            address: address0,
            privateKey: wallet.accounts[0].stxPrivateKey.substring(0, 10) + '...' // Masked for log
        });

        // Derive indices 1..4
        for (let i = 1; i < NUM_RELAYERS; i++) {
            wallet = generateNewAccount(wallet); // Adds next account to wallet
            const newAccount = wallet.accounts[i];
            // FIX: Using 128 (Testnet) explicitly
            const newAddress = getAddressFromPrivateKey(newAccount.stxPrivateKey, 'testnet');
            accounts.push({
                index: i,
                address: newAddress,
                privateKey: newAccount.stxPrivateKey.substring(0, 10) + '...'
            });
        }

        console.log('\n*** DERIVED RELAYER ADDRESSES ***');
        accounts.forEach(acc => {
            console.log(`Relayer [${acc.index}]: ${acc.address}`);
        });
        console.log('*********************************\n');

        console.log('Success: Address derivation logic works with explicit version 128.');

    } catch (error) {
        console.error('Failed to derive addresses:', error);
    }
}

main().catch(console.error);
