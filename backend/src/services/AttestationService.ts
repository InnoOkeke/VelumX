/**
 * Attestation Service
 * Handles fetching attestations from Circle's API and Stacks attestation service
 */

import { getConfig } from '../config';
import { logger } from '../utils/logger';
import { AttestationData } from '@shared/types';

interface AttestationFetchOptions {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
}

export class AttestationService {
  private config = getConfig();
  private readonly CIRCLE_ATTESTATION_API = 'https://iris-api-sandbox.circle.com/v1/attestations';
  private readonly STACKS_ATTESTATION_API = 'https://api.testnet.hiro.so';

  /**
   * Fetches attestation from Circle's API
   * Treats 404 as "not ready" (non-fatal) and retries
   * 
   * @param messageHash - The message hash to fetch attestation for
   * @param options - Fetch options (maxRetries, retryDelay, timeout)
   * @returns Attestation data
   */
  async fetchCircleAttestation(
    messageHash: string,
    options: AttestationFetchOptions = {}
  ): Promise<AttestationData> {
    const {
      maxRetries = this.config.maxRetries,
      retryDelay = this.config.attestationPollInterval,
      timeout = this.config.transactionTimeout,
    } = options;

    logger.info('Starting Circle attestation fetch', {
      messageHash,
      maxRetries,
      retryDelay,
      timeout,
    });

    const startTime = Date.now();
    let attempt = 0;

    while (attempt < maxRetries) {
      // Check timeout
      if (Date.now() - startTime > timeout) {
        const error = new Error(`Attestation fetch timeout after ${timeout}ms`);
        logger.error('Circle attestation fetch timeout', {
          messageHash,
          duration: Date.now() - startTime,
          attempts: attempt + 1,
        });
        throw error;
      }

      attempt++;

      try {
        logger.debug('Fetching Circle attestation', {
          messageHash,
          attempt,
          maxRetries,
        });

        const response = await this.fetchFromCircleAPI(messageHash);

        if (response.attestation) {
          logger.info('Circle attestation fetched successfully', {
            messageHash,
            attempt,
            duration: Date.now() - startTime,
          });

          return {
            attestation: response.attestation,
            messageHash,
            fetchedAt: Date.now(),
          };
        }

        // Attestation not ready yet (404 or pending) - this is NORMAL
        logger.info('Circle attestation not ready yet, will retry', {
          messageHash,
          attempt,
          maxRetries,
          nextRetryIn: retryDelay,
        });

      } catch (error) {
        const err = error as Error;
        // Only log as error if it's NOT a "not ready" case
        if (err.message.includes('404') || err.message.includes('not ready')) {
          logger.info('Circle attestation not ready (404), will retry', {
            messageHash,
            attempt,
            nextRetryIn: retryDelay,
          });
        } else {
          // Real error (auth, network, etc.)
          logger.error('Circle attestation fetch error', {
            messageHash,
            attempt,
            error: err.message,
          });
          throw error; // Fatal error, don't retry
        }
      }

      // Wait before next attempt (unless it's the last attempt)
      if (attempt < maxRetries) {
        await this.sleep(retryDelay);
      }
    }

    // All retries exhausted - attestation still not ready
    const error = new Error(
      `Attestation not ready after ${maxRetries} attempts (${Math.floor((Date.now() - startTime) / 1000)}s)`
    );
    logger.warn('Circle attestation not ready after max retries', {
      messageHash,
      attempts: maxRetries,
      duration: Date.now() - startTime,
    });
    throw error;
  }

  /**
   * Fetches attestation for xReserve (Stacks official bridge)
   * For xReserve, we need to check the Stacks transaction status
   * 
   * @param txHash - The Ethereum transaction hash (used as message identifier)
   * @param options - Fetch options
   * @returns Attestation data
   */
  async fetchXReserveAttestation(
    txHash: string,
    options: AttestationFetchOptions = {}
  ): Promise<AttestationData> {
    const {
      maxRetries = this.config.maxRetries,
      retryDelay = this.config.attestationPollInterval,
      timeout = this.config.transactionTimeout,
    } = options;

    logger.info('Starting xReserve attestation fetch', {
      txHash,
      maxRetries,
      retryDelay,
      timeout,
    });

    const startTime = Date.now();
    let attempt = 0;

    while (attempt < maxRetries) {
      // Check timeout
      if (Date.now() - startTime > timeout) {
        const error = new Error(`xReserve attestation timeout after ${timeout}ms`);
        logger.error('xReserve attestation fetch timeout', {
          txHash,
          duration: Date.now() - startTime,
          attempts: attempt + 1,
        });
        throw error;
      }

      attempt++;

      try {
        logger.debug('Fetching xReserve attestation from Stacks', {
          txHash,
          attempt,
          maxRetries,
        });

        // For xReserve, check if the Ethereum deposit has been processed on Stacks
        // The attestation comes from the Stacks network confirming the deposit
        const response = await this.fetchFromStacksAPI(txHash);

        if (response.attestation) {
          logger.info('xReserve attestation fetched successfully', {
            txHash,
            attempt,
            duration: Date.now() - startTime,
          });

          return {
            attestation: response.attestation,
            messageHash: txHash,
            fetchedAt: Date.now(),
          };
        }

        // Attestation not ready yet - Stacks hasn't confirmed the deposit
        logger.info('xReserve attestation not ready yet, will retry', {
          txHash,
          attempt,
          maxRetries,
          nextRetryIn: retryDelay,
        });

      } catch (error) {
        const err = error as Error;
        // Only log as error if it's NOT a "not ready" case
        if (err.message.includes('404') || err.message.includes('not found')) {
          logger.info('xReserve transaction not found on Stacks yet, will retry', {
            txHash,
            attempt,
            nextRetryIn: retryDelay,
          });
        } else {
          logger.error('xReserve attestation fetch error', {
            txHash,
            attempt,
            error: err.message,
          });
          throw error; // Fatal error
        }
      }

      // Wait before next attempt
      if (attempt < maxRetries) {
        await this.sleep(retryDelay);
      }
    }

    // All retries exhausted
    const error = new Error(
      `xReserve attestation not ready after ${maxRetries} attempts (${Math.floor((Date.now() - startTime) / 1000)}s)`
    );
    logger.warn('xReserve attestation not ready after max retries', {
      txHash,
      attempts: maxRetries,
      duration: Date.now() - startTime,
    });
    throw error;
  }

