import { PrismaClient } from '@prisma/client';
import { STACKS_MAINNET, STACKS_TESTNET } from '@stacks/network';
import { invalidateStatsCache } from './services/RedisClient.js';

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
        this.networkType = (process.env.NETWORK || 'mainnet') as 'mainnet' | 'testnet';
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
                take: 50
            });

            if (pendingTxs.length === 0) return;
            console.log(`[StatusSync] Checking ${pendingTxs.length} pending transactions...`);

            // Mark transactions older than 2 hours as Failed — they've been silently dropped
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            const stale = pendingTxs.filter((tx: any) => new Date(tx.createdAt) < twoHoursAgo);
            if (stale.length > 0) {
                const staleIds = stale.map((tx: any) => tx.id);
                await (prisma.transaction as any).updateMany({
                    where: { id: { in: staleIds } },
                    data: { status: 'Failed' }
                });
                console.log(`[StatusSync] Marked ${stale.length} stale transactions as Failed`);
            }

            // Check remaining non-stale pending transactions against the chain
            const fresh = pendingTxs.filter((tx: any) => new Date(tx.createdAt) >= twoHoursAgo);
            for (const tx of fresh) {
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
            const blockchainStatus = data.tx_status; // 'success', 'pending', 'abort_by_post_condition', 'dropped_*', etc.

            // 3. Map blockchain status to dashboard status
            // Full list: https://docs.hiro.so/stacks/api/transactions/get-transaction
            let newStatus = 'Pending';
            if (blockchainStatus === 'success') {
                newStatus = 'Confirmed';
            } else if (
                blockchainStatus === 'abort_by_post_condition' ||
                blockchainStatus === 'abort_by_response' ||
                blockchainStatus === 'abort_by_mempool' ||
                blockchainStatus === 'dropped_replace_by_fee' ||
                blockchainStatus === 'dropped_replace_across_fork' ||
                blockchainStatus === 'dropped_too_expensive' ||
                blockchainStatus === 'dropped_stale_garbage_collect' ||
                blockchainStatus === 'dropped_problematic'
            ) {
                newStatus = 'Failed';
            }

            // 4. Update the database if the status has changed
            if (newStatus !== 'Pending') {
                console.log(`[StatusSync] Updating TX ${txid}: ${newStatus}`);
                const updated = await (prisma.transaction as any).update({
                    where: { id },
                    data: { status: newStatus }
                });
                // Invalidate dashboard cache for this user so next load is fresh
                if (updated?.userId) await invalidateStatsCache(updated.userId);
            }
        } catch (error) {
            console.error(`[StatusSync] Failed to check status for ${txid}:`, error);
        }
    }
}
