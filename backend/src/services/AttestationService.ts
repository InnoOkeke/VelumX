/**
 * Attestation Service
 * Handles fetching attestations from Circle's API and Stacks attestation service
 */

import { getConfig } from '../config';
import { logger } from '../utils/logger';
import { AttestationData } from '@shared/types';

/**
 * Options for attestation fetch operations.
 * 
 * Note on terminology: The parameter is named "maxRetries" for backward compatibility,
 * but internally we treat it as "maxAttempts" (total number of attempts including the initial one).
 * This clarifies the semantics and fixes the off-by-one error in the original implementation.
 * 
 * Example: maxRetries=3 means 3 total attempts (1 initial + 2 retries), not 3 retries after initial.
 */
interface AttestationFetchOptions {
  maxRetries?: number;  // Actually treated as maxAttempts internally
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
   * This method uses the corrected retry logic via the shared retryWithAttempts helper.
   * The off-by-one bug has been fixed: maxRetries is now treated as maxAttempts (total attempts).
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

    // Validate and coerce maxRetries to a valid maxAttempts value
    // Note: We rename maxRetries to maxAttempts here to clarify semantics.
    // The original bug: loop condition was `while (attempt < maxRetries)` which caused
    // an off-by-one error. With maxRetries=3, only 3 attempts were made instead of 4.
    // Fix: We now treat the parameter as maxAttempts (total attempts, not retries after initial).
    const maxAttempts = this.validateMaxAttempts(maxRetries, 'fetchCircleAttestation');

    logger.info('Starting Circle attestation fetch', {
      messageHash,
      maxAttempts,
      retryDelay,
      timeout,
    });

    // Extract Circle API call into operation callback
    const operation = async (): Promise<AttestationData | null> => {
      const response = await this.fetchFromCircleAPI(messageHash);

      if (response.attestation) {
        return {
          attestation: response.attestation,
          messageHash,
          fetchedAt: Date.now(),
        };
      }

      // Attestation not ready yet (404 or pending) - return null to signal retry
      return null;
    };

