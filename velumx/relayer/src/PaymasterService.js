"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymasterService = void 0;
const transactions_1 = require("@stacks/transactions");
const network_1 = require("@stacks/network");
class PaymasterService {
    network;
    relayerKey;
    smartWalletContract; // e.g. SP...ADMIN.smart-wallet
    constructor() {
        this.network = process.env.NETWORK === 'mainnet' ? new network_1.StacksMainnet() : new network_1.StacksTestnet();
        this.relayerKey = process.env.RELAYER_PRIVATE_KEY || '';
        this.smartWalletContract = process.env.SMART_WALLET_CONTRACT || '';
        if (!this.relayerKey) {
            console.warn("WARNING: RELAYER_PRIVATE_KEY not set. Sponsorship will fail.");
        }
    }
    async estimateFee(intent) {
        // Logic to calculate estimated STX gas, convert using Oracle rate, and add markup
        // In a real scenario, this queries the smart contract via read-only call
        return {
            maxFeeUSDCx: "250000", // e.g. $0.25
            estimatedGas: 5000
        };
    }
    async sponsorIntent(intent) {
        // The Relayer calls `execute-gasless` on the user's Smart Wallet contract
        // The Relayer pays the STX fee for this transaction.
        // The Smart Wallet contract will reimburse the Relayer in USDCx via the paymaster-module.
        const [contractAddress, contractName] = this.smartWalletContract.split('.');
        const txOptions = {
            contractAddress,
            contractName,
            functionName: 'execute-gasless',
            functionArgs: [
                (0, transactions_1.principalCV)(intent.target),
                // Note: Function resolution in Clarity requires specialized handling.
                // For a generic wallet, the SDK usually encodes the full payload.
                (0, transactions_1.bufferCV)(Buffer.from(intent.signature, 'hex')), // Mock implementation
                (0, transactions_1.uintCV)(intent.maxFeeUSDCx),
                (0, transactions_1.uintCV)(intent.nonce),
                (0, transactions_1.bufferCV)(Buffer.from(intent.signature, 'hex'))
            ],
            senderKey: this.relayerKey,
            validateWithAbi: false, // Intent structs might be dynamic
            network: this.network,
            anchorMode: transactions_1.AnchorMode.Any,
            postConditionMode: transactions_1.PostConditionMode.Allow, // Relayer allows STX to leave its wallet
        };
        const transaction = await (0, transactions_1.makeContractCall)(txOptions);
        const broadcastResponse = await (0, transactions_1.broadcastTransaction)(transaction, this.network);
        if (broadcastResponse.error) {
            throw new Error(`Broadcast failed: ${broadcastResponse.error} - ${broadcastResponse.reason}`);
        }
        return {
            txid: broadcastResponse.txid,
            status: "sponsored"
        };
    }
}
exports.PaymasterService = PaymasterService;
//# sourceMappingURL=PaymasterService.js.map