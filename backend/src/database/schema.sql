-- Liquidity Swap Integration Database Schema
-- This schema supports pool metadata, position tracking, and analytics

-- Enable UUID extension if using PostgreSQL
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Token metadata table
CREATE TABLE IF NOT EXISTS tokens (
  address VARCHAR(255) PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  decimals INT NOT NULL,
  logo_url VARCHAR(500),
  price_usd DECIMAL(20, 8),
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pool metadata and cached data
CREATE TABLE IF NOT EXISTS pools (
  id VARCHAR(255) PRIMARY KEY,
  token_a_address VARCHAR(255) NOT NULL,
  token_b_address VARCHAR(255) NOT NULL,
  reserve_a DECIMAL(78, 0) NOT NULL DEFAULT 0,
  reserve_b DECIMAL(78, 0) NOT NULL DEFAULT 0,
  total_supply DECIMAL(78, 0) NOT NULL DEFAULT 0,
  name VARCHAR(100),
  description TEXT,
  tags TEXT[], -- PostgreSQL array, use JSON for other DBs
  verified BOOLEAN DEFAULT FALSE,
  featured BOOLEAN DEFAULT FALSE,
  risk_level VARCHAR(10) DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
  category VARCHAR(50) DEFAULT 'general',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes for efficient queries
  INDEX idx_pools_tokens (token_a_address, token_b_address),
  INDEX idx_pools_featured (featured, verified),
  INDEX idx_pools_category (category),
  
  -- Foreign key constraints
  FOREIGN KEY (token_a_address) REFERENCES tokens(address) ON DELETE CASCADE,
  FOREIGN KEY (token_b_address) REFERENCES tokens(address) ON DELETE CASCADE
);

-- Historical pool data for analytics
CREATE TABLE IF NOT EXISTS pool_snapshots (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  pool_id VARCHAR(255) NOT NULL,
  reserve_a DECIMAL(78, 0) NOT NULL,
  reserve_b DECIMAL(78, 0) NOT NULL,
  total_supply DECIMAL(78, 0) NOT NULL,
  tvl_usd DECIMAL(20, 2),
  volume_24h DECIMAL(20, 2),
  price_a DECIMAL(20, 8),
  price_b DECIMAL(20, 8),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes for time-series queries
  INDEX idx_pool_snapshots_pool_time (pool_id, timestamp),
  INDEX idx_pool_snapshots_timestamp (timestamp),
  
  -- Foreign key constraint
  FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE
);

-- User position tracking
CREATE TABLE IF NOT EXISTS user_positions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_address VARCHAR(255) NOT NULL,
  pool_id VARCHAR(255) NOT NULL,
  lp_token_balance DECIMAL(78, 0) NOT NULL DEFAULT 0,
  initial_value_usd DECIMAL(20, 2),
  initial_token_a_amount DECIMAL(78, 0),
  initial_token_b_amount DECIMAL(78, 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Unique constraint to prevent duplicate positions
  UNIQUE KEY unique_user_pool (user_address, pool_id),
  
  -- Indexes for efficient queries
  INDEX idx_user_positions_user (user_address),
  INDEX idx_user_positions_pool (pool_id),
  INDEX idx_user_positions_updated (updated_at),
  
  -- Foreign key constraint
  FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE
);

-- Position history for tracking add/remove operations
CREATE TABLE IF NOT EXISTS position_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_address VARCHAR(255) NOT NULL,
  pool_id VARCHAR(255) NOT NULL,
  action VARCHAR(10) NOT NULL CHECK (action IN ('add', 'remove')),
  lp_token_amount DECIMAL(78, 0) NOT NULL,
  token_a_amount DECIMAL(78, 0) NOT NULL,
  token_b_amount DECIMAL(78, 0) NOT NULL,
  value_usd DECIMAL(20, 2),
  transaction_hash VARCHAR(255),
  block_height BIGINT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes for efficient queries
  INDEX idx_position_history_user (user_address),
  INDEX idx_position_history_pool (pool_id),
  INDEX idx_position_history_timestamp (timestamp),
  INDEX idx_position_history_tx (transaction_hash),
  
  -- Foreign key constraint
  FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE
);

