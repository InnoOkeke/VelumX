/**
 * Logging infrastructure using Winston
 * Provides structured logging with different levels
 */

import winston from 'winston';

/**
 * Custom log format
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    // Add metadata if present
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    
    return msg;
  })
);

/**
 * Create logger instance
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      ),
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
 * Create a child logger with additional context
 */
export function createChildLogger(context: string): winston.Logger {
  return logger.child({ context });
}
