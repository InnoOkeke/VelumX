/**
 * Logging infrastructure using Winston
 * Provides structured logging with different levels, transaction tracing, and audit logs
 * 
 * Features:
 * - Structured logging with JSON format
 * - Transaction tracing with correlation IDs
 * - Audit logs for user operations
 * - Performance logging
 * - Multiple log levels and transports
 * 
 * Validates: Requirements 10.1, 10.4
 */

import winston from 'winston';
import { randomUUID } from 'crypto';

/**
 * Log context for correlation
 */
interface LogContext {
  correlationId?: string;
  userId?: string;
  transactionId?: string;
  operation?: string;
  component?: string;
}

/**
 * Custom log format with structured data
 */
const structuredFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

/**
 * Console format with colors
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    
    // Add important metadata inline
    if (metadata.correlationId) {
      msg += ` [CID: ${metadata.correlationId}]`;
    }
    if (metadata.transactionId) {
      msg += ` [TxID: ${metadata.transactionId}]`;
    }
    if (metadata.userId) {
      msg += ` [User: ${metadata.userId}]`;
    }
    
    // Add remaining metadata as JSON
    const { correlationId, transactionId, userId, timestamp: _, level: __, message: ___, ...rest } = metadata;
    if (Object.keys(rest).length > 0) {
      msg += ` ${JSON.stringify(rest)}`;
    }
    
    return msg;
  })
);

/**
 * Create logger instance
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: structuredFormat,
  defaultMeta: {
    service: 'velumx-backend',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Audit log for user operations
    new winston.transports.File({
      filename: 'logs/audit.log',
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),
    // Performance log
    new winston.transports.File({
      filename: 'logs/performance.log',
      level: 'debug',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' }),
  ],
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' }),
  ],
});

/**
 * Log levels:
 * - error: Error messages
 * - warn: Warning messages
 * - info: Informational messages
 * - http: HTTP request logs
 * - debug: Debug messages
 */

/**
 * Transaction tracing utilities
 */
export class TransactionTracer {
  private correlationId: string;
  private context: LogContext;

  constructor(context: Partial<LogContext> = {}) {
    this.correlationId = context.correlationId || randomUUID();
    this.context = {
      correlationId: this.correlationId,
      ...context,
    };
  }

  /**
   * Get correlation ID
   */
  getCorrelationId(): string {
    return this.correlationId;
  }

  /**
   * Log with trace context
   */
  log(level: string, message: string, metadata?: object): void {
    logger.log(level, message, {
      ...this.context,
      ...metadata,
    });
  }

  /**
   * Log info with trace
   */
  info(message: string, metadata?: object): void {
    this.log('info', message, metadata);
  }

  /**
   * Log error with trace
   */
  error(message: string, error?: Error, metadata?: object): void {
    this.log('error', message, {
      error: error?.message,
      stack: error?.stack,
      ...metadata,
    });
  }

  /**
   * Log warning with trace
   */
  warn(message: string, metadata?: object): void {
    this.log('warn', message, metadata);
  }

  /**
   * Log debug with trace
   */
  debug(message: string, metadata?: object): void {
    this.log('debug', message, metadata);
  }

  /**
   * Create child tracer with additional context
   */
  child(context: Partial<LogContext>): TransactionTracer {
    return new TransactionTracer({
      ...this.context,
      ...context,
    });
  }
}

/**
 * Performance logger
 */
export class PerformanceLogger {
  private startTime: number;
  private operation: string;
  private context: LogContext;

  constructor(operation: string, context: Partial<LogContext> = {}) {
    this.startTime = Date.now();
    this.operation = operation;
    this.context = {
      operation,
      ...context,
    };

    logger.debug('Operation started', {
      ...this.context,
      timestamp: this.startTime,
    });
  }

  /**
   * Mark a checkpoint
   */
  checkpoint(name: string, metadata?: object): void {
    const duration = Date.now() - this.startTime;
    logger.debug('Operation checkpoint', {
      ...this.context,
      checkpoint: name,
      duration,
      ...metadata,
    });
  }

  /**
   * Complete operation
   */
  complete(success: boolean = true, metadata?: object): void {
    const duration = Date.now() - this.startTime;
    const level = success ? 'info' : 'warn';

    logger.log(level, 'Operation completed', {
      ...this.context,
      success,
      duration,
      ...metadata,
    });
  }