-- Fee earnings tracking
CREATE TABLE IF NOT EXISTS fee_earnings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_address VARCHAR(255) NOT NULL,
  pool_id VARCHAR(255) NOT NULL,
  amount_usd DECIMAL(20, 8) NOT NULL,
  transaction_hash VARCHAR(255),
  block_height BIGINT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes for efficient queries
  INDEX idx_fee_earnings_user_pool (user_address, pool_id),
  INDEX idx_fee_earnings_timestamp (timestamp),
  INDEX idx_fee_earnings_tx (transaction_hash),
  
  -- Foreign key constraint
  FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE
);

-- Pool analytics cache for performance
CREATE TABLE IF NOT EXISTS pool_analytics_cache (
  pool_id VARCHAR(255) PRIMARY KEY,
  tvl DECIMAL(20, 2),
  volume_24h DECIMAL(20, 2),
  volume_7d DECIMAL(20, 2),
  apr DECIMAL(8, 4),
  fee_earnings_24h DECIMAL(20, 8),
  price_change_24h DECIMAL(8, 4),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign key constraint
  FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE
);

-- System configuration and metadata
CREATE TABLE IF NOT EXISTS system_config (
  key_name VARCHAR(100) PRIMARY KEY,
  value_data TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default system configuration
INSERT INTO system_config (key_name, value_data, description) VALUES
('pool_discovery_last_scan', '0', 'Last block height scanned for new pools'),
('analytics_last_update', '0', 'Last timestamp when analytics were updated'),
('cache_ttl_seconds', '300', 'Default cache TTL in seconds'),
('max_pools_per_page', '50', 'Maximum pools returned per API page')
ON DUPLICATE KEY UPDATE value_data = VALUES(value_data);

-- Create triggers for updating timestamps (MySQL syntax)
-- For PostgreSQL, use BEFORE UPDATE triggers with NEW.updated_at = NOW()

DELIMITER //

CREATE TRIGGER update_tokens_timestamp
  BEFORE UPDATE ON tokens
  FOR EACH ROW
BEGIN
  SET NEW.updated_at = CURRENT_TIMESTAMP;
END//

CREATE TRIGGER update_pools_timestamp
  BEFORE UPDATE ON pools
  FOR EACH ROW
BEGIN
  SET NEW.updated_at = CURRENT_TIMESTAMP;
END//

CREATE TRIGGER update_user_positions_timestamp
  BEFORE UPDATE ON user_positions
  FOR EACH ROW
BEGIN
  SET NEW.updated_at = CURRENT_TIMESTAMP;
END//

CREATE TRIGGER update_pool_analytics_cache_timestamp
  BEFORE UPDATE ON pool_analytics_cache
  FOR EACH ROW
BEGIN
  SET NEW.updated_at = CURRENT_TIMESTAMP;
END//

CREATE TRIGGER update_system_config_timestamp
  BEFORE UPDATE ON system_config
  FOR EACH ROW
BEGIN
  SET NEW.updated_at = CURRENT_TIMESTAMP;
END//

DELIMITER ;

-- Create views for common queries

-- View for pool summary with token information
CREATE VIEW pool_summary AS
SELECT 
  p.id,
  p.token_a_address,
  p.token_b_address,
  ta.symbol as token_a_symbol,
  ta.name as token_a_name,
  tb.symbol as token_b_symbol,
  tb.name as token_b_name,
  p.reserve_a,
  p.reserve_b,
  p.total_supply,
  p.verified,
  p.featured,
  p.risk_level,
  p.category,
  pac.tvl,
  pac.volume_24h,
  pac.apr,
  p.created_at,
  p.updated_at
FROM pools p
LEFT JOIN tokens ta ON p.token_a_address = ta.address
LEFT JOIN tokens tb ON p.token_b_address = tb.address
LEFT JOIN pool_analytics_cache pac ON p.id = pac.pool_id;

-- View for user portfolio summary
CREATE VIEW user_portfolio_summary AS
SELECT 
  up.user_address,
  COUNT(up.pool_id) as position_count,
  SUM(up.initial_value_usd) as total_initial_value,
  SUM(
    (up.lp_token_balance * p.reserve_a * ta.price_usd / p.total_supply) +
    (up.lp_token_balance * p.reserve_b * tb.price_usd / p.total_supply)
  ) as total_current_value
FROM user_positions up
JOIN pools p ON up.pool_id = p.id
LEFT JOIN tokens ta ON p.token_a_address = ta.address
LEFT JOIN tokens tb ON p.token_b_address = tb.address
WHERE up.lp_token_balance > 0
GROUP BY up.user_address;