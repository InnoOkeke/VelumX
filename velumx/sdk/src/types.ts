import { principalCV, uintCV, stringAsciiCV, tupleCV, someCV, noneCV, ClarityValue } from '@stacks/transactions';

export interface WalletIntent {
    target: string;
    payload: string; // Hex string of the encoded transaction
    maxFeeUSDCx: string | number; // uint represented as string or number
    nonce: string | number;
    deadline?: string | number; // Future feature
}

export interface SignedIntent extends WalletIntent {
    signature: string;
}

export interface NetworkConfig {
    coreApiUrl: string;
    network: 'mainnet' | 'testnet' | 'devnet';
    paymasterUrl?: string; // URL for the SGAL relayer service
    apiKey?: string; // SGAL API Key
}
