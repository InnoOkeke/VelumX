import {
    signStructuredData,
    tupleCV,
    uintCV,
    principalCV,
    stringAsciiCV,
    noneCV,
    someCV,
    listCV
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
     * Structure matches the Smart Wallet expectation
     */
    private formatIntentMessage(intent: WalletIntent) {
        return tupleCV({
            target: principalCV(intent.target),
            'function-name': stringAsciiCV(intent.functionName),
            args: listCV(intent.args),
            'max-fee-usdcx': uintCV(intent.maxFeeUSDCx),
            nonce: uintCV(intent.nonce),
            deadline: intent.deadline ? someCV(uintCV(intent.deadline)) : noneCV()
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
