-- Database Query Optimizations and Additional Indexes
-- This file contains performance optimizations for the liquidity swap integration

-- ============================================================================
-- COMPOSITE INDEXES FOR COMMON QUERY PATTERNS
-- ============================================================================

-- Optimize pool queries by token pair and status
CREATE INDEX IF NOT EXISTS idx_pools_tokens_verified 
  ON pools(token_a_address, token_b_address, verified);

CREATE INDEX IF NOT EXISTS idx_pools_featured_risk 
  ON pools(featured, risk_level, verified);

-- Optimize pool snapshots for time-series analytics
CREATE INDEX IF NOT EXISTS idx_pool_snapshots_pool_timestamp_desc 
  ON pool_snapshots(pool_id, timestamp DESC);

-- Covering index for common snapshot queries
CREATE INDEX IF NOT EXISTS idx_pool_snapshots_analytics 
  ON pool_snapshots(pool_id, timestamp, tvl_usd, volume_24h);

-- Optimize user position queries
CREATE INDEX IF NOT EXISTS idx_user_positions_user_updated 
  ON user_positions(user_address, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_positions_pool_balance 
  ON user_positions(pool_id, lp_token_balance DESC);

-- Optimize position history queries
CREATE INDEX IF NOT EXISTS idx_position_history_user_timestamp 
  ON position_history(user_address, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_position_history_pool_timestamp 
  ON position_history(pool_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_position_history_action_timestamp 
  ON position_history(action, timestamp DESC);

-- Optimize fee earnings queries
CREATE INDEX IF NOT EXISTS idx_fee_earnings_user_timestamp 
  ON fee_earnings(user_address, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_fee_earnings_pool_timestamp 
  ON fee_earnings(pool_id, timestamp DESC);

-- Covering index for fee aggregation queries
CREATE INDEX IF NOT EXISTS idx_fee_earnings_aggregation 
  ON fee_earnings(user_address, pool_id, timestamp, amount_usd);

-- ============================================================================
-- PARTIAL INDEXES FOR FILTERED QUERIES
-- ============================================================================

-- Index only active positions (non-zero balance)
CREATE INDEX IF NOT EXISTS idx_user_positions_active 
  ON user_positions(user_address, pool_id) 
  WHERE lp_token_balance > 0;

-- Index only featured and verified pools
CREATE INDEX IF NOT EXISTS idx_pools_featured_verified 
  ON pools(id, token_a_address, token_b_address) 
  WHERE featured = TRUE AND verified = TRUE;

-- Index recent snapshots (last 90 days)
CREATE INDEX IF NOT EXISTS idx_pool_snapshots_recent 
  ON pool_snapshots(pool_id, timestamp DESC, tvl_usd, volume_24h) 
  WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 90 DAY);

-- ============================================================================
-- MATERIALIZED VIEWS FOR COMPLEX AGGREGATIONS
-- ============================================================================

-- Materialized view for pool statistics (refresh periodically)
CREATE TABLE IF NOT EXISTS pool_stats_materialized (
  pool_id VARCHAR(255) PRIMARY KEY,
  total_liquidity_providers INT DEFAULT 0,
  total_transactions INT DEFAULT 0,
  total_volume_all_time DECIMAL(20, 2) DEFAULT 0,
  avg_transaction_size DECIMAL(20, 2) DEFAULT 0,
  last_transaction_timestamp TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pool_stats_volume 
  ON pool_stats_materialized(total_volume_all_time DESC);

CREATE INDEX IF NOT EXISTS idx_pool_stats_providers 
  ON pool_stats_materialized(total_liquidity_providers DESC);

-- Materialized view for user statistics
CREATE TABLE IF NOT EXISTS user_stats_materialized (
  user_address VARCHAR(255) PRIMARY KEY,
  total_positions INT DEFAULT 0,
  active_positions INT DEFAULT 0,
  total_value_usd DECIMAL(20, 2) DEFAULT 0,
  total_fees_earned DECIMAL(20, 8) DEFAULT 0,
  total_transactions INT DEFAULT 0,
  first_position_timestamp TIMESTAMP,
  last_activity_timestamp TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_stats_value 
  ON user_stats_materialized(total_value_usd DESC);

CREATE INDEX IF NOT EXISTS idx_user_stats_fees 
  ON user_stats_materialized(total_fees_earned DESC);

CREATE INDEX IF NOT EXISTS idx_user_stats_activity 
  ON user_stats_materialized(last_activity_timestamp DESC);

-- ============================================================================
-- STORED PROCEDURES FOR COMMON OPERATIONS
-- ============================================================================

DELIMITER //

-- Procedure to update pool statistics
CREATE PROCEDURE IF NOT EXISTS update_pool_stats(IN p_pool_id VARCHAR(255))
BEGIN
  INSERT INTO pool_stats_materialized (
    pool_id,
    total_liquidity_providers,
    total_transactions,
    total_volume_all_time,
    avg_transaction_size,
    last_transaction_timestamp,
    updated_at
  )
  SELECT 
    p_pool_id,
    COUNT(DISTINCT user_address) as total_liquidity_providers,
    COUNT(*) as total_transactions,
    SUM(value_usd) as total_volume_all_time,
    AVG(value_usd) as avg_transaction_size,
    MAX(timestamp) as last_transaction_timestamp,
    NOW() as updated_at
  FROM position_history
  WHERE pool_id = p_pool_id
  ON DUPLICATE KEY UPDATE
    total_liquidity_providers = VALUES(total_liquidity_providers),
    total_transactions = VALUES(total_transactions),
    total_volume_all_time = VALUES(total_volume_all_time),
    avg_transaction_size = VALUES(avg_transaction_size),
    last_transaction_timestamp = VALUES(last_transaction_timestamp),
    updated_at = NOW();
END//

-- Procedure to update user statistics
CREATE PROCEDURE IF NOT EXISTS update_user_stats(IN p_user_address VARCHAR(255))
BEGIN
  INSERT INTO user_stats_materialized (
    user_address,
    total_positions,
    active_positions,
    total_value_usd,
    total_fees_earned,
    total_transactions,
    first_position_timestamp,
    last_activity_timestamp,
    updated_at
  )
  SELECT 
    p_user_address,
    COUNT(*) as total_positions,
    SUM(CASE WHEN lp_token_balance > 0 THEN 1 ELSE 0 END) as active_positions,
    SUM(initial_value_usd) as total_value_usd,
    COALESCE((SELECT SUM(amount_usd) FROM fee_earnings WHERE user_address = p_user_address), 0) as total_fees_earned,
    COALESCE((SELECT COUNT(*) FROM position_history WHERE user_address = p_user_address), 0) as total_transactions,
    MIN(created_at) as first_position_timestamp,
    MAX(updated_at) as last_activity_timestamp,
    NOW() as updated_at
  FROM user_positions
  WHERE user_address = p_user_address
  ON DUPLICATE KEY UPDATE
    total_positions = VALUES(total_positions),
    active_positions = VALUES(active_positions),
    total_value_usd = VALUES(total_value_usd),
    total_fees_earned = VALUES(total_fees_earned),
    total_transactions = VALUES(total_transactions),
    first_position_timestamp = VALUES(first_position_timestamp),
    last_activity_timestamp = VALUES(last_activity_timestamp),
    updated_at = NOW();
END//

-- Procedure to get pool analytics efficiently
CREATE PROCEDURE IF NOT EXISTS get_pool_analytics(
  IN p_pool_id VARCHAR(255),
  IN p_timeframe_days INT
)
BEGIN
  SELECT 
    ps.pool_id,
    ps.timestamp,
    ps.reserve_a,
    ps.reserve_b,
    ps.total_supply,
    ps.tvl_usd,
    ps.volume_24h,
    ps.price_a,
    ps.price_b,
    p.token_a_address,
    p.token_b_address,
    ta.symbol as token_a_symbol,
    tb.symbol as token_b_symbol
  FROM pool_snapshots ps
  JOIN pools p ON ps.pool_id = p.id
  LEFT JOIN tokens ta ON p.token_a_address = ta.address
  LEFT JOIN tokens tb ON p.token_b_address = tb.address
  WHERE ps.pool_id = p_pool_id
    AND ps.timestamp >= DATE_SUB(NOW(), INTERVAL p_timeframe_days DAY)
  ORDER BY ps.timestamp ASC;
END//

-- Procedure to get user portfolio efficiently
CREATE PROCEDURE IF NOT EXISTS get_user_portfolio(IN p_user_address VARCHAR(255))
BEGIN
  SELECT 
    up.user_address,
    up.pool_id,
    up.lp_token_balance,
    up.initial_value_usd,
    up.initial_token_a_amount,
    up.initial_token_b_amount,
    up.created_at,
    up.updated_at,
    p.token_a_address,
    p.token_b_address,
    p.reserve_a,
    p.reserve_b,
    p.total_supply,
    ta.symbol as token_a_symbol,
    ta.name as token_a_name,
    ta.price_usd as token_a_price,
    tb.symbol as token_b_symbol,
    tb.name as token_b_name,
    tb.price_usd as token_b_price,
    pac.tvl,
    pac.apr,
    pac.volume_24h,
    COALESCE(fe.total_fees, 0) as total_fees_earned
  FROM user_positions up
  JOIN pools p ON up.pool_id = p.id
  LEFT JOIN tokens ta ON p.token_a_address = ta.address
  LEFT JOIN tokens tb ON p.token_b_address = tb.address
  LEFT JOIN pool_analytics_cache pac ON p.id = pac.pool_id
  LEFT JOIN (
    SELECT user_address, pool_id, SUM(amount_usd) as total_fees
    FROM fee_earnings
    WHERE user_address = p_user_address
    GROUP BY user_address, pool_id
  ) fe ON up.user_address = fe.user_address AND up.pool_id = fe.pool_id
  WHERE up.user_address = p_user_address
    AND up.lp_token_balance > 0
  ORDER BY up.updated_at DESC;
END//

-- Procedure to get top pools by metric
CREATE PROCEDURE IF NOT EXISTS get_top_pools(
  IN p_metric VARCHAR(20),
  IN p_limit INT
)
BEGIN
  IF p_metric = 'tvl' THEN
    SELECT 
      p.id,
      p.token_a_address,
      p.token_b_address,
      ta.symbol as token_a_symbol,
      tb.symbol as token_b_symbol,
      pac.tvl,
      pac.volume_24h,
      pac.apr,
      p.verified,
      p.featured
    FROM pools p
    LEFT JOIN tokens ta ON p.token_a_address = ta.address
    LEFT JOIN tokens tb ON p.token_b_address = tb.address
    LEFT JOIN pool_analytics_cache pac ON p.id = pac.pool_id
    ORDER BY pac.tvl DESC
    LIMIT p_limit;
  ELSEIF p_metric = 'volume' THEN
    SELECT 
      p.id,
      p.token_a_address,
      p.token_b_address,
      ta.symbol as token_a_symbol,
      tb.symbol as token_b_symbol,
      pac.tvl,
      pac.volume_24h,
      pac.apr,
      p.verified,
      p.featured
    FROM pools p
    LEFT JOIN tokens ta ON p.token_a_address = ta.address
    LEFT JOIN tokens tb ON p.token_b_address = tb.address
    LEFT JOIN pool_analytics_cache pac ON p.id = pac.pool_id
    ORDER BY pac.volume_24h DESC
    LIMIT p_limit;
  ELSEIF p_metric = 'apr' THEN
    SELECT 
      p.id,
      p.token_a_address,
      p.token_b_address,
      ta.symbol as token_a_symbol,
      tb.symbol as token_b_symbol,
      pac.tvl,
      pac.volume_24h,
      pac.apr,
      p.verified,
      p.featured
    FROM pools p
    LEFT JOIN tokens ta ON p.token_a_address = ta.address
    LEFT JOIN tokens tb ON p.token_b_address = tb.address
    LEFT JOIN pool_analytics_cache pac ON p.id = pac.pool_id
    ORDER BY pac.apr DESC
    LIMIT p_limit;
  END IF;
END//

DELIMITER ;

-- ============================================================================
-- QUERY OPTIMIZATION HINTS AND BEST PRACTICES
-- ============================================================================

-- For time-series queries, always use indexed timestamp columns
-- Example: WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)

-- For aggregation queries, use materialized views when possible
-- Example: SELECT * FROM pool_stats_materialized WHERE pool_id = ?

-- For user portfolio queries, use the stored procedure
-- Example: CALL get_user_portfolio('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM')

-- For pool analytics, use the stored procedure with appropriate timeframe
-- Example: CALL get_pool_analytics('USDCx-STX', 30)

-- ============================================================================
-- MAINTENANCE TASKS
-- ============================================================================

-- Schedule these tasks to run periodically (e.g., via cron or scheduled jobs)

-- 1. Update pool statistics (run every 5 minutes)
-- CALL update_pool_stats('pool_id');

-- 2. Update user statistics (run every 10 minutes)
-- CALL update_user_stats('user_address');

-- 3. Clean up old snapshots (run daily)
-- DELETE FROM pool_snapshots WHERE timestamp < DATE_SUB(NOW(), INTERVAL 365 DAY);

-- 4. Analyze tables for query optimization (run weekly)
-- ANALYZE TABLE pools, pool_snapshots, user_positions, position_history, fee_earnings;

-- 5. Optimize tables to reclaim space (run monthly)
-- OPTIMIZE TABLE pools, pool_snapshots, user_positions, position_history, fee_earnings;

-- ============================================================================
-- CONNECTION POOLING CONFIGURATION
-- ============================================================================

-- Recommended connection pool settings for high-performance applications:
-- - Pool size: 10-20 connections for typical workloads
-- - Max idle time: 10 minutes
-- - Connection timeout: 30 seconds
-- - Query timeout: 60 seconds
-- - Enable prepared statement caching
-- - Enable query result caching for read-heavy workloads

-- ============================================================================
-- MONITORING QUERIES
-- ============================================================================

-- Query to check index usage
SELECT 
  TABLE_NAME,
  INDEX_NAME,
  SEQ_IN_INDEX,
  COLUMN_NAME,
  CARDINALITY
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('pools', 'pool_snapshots', 'user_positions', 'position_history', 'fee_earnings')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- Query to check table sizes
SELECT 
  TABLE_NAME,
  ROUND(((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024), 2) AS 'Size (MB)',
  TABLE_ROWS
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('pools', 'pool_snapshots', 'user_positions', 'position_history', 'fee_earnings')
ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC;

-- Query to identify slow queries (requires slow query log enabled)
-- SELECT * FROM mysql.slow_log ORDER BY query_time DESC LIMIT 10;
