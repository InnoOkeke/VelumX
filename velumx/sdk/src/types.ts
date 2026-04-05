import { principalCV, uintCV, stringAsciiCV, tupleCV, someCV, noneCV, ClarityValue } from '@stacks/transactions';

export interface WalletIntent {
    target: string;
    payload: string; // Hex string of the encoded transaction
    maxFee: string | number; // uint represented as string or number
    feeToken: string; // Contract principal of gas token (e.g. SP...usdcx)
    nonce: string | number;
    deadline?: string | number; // Future feature
}

export interface SignedIntent extends WalletIntent {
    signature: string;
}

export interface NetworkConfig {
    coreApiUrl: string;
    network: 'mainnet' | 'testnet' | 'devnet';
    paymasterUrl?: string; // URL for the VelumX relayer service
    apiKey?: string; // VelumX API Key
}

export interface SponsorshipOptions {
    userId?: string;
    feeAmount?: string;
}
