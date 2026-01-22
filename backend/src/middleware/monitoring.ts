/**
 * Monitoring middleware for Express
 * Integrates monitoring service with HTTP requests
 * 
 * Validates: Requirements 9.5, 10.4
 */

import { Request, Response, NextFunction } from 'express';
import { monitoringService, MetricType } from '../services/MonitoringService';
import { logger } from '../utils/logger';

/**
 * Request monitoring middleware
 * Tracks request metrics and performance
 */
export function requestMonitoring(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Track request start
  monitoringService.incrementCounter('http.requests.total', {
    method: req.method,
    path: req.path,
  });

  // Monitor response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const success = res.statusCode < 400;

    // Record request metrics
    monitoringService.recordRequest(success, duration);

    // Record status code metrics
    monitoringService.incrementCounter(`http.status.${res.statusCode}`, {
      method: req.method,
      path: req.path,
    });

    // Record route-specific metrics
    monitoringService.recordMetric(
      `http.route.${req.method}.${req.path}.duration`,
      duration,
      MetricType.GAUGE
    );

    // Log slow requests
    if (duration > 5000) {
      logger.warn('Slow request detected', {
        method: req.method,
        path: req.path,
        duration,
        statusCode: res.statusCode,
      });
    }
  });

  next();
}

/**
 * Error monitoring middleware
 * Tracks errors and creates alerts
 */
export function errorMonitoring(err: Error, req: Request, res: Response, next: NextFunction): void {
  // Record error
  monitoringService.recordError(err, 'http_request', {
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
  });

  // Pass to next error handler
  next(err);
}

/**
 * Health check endpoint handler
 */
export function healthCheckHandler(req: Request, res: Response): void {
  const health = monitoringService.getHealthStatus();
  const performance = monitoringService.getPerformanceSnapshot();

  const statusCode = health.overall === 'healthy' ? 200 : health.overall === 'degraded' ? 200 : 503;

  res.status(statusCode).json({
    status: health.overall,
    timestamp: Date.now(),
    uptime: health.uptime,
    components: health.components,
    performance: {
      cpu: performance.cpu,
      memory: performance.memory,
      requests: performance.requests,
      errors: performance.errors,
    },
  });
}

/**
 * Metrics endpoint handler
 */
export function metricsHandler(req: Request, res: Response): void {
  const since = req.query.since ? parseInt(req.query.since as string) : undefined;
  const metricName = req.query.name as string | undefined;

  let metrics;
  if (metricName) {
    metrics = { [metricName]: monitoringService.getMetrics(metricName, since) };
  } else {
    const allMetrics = monitoringService.getAllMetrics();
    metrics = Object.fromEntries(allMetrics);
  }

  res.json({
    success: true,
    timestamp: Date.now(),
    metrics,
  });
}

/**
 * Alerts endpoint handler
 */
export function alertsHandler(req: Request, res: Response): void {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
  const alerts = monitoringService.getAlerts(limit);

  res.json({
    success: true,
    timestamp: Date.now(),
    count: alerts.length,
    alerts,
  });
}
