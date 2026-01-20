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
import { transactionMonitorService } from './services/TransactionMonitorService';

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

// Initialize services
async function initializeServices() {
  try {
    await transactionMonitorService.initialize();
    await transactionMonitorService.startMonitoring();
    logger.info('Services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services', { error });
    throw error;
  }
}

// Create Express app
const app = express();

// Apply middleware
app.use(configureCors());
app.use(securityHeaders);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeInput);
app.use(requestLogger);
app.use(createRateLimiter()); // Rate limiting

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
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

app.use('/api/transactions', transactionRoutes);
app.use('/api/attestations', attestationRoutes);
app.use('/api/paymaster', paymasterRoutes);
app.use('/api/swap', swapRoutes);

// 404 handler (must be after all routes)
app.use(notFoundHandler);

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
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled rejection', { reason });
  process.exit(1);
});

export default app;
