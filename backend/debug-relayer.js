
const { getAddressFromPrivateKey } = require('@stacks/transactions');
const { generateWallet } = require('@stacks/wallet-sdk');
const dotenv = require('dotenv');
const path = require('path');

// Load .env from backend directory
dotenv.config({ path: path.join(__dirname, '.env') });

async function debugRelayer() {
    const privKeyRaw = process.env.RELAYER_PRIVATE_KEY;
    const seedPhrase = process.env.RELAYER_SEED_PHRASE;
    const expectedAddr = process.env.RELAYER_STACKS_ADDRESS;
    const rpcUrl = process.env.STACKS_RPC_URL || 'https://api.testnet.hiro.so';

    console.log('--- Relayer Debug ---');
    console.log('Expected Address:', expectedAddr);
    console.log('RPC URL:', rpcUrl);

    let finalKey = (privKeyRaw && privKeyRaw.length === 66) ? privKeyRaw.substring(0, 64) : privKeyRaw;

    try {
        if (seedPhrase) {
            console.log('Seed phrase found. Deriving...');
            const wallet = await generateWallet({
                secretKey: seedPhrase,
                password: '',
            });
            finalKey = wallet.accounts[0].stxPrivateKey;
            console.log('Derived Key:', finalKey.substring(0, 4) + '...' + finalKey.substring(60));
        } else if (!finalKey) {
            console.error('Error: Neither RELAYER_PRIVATE_KEY nor RELAYER_SEED_PHRASE found in .env');
            return;
        }

        const derivedAddr = getAddressFromPrivateKey(finalKey, 'testnet');
        console.log('Derived Address:', derivedAddr);

        if (derivedAddr !== expectedAddr) {
            console.warn('⚠️ ADDRESS MISMATCH! Derived:', derivedAddr, 'Expected:', expectedAddr);
        } else {
            console.log('✅ Address matches.');
        }

        // Check balance via API
        console.log('\nFetching balance for', derivedAddr, '...');
        const response = await fetch(`${rpcUrl}/extended/v1/address/${derivedAddr}/balances`);
        const data = await response.json();

        const stxBalance = BigInt(data.stx.balance);
        console.log('STX Balance (micro-STX):', stxBalance.toString());
        console.log('STX Balance (STX):', Number(stxBalance) / 1_000_000);

        if (stxBalance === 0n) {
            console.error('❌ Balance is 0! This address needs testnet STX.');
        } else {
            console.log('✅ Balance is positive.');
        }
    } catch (error) {
        console.error('Error during debug:', error);
    }
}

debugRelayer();
