/**
 * VelumX SDK Types
 *
 * The SDK integrates with the VelumX relayer to sponsor Stacks transactions.
 * Developers build their own transactions — VelumX handles the STX fee sponsorship.
 */

/**
 * Configuration for VelumXClient
 */
export interface NetworkConfig {
    /** Stacks network: 'mainnet' | 'testnet' */
    network: 'mainnet' | 'testnet';
    /** VelumX relayer URL or proxy path. Defaults to 'https://api.velumx.xyz/api/v1' */
    paymasterUrl?: string;
    /** Your VelumX API key from the Developer Dashboard */
    apiKey?: string;
    /** Stacks core API URL (optional, for advanced use) */
    coreApiUrl?: string;
}

/**
 * Options passed when sponsoring a transaction
 */
export interface SponsorshipOptions {
    /** Contract principal of the SIP-010 token the user pays gas with
     *  e.g. 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx'
     *  Not required when sponsorshipPolicy is DEVELOPER_SPONSORS */
    feeToken?: string;
    /** Fee amount in micro units of feeToken (from estimateFee response) */
    feeAmount?: string;
    /** Optional user identifier for multi-tenant tracking */
    userId?: string;
    /** Network override */
    network?: 'mainnet' | 'testnet';
}

/**
 * Response from estimateFee
 */
export interface FeeEstimateResult {
    /** Fee amount in micro units of feeToken. "0" when developer sponsors. */
    maxFee: string;
    /** The fee token contract principal */
    feeToken: string;
    /** Estimated gas units */
    estimatedGas: number;
    /** 'DEVELOPER_SPONSORS' | 'USER_PAYS' */
    policy: string;
    /** USD value of the fee (e.g. "0.0200") — for display purposes */
    maxFeeUsd?: string;
    /** Developer's relayer STX address — used as fee recipient in paymaster txs */
    relayerAddress?: string;
    /** VelumX paymaster contract address for this network */
    paymasterAddress?: string;
}

/**
 * Response from sponsor
 */
export interface SponsorResult {
    /** Stacks transaction ID */
    txid: string;
    /** 'sponsored' | 'pending' */
    status: string;
}

/**
 * @deprecated Use VelumXClient directly.
 * Kept for backward compatibility only.
 */
export interface SignedIntent {
    target: string;
    payload: string;
    maxFee: string | number;
    feeToken: string;
    nonce: string | number;
    signature: string;
    network?: 'mainnet' | 'testnet';
}
