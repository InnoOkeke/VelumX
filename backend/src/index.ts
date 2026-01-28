/**
 * Backend API Server
 * Main entry point for the USDC Bridge Platform backend
 */

import express, { Request, Response } from 'express';
import { getConfig } from './config';
import { logger } from './utils/logger';
import {
  configureCors,
  securityHeaders,
  sanitizeInput,
  requestLogger,
  errorHandler,
  notFoundHandler,
} from './middleware/security';
import { createRateLimiter } from './middleware/rate-limit';
import { requestMonitoring, errorMonitoring, healthCheckHandler, metricsHandler, alertsHandler } from './middleware/monitoring';
import { transactionMonitorService } from './services/TransactionMonitorService';
import { monitoringService } from './services/MonitoringService';

// Load and validate configuration
let config;
try {
  config = getConfig();
  logger.info('Configuration loaded successfully', {
    port: config.port,
    environment: process.env.NODE_ENV || 'development',
  });
} catch (error) {
  logger.error('Failed to load configuration', { error });
  process.exit(1);
}

import { paymasterService } from './services/PaymasterService';

// Initialize services
async function initializeServices() {
  try {
    // Initialize monitoring service
    monitoringService.initialize();
    logger.info('Monitoring service initialized');

    // Warm up paymaster caches
    await paymasterService.warmup();

    // Initialize transaction monitor
    await transactionMonitorService.initialize();
    await transactionMonitorService.startMonitoring();
    logger.info('Transaction monitor service initialized');

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services', { error });
    throw error;
  }
}

// Create Express app
const app = express();

// Trust the first proxy (Render load balancer)
app.set('trust proxy', 1);

// Apply middleware
app.use(configureCors());
app.use(securityHeaders);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeInput);
app.use(requestLogger);
app.use(requestMonitoring); // Add monitoring middleware
app.use(createRateLimiter()); // Rate limiting

// Health check and monitoring endpoints
app.get('/api/health', healthCheckHandler);
app.get('/api/metrics', metricsHandler);
app.get('/api/alerts', alertsHandler);

// Legacy health check endpoint (for backward compatibility)
app.get('/api/health/legacy', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: Date.now(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
  });
});

// API routes
import transactionRoutes from './routes/transactions';
import attestationRoutes from './routes/attestations';
import paymasterRoutes from './routes/paymaster';
import swapRoutes from './routes/swap';
import liquidityRoutes from './routes/liquidity';

app.use('/api/transactions', transactionRoutes);
app.use('/api/attestations', attestationRoutes);
app.use('/api/paymaster', paymasterRoutes);
app.use('/api/swap', swapRoutes);
app.use('/api/liquidity', liquidityRoutes);

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Error monitoring middleware (before error handler)
app.use(errorMonitoring);

// Error handler (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(config.port, async () => {
  logger.info(`Server started successfully`, {
    port: config.port,
    environment: process.env.NODE_ENV || 'development',
  });

  // Initialize services after server starts
  try {
    await initializeServices();
  } catch (error) {
    logger.error('Failed to initialize services, shutting down', { error });
    process.exit(1);
  }
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutdown signal received, closing server gracefully...');

  // Stop monitoring service
  monitoringService.shutdown();

  // Stop transaction monitor service
  await transactionMonitorService.stopMonitoring();

  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  monitoringService.recordError(error, 'uncaught_exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled rejection', { reason });
  monitoringService.recordError(
    reason instanceof Error ? reason : new Error(String(reason)),
    'unhandled_rejection'
  );
  process.exit(1);
});

export default app;
