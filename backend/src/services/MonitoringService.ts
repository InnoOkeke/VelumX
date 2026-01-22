/**
 * Monitoring Service
 * Provides comprehensive system monitoring, metrics collection, and alerting
 * 
 * Features:
 * - Performance metrics collection (response times, throughput, error rates)
 * - Health checks for all system components
 * - Error rate monitoring and alerting
 * - Resource utilization tracking
 * - Custom metric tracking for business logic
 * 
 * Validates: Requirements 9.5, 10.4
 */

import { logger } from '../utils/logger';
import EventEmitter from 'events';
import os from 'os';

/**
 * Metric types
 */
export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  TIMER = 'timer',
}

/**
 * Health status
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
}

/**
 * Alert severity levels
 */
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * Metric data structure
 */
interface Metric {
  name: string;
  type: MetricType;
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

/**
 * Health check result
 */
interface HealthCheckResult {
  component: string;
  status: HealthStatus;
  message?: string;
  timestamp: number;
  details?: Record<string, any>;
}

/**
 * Alert data structure
 */
interface Alert {
  id: string;
  severity: AlertSeverity;
  message: string;
  timestamp: number;
  component: string;
  metadata?: Record<string, any>;
}

/**
 * Performance metrics snapshot
 */
interface PerformanceSnapshot {
  timestamp: number;
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  requests: {
    total: number;
    successful: number;
    failed: number;
    averageResponseTime: number;
  };
  errors: {
    total: number;
    rate: number;
  };
}

/**
 * Monitoring configuration
 */
interface MonitoringConfig {
  errorRateThreshold: number; // Percentage
  responseTimeThreshold: number; // Milliseconds
  memoryThreshold: number; // Percentage
  cpuThreshold: number; // Percentage
  healthCheckInterval: number; // Milliseconds
  metricsRetentionPeriod: number; // Milliseconds
}

/**
 * Default monitoring configuration
 */
const DEFAULT_CONFIG: MonitoringConfig = {
  errorRateThreshold: 5, // 5% error rate triggers alert
  responseTimeThreshold: 5000, // 5 seconds
  memoryThreshold: 85, // 85% memory usage
  cpuThreshold: 80, // 80% CPU usage
  healthCheckInterval: 30000, // 30 seconds
  metricsRetentionPeriod: 3600000, // 1 hour
};

/**
 * Monitoring Service
 * Singleton service for system monitoring and alerting
 */
class MonitoringService extends EventEmitter {
  private static instance: MonitoringService;
  private config: MonitoringConfig;
  private metrics: Map<string, Metric[]>;
  private healthChecks: Map<string, HealthCheckResult>;
  private alerts: Alert[];
  private requestStats: {
    total: number;
    successful: number;
    failed: number;
    responseTimes: number[];
  };
  private errorCount: number;
  private startTime: number;
  private healthCheckInterval?: NodeJS.Timeout;
  private metricsCleanupInterval?: NodeJS.Timeout;