  /**
   * Fetches attestation from Stacks attestation service
   * Polls every 30 seconds until available or timeout
   * 
   * @param txHash - The Stacks transaction hash
   * @param options - Fetch options
   * @returns Attestation data
   */
  async fetchStacksAttestation(
    txHash: string,
    options: AttestationFetchOptions = {}
  ): Promise<AttestationData> {
    const {
      maxRetries = this.config.maxRetries,
      retryDelay = this.config.attestationPollInterval,
      timeout = this.config.transactionTimeout,
    } = options;

    logger.info('Starting Stacks attestation fetch', {
      txHash,
      maxRetries,
      retryDelay,
      timeout,
    });

    const startTime = Date.now();
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < maxRetries) {
      // Check timeout
      if (Date.now() - startTime > timeout) {
        const error = new Error(`Attestation fetch timeout after ${timeout}ms`);
        logger.error('Stacks attestation fetch timeout', {
          txHash,
          duration: Date.now() - startTime,
          attempts: attempt + 1,
        });
        throw error;
      }

      attempt++;

      try {
        logger.debug('Fetching Stacks attestation', {
          txHash,
          attempt,
          maxRetries,
        });

        const response = await this.fetchFromStacksAPI(txHash);

        if (response.attestation) {
          logger.info('Stacks attestation fetched successfully', {
            txHash,
            attempt,
            duration: Date.now() - startTime,
          });

          return {
            attestation: response.attestation,
            messageHash: response.messageHash,
            fetchedAt: Date.now(),
          };
        }

        // Attestation not ready yet
        logger.debug('Stacks attestation not ready, will retry', {
          txHash,
          attempt,
          nextRetryIn: retryDelay,
        });

      } catch (error) {
        lastError = error as Error;
        logger.warn('Stacks attestation fetch attempt failed', {
          txHash,
          attempt,
          error: (error as Error).message,
        });
      }

      // Wait before next attempt
      if (attempt < maxRetries) {
        await this.sleep(retryDelay);
      }
    }

    // All retries exhausted
    const error = new Error(
      `Failed to fetch Stacks attestation after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
    );
    logger.error('Stacks attestation fetch failed', {
      txHash,
      attempts: maxRetries,
      lastError: lastError?.message,
    });
    throw error;
  }

  /**
   * Fetches attestation from Circle's API
   * @private
   */
  private async fetchFromCircleAPI(messageHash: string): Promise<any> {
    const url = `${this.CIRCLE_ATTESTATION_API}/${messageHash}`;
    
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    // Add API key if configured
    if (this.config.circleApiKey) {
      headers['Authorization'] = `Bearer ${this.config.circleApiKey}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      if (response.status === 404) {
        // Attestation not ready yet
        return { attestation: null };
      }
      throw new Error(`Circle API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Fetches attestation from Stacks API
   * @private
   */
  private async fetchFromStacksAPI(txHash: string): Promise<any> {
    // Note: This is a placeholder implementation
    // The actual Stacks attestation API endpoint may differ
    const url = `${this.STACKS_ATTESTATION_API}/extended/v1/tx/${txHash}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        // Transaction not found or attestation not ready
        return { attestation: null, messageHash: '' };
      }
      throw new Error(`Stacks API error: ${response.status} ${response.statusText}`);
    }

    const data: any = await response.json();
    
    // Extract attestation from transaction data
    // This will depend on the actual Stacks attestation format
    if (data.tx_status === 'success' && data.burn_block_time) {
      // Transaction is confirmed, check for attestation
      // For now, return placeholder
      return {
        attestation: data.tx_result?.hex || null,
        messageHash: txHash,
      };
    }

    return { attestation: null, messageHash: '' };
  }

  /**
   * Sleep utility for retry delays
   * @private
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validates message hash format
   */
  isValidMessageHash(messageHash: string): boolean {
    return /^0x[a-fA-F0-9]{64}$/.test(messageHash);
  }

  /**
   * Validates transaction hash format
   */
  isValidTxHash(txHash: string): boolean {
    return /^0x[a-fA-F0-9]{64}$/.test(txHash);
  }
}

// Export singleton instance
export const attestationService = new AttestationService();
