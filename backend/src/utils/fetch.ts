
import { logger } from './logger';

interface RetryOptions {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    timeout?: number;
}

/**
 * Robust fetch with exponential backoff and 429 handling
 */
export async function fetchWithRetry(
    url: string,
    options: RequestInit = {},
    retryOptions: RetryOptions = {}
): Promise<Response> {
    const {
        maxRetries = 3,
        initialDelay = 1000,
        maxDelay = 10000,
        timeout = 15000,
    } = retryOptions;

    let lastError: Error | null = null;
    let delay = initialDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            if (attempt > 0) {
                logger.warn(`Retry attempt ${attempt} for ${url}`, { delay });
                await new Promise(resolve => setTimeout(resolve, delay));
                delay = Math.min(delay * 2, maxDelay);
            }

            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });

            if (response.ok) {
                return response;
            }

            // Handle specific status codes
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After');
                const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay;
                logger.error(`Rate limited (429) for ${url}`, { waitTime });

                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue; // Retry without counting as a regular attempt if we have a Retry-After? 
                    // Actually, let's just use the exponential backoff or the header.
                }
            }

            const errorBody = await response.text().catch(() => 'No error body');
            throw new Error(`HTTP ${response.status}: ${errorBody}`);

        } catch (error) {
            lastError = error as Error;
            logger.error(`Fetch failed for ${url} (Attempt ${attempt + 1}/${maxRetries + 1})`, {
                error: lastError.message,
            });

            if (attempt === maxRetries) break;

            // Don't retry on certain errors (e.g., protocol errors found via inspection)
            if (lastError.name === 'AbortError') {
                logger.error(`Request timed out for ${url}`);
            }
        } finally {
            clearTimeout(timeoutId);
        }
    }

    throw lastError || new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}
