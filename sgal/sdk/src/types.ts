import { principalCV, uintCV, stringAsciiCV, tupleCV, someCV, noneCV, ClarityValue } from '@stacks/transactions';

export interface WalletIntent {
    target: string;
    functionName: string;
    args: ClarityValue[];
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
}
