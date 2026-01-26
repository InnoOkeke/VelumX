
const { getPublicKeyFromPrivate, getAddressFromPublicKey, AddressVersion } = require('@stacks/transactions');
const dotenv = require('dotenv');
dotenv.config();

function verify() {
    const pkRaw = process.env.RELAYER_PRIVATE_KEY;
    const expectedAddr = process.env.RELAYER_STACKS_ADDRESS;

    if (!pkRaw || !expectedAddr) {
        console.error('Missing environment variables');
        return;
    }

    console.log('PK Length:', pkRaw.length);

    // AddressVersion.TestnetSingleSig is 26
    const TESTNET_VERSION = 26;

    const tryPk = (pk) => {
        try {
            console.log(`Testing PK: ${pk.substring(0, 4)}...${pk.substring(pk.length - 4)} (length ${pk.length})`);
            const pubKey = getPublicKeyFromPrivate(pk);
            const addr = getAddressFromPublicKey(pubKey, TESTNET_VERSION);
            console.log('Derived Address:', addr);
            if (addr === expectedAddr) {
                console.log('>>> MATCH FOUND! <<<');
                return true;
            }
        } catch (e) {
            console.error('Error with this PK:', e.message);
        }
        return false;
    };

    if (pkRaw.length === 66 && pkRaw.endsWith('01')) {
        console.log('Detected 33-byte format.');
        if (!tryPk(pkRaw)) {
            console.log('Trying 32-byte format...');
            tryPk(pkRaw.substring(0, 64));
        }
    } else {
        tryPk(pkRaw);
    }
}

verify();
