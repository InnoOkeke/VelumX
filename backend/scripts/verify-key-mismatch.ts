
import dotenv from 'dotenv';
import { generateWallet } from '@stacks/wallet-sdk';
import { getAddressFromPrivateKey } from '@stacks/transactions';
import path from 'path';

// Load env from backend root
dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
    const seed = process.env.RELAYER_SEED_PHRASE;
    if (!seed) {
        console.error('No seed found');
        process.exit(1);
    }

    const wallet = await generateWallet({ secretKey: seed, password: '' });
    const fullKey = wallet.accounts[0].stxPrivateKey;

    console.log('Full Key Length:', fullKey.length);
    console.log('Full Key (last 4):', fullKey.slice(-4));

    // Address from FULL key (using 'testnet' string which maps to 128)
    const addressFull = getAddressFromPrivateKey(fullKey, 'testnet');
    console.log('Address (Full Key):   ', addressFull);

    // Address from STRIPPED key
    if (fullKey.length === 66) {
        const strippedKey = fullKey.substring(0, 64);
        console.log('Stripped Key Length:', strippedKey.length);
        const addressStripped = getAddressFromPrivateKey(strippedKey, 'testnet');
        console.log('Address (Stripped):   ', addressStripped);

        if (addressFull !== addressStripped) {
            console.error('\n❌ CRITICAL MISMATCH: Stripping the key changes the address!');
            console.error('The Paymaster is checking the balance of Address A but signing as Address B (which is empty).');
        } else {
            console.log('\n✅ No mismatch. Addresses are identical.');
        }
    } else {
        console.log('Key is not 66 chars, cannot test stripping logic.');
    }
}

main();
