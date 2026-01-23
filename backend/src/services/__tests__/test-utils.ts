/**
 * Test Utilities for Attestation Service Testing
 * 
 * This file provides shared testing infrastructure for property-based and unit tests:
 * - Logger mocking utilities to capture and verify log output
 * - Fake timer utilities for time-based testing
 * - Common test helpers for attestation service tests
 * 
 * Feature: attestation-retry-fix
 * Validates: Testing Strategy requirements
 */

import { vi } from 'vitest';
import type { Logger } from 'winston';

/**
 * Captured log entry for verification
 */
export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata?: Record<string, any>;
}

/**
 * Logger mock that captures all log calls for verification
 */
export class MockLogger {
  private logs: LogEntry[] = [];

  info(message: string, metadata?: Record<string, any>): void {
    this.logs.push({ level: 'info', message, metadata });
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.logs.push({ level: 'warn', message, metadata });
  }

  error(message: string, metadata?: Record<string, any>): void {
    this.logs.push({ level: 'error', message, metadata });
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.logs.push({ level: 'debug', message, metadata });
  }

  /**
   * Get all captured logs
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs filtered by level
   */
  getLogsByLevel(level: LogEntry['level']): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  /**
   * Get logs filtered by message pattern
   */
  getLogsByMessage(pattern: string | RegExp): LogEntry[] {
    if (typeof pattern === 'string') {
      return this.logs.filter(log => log.message.includes(pattern));
    }
    return this.logs.filter(log => pattern.test(log.message));
  }

  /**
   * Check if a specific log message exists
   */
  hasLog(level: LogEntry['level'], messagePattern: string | RegExp): boolean {
    return this.logs.some(log => {
      if (log.level !== level) return false;
      if (typeof messagePattern === 'string') {
        return log.message.includes(messagePattern);
      }
      return messagePattern.test(log.message);
    });
  }

  /**
   * Count logs matching criteria
   */
  countLogs(level?: LogEntry['level'], messagePattern?: string | RegExp): number {
    let filtered = this.logs;
    
    if (level) {
      filtered = filtered.filter(log => log.level === level);
    }
    
    if (messagePattern) {
      if (typeof messagePattern === 'string') {
        filtered = filtered.filter(log => log.message.includes(messagePattern));
      } else {
        filtered = filtered.filter(log => messagePattern.test(log.message));
      }
    }
    
    return filtered.length;
  }

  /**
   * Clear all captured logs
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Get the last log entry
   */
  getLastLog(): LogEntry | undefined {
    return this.logs[this.logs.length - 1];
  }

  /**
   * Get logs with specific metadata field
   */
  getLogsWithMetadata(key: string, value?: any): LogEntry[] {
    return this.logs.filter(log => {
      if (!log.metadata) return false;
      if (value === undefined) return key in log.metadata;
      return log.metadata[key] === value;
    });
  }
}

/**
 * Create a mock logger instance
 */
export function createMockLogger(): MockLogger {
  return new MockLogger();
}

/**
 * Setup logger mock for a test
 * Returns the mock logger and a cleanup function
 */
export function setupLoggerMock(): { mockLogger: MockLogger; cleanup: () => void } {
  const mockLogger = createMockLogger();
  
  // Mock the logger module
  vi.mock('../../utils/logger', () => ({
    logger: mockLogger,
  }));

  const cleanup = () => {
    mockLogger.clear();
    vi.unmock('../../utils/logger');
  };

  return { mockLogger, cleanup };
}

/**
 * Fake timer utilities for time-based testing
 */
export class FakeTimers {
  private currentTime: number;
  private timers: Map<number, { callback: () => void; time: number }>;
  private nextTimerId: number;

  constructor(initialTime: number = Date.now()) {
    this.currentTime = initialTime;
    this.timers = new Map();
    this.nextTimerId = 1;
  }

  /**
   * Get current fake time
   */
  now(): number {
    return this.currentTime;
  }

