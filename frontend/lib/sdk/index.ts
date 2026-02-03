/**
 * VelumX Gas Station SDK
 * Enables gasless transactions for Stacks Dapps using USDCx fees
 */

export interface SDKConfig {
    apiKey: string;
    network?: 'mainnet' | 'testnet';
    baseUrl?: string;
}

export interface FeeEstimateResponse {
    gasInStx: string;
    gasInUsdcx: string;
    stxToUsd: number;
    usdcToUsd: number;
    markup: number;
    estimatedAt: number;
    validUntil: number;
}

export class VelumXSDK {
    private apiKey: string;
    private baseUrl: string;

    constructor(config: SDKConfig) {
        this.apiKey = config.apiKey;
        const defaultUrl = config.network === 'mainnet'
            ? 'https://velum-x.vercel.app'
            : 'https://velum-x.vercel.app'; // Default to Vercel URL
        this.baseUrl = config.baseUrl || defaultUrl;
    }

    /**
     * Estimates the USDCx fee for a given STX gas amount
     * @param estimatedGasInStx The amount of STX (in micro-STX) usually required
     */
    async estimateFee(estimatedGasInStx: string): Promise<FeeEstimateResponse> {
        const response = await fetch(`${this.baseUrl}/api/paymaster/estimate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
            },
            body: JSON.stringify({ estimatedGasInStx }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Fee estimation failed');
        }

        return response.json();
    }

    /**
     * Submits a transaction to be sponsored by the VelumX Paymaster
     * @param transaction The hex-encoded or serialized Stacks transaction
     * @param userAddress The address paying the USDCx fee
     * @param feeInUsdcx The fee amount in USDCx (micro-units) as quoted by estimateFee
     */
    async sponsorTransaction(
        transaction: string,
        userAddress: string,
        feeInUsdcx: string
    ): Promise<{ txid: string; timestamp: number }> {
        const response = await fetch(`${this.baseUrl}/api/paymaster/sponsor`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
            },
            body: JSON.stringify({ transaction, userAddress, feeInUsdcx }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Transaction sponsorship failed');
        }

        return response.json();
    }
}