  private constructor(config: Partial<MonitoringConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = new Map();
    this.healthChecks = new Map();
    this.alerts = [];
    this.requestStats = {
      total: 0,
      successful: 0,
      failed: 0,
      responseTimes: [],
    };
    this.errorCount = 0;
    this.startTime = Date.now();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<MonitoringConfig>): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService(config);
    }
    return MonitoringService.instance;
  }

  /**
   * Initialize monitoring service
   */
  public initialize(): void {
    logger.info('Initializing monitoring service', {
      config: this.config,
    });

    // Start periodic health checks
    this.startHealthChecks();

    // Start metrics cleanup
    this.startMetricsCleanup();

    // Register system health checks
    this.registerSystemHealthChecks();

    logger.info('Monitoring service initialized successfully');
  }

  /**
   * Shutdown monitoring service
   */
  public shutdown(): void {
    logger.info('Shutting down monitoring service');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    if (this.metricsCleanupInterval) {
      clearInterval(this.metricsCleanupInterval);
    }

    logger.info('Monitoring service shut down successfully');
  }

  /**
   * Record a metric
   */
  public recordMetric(
    name: string,
    value: number,
    type: MetricType = MetricType.GAUGE,
    labels?: Record<string, string>
  ): void {
    const metric: Metric = {
      name,
      type,
      value,
      timestamp: Date.now(),
      labels,
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    this.metrics.get(name)!.push(metric);

    // Emit metric event
    this.emit('metric', metric);

    // Check for threshold violations
    this.checkThresholds(metric);
  }

  /**
   * Increment a counter metric
   */
  public incrementCounter(name: string, labels?: Record<string, string>): void {
    const existing = this.getLatestMetric(name);
    const value = existing ? existing.value + 1 : 1;
    this.recordMetric(name, value, MetricType.COUNTER, labels);
  }

  /**
   * Record request metrics
   */
  public recordRequest(success: boolean, responseTime: number): void {
    this.requestStats.total++;
    if (success) {
      this.requestStats.successful++;
    } else {
      this.requestStats.failed++;
    }
    this.requestStats.responseTimes.push(responseTime);

    // Keep only last 1000 response times
    if (this.requestStats.responseTimes.length > 1000) {
      this.requestStats.responseTimes.shift();
    }

    // Record metrics
    this.recordMetric('requests.total', this.requestStats.total, MetricType.COUNTER);
    this.recordMetric('requests.successful', this.requestStats.successful, MetricType.COUNTER);
    this.recordMetric('requests.failed', this.requestStats.failed, MetricType.COUNTER);
    this.recordMetric('requests.response_time', responseTime, MetricType.HISTOGRAM);

    // Check response time threshold
    if (responseTime > this.config.responseTimeThreshold) {
      this.createAlert(
        AlertSeverity.WARNING,
        'High response time detected',
        'performance',
        { responseTime, threshold: this.config.responseTimeThreshold }
      );
    }
  }

  /**
   * Record an error
   */
  public recordError(error: Error, context?: string, metadata?: Record<string, any>): void {
    this.errorCount++;
    this.recordMetric('errors.total', this.errorCount, MetricType.COUNTER);

    // Calculate error rate
    const errorRate = (this.requestStats.failed / this.requestStats.total) * 100;
    this.recordMetric('errors.rate', errorRate, MetricType.GAUGE);

    // Log error
    logger.error('Error recorded by monitoring service', {
      error: error.message,
      stack: error.stack,
      context,
      ...metadata,
    });

    // Check error rate threshold
    if (errorRate > this.config.errorRateThreshold) {
      this.createAlert(
        AlertSeverity.ERROR,
        'High error rate detected',
        'errors',
        { errorRate, threshold: this.config.errorRateThreshold }
      );
    }
  }

  /**
   * Register a health check
   */
  public registerHealthCheck(
    component: string,
    checkFn: () => Promise<HealthCheckResult>
  ): void {
    logger.debug('Registering health check', { component });

    // Store the check function for periodic execution
    this.on(`healthcheck:${component}`, async () => {
      try {
        const result = await checkFn();
        this.healthChecks.set(component, result);

        // Create alert if unhealthy
        if (result.status === HealthStatus.UNHEALTHY) {
          this.createAlert(
            AlertSeverity.CRITICAL,
            `Component ${component} is unhealthy`,
            component,
            result.details
          );
        } else if (result.status === HealthStatus.DEGRADED) {
          this.createAlert(
            AlertSeverity.WARNING,
            `Component ${component} is degraded`,
            component,
            result.details
          );
        }
      } catch (error) {
        logger.error('Health check failed', {
          component,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        this.healthChecks.set(component, {
          component,
          status: HealthStatus.UNHEALTHY,
          message: 'Health check execution failed',
          timestamp: Date.now(),
          details: { error: error instanceof Error ? error.message : 'Unknown error' },
        });
      }
    });
  }

  /**
   * Get health status for all components
   */
  public getHealthStatus(): {
    overall: HealthStatus;
    components: HealthCheckResult[];
    uptime: number;
  } {
    const components = Array.from(this.healthChecks.values());
    
    // Determine overall status
    let overall = HealthStatus.HEALTHY;
    if (components.some(c => c.status === HealthStatus.UNHEALTHY)) {
      overall = HealthStatus.UNHEALTHY;
    } else if (components.some(c => c.status === HealthStatus.DEGRADED)) {
      overall = HealthStatus.DEGRADED;
    }

    return {
      overall,
      components,
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Get performance snapshot
   */
  public getPerformanceSnapshot(): PerformanceSnapshot {
    const cpuUsage = process.cpuUsage();
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const avgResponseTime =
      this.requestStats.responseTimes.length > 0
        ? this.requestStats.responseTimes.reduce((a, b) => a + b, 0) /
          this.requestStats.responseTimes.length
        : 0;

    const errorRate =
      this.requestStats.total > 0
        ? (this.requestStats.failed / this.requestStats.total) * 100
        : 0;

    return {
      timestamp: Date.now(),
      cpu: {
        usage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to milliseconds
        loadAverage: os.loadavg(),
      },
      memory: {
        used: usedMem,
        total: totalMem,
        percentage: (usedMem / totalMem) * 100,
      },
      requests: {
        total: this.requestStats.total,
        successful: this.requestStats.successful,
        failed: this.requestStats.failed,
        averageResponseTime: avgResponseTime,
      },
      errors: {
        total: this.errorCount,
        rate: errorRate,
      },
    };
  }

  /**
   * Get metrics for a specific name
   */
  public getMetrics(name: string, since?: number): Metric[] {
    const metrics = this.metrics.get(name) || [];
    if (since) {
      return metrics.filter(m => m.timestamp >= since);
    }
    return metrics;
  }

  /**
   * Get all metrics
   */
  public getAllMetrics(): Map<string, Metric[]> {
    return new Map(this.metrics);
  }

  /**
   * Get recent alerts
   */
  public getAlerts(limit: number = 100): Alert[] {
    return this.alerts.slice(-limit);
  }

  /**
   * Clear old alerts
   */
  public clearOldAlerts(olderThan: number): void {
    const cutoff = Date.now() - olderThan;
    this.alerts = this.alerts.filter(a => a.timestamp >= cutoff);
  }

  /**
   * Create an alert
   */
  private createAlert(
    severity: AlertSeverity,
    message: string,
    component: string,
    metadata?: Record<string, any>
  ): void {
    const alert: Alert = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      severity,
      message,
      timestamp: Date.now(),
      component,
      metadata,
    };

    this.alerts.push(alert);

    // Emit alert event
    this.emit('alert', alert);

    // Log alert
    const logLevel = severity === AlertSeverity.CRITICAL || severity === AlertSeverity.ERROR
      ? 'error'
      : severity === AlertSeverity.WARNING
      ? 'warn'
      : 'info';

    logger[logLevel]('Alert created', {
      alert,
    });

    // Keep only last 1000 alerts
    if (this.alerts.length > 1000) {
      this.alerts.shift();
    }
  }

  /**
   * Check metric thresholds
   */
  private checkThresholds(metric: Metric): void {
    // Check memory threshold
    if (metric.name === 'system.memory.percentage' && metric.value > this.config.memoryThreshold) {
      this.createAlert(
        AlertSeverity.WARNING,
        'High memory usage detected',
        'system',
        { usage: metric.value, threshold: this.config.memoryThreshold }
      );
    }

    // Check CPU threshold
    if (metric.name === 'system.cpu.percentage' && metric.value > this.config.cpuThreshold) {
      this.createAlert(
        AlertSeverity.WARNING,
        'High CPU usage detected',
        'system',
        { usage: metric.value, threshold: this.config.cpuThreshold }
      );
    }
  }

  /**
   * Get latest metric value
   */
  private getLatestMetric(name: string): Metric | undefined {
    const metrics = this.metrics.get(name);
    return metrics && metrics.length > 0 ? metrics[metrics.length - 1] : undefined;
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      // Trigger all registered health checks
      for (const component of this.healthChecks.keys()) {
        this.emit(`healthcheck:${component}`);
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Start metrics cleanup
   */
  private startMetricsCleanup(): void {
    this.metricsCleanupInterval = setInterval(() => {
      const cutoff = Date.now() - this.config.metricsRetentionPeriod;

      // Clean up old metrics
      for (const [name, metrics] of this.metrics.entries()) {
        const filtered = metrics.filter(m => m.timestamp >= cutoff);
        if (filtered.length === 0) {
          this.metrics.delete(name);
        } else {
          this.metrics.set(name, filtered);
        }
      }

      // Clean up old alerts
      this.clearOldAlerts(this.config.metricsRetentionPeriod);

      logger.debug('Metrics cleanup completed', {
        metricsCount: this.metrics.size,
        alertsCount: this.alerts.length,
      });
    }, 300000); // Run every 5 minutes
  }

  /**
   * Register system health checks
   */
  private registerSystemHealthChecks(): void {
    // Memory health check
    this.registerHealthCheck('system.memory', async () => {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const percentage = (usedMem / totalMem) * 100;

      this.recordMetric('system.memory.used', usedMem, MetricType.GAUGE);
      this.recordMetric('system.memory.total', totalMem, MetricType.GAUGE);
      this.recordMetric('system.memory.percentage', percentage, MetricType.GAUGE);

      let status = HealthStatus.HEALTHY;
      if (percentage > 90) {
        status = HealthStatus.UNHEALTHY;
      } else if (percentage > this.config.memoryThreshold) {
        status = HealthStatus.DEGRADED;
      }

      return {
        component: 'system.memory',
        status,
        message: `Memory usage: ${percentage.toFixed(2)}%`,
        timestamp: Date.now(),
        details: {
          used: usedMem,
          total: totalMem,
          percentage,
        },
      };
    });

    // CPU health check
    this.registerHealthCheck('system.cpu', async () => {
      const loadAvg = os.loadavg();
      const cpuCount = os.cpus().length;
      const loadPercentage = (loadAvg[0] / cpuCount) * 100;

      this.recordMetric('system.cpu.load_1m', loadAvg[0], MetricType.GAUGE);
      this.recordMetric('system.cpu.load_5m', loadAvg[1], MetricType.GAUGE);
      this.recordMetric('system.cpu.load_15m', loadAvg[2], MetricType.GAUGE);
      this.recordMetric('system.cpu.percentage', loadPercentage, MetricType.GAUGE);

      let status = HealthStatus.HEALTHY;
      if (loadPercentage > 95) {
        status = HealthStatus.UNHEALTHY;
      } else if (loadPercentage > this.config.cpuThreshold) {
        status = HealthStatus.DEGRADED;
      }

      return {
        component: 'system.cpu',
        status,
        message: `CPU load: ${loadPercentage.toFixed(2)}%`,
        timestamp: Date.now(),
        details: {
          loadAverage: loadAvg,
          cpuCount,
          percentage: loadPercentage,
        },
      };
    });

    // Uptime health check
    this.registerHealthCheck('system.uptime', async () => {
      const uptime = Date.now() - this.startTime;
      this.recordMetric('system.uptime', uptime, MetricType.GAUGE);

      return {
        component: 'system.uptime',
        status: HealthStatus.HEALTHY,
        message: `Uptime: ${Math.floor(uptime / 1000)}s`,
        timestamp: Date.now(),
        details: {
          uptime,
          startTime: this.startTime,
        },
      };
    });
  }
}

// Export singleton instance and class
export const monitoringService = MonitoringService.getInstance();
export { MonitoringService };