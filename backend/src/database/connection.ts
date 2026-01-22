/**
 * Database Connection Utility
 * Handles database connections and query execution for liquidity features
 * Now integrated with optimized connection pooling and query caching
 */

import { getConfig } from '../config';
import { logger } from '../utils/logger';
import { getPool, DatabasePool, QueryBuilder, QueryOptimizer } from './pool';

// Database configuration interface
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  connectionLimit?: number;
}

// Query result interface
export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  fields?: any[];
}

// Database connection class
export class DatabaseConnection {
  private config: DatabaseConfig;
  private pool: DatabasePool;

  constructor() {
    const appConfig = getConfig();
    
    // Extract database config from environment
    this.config = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      database: process.env.DB_NAME || 'velumx_liquidity',
      username: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true',
      connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10'),
    };

    // Get optimized pool instance
    this.pool = getPool();
  }

  /**
   * Initialize database connection pool
   */
  async initialize(): Promise<void> {
    try {
      await this.pool.initialize();
      logger.info('Database connection initialized with optimized pooling', {
        host: this.config.host,
        database: this.config.database,
        port: this.config.port,
        connectionLimit: this.config.connectionLimit,
      });
    } catch (error) {
      logger.error('Failed to initialize database connection', { error });
      throw error;
    }
  }

  /**
   * Execute a query with parameters and optional caching
   */
  async query<T = any>(
    sql: string,
    params: any[] = [],
    options?: {
      cache?: boolean;
      cacheTTL?: number;
    }
  ): Promise<QueryResult<T>> {
    try {
      const rows = await this.pool.query<T[]>(sql, params, options);
      
      return {
        rows: rows || [],
        rowCount: rows?.length || 0,
      };
    } catch (error) {
      logger.error('Database query failed', { sql, params, error });
      throw error;
    }
  }

  /**
   * Execute a transaction with multiple queries
   */
  async transaction<T>(callback: (query: (sql: string, params?: any[]) => Promise<QueryResult>) => Promise<T>): Promise<T> {
    try {
      logger.debug('Starting database transaction');
      
      return await this.pool.transaction(async (connection) => {
        const transactionQuery = async (sql: string, params: any[] = []) => {
          const rows = await this.pool.query(sql, params, { cache: false });
          return {
            rows: rows || [],
            rowCount: rows?.length || 0,
          };
        };
        
        return await callback(transactionQuery);
      });
    } catch (error) {
      logger.error('Database transaction failed', { error });
      throw error;
    }
  }

  /**
   * Call a stored procedure
   */
  async callProcedure<T = any>(
    procedureName: string,
    params: any[] = [],
    options?: {
      cache?: boolean;
      cacheTTL?: number;
    }
  ): Promise<QueryResult<T>> {
    try {
      const rows = await this.pool.callProcedure<T[]>(procedureName, params, options);
      
      return {
        rows: rows || [],
        rowCount: rows?.length || 0,
      };
    } catch (error) {
      logger.error('Stored procedure call failed', { procedureName, params, error });
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    try {
      await this.pool.close();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error closing database connection', { error });
    }
  }

  /**
   * Check database health
   */
  async healthCheck(): Promise<boolean> {
    try {
      return await this.pool.healthCheck();
    } catch (error) {
      logger.error('Database health check failed', { error });
      return false;
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    totalPools: number;
    totalPositions: number;
    totalUsers: number;
    lastUpdate: Date;
    poolStats: any;
  }> {
    try {
      const poolStats = this.pool.getStats();
      
      // Query actual database stats
      const poolsResult = await this.query('SELECT COUNT(*) as count FROM pools', [], { cache: true, cacheTTL: 60000 });
      const positionsResult = await this.query('SELECT COUNT(*) as count FROM user_positions WHERE lp_token_balance > 0', [], { cache: true, cacheTTL: 60000 });
      const usersResult = await this.query('SELECT COUNT(DISTINCT user_address) as count FROM user_positions', [], { cache: true, cacheTTL: 60000 });
      
      return {
        totalPools: poolsResult.rows[0]?.count || 0,
        totalPositions: positionsResult.rows[0]?.count || 0,
        totalUsers: usersResult.rows[0]?.count || 0,
        lastUpdate: new Date(),
        poolStats,
      };
    } catch (error) {
      logger.error('Failed to get database stats', { error });
      return {
        totalPools: 0,
        totalPositions: 0,
        totalUsers: 0,
        lastUpdate: new Date(),
        poolStats: this.pool.getStats(),
      };
    }
  }

  /**
   * Clear query cache
   */
  clearQueryCache(): void {
    this.pool.clearQueryCache();
    logger.info('Query cache cleared');
  }

  /**
   * Analyze query performance
   */
  async analyzeQuery(sql: string, params?: any[]): Promise<{
    estimatedRows: number;
    usesIndex: boolean;
    suggestions: string[];
  }> {
    return QueryOptimizer.analyzeQuery(sql, params);
  }

  /**
   * Get query builder helper
   */
  getQueryBuilder(): typeof QueryBuilder {
    return QueryBuilder;
  }
}

// Singleton database instance
let dbInstance: DatabaseConnection | null = null;

/**
 * Get database connection instance
 */
export function getDatabase(): DatabaseConnection {
  if (!dbInstance) {
    dbInstance = new DatabaseConnection();
  }
  return dbInstance;
}

/**
 * Initialize database connection
 */
export async function initializeDatabase(): Promise<void> {
  const db = getDatabase();
  await db.initialize();
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}

// Database utility functions

/**
 * Escape SQL identifiers
 */
export function escapeIdentifier(identifier: string): string {
  return `\`${identifier.replace(/`/g, '``')}\``;
}

/**
 * Build WHERE clause from conditions
 */
export function buildWhereClause(conditions: Record<string, any>): { sql: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];
  
  for (const [key, value] of Object.entries(conditions)) {
    if (value !== undefined && value !== null) {
      clauses.push(`${escapeIdentifier(key)} = ?`);
      params.push(value);
    }
  }
  
  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

/**
 * Build pagination clause
 */
export function buildPaginationClause(page: number = 1, limit: number = 50): { sql: string; params: any[] } {
  const offset = (page - 1) * limit;
  return {
    sql: 'LIMIT ? OFFSET ?',
    params: [limit, offset],
  };
}

/**
 * Build ORDER BY clause
 */
export function buildOrderClause(orderBy: string = 'created_at', direction: 'ASC' | 'DESC' = 'DESC'): string {
  return `ORDER BY ${escapeIdentifier(orderBy)} ${direction}`;
}