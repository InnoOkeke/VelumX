interface SignedIntent {
    target: string;
    functionName: string;
    args: any[];
    maxFeeUSDCx: string | number;
    nonce: string | number;
    signature: string;
}
export declare class PaymasterService {
    private network;
    private relayerKey;
    private smartWalletContract;
    constructor();
    estimateFee(intent: any): Promise<{
        maxFeeUSDCx: string;
        estimatedGas: number;
    }>;
    sponsorIntent(intent: SignedIntent): Promise<{
        txid: string;
        status: string;
    }>;
}
export {};
//# sourceMappingURL=PaymasterService.d.ts.map