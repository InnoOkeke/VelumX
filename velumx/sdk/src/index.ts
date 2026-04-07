/**
 * @velumx/sdk
 *
 * Integrate VelumX gasless transaction sponsorship into any Stacks dApp.
 *
 * Quick start:
 *
 * ```ts
 * import { VelumXClient } from '@velumx/sdk';
 *
 * const velumx = new VelumXClient({
 *   network: 'mainnet',
 *   paymasterUrl: '/api/velumx/proxy', // or your relayer URL
 *   apiKey: 'your-api-key'
 * });
 *
 * // 1. Estimate fee in user's chosen token
 * const { maxFee, policy } = await velumx.estimateFee({
 *   feeToken: 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx'
 * });
 *
 * // 2. Build your transaction (swap, bridge, transfer — anything)
 * //    Use @stacks/connect or @stacks/transactions with sponsored: true
 *
 * // 3. Sponsor it — VelumX pays the STX fee
 * const { txid } = await velumx.sponsor(txHex, {
 *   feeToken: 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx',
 *   feeAmount: maxFee
 * });
 * ```
 */

export { VelumXClient } from './VelumXClient';
export type {
    NetworkConfig,
    SponsorshipOptions,
    FeeEstimateResult,
    SponsorResult,
    SignedIntent
} from './types';