  /**
   * Advance time by specified milliseconds
   */
  advance(ms: number): void {
    this.currentTime += ms;
    
    // Execute any timers that should fire
    const timersToFire = Array.from(this.timers.entries())
      .filter(([_, timer]) => timer.time <= this.currentTime)
      .sort((a, b) => a[1].time - b[1].time);
    
    for (const [id, timer] of timersToFire) {
      this.timers.delete(id);
      timer.callback();
    }
  }

  /**
   * Set a timeout (returns timer ID)
   */
  setTimeout(callback: () => void, ms: number): number {
    const id = this.nextTimerId++;
    this.timers.set(id, {
      callback,
      time: this.currentTime + ms,
    });
    return id;
  }

  /**
   * Clear a timeout
   */
  clearTimeout(id: number): void {
    this.timers.delete(id);
  }

  /**
   * Clear all timers
   */
  clearAll(): void {
    this.timers.clear();
  }

  /**
   * Get number of pending timers
   */
  getPendingTimerCount(): number {
    return this.timers.size;
  }
}

/**
 * Setup fake timers for a test using Vitest's built-in fake timers
 */
export function setupFakeTimers(): { advance: (ms: number) => void; cleanup: () => void } {
  vi.useFakeTimers();

  const advance = (ms: number) => {
    vi.advanceTimersByTime(ms);
  };

  const cleanup = () => {
    vi.useRealTimers();
  };

  return { advance, cleanup };
}

/**
 * Helper to create a mock fetch response
 */
export function createMockFetchResponse(
  status: number,
  data?: any,
  statusText: string = 'OK'
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers(),
  } as Response;
}

/**
 * Helper to create a mock attestation response
 */
export function createMockAttestationResponse(attestation: string | null) {
  return {
    attestation,
    status: attestation ? 'complete' : 'pending',
  };
}

/**
 * Helper to create a mock Stacks API response
 */
export function createMockStacksResponse(
  txStatus: 'success' | 'pending' | 'failed',
  attestation: string | null = null
) {
  return {
    tx_status: txStatus,
    tx_result: attestation ? { hex: attestation } : undefined,
    burn_block_time: txStatus === 'success' ? Date.now() : undefined,
  };
}

/**
 * Wait for all pending promises to resolve
 * Useful for testing async operations
 */
export async function flushPromises(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

/**
 * Helper to verify log message format
 */
export function verifyAttemptLogFormat(
  log: LogEntry,
  expectedAttempt: number,
  expectedMaxAttempts: number
): boolean {
  if (!log.metadata) return false;
  
  // Check for "Attempt X/Y" format in message or metadata
  const attemptPattern = new RegExp(`Attempt ${expectedAttempt}/${expectedMaxAttempts}`);
  if (attemptPattern.test(log.message)) return true;
  
  // Check metadata fields
  return (
    log.metadata.attempt === expectedAttempt &&
    log.metadata.maxAttempts === expectedMaxAttempts
  );
}

/**
 * Helper to verify "will retry" log accuracy
 */
export function verifyWillRetryLog(
  logs: LogEntry[],
  attemptNumber: number,
  maxAttempts: number
): boolean {
  const willRetryLogs = logs.filter(log => 
    log.message.includes('will retry')
  );
  
  // "will retry" should only appear when there are more attempts remaining
  const hasMoreAttempts = attemptNumber < maxAttempts;
  const hasWillRetryLog = willRetryLogs.length > 0;
  
  return hasWillRetryLog === hasMoreAttempts;
}

/**
 * Test data generators for property-based testing
 */

/**
 * Generate a valid message hash (0x + 64 hex chars)
 */
export function generateMessageHash(seed: number = Math.random()): string {
  const hex = Math.floor(seed * Number.MAX_SAFE_INTEGER).toString(16).padStart(64, '0');
  return `0x${hex.slice(0, 64)}`;
}

/**
 * Generate a valid transaction hash
 */
export function generateTxHash(seed: number = Math.random()): string {
  return generateMessageHash(seed);
}

/**
 * Generate random attestation data
 */
export function generateAttestationData(seed: number = Math.random()): string {
  const hex = Math.floor(seed * Number.MAX_SAFE_INTEGER).toString(16);
  return `0x${hex}`;
}
