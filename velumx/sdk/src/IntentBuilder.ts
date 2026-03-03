import {
    signStructuredData,
    tupleCV,
    uintCV,
    principalCV,
    stringAsciiCV,
    noneCV,
    someCV,
    listCV,
    bufferCV
} from '@stacks/transactions';
import { WalletIntent, SignedIntent } from './types';

export class IntentBuilder {
    private domainName = "SGAL-Smart-Wallet";
    private domainVersion = "1.0.0";
    private chainId: number;

    constructor(network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet') {
        this.chainId = network === 'mainnet' ? 1 : 2147483648; // Testnet chain ID
    }

    /**
     * Builds the SIP-018 structured data domain
     */
    private getDomain() {
        return tupleCV({
            name: stringAsciiCV(this.domainName),
            version: stringAsciiCV(this.domainVersion),
            'chain-id': uintCV(this.chainId)
        });
    }

    /**
     * Formats the intent into a Clarity Tuple for signing
     * Structure matches the Smart Wallet v4 expectation
     */
    private formatIntentMessage(intent: WalletIntent) {
        return tupleCV({
            target: principalCV(intent.target),
            payload: bufferCV(Buffer.from(intent.payload.startsWith('0x') ? intent.payload.substring(2) : intent.payload, 'hex')),
            'max-fee-usdcx': uintCV(intent.maxFeeUSDCx),
            nonce: uintCV(intent.nonce)
        });
    }

    /**
     * Signs an intent using a private key
     * In a browser environment, this would use a wallet popup (e.g. Leather/Xverse)
     * For Node.js/Backend, it signs directly.
     */
    public signIntent(intent: WalletIntent, privateKey: string): SignedIntent {
        const domain = this.getDomain();
        const message = this.formatIntentMessage(intent);

        // Uses Stacks.js SIP-018 signing utility
        // Note: For dApps, use the '@stacks/connect' openSignatureRequest instead
        const signature = signStructuredData({
            message,
            domain,
            privateKey
        });

        return {
            ...intent,
            signature
        };
    }
}
