import { broadcastTransaction } from '@stacks/transactions';
import { getConfig } from '../config';
import { fetchWithRetry } from './fetch';
import { logger } from './logger';

interface BroadcastOptions {
  maxBroadcastRetries?: number;
  verifyRetries?: number;
  verifyIntervalMs?: number;
}

/**
 * Broadcasts a Stacks transaction and verifies the node knows about the txid.
 * Throws on failure or if the txid cannot be observed within the verify window.
 */
export async function broadcastAndVerify(
  transaction: any,
  network: any,
  options: BroadcastOptions = {}
): Promise<string> {
  const cfg = getConfig();
  const maxBroadcastRetries = options.maxBroadcastRetries ?? 3;
  const verifyRetries = options.verifyRetries ?? 6; // total ~12s with default interval
  const verifyIntervalMs = options.verifyIntervalMs ?? 2000;

  let lastErr: any = null;

  for (let attempt = 1; attempt <= maxBroadcastRetries; attempt++) {
    try {
      logger.debug(`broadcastAndVerify: broadcasting attempt ${attempt}/${maxBroadcastRetries}`);
      const resp: any = await broadcastTransaction({ transaction, network });

      if (!resp || 'error' in resp) {
        lastErr = resp || new Error('Empty broadcast response');

        // If the response indicates BadNonce or TooMuchChaining bubble it up for higher-level handling
        const reason = resp?.reason || resp?.error || '';
        const msg = `Broadcast failure: ${String(reason)}`;
        logger.warn(msg, { resp });

        // If we've exhausted attempts, throw the last response as an error
        if (attempt === maxBroadcastRetries) {
          throw new Error(msg);
        }

        // Backoff a bit and retry
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }

      const txid: string | undefined = resp.txid;

      if (!txid) {
        lastErr = new Error('Broadcast returned no txid');
        logger.warn('broadcastAndVerify: no txid in broadcast response', { resp });
        if (attempt === maxBroadcastRetries) throw lastErr;
        await new Promise(r => setTimeout(r, 1000 * attempt));
        continue;
      }

      // Poll the node to ensure the tx is known (returns 200 for known txs)
      for (let v = 0; v < verifyRetries; v++) {
        try {
          const url = `${cfg.stacksRpcUrl}/extended/v1/tx/${txid}`;
          const r = await fetchWithRetry(url, {}, { maxRetries: 1, timeout: 5000 });
          if (r.ok) {
            logger.info('broadcastAndVerify: tx observed by node', { txid });
            return txid;
          }
        } catch (e) {
          // 404 or network error means node doesn't yet know about it; continue polling
          logger.debug('broadcastAndVerify: tx not yet observed', { txid, attempt: v, error: (e as Error).message });
        }

        await new Promise(r => setTimeout(r, verifyIntervalMs));
      }

      // If we reach here, the tx was broadcast but never observed
      throw new Error(`Transaction ${txid} not observed by node after ${verifyRetries} checks`);

    } catch (err) {
      lastErr = err;
      // If last attempt, rethrow
      if (attempt === maxBroadcastRetries) {
        logger.error('broadcastAndVerify: final broadcast error', { error: (err as Error).message });
        throw err;
      }
      // small backoff before retry
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }

  throw lastErr || new Error('Unknown broadcast failure');
}

/**
 * Convenience wrapper for checking tx status via RPC
 */
export async function checkTransactionStatus(txid: string): Promise<'pending' | 'success' | 'failed'> {
  const cfg = getConfig();
  try {
    const resp = await fetchWithRetry(`${cfg.stacksRpcUrl}/extended/v1/tx/${txid}`, {}, { maxRetries: 2, timeout: 5000 });
    if (!resp.ok) return 'pending';
    const data: any = await resp.json();
    if (data.tx_status === 'success') return 'success';
    if (data.tx_status && (data.tx_status.startsWith('abort') || data.tx_status === 'failed')) return 'failed';
    return 'pending';
  } catch (error) {
    return 'pending';
  }
}