  /**
   * Fail operation
   */
  fail(error: Error, metadata?: object): void {
    const duration = Date.now() - this.startTime;

    logger.error('Operation failed', {
      ...this.context,
      error: error.message,
      stack: error.stack,
      duration,
      ...metadata,
    });
  }
}

/**
 * Audit logger for user operations
 */
export class AuditLogger {
  /**
   * Log user action
   */
  static logUserAction(
    userId: string,
    action: string,
    resource: string,
    metadata?: object
  ): void {
    logger.info('User action', {
      audit: true,
      userId,
      action,
      resource,
      timestamp: Date.now(),
      ...metadata,
    });
  }

  /**
   * Log liquidity operation
   */
  static logLiquidityOperation(
    userId: string,
    operation: 'add' | 'remove',
    poolId: string,
    amounts: { tokenA: string; tokenB: string },
    metadata?: object
  ): void {
    this.logUserAction(userId, `liquidity.${operation}`, poolId, {
      amounts,
      ...metadata,
    });
  }

  /**
   * Log swap operation
   */
  static logSwapOperation(
    userId: string,
    fromToken: string,
    toToken: string,
    amount: string,
    metadata?: object
  ): void {
    this.logUserAction(userId, 'swap', `${fromToken}-${toToken}`, {
      fromToken,
      toToken,
      amount,
      ...metadata,
    });
  }

  /**
   * Log authentication event
   */
  static logAuthEvent(
    userId: string,
    event: 'login' | 'logout' | 'failed_login',
    metadata?: object
  ): void {
    this.logUserAction(userId, `auth.${event}`, 'authentication', metadata);
  }

  /**
   * Log security event
   */
  static logSecurityEvent(
    userId: string,
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    metadata?: object
  ): void {
    logger.warn('Security event', {
      audit: true,
      security: true,
      userId,
      event,
      severity,
      timestamp: Date.now(),
      ...metadata,
    });
  }
}

/**
 * Helper functions for common logging patterns
 */

export function logTransactionSubmission(txHash: string, type: string, metadata?: object): void {
  logger.info('Transaction submitted', {
    txHash,
    type,
    ...metadata,
  });
}

export function logAttestationFetch(messageHash: string, success: boolean, metadata?: object): void {
  logger.info('Attestation fetch', {
    messageHash,
    success,
    ...metadata,
  });
}

export function logError(error: Error, context?: string, metadata?: object): void {
  logger.error('Error occurred', {
    error: error.message,
    stack: error.stack,
    context,
    ...metadata,
  });
}

export function logApiRequest(method: string, path: string, statusCode: number, duration: number): void {
  logger.http('API request', {
    method,
    path,
    statusCode,
    duration,
  });
}

export function logPaymasterOperation(operation: string, userAddress: string, metadata?: object): void {
  logger.info('Paymaster operation', {
    operation,
    userAddress,
    ...metadata,
  });
}

export function logRelayerBalance(balance: bigint, threshold: bigint): void {
  logger.info('Relayer balance check', {
    balance: balance.toString(),
    threshold: threshold.toString(),
    belowThreshold: balance < threshold,
  });
}

/**
 * Log liquidity service operations
 */
export function logLiquidityOperation(
  operation: string,
  poolId: string,
  userAddress: string,
  metadata?: object
): void {
  logger.info('Liquidity operation', {
    operation,
    poolId,
    userAddress,
    ...metadata,
  });
}

/**
 * Log pool analytics calculation
 */
export function logPoolAnalytics(
  poolId: string,
  metrics: object,
  metadata?: object
): void {
  logger.debug('Pool analytics calculated', {
    poolId,
    metrics,
    ...metadata,
  });
}

/**
 * Log cache operations
 */
export function logCacheOperation(
  operation: 'hit' | 'miss' | 'set' | 'delete',
  key: string,
  metadata?: object
): void {
  logger.debug('Cache operation', {
    operation,
    key,
    ...metadata,
  });
}

/**
 * Log WebSocket events
 */
export function logWebSocketEvent(
  event: string,
  clientId: string,
  metadata?: object
): void {
  logger.debug('WebSocket event', {
    event,
    clientId,
    ...metadata,
  });
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(context: string): winston.Logger {
  return logger.child({ context });
}

/**
 * Create a transaction tracer
 */
export function createTransactionTracer(context?: Partial<LogContext>): TransactionTracer {
  return new TransactionTracer(context);
}

/**
 * Create a performance logger
 */
export function createPerformanceLogger(operation: string, context?: Partial<LogContext>): PerformanceLogger {
  return new PerformanceLogger(operation, context);
}
