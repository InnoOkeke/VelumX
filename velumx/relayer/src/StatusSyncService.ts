import { PrismaClient } from '@prisma/client';
import { STACKS_MAINNET, STACKS_TESTNET } from '@stacks/network';

const prisma = new PrismaClient();

/**
 * StatusSyncService - Background poller for Stacks transaction status
 * This service ensures that transactions broadcasted as 'Pending' are 
 * updated to 'Success', 'Failed', or 'Dropped' once processed by the blockchain.
 */
export class StatusSyncService {
    private syncIntervalMs: number = 30000; // 30 seconds
    private networkType: 'mainnet' | 'testnet';
    private baseUrl: string;
    private timer: any = null;

    constructor() {
        this.networkType = (process.env.NETWORK || 'testnet') as 'mainnet' | 'testnet';
        const network = this.networkType === 'mainnet' ? STACKS_MAINNET : STACKS_TESTNET;
        this.baseUrl = network.client.baseUrl;
    }

    /**
     * Start the synchronization service
     */
    public start() {
        if (this.timer) return;
        console.log(`[StatusSync] Starting Sync Service (${this.networkType}, ${this.syncIntervalMs}ms)`);
        this.timer = setInterval(() => this.sync(), this.syncIntervalMs);
        this.sync(); // Initial run
    }

    /**
     * Stop the synchronization service
     */
    public stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /**
     * Perform a single synchronization pass
     */
    private async sync() {
        try {
            // 1. Fetch 'Pending' transactions from the database
            const pendingTxs = await (prisma.transaction as any).findMany({
                where: { status: 'Pending' },
                take: 50 // Limit batch size for performance
            });

            if (pendingTxs.length === 0) return;
            console.log(`[StatusSync] Checking ${pendingTxs.length} pending transactions...`);

            for (const tx of pendingTxs) {
                await this.checkStatus(tx.id, tx.txid);
            }
        } catch (error) {
            console.error('[StatusSync] Sync Pass Failed:', error);
        }
    }

    /**
     * Check the status of a specific Stacks transaction
     */
    private async checkStatus(id: string, txid: string) {
        try {
            // 2. Query the Stacks API for the transaction status
            const url = `${this.baseUrl}/extended/v1/tx/${txid}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                if (response.status === 404) {
                    // Transaction not found on the network yet
                    return;
                }
                console.warn(`[StatusSync] API error for ${txid}: ${response.status}`);
                return;
            }

            const data: any = await response.json();
            const blockchainStatus = data.tx_status; // 'success', 'pending', 'abort_by_mempool', etc.

            // 3. Map blockchain status to dashboard status
            let newStatus = 'Pending';
            if (blockchainStatus === 'success') {
                newStatus = 'Success';
            } else if (blockchainStatus === 'abort_by_post_condition' || blockchainStatus === 'abort_by_mempool') {
                newStatus = 'Failed';
            }

            // 4. Update the database if the status has changed
            if (newStatus !== 'Pending') {
                console.log(`[StatusSync] Updating TX ${txid}: ${newStatus}`);
                await (prisma.transaction as any).update({
                    where: { id },
                    data: { status: newStatus }
                });
            }
        } catch (error) {
            console.error(`[StatusSync] Failed to check status for ${txid}:`, error);
        }
    }
}