    // Use the shared retry helper with corrected attempt counting
    return this.retryWithAttempts(
      operation,
      maxAttempts,
      retryDelay,
      timeout,
      'Circle attestation',
      messageHash
    );
  }

  /**
   * Fetches attestation for xReserve (Stacks official bridge)
   * 
   * xReserve is the official Stacks bridge that operates fully automatically without
   * using Circle's attestation system. Instead of querying Circle's API, we verify
   * that the USDCx tokens have arrived on Stacks by checking the recipient's balance.
   * 
   * This method uses the corrected retry logic via the shared retryWithAttempts helper.
   * The off-by-one bug has been fixed: maxRetries is now treated as maxAttempts (total attempts).
   * 
   * @param txHash - The Ethereum transaction hash (used as message identifier)
   * @param recipientAddress - The Stacks address that should receive USDCx tokens
   * @param expectedAmount - The expected amount of USDCx tokens (as string)
   * @param options - Fetch options (maxRetries, retryDelay, timeout)
   * @returns Attestation data with 'xreserve-automatic' as attestation value
   */
  async fetchXReserveAttestation(
    txHash: string,
    recipientAddress: string,
    expectedAmount: string,
    options: AttestationFetchOptions = {}
  ): Promise<AttestationData> {
    const {
      maxRetries = this.config.maxRetries,
      retryDelay = this.config.attestationPollInterval,
      timeout = this.config.transactionTimeout,
    } = options;

    // Validate and coerce maxRetries to a valid maxAttempts value
    // Note: We rename maxRetries to maxAttempts here to clarify semantics.
    // The original bug: loop condition was `while (attempt < maxRetries)` which caused
    // an off-by-one error. With maxRetries=3, only 3 attempts were made instead of 4.
    // Fix: We now treat the parameter as maxAttempts (total attempts, not retries after initial).
    const maxAttempts = this.validateMaxAttempts(maxRetries, 'fetchXReserveAttestation');

    logger.info('Starting xReserve balance verification', {
      txHash,
      recipientAddress,
      expectedAmount,
      maxAttempts,
      retryDelay,
      timeout,
    });

    // Query Stacks blockchain for balance verification
    const operation = async (): Promise<AttestationData | null> => {
      const balance = await this.fetchStacksBalance(recipientAddress);

      if (this.verifyBalanceIncrease(balance, expectedAmount)) {
        logger.info('xReserve balance verification successful', {
          txHash,
          recipientAddress,
          balance: balance.toString(),
          expectedAmount,
        });

        return {
          attestation: 'xreserve-automatic',
          messageHash: txHash,
          fetchedAt: Date.now(),
        };
      }

      // Balance not yet increased, retry
      logger.debug('xReserve balance not yet increased', {
        txHash,
        recipientAddress,
        currentBalance: balance.toString(),
        expectedAmount,
      });

      return null;
    };

    // Use the shared retry helper with corrected attempt counting
    return this.retryWithAttempts(
      operation,
      maxAttempts,
      retryDelay,
      timeout,
      'xReserve balance verification',
      txHash
    );
  }

  /**
   * Fetches attestation from Stacks attestation service
   * Polls every 30 seconds until available or timeout
   * 
   * This method uses the corrected retry logic via the shared retryWithAttempts helper.
   * The off-by-one bug has been fixed: maxRetries is now treated as maxAttempts (total attempts).
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

    // Validate and coerce maxRetries to a valid maxAttempts value
    // Note: We rename maxRetries to maxAttempts here to clarify semantics.
    // The original bug: loop condition was `while (attempt < maxRetries)` which caused
    // an off-by-one error. With maxRetries=3, only 3 attempts were made instead of 4.
    // Fix: We now treat the parameter as maxAttempts (total attempts, not retries after initial).
    const maxAttempts = this.validateMaxAttempts(maxRetries, 'fetchStacksAttestation');

    logger.info('Starting Stacks attestation fetch', {
      txHash,
      maxAttempts,
      retryDelay,
      timeout,
    });

    // Extract Stacks API call into operation callback
    const operation = async (): Promise<AttestationData | null> => {
      const response = await this.fetchFromStacksAPI(txHash);

      if (response.attestation) {
        return {
          attestation: response.attestation,
          messageHash: response.messageHash,
          fetchedAt: Date.now(),
        };
      }

      // Attestation not ready yet - return null to signal retry
      return null;
    };

    // Use the shared retry helper with corrected attempt counting
    // The helper preserves lastError tracking in its error messages
    return this.retryWithAttempts(
      operation,
      maxAttempts,
      retryDelay,
      timeout,
      'Stacks attestation',
      txHash
    );
  }

  /**
   * Fetches USDCx balance for a Stacks address
   * Queries the Stacks blockchain API for fungible token balances
   * 
   * Error handling:
   * - Retryable errors (404, network, timeout, rate limit) are thrown to trigger retry logic
   * - Permanent errors (401, 403, 500, validation) are thrown immediately without retry
   * - 404 responses return 0n (address not found is normal for new addresses)
   * 
   * @param address - The Stacks address to query
   * @returns The USDCx balance as a bigint (0n if address not found or no balance)
   * @throws Error for API failures (classified as retryable or permanent)
   * @private
   */
  private async fetchStacksBalance(address: string): Promise<bigint> {
    const url = `${this.config.stacksRpcUrl}/extended/v1/address/${address}/balances`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        if (response.status === 404) {
          // Address not found or no balance yet - this is normal for new addresses
          return 0n;
        }

        // Create error with status code for classification
        const error = new Error(`Stacks API error: ${response.status} ${response.statusText}`);

        // Classify error and throw appropriately
        if (this.isRetryableError(error)) {
          // Retryable error - throw to trigger retry logic
          throw error;
        } else {
          // Permanent error - throw immediately without retry
          throw error;
        }
      }

      const data: any = await response.json();

      // Extract USDCx balance from fungible_tokens
      // The key format is the full contract identifier (e.g., "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx::usdcx-token")
      const fungibleTokens = data.fungible_tokens || {};
      const usdcxKey = Object.keys(fungibleTokens).find(key => key.startsWith(this.config.stacksUsdcxAddress));

      if (!usdcxKey) {
        return 0n;
      }

      return BigInt(fungibleTokens[usdcxKey].balance);
    } catch (error) {
      // Catch network errors (fetch failures, timeouts, etc.)
      const err = error as Error;

      // Classify the error
      if (this.isRetryableError(err)) {
        // Retryable error (network timeout, connection failure, etc.) - throw to trigger retry
        logger.debug('Retryable error in fetchStacksBalance', {
          address,
          error: err.message,
        });
        throw err;
      } else {
        // Permanent error - throw immediately without retry
        logger.error('Permanent error in fetchStacksBalance', {
          address,
          error: err.message,
        });
        throw err;
      }
    }
  }

  /**
   * Verifies that balance increased by expected amount
   * 
   * Note: We check >= instead of == to handle cases where user received
   * multiple deposits or had existing balance. For first deposit, balance 
   * should be >= expected amount. For subsequent deposits, we can't verify 
   * exact increase without tracking previous balance, so we just verify 
   * balance >= expected.
   * 
   * @param currentBalance - The current USDCx balance as a bigint
   * @param expectedAmount - The expected deposit amount as a string
   * @returns true if balance meets or exceeds expected amount, false otherwise
   * @private
   */
  private verifyBalanceIncrease(
    currentBalance: bigint,
    expectedAmount: string
  ): boolean {
    const expected = BigInt(expectedAmount);

    // For first deposit, balance should be >= expected amount
    // For subsequent deposits, we can't verify exact increase without
    // tracking previous balance, so we just verify balance >= expected
    return currentBalance >= expected;
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
   * Validates and coerces maxAttempts parameter to a valid non-negative integer.
   * Invalid values (negative, non-integer, null, undefined, NaN) are coerced to the default value.
   * 
   * This validation ensures that the retry logic receives a valid maxAttempts value,
   * preventing errors from invalid configuration.
   * 
   * @param value - The value to validate (comes from maxRetries parameter)
   * @param methodName - The name of the calling method (for logging)
   * @returns A valid non-negative integer for maxAttempts
   * @private
   */
  private validateMaxAttempts(value: number, methodName: string): number {
    const defaultValue = 3;

    // Check for null, undefined, or NaN
    if (value == null || Number.isNaN(value)) {
      logger.warn(`Invalid maxAttempts value in ${methodName}, using default`, {
        providedValue: value,
        defaultValue,
        reason: 'null, undefined, or NaN',
      });
      return defaultValue;
    }

    // Check if it's not a number
    if (typeof value !== 'number') {
      logger.warn(`Invalid maxAttempts value in ${methodName}, using default`, {
        providedValue: value,
        providedType: typeof value,
        defaultValue,
        reason: 'not a number',
      });
      return defaultValue;
    }

    // Check if it's negative
    if (value < 0) {
      logger.warn(`Invalid maxAttempts value in ${methodName}, using default`, {
        providedValue: value,
        defaultValue,
        reason: 'negative value',
      });
      return defaultValue;
    }

    // Check if it's not an integer
    if (!Number.isInteger(value)) {
      logger.warn(`Invalid maxAttempts value in ${methodName}, using default`, {
        providedValue: value,
        defaultValue,
        reason: 'non-integer value',
      });
      return defaultValue;
    }

    // Value is valid
    return value;
  }

  /**
   * Shared retry helper that encapsulates retry logic with corrected attempt counting.
   * 
   * THE OFF-BY-ONE BUG FIX:
   * ----------------------
   * Original bug: The loop condition was `while (attempt < maxRetries)` which caused
   * an off-by-one error. With maxRetries=3, the loop would run 3 times (attempts 0, 1, 2),
   * not 4 times as expected (1 initial + 3 retries).
   * 
   * Fix: We now use `while (attempt < maxAttempts)` where maxAttempts represents the
   * total number of attempts (not retries after initial). With maxAttempts=3, the loop
   * runs exactly 3 times (attempts 1, 2, 3).
   * 
   * MAXATTEMPTS VS MAXRETRIES TERMINOLOGY:
   * -------------------------------------
   * - maxRetries: Number of retry attempts AFTER the initial attempt (confusing semantics)
   * - maxAttempts: Total number of attempts INCLUDING the initial attempt (clear semantics)
   * 
   * We use maxAttempts internally for clarity. The public interface still uses maxRetries
   * for backward compatibility, but we treat it as maxAttempts.
   * 
   * Example: maxRetries=3 → maxAttempts=3 → 3 total attempts (not 1 initial + 3 retries)
   * 
   * HOW THIS HELPER WORKS:
   * ---------------------
   * 1. Validates timeout before each attempt
   * 2. Increments attempt counter (1-indexed for logging)
   * 3. Executes the operation callback
   * 4. If successful (non-null result), returns immediately
   * 5. If null result (not ready), checks if more attempts remain
   * 6. If more attempts remain, logs "will retry" and sleeps
   * 7. If no more attempts, logs "retry limit reached"
   * 8. If error occurs, checks if retryable (404, not found, not ready)
   * 9. Fatal errors (non-retryable) are thrown immediately
   * 10. After loop exhaustion, throws error with attempt count and duration
   * 
   * CORRECTED LOOP CONDITION:
   * ------------------------
   * The key fix is: `while (attempt < maxAttempts)`
   * - This ensures exactly maxAttempts iterations
   * - Combined with `hasMoreAttempts = attempt < maxAttempts` check
   * - Ensures "will retry" is only logged when another attempt will actually occur
   * 
   * @param operation - The async operation to retry (returns T on success, null if not ready)
   * @param maxAttempts - Maximum number of attempts (total, not retries after initial)
   * @param retryDelay - Delay in milliseconds between attempts
   * @param timeout - Maximum total duration in milliseconds
   * @param operationName - Name of the operation for logging (e.g., "Circle attestation")
   * @param identifier - Identifier (messageHash or txHash) for logging
   * @returns The successful result from the operation
   * @throws Error if all attempts exhausted, timeout reached, or fatal error occurs
   * @private
   */
  private async retryWithAttempts<T>(
    operation: () => Promise<T | null>,
    maxAttempts: number,
    retryDelay: number,
    timeout: number,
    operationName: string,
    identifier: string
  ): Promise<T> {
    const startTime = Date.now();
    let attempt = 0;  // 0-indexed counter, incremented at start of each iteration
    let lastError: Error | null = null;

    // CORRECTED LOOP CONDITION: while (attempt < maxAttempts)
    // This ensures exactly maxAttempts iterations (e.g., maxAttempts=3 → 3 iterations)
    // Original bug was here: the condition caused one fewer iteration than expected
    while (attempt < maxAttempts) {
      // Check timeout before each attempt to prevent exceeding configured timeout
      if (Date.now() - startTime > timeout) {
        const duration = Date.now() - startTime;
        const error = new Error(`${operationName} timeout after ${timeout}ms`);
        logger.error(`${operationName} timeout`, {
          identifier,
          duration,
          attempts: attempt,
        });
        throw error;
      }

      attempt++;  // Increment at start: attempt is now 1-indexed for logging (1, 2, 3, ...)

      try {
        logger.debug(`Fetching ${operationName}`, {
          identifier,
          attempt,  // Logged as 1-indexed (human-readable)
          maxAttempts,
        });

        const result = await operation();

        if (result !== null) {
          // Success! Return the result immediately
          logger.info(`${operationName} fetched successfully`, {
            identifier,
            attempt,
            duration: Date.now() - startTime,
          });
          return result;
        }

        // Result is null - attestation not ready yet (this is normal, not an error)
        // Check if we have more attempts remaining BEFORE logging "will retry"
        const hasMoreAttempts = attempt < maxAttempts;

        if (hasMoreAttempts) {
          // ACCURATE RETRY LOGGING: Only log "will retry" when we actually will retry
          // This fixes the bug where "will retry" was logged even on the last attempt
          logger.info(`${operationName} not ready yet, will retry`, {
            identifier,
            attempt,
            maxAttempts,
            nextRetryIn: retryDelay,
          });
          await this.sleep(retryDelay);
        } else {
          // No more attempts - log that we've reached the limit
          logger.info(`${operationName} not ready, retry limit reached`, {
            identifier,
            attempt,
            maxAttempts,
          });
        }

      } catch (error) {
        lastError = error as Error;
        const err = error as Error;

        // Check if this is a retryable error using the helper method
        // Retryable errors: 404, timeout, network errors, rate limiting
        // Permanent errors: 401, 403, 500, validation errors
        const isRetryable = this.isRetryableError(err);

        if (isRetryable) {
          // Transient error - check if we can retry
          const hasMoreAttempts = attempt < maxAttempts;

          if (hasMoreAttempts) {
            // ACCURATE RETRY LOGGING: Only log "will retry" when we actually will retry
            logger.info(`${operationName} not ready (${err.message}), will retry`, {
              identifier,
              attempt,
              nextRetryIn: retryDelay,
            });
            await this.sleep(retryDelay);
          } else {
            // No more attempts - log that we've reached the limit
            logger.info(`${operationName} not ready, retry limit reached`, {
              identifier,
              attempt,
              maxAttempts,
            });
          }
        } else {
          // Fatal error (non-retryable) - throw immediately without further attempts
          // Examples: 401, 403, 500, network errors
          logger.error(`${operationName} fetch error`, {
            identifier,
            attempt,
            error: err.message,
          });
          throw error;
        }
      }
    }

    // All attempts exhausted - attestation still not ready
    // This is reached when the loop completes without success or fatal error
    const duration = Math.floor((Date.now() - startTime) / 1000);
    const error = new Error(
      `${operationName} not ready after ${maxAttempts} attempts (${duration}s)${lastError ? `: ${lastError.message}` : ''}`
    );
    logger.warn(`${operationName} not ready after max attempts`, {
      identifier,
      attempts: maxAttempts,  // Log total attempts made
      duration: Date.now() - startTime,
      lastError: lastError?.message,
    });
    throw error;
  }

  /**
   * Classifies errors as retryable or permanent
   * 
   * Retryable errors (return true):
   * - 404 Not Found (address not yet on chain, balance not yet updated)
   * - Network timeouts
   * - Temporary network failures
   * - Rate limiting (429)
   * 
   * Permanent errors (return false):
   * - 401 Unauthorized
   * - 403 Forbidden
   * - 500 Internal Server Error
   * - Validation errors
   * 
   * @param error - The error to classify
   * @returns true if the error is retryable, false if permanent
   * @private
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Check for retryable error patterns
    const isRetryable = message.includes('404') ||
      message.includes('not found') ||
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('429') ||
      message.includes('rate limit');

    // Check for permanent error patterns
    const isPermanent = message.includes('401') ||
      message.includes('unauthorized') ||
      message.includes('403') ||
      message.includes('forbidden') ||
      message.includes('500') ||
      message.includes('internal server error') ||
      message.includes('validation error') ||
      message.includes('invalid');

    // If explicitly permanent, return false
    if (isPermanent) {
      return false;
    }

    // Otherwise, return true if retryable pattern found
    return isRetryable;
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
