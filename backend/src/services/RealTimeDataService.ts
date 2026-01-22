/**
 * Real-Time Data Service
 * Provides real-time updates for pool data and user positions using WebSocket connections
 * Integrates with Stacks blockchain for live transaction monitoring
 */

import { WebSocketServer, WebSocket } from 'ws';
import { getExtendedConfig } from '../config';
import { logger } from '../utils/logger';
import { getCache, CACHE_KEYS, invalidatePoolCache, invalidateUserCache } from '../cache/redis';
import { poolDiscoveryService } from './PoolDiscoveryService';
import { poolAnalyticsService } from './PoolAnalyticsService';
import { positionTrackingService } from './PositionTrackingService';
import { liquidityService } from './LiquidityService';
import { callReadOnlyFunction, cvToJSON } from '@stacks/transactions';
import {
  PoolUpdate,
  PositionUpdate,
  Pool,
} from '../types/liquidity';

interface WebSocketClient {
  id: string;
  socket: WebSocket;
  subscriptions: Set<string>;
  userAddress?: string;
  lastPing: number;
  connectedAt: Date;
  messageCount: number;
  rateLimitTokens: number;
  lastRateLimitReset: number;
  isAuthenticated: boolean;
  connectionMetadata: {
    userAgent?: string;
    ip?: string;
    origin?: string;
  };
}

interface SubscriptionData {
  type: 'pool' | 'user' | 'global';
  target: string; // poolId or userAddress
}

/**
 * Real-Time Data Service Class
 * Handles WebSocket connections and real-time blockchain data streaming
 */
export class RealTimeDataService {
  private config = getExtendedConfig();
  private cache = getCache();
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocketClient> = new Map();
  private subscriptions: Map<string, Set<string>> = new Map(); // subscription -> client IDs
  private blockchainMonitor: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private connectionCleanupInterval: NodeJS.Timeout | null = null;
  private rateLimitCleanupInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private maxConnections = 10000; // Maximum concurrent connections
  private rateLimitConfig = {
    maxTokens: 100, // Maximum tokens per client
    refillRate: 10, // Tokens refilled per minute
    refillInterval: 60000, // 1 minute in milliseconds
  };

  constructor() {
    logger.info('RealTimeDataService initialized');
  }

  /**
   * Start the WebSocket server and blockchain monitoring
   */
  async start(port: number = 8080): Promise<void> {
    try {
      // Initialize WebSocket server
      this.wss = new WebSocketServer({ 
        port,
        perMessageDeflate: false,
        maxPayload: 1024 * 1024, // 1MB max message size
      });

      this.wss.on('connection', (socket: WebSocket, request: any) => {
        this.handleClientConnection(socket, request);
      });

      this.wss.on('error', (error: Error) => {
        logger.error('WebSocket server error', { error });
      });

      // Start blockchain monitoring
      await this.startBlockchainMonitoring();

      // Start heartbeat for connection management
      this.startHeartbeat();

      // Start connection cleanup for stale connections
      this.startConnectionCleanup();

      // Start rate limit token refill
      this.startRateLimitCleanup();

      this.isRunning = true;
      logger.info('RealTimeDataService started', { port, wsPort: port });
    } catch (error) {
      logger.error('Failed to start RealTimeDataService', { error });
      throw error;
    }
  }

  /**
   * Stop the service and cleanup resources
   */
  async stop(): Promise<void> {
    try {
      this.isRunning = false;

      // Stop blockchain monitoring
      if (this.blockchainMonitor) {
        clearInterval(this.blockchainMonitor);
        this.blockchainMonitor = null;
      }

      // Stop heartbeat
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      // Stop connection cleanup
      if (this.connectionCleanupInterval) {
        clearInterval(this.connectionCleanupInterval);
        this.connectionCleanupInterval = null;
      }

      // Stop rate limit cleanup
      if (this.rateLimitCleanupInterval) {
        clearInterval(this.rateLimitCleanupInterval);
        this.rateLimitCleanupInterval = null;
      }

      // Close all client connections
      for (const client of this.clients.values()) {
        client.socket.close(1000, 'Server shutting down');
      }
      this.clients.clear();
      this.subscriptions.clear();

      // Close WebSocket server
      if (this.wss) {
        this.wss.close();
        this.wss = null;
      }

      logger.info('RealTimeDataService stopped');
    } catch (error) {
      logger.error('Error stopping RealTimeDataService', { error });
    }
  }

  /**
   * Handle new WebSocket client connection with enhanced management
   */
  private handleClientConnection(socket: WebSocket, request: any): void {
    // Check connection limits
    if (this.clients.size >= this.maxConnections) {
      logger.warn('Connection limit reached, rejecting new connection', { 
        currentConnections: this.clients.size,
        maxConnections: this.maxConnections 
      });
      socket.close(1013, 'Server overloaded');
      return;
    }

    const clientId = this.generateClientId();
    const now = Date.now();
    
    const client: WebSocketClient = {
      id: clientId,
      socket,
      subscriptions: new Set(),
      lastPing: now,
      connectedAt: new Date(now),
      messageCount: 0,
      rateLimitTokens: this.rateLimitConfig.maxTokens,
      lastRateLimitReset: now,
      isAuthenticated: false,
      connectionMetadata: {
        userAgent: request.headers['user-agent'],
        ip: request.socket.remoteAddress,
        origin: request.headers.origin,
      },
    };

    this.clients.set(clientId, client);

    logger.info('Client connected with enhanced tracking', { 
      clientId, 
      clientCount: this.clients.size,
      userAgent: client.connectionMetadata.userAgent,
      ip: client.connectionMetadata.ip,
      origin: client.connectionMetadata.origin,
    });

    // Set up message handling with rate limiting
    socket.on('message', (data: Buffer) => {
      if (this.checkRateLimit(clientId)) {
        this.handleClientMessage(clientId, data);
      } else {
        this.sendToClient(clientId, {
          type: 'error',
          message: 'Rate limit exceeded. Please slow down.',
          timestamp: new Date().toISOString(),
        });
      }
    });

    socket.on('close', (code: number, reason: Buffer) => {
      this.handleClientDisconnection(clientId, code, reason);
    });

    socket.on('error', (error: Error) => {
      logger.error('Client socket error', { clientId, error });
      this.handleClientDisconnection(clientId, 1006, Buffer.from('Socket error'));
    });

    socket.on('pong', () => {
      const client = this.clients.get(clientId);
      if (client) {
        client.lastPing = Date.now();
      }
    });

    // Send welcome message with connection info
    this.sendToClient(clientId, {
      type: 'welcome',
      clientId,
      timestamp: new Date().toISOString(),
      serverVersion: '1.0.0',
      rateLimits: {
        maxTokens: this.rateLimitConfig.maxTokens,
        refillRate: this.rateLimitConfig.refillRate,
      },
      connectionInfo: {
        maxSubscriptions: 50, // Limit subscriptions per client
        heartbeatInterval: 30000, // 30 seconds
      },
    });
  }

  /**
   * Check rate limit for a client
   */
  private checkRateLimit(clientId: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    const now = Date.now();
    
    // Refill tokens if enough time has passed
    const timeSinceLastReset = now - client.lastRateLimitReset;
    if (timeSinceLastReset >= this.rateLimitConfig.refillInterval) {
      const tokensToAdd = Math.floor(timeSinceLastReset / this.rateLimitConfig.refillInterval) * this.rateLimitConfig.refillRate;
      client.rateLimitTokens = Math.min(this.rateLimitConfig.maxTokens, client.rateLimitTokens + tokensToAdd);
      client.lastRateLimitReset = now;
    }

    // Check if client has tokens available
    if (client.rateLimitTokens > 0) {
      client.rateLimitTokens--;
      client.messageCount++;
      return true;
    }

    logger.warn('Rate limit exceeded for client', { 
      clientId, 
      tokens: client.rateLimitTokens,
      messageCount: client.messageCount 
    });
    return false;
  }

  /**
   * Start connection cleanup for stale connections
   */
  private startConnectionCleanup(): void {
    this.connectionCleanupInterval = setInterval(() => {
      const now = Date.now();
      const staleTimeout = 300000; // 5 minutes
      const maxIdleTime = 1800000; // 30 minutes

      for (const [clientId, client] of this.clients.entries()) {
        const timeSinceLastPing = now - client.lastPing;
        const connectionAge = now - client.connectedAt.getTime();

        // Remove stale connections
        if (timeSinceLastPing > staleTimeout) {
          logger.warn('Removing stale connection', { 
            clientId, 
            timeSinceLastPing,
            connectionAge 
          });
          client.socket.close(1000, 'Connection stale');
          continue;
        }

        // Remove idle unauthenticated connections
        if (!client.isAuthenticated && connectionAge > maxIdleTime) {
          logger.warn('Removing idle unauthenticated connection', { 
            clientId, 
            connectionAge 
          });
          client.socket.close(1000, 'Idle timeout');
          continue;
        }

        // Log connection statistics
        if (connectionAge > 3600000) { // 1 hour
          logger.debug('Long-running connection', {
            clientId,
            connectionAge,
            messageCount: client.messageCount,
            subscriptionCount: client.subscriptions.size,
            isAuthenticated: client.isAuthenticated,
          });
        }
      }
    }, 60000); // Check every minute

    logger.info('Connection cleanup started');
  }

  /**
   * Start rate limit token refill
   */
  private startRateLimitCleanup(): void {
    this.rateLimitCleanupInterval = setInterval(() => {
      const now = Date.now();
      
      for (const client of this.clients.values()) {
        const timeSinceLastReset = now - client.lastRateLimitReset;
        
        if (timeSinceLastReset >= this.rateLimitConfig.refillInterval) {
          const tokensToAdd = Math.floor(timeSinceLastReset / this.rateLimitConfig.refillInterval) * this.rateLimitConfig.refillRate;
          client.rateLimitTokens = Math.min(this.rateLimitConfig.maxTokens, client.rateLimitTokens + tokensToAdd);
          client.lastRateLimitReset = now;
        }
      }
    }, this.rateLimitConfig.refillInterval); // Refill every minute

    logger.info('Rate limit cleanup started');
  }

  /**
   * Handle client disconnection
   */
  private handleClientDisconnection(clientId: string, code?: number, reason?: Buffer): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove client from all subscriptions
    for (const subscription of client.subscriptions) {
      const subscribers = this.subscriptions.get(subscription);
      if (subscribers) {
        subscribers.delete(clientId);
        if (subscribers.size === 0) {
          this.subscriptions.delete(subscription);
        }
      }
    }

    this.clients.delete(clientId);

    logger.info('Client disconnected', { 
      clientId, 
      code, 
      reason: reason?.toString(),
      clientCount: this.clients.size,
    });
  }

  /**
   * Handle incoming client messages
   */
  private handleClientMessage(clientId: string, data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());
      const client = this.clients.get(clientId);
      
      if (!client) {
        logger.warn('Message from unknown client', { clientId });
        return;
      }

      logger.debug('Client message received', { clientId, type: message.type });

      switch (message.type) {
        case 'subscribe':
          this.handleSubscription(clientId, message);
          break;
        case 'unsubscribe':
          this.handleUnsubscription(clientId, message);
          break;
        case 'ping':
          this.sendToClient(clientId, { type: 'pong', timestamp: new Date().toISOString() });
          break;
        case 'auth':
          this.handleAuthentication(clientId, message);
          break;
        default:
          logger.warn('Unknown message type', { clientId, type: message.type });
          this.sendToClient(clientId, { 
            type: 'error', 
            message: 'Unknown message type',
            timestamp: new Date().toISOString(),
          });
      }
    } catch (error) {
      logger.error('Error handling client message', { clientId, error });
      this.sendToClient(clientId, { 
        type: 'error', 
        message: 'Invalid message format',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Handle client subscription requests with enhanced validation
   */
  private handleSubscription(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { target, subscriptionType } = message;
    
    if (!target || !subscriptionType) {
      this.sendToClient(clientId, {
        type: 'error',
        message: 'Missing target or subscriptionType',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Check subscription limits
    const maxSubscriptions = 50;
    if (client.subscriptions.size >= maxSubscriptions) {
      this.sendToClient(clientId, {
        type: 'error',
        message: `Maximum subscriptions limit reached (${maxSubscriptions})`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Validate subscription type
    const validTypes = ['pool', 'user', 'global'];
    if (!validTypes.includes(subscriptionType)) {
      this.sendToClient(clientId, {
        type: 'error',
        message: `Invalid subscription type. Valid types: ${validTypes.join(', ')}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // For user subscriptions, require authentication
    if (subscriptionType === 'user' && !client.isAuthenticated) {
      this.sendToClient(clientId, {
        type: 'error',
        message: 'Authentication required for user subscriptions',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Validate target format based on subscription type
    if (!this.validateSubscriptionTarget(subscriptionType, target)) {
      this.sendToClient(clientId, {
        type: 'error',
        message: 'Invalid target format for subscription type',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const subscriptionKey = `${subscriptionType}:${target}`;
    
    // Check if already subscribed
    if (client.subscriptions.has(subscriptionKey)) {
      this.sendToClient(clientId, {
        type: 'error',
        message: 'Already subscribed to this target',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    // Add client to subscription
    if (!this.subscriptions.has(subscriptionKey)) {
      this.subscriptions.set(subscriptionKey, new Set());
    }
    this.subscriptions.get(subscriptionKey)!.add(clientId);
    client.subscriptions.add(subscriptionKey);

    // Store user address for user subscriptions
    if (subscriptionType === 'user') {
      client.userAddress = target;
    }

    logger.info('Client subscribed with validation', { 
      clientId, 
      subscriptionKey,
      subscriptionCount: client.subscriptions.size,
      totalSubscriptions: this.subscriptions.size,
    });

    this.sendToClient(clientId, {
      type: 'subscribed',
      target,
      subscriptionType,
      subscriptionCount: client.subscriptions.size,
      timestamp: new Date().toISOString(),
    });

    // Send initial data for the subscription
    this.sendInitialData(clientId, subscriptionType, target);
  }

  /**
   * Validate subscription target format
   */
  private validateSubscriptionTarget(subscriptionType: string, target: string): boolean {
    switch (subscriptionType) {
      case 'pool':
        // Pool ID should be in format "tokenA-tokenB"
        return /^[A-Za-z0-9.-]+\-[A-Za-z0-9.-]+$/.test(target);
      case 'user':
        // User address should be a valid Stacks address
        return /^[A-Z0-9]{28,41}$/.test(target) || /^S[A-Z0-9]{39}$/.test(target);
      case 'global':
        // Global subscriptions have predefined targets
        const validGlobalTargets = ['market', 'system', 'alerts'];
        return validGlobalTargets.includes(target);
      default:
        return false;
    }
  }

  /**
   * Handle client unsubscription requests
   */
  private handleUnsubscription(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { target, subscriptionType } = message;
    const subscriptionKey = `${subscriptionType}:${target}`;
    
    // Remove client from subscription
    const subscribers = this.subscriptions.get(subscriptionKey);
    if (subscribers) {
      subscribers.delete(clientId);
      if (subscribers.size === 0) {
        this.subscriptions.delete(subscriptionKey);
      }
    }
    client.subscriptions.delete(subscriptionKey);

    logger.info('Client unsubscribed', { clientId, subscriptionKey });

    this.sendToClient(clientId, {
      type: 'unsubscribed',
      target,
      subscriptionType,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle client authentication with enhanced security
   */
  private handleAuthentication(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { userAddress, signature, timestamp } = message;
    
    if (!userAddress) {
      this.sendToClient(clientId, {
        type: 'error',
        message: 'Missing userAddress in authentication request',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Validate user address format
    if (!this.validateSubscriptionTarget('user', userAddress)) {
      this.sendToClient(clientId, {
        type: 'error',
        message: 'Invalid user address format',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // In production, verify the signature to authenticate the user
    // This would involve:
    // 1. Verifying the signature against the user's public key
    // 2. Checking the timestamp to prevent replay attacks
    // 3. Validating the message format and content
    
    const isValidSignature = this.verifySignature(userAddress, signature, timestamp);
    
    if (!isValidSignature) {
      this.sendToClient(clientId, {
        type: 'error',
        message: 'Invalid signature or authentication failed',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Check if user is already authenticated from another connection
    const existingConnection = this.findExistingUserConnection(userAddress);
    if (existingConnection && existingConnection !== clientId) {
      logger.warn('User attempting to authenticate from multiple connections', {
        userAddress,
        existingClientId: existingConnection,
        newClientId: clientId,
      });
      
      // Optionally close the existing connection or allow multiple connections
      // For now, we'll allow multiple connections but log it
    }

    client.userAddress = userAddress;
    client.isAuthenticated = true;
    
    this.sendToClient(clientId, {
      type: 'authenticated',
      userAddress,
      timestamp: new Date().toISOString(),
      capabilities: {
        canSubscribeToUserData: true,
        canReceivePrivateUpdates: true,
        maxUserSubscriptions: 10,
      },
    });

    logger.info('Client authenticated successfully', { 
      clientId, 
      userAddress,
      connectionAge: Date.now() - client.connectedAt.getTime(),
    });
  }

  /**
   * Verify signature for authentication (placeholder for real implementation)
   */
  private verifySignature(userAddress: string, signature: string, timestamp: number): boolean {
    // In production, this would:
    // 1. Reconstruct the message that was signed
    // 2. Verify the signature using the user's public key
    // 3. Check timestamp to prevent replay attacks (within 5 minutes)
    // 4. Validate signature format and encoding
    
    if (!signature || !timestamp) {
      return false;
    }

    // Check timestamp (must be within 5 minutes)
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    if (Math.abs(now - timestamp) > maxAge) {
      logger.warn('Authentication timestamp too old', { 
        userAddress, 
        timestamp, 
        now, 
        age: now - timestamp 
      });
      return false;
    }

    // For now, accept any non-empty signature (in production, implement real verification)
    return signature.length > 0;
  }

  /**
   * Find existing connection for a user
   */
  private findExistingUserConnection(userAddress: string): string | null {
    for (const [clientId, client] of this.clients.entries()) {
      if (client.userAddress === userAddress && client.isAuthenticated) {
        return clientId;
      }
    }
    return null;
  }

  /**
   * Send initial data for a subscription
   */
  private async sendInitialData(clientId: string, subscriptionType: string, target: string): Promise<void> {
    try {
      switch (subscriptionType) {
        case 'pool':
          const poolData = await this.getPoolData(target);
          if (poolData) {
            this.sendToClient(clientId, {
              type: 'pool_update',
              data: poolData,
              timestamp: new Date().toISOString(),
            });
          }
          break;
        case 'user':
          const userData = await this.getUserData(target);
          if (userData) {
            this.sendToClient(clientId, {
              type: 'user_update',
              data: userData,
              timestamp: new Date().toISOString(),
            });
          }
          break;
        case 'global':
          const globalData = await this.getGlobalData();
          this.sendToClient(clientId, {
            type: 'global_update',
            data: globalData,
            timestamp: new Date().toISOString(),
          });
          break;
      }
    } catch (error) {
      logger.error('Error sending initial data', { clientId, subscriptionType, target, error });
    }
  }

  /**
   * Start blockchain monitoring for real-time updates
   */
  private async startBlockchainMonitoring(): Promise<void> {
    // Monitor blockchain every 10 seconds for new transactions
    this.blockchainMonitor = setInterval(async () => {
      try {
        await this.checkForBlockchainUpdates();
      } catch (error) {
        logger.error('Blockchain monitoring error', { error });
      }
    }, 10000); // 10 seconds

    logger.info('Blockchain monitoring started');
  }

  /**
   * Check for blockchain updates and broadcast to subscribers
   */
  private async checkForBlockchainUpdates(): Promise<void> {
    try {
      // Get latest block height
      const response = await fetch(`${this.config.stacksRpcUrl}/extended/v1/block`);
      if (!response.ok) return;

      const blockData: any = await response.json();
      const currentHeight = blockData.height;

      // Check if we have a new block
      const lastHeight = await this.cache.get('last_processed_block') || '0';
      if (currentHeight <= parseInt(lastHeight)) return;

      // Process new blocks
      for (let height = parseInt(lastHeight) + 1; height <= currentHeight; height++) {
        await this.processBlock(height);
      }

      // Update last processed block
      await this.cache.set('last_processed_block', currentHeight.toString(), 3600);
    } catch (error) {
      logger.error('Error checking blockchain updates', { error });
    }
  }

  /**
   * Process a specific block for relevant transactions
   */
  private async processBlock(height: number): Promise<void> {
    try {
      // Get block transactions
      const response = await fetch(
        `${this.config.stacksRpcUrl}/extended/v1/block/by_height/${height}`
      );
      
      if (!response.ok) return;

      const blockData: any = await response.json();
      const transactions = blockData.txs || [];

      // Process each transaction
      for (const tx of transactions) {
        if (tx.tx_status === 'success') {
          await this.processTransaction(tx);
        }
      }
    } catch (error) {
      logger.error('Error processing block', { height, error });
    }
  }

  /**
   * Process a transaction for liquidity-related events
   */
  private async processTransaction(tx: any): Promise<void> {
    try {
      // Check if transaction involves our swap contract
      const swapContractAddress = this.config.stacksSwapContractAddress;
      
      if (tx.contract_call?.contract_id === swapContractAddress) {
        const functionName = tx.contract_call.function_name;
        
        switch (functionName) {
          case 'add-liquidity':
          case 'remove-liquidity':
            await this.handleLiquidityTransaction(tx);
            break;
          case 'swap':
            await this.handleSwapTransaction(tx);
            break;
        }
      }
    } catch (error) {
      logger.error('Error processing transaction', { txId: tx.tx_id, error });
    }
  }

  /**
   * Handle liquidity-related transactions
   */
  private async handleLiquidityTransaction(tx: any): Promise<void> {
    try {
      const functionArgs = tx.contract_call.function_args;
      const senderAddress = tx.sender_address;
      
      // Extract token addresses from function arguments
      const tokenA = functionArgs[0]?.repr?.replace(/'/g, '');
      const tokenB = functionArgs[1]?.repr?.replace(/'/g, '');
      
      if (!tokenA || !tokenB) return;

      // Generate pool ID
      const poolId = `${tokenA}-${tokenB}`;

      // Invalidate caches
      await invalidatePoolCache(poolId);
      await invalidateUserCache(senderAddress);

      // Get updated pool data
      const poolData = await this.getPoolData(poolId);
      if (poolData) {
        this.broadcastPoolUpdate(poolId, poolData);
      }

      // Get updated user data
      const userData = await this.getUserData(senderAddress);
      if (userData) {
        this.broadcastUserUpdate(senderAddress, userData);
      }

      logger.info('Liquidity transaction processed', {
        txId: tx.tx_id,
        function: tx.contract_call.function_name,
        poolId,
        user: senderAddress,
      });
    } catch (error) {
      logger.error('Error handling liquidity transaction', { txId: tx.tx_id, error });
    }
  }

  /**
   * Handle swap transactions that affect pool reserves
   */
  private async handleSwapTransaction(tx: any): Promise<void> {
    try {
      const functionArgs = tx.contract_call.function_args;
      
      // Extract token addresses
      const tokenIn = functionArgs[0]?.repr?.replace(/'/g, '');
      const tokenOut = functionArgs[1]?.repr?.replace(/'/g, '');
      
      if (!tokenIn || !tokenOut) return;

      // Generate pool ID
      const poolId = `${tokenIn}-${tokenOut}`;

      // Invalidate pool cache
      await invalidatePoolCache(poolId);

      // Get updated pool data
      const poolData = await this.getPoolData(poolId);
      if (poolData) {
        this.broadcastPoolUpdate(poolId, poolData);
      }

      // Broadcast global market update
      const globalData = await this.getGlobalData();
      this.broadcastGlobalUpdate(globalData);

      logger.info('Swap transaction processed', {
        txId: tx.tx_id,
        poolId,
      });
    } catch (error) {
      logger.error('Error handling swap transaction', { txId: tx.tx_id, error });
    }
  }

  /**
   * Get current pool data
   */
  private async getPoolData(poolId: string): Promise<PoolUpdate | null> {
    try {
      const pool = await poolDiscoveryService.getPoolById(poolId);
      if (!pool) return null;

      const analytics = await poolAnalyticsService.getPoolAnalytics(poolId);

      return {
        poolId,
        reserveA: pool.reserveA,
        reserveB: pool.reserveB,
        totalSupply: pool.totalSupply,
        tvl: analytics.tvl,
        volume24h: analytics.volume24h,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Error getting pool data', { poolId, error });
      return null;
    }
  }

  /**
   * Get current user data
   */
  private async getUserData(userAddress: string): Promise<PositionUpdate[] | null> {
    try {
      const positions = await positionTrackingService.getUserPositions(userAddress);
      
      return positions.map(position => ({
        userAddress,
        poolId: position.poolId,
        lpTokenBalance: position.lpTokenBalance,
        currentValue: position.currentValue,
        feeEarnings: position.feeEarnings,
        timestamp: new Date(),
      }));
    } catch (error) {
      logger.error('Error getting user data', { userAddress, error });
      return null;
    }
  }

  /**
   * Get global market data
   */
  private async getGlobalData(): Promise<any> {
    try {
      const summary = await poolAnalyticsService.getAnalyticsSummary();
      
      return {
        totalTVL: summary.totalTVL,
        totalVolume24h: summary.totalVolume24h,
        totalFees24h: summary.totalFees24h,
        averageAPR: summary.averageAPR,
        poolCount: summary.poolCount,
   
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Error getting global data', { error });
      return {
        totalTVL: 0,
        totalVolume24h: 0,
        totalFees24h: 0,
        averageAPR: 0,
        poolCount: 0,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Broadcast pool update to subscribers
   */
  private broadcastPoolUpdate(poolId: string, data: PoolUpdate): void {
    const subscriptionKey = `pool:${poolId}`;
    const subscribers = this.subscriptions.get(subscriptionKey);
    
    if (subscribers && subscribers.size > 0) {
      const message = {
        type: 'pool_update',
        data,
        timestamp: new Date().toISOString(),
      };

      for (const clientId of subscribers) {
        this.sendToClient(clientId, message);
      }

      logger.debug('Pool update broadcasted', { poolId, subscriberCount: subscribers.size });
    }
  }

  /**
   * Broadcast user update to subscribers
   */
  private broadcastUserUpdate(userAddress: string, data: PositionUpdate[]): void {
    const subscriptionKey = `user:${userAddress}`;
    const subscribers = this.subscriptions.get(subscriptionKey);
    
    if (subscribers && subscribers.size > 0) {
      const message = {
        type: 'user_update',
        data,
        timestamp: new Date().toISOString(),
      };

      for (const clientId of subscribers) {
        this.sendToClient(clientId, message);
      }

      logger.debug('User update broadcasted', { userAddress, subscriberCount: subscribers.size });
    }
  }

  /**
   * Broadcast global update to subscribers
   */
  private broadcastGlobalUpdate(data: any): void {
    const subscriptionKey = 'global:market';
    const subscribers = this.subscriptions.get(subscriptionKey);
    
    if (subscribers && subscribers.size > 0) {
      const message = {
        type: 'global_update',
        data,
        timestamp: new Date().toISOString(),
      };

      for (const clientId of subscribers) {
        this.sendToClient(clientId, message);
      }

      logger.debug('Global update broadcasted', { subscriberCount: subscribers.size });
    }
  }

  /**
   * Send message to specific client
   */
  private sendToClient(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      client.socket.send(JSON.stringify(message));
    } catch (error) {
      logger.error('Error sending message to client', { clientId, error });
      this.handleClientDisconnection(clientId, 1006, Buffer.from('Send error'));
    }
  }

  /**
   * Start heartbeat to maintain connections
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 60000; // 60 seconds

      for (const [clientId, client] of this.clients.entries()) {
        if (now - client.lastPing > timeout) {
          logger.warn('Client heartbeat timeout', { clientId });
          client.socket.close(1000, 'Heartbeat timeout');
          continue;
        }

        // Send ping
        if (client.socket.readyState === WebSocket.OPEN) {
          try {
            client.socket.ping();
          } catch (error) {
            logger.error('Error sending ping', { clientId, error });
          }
        }
      }
    }, 30000); // Check every 30 seconds

    logger.info('Heartbeat started');
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Subscribe to pool updates (programmatic API)
   */
  subscribeToPool(poolId: string, callback: (data: PoolUpdate) => void): string {
    const subscriptionId = `pool_${poolId}_${Date.now()}`;
    
    // Store callback for programmatic subscriptions
    // This would be used for server-side subscriptions
    
    logger.info('Programmatic pool subscription created', { poolId, subscriptionId });
    return subscriptionId;
  }

  /**
   * Subscribe to user position updates (programmatic API)
   */
  subscribeToUserPositions(userAddress: string, callback: (data: PositionUpdate[]) => void): string {
    const subscriptionId = `user_${userAddress}_${Date.now()}`;
    
    // Store callback for programmatic subscriptions
    
    logger.info('Programmatic user subscription created', { userAddress, subscriptionId });
    return subscriptionId;
  }

  /**
   * Get service status
   */
  getStatus(): {
    isRunning: boolean;
    clientCount: number;
    subscriptionCount: number;
    uptime: number;
  } {
    return {
      isRunning: this.isRunning,
      clientCount: this.clients.size,
      subscriptionCount: this.subscriptions.size,
      uptime: this.isRunning ? Date.now() : 0,
    };
  }

  /**
   * Get detailed statistics with enhanced metrics
   */
  getStatistics(): {
    clients: number;
    authenticatedClients: number;
    subscriptions: {
      pool: number;
      user: number;
      global: number;
      total: number;
    };
    connections: {
      active: number;
      total: number;
      averageAge: number;
      averageMessageCount: number;
    };
    rateLimiting: {
      totalMessages: number;
      rateLimitedClients: number;
      averageTokens: number;
    };
    performance: {
      uptime: number;
      memoryUsage: number;
      subscriptionDistribution: { [key: string]: number };
    };
  } {
    const subscriptionStats = { pool: 0, user: 0, global: 0, total: 0 };
    const subscriptionDistribution: { [key: string]: number } = {};
    
    for (const key of this.subscriptions.keys()) {
      const [type] = key.split(':');
      if (type in subscriptionStats) {
        subscriptionStats[type as keyof typeof subscriptionStats]++;
      }
      subscriptionStats.total++;
      
      // Track subscription distribution
      subscriptionDistribution[key] = this.subscriptions.get(key)?.size || 0;
    }

    // Calculate connection statistics
    let totalAge = 0;
    let totalMessages = 0;
    let authenticatedCount = 0;
    let rateLimitedCount = 0;
    let totalTokens = 0;

    const now = Date.now();
    for (const client of this.clients.values()) {
      totalAge += now - client.connectedAt.getTime();
      totalMessages += client.messageCount;
      totalTokens += client.rateLimitTokens;
      
      if (client.isAuthenticated) {
        authenticatedCount++;
      }
      
      if (client.rateLimitTokens < this.rateLimitConfig.maxTokens * 0.1) {
        rateLimitedCount++;
      }
    }

    const clientCount = this.clients.size;
    const averageAge = clientCount > 0 ? totalAge / clientCount : 0;
    const averageMessageCount = clientCount > 0 ? totalMessages / clientCount : 0;
    const averageTokens = clientCount > 0 ? totalTokens / clientCount : 0;

    return {
      clients: clientCount,
      authenticatedClients: authenticatedCount,
      subscriptions: subscriptionStats,
      connections: {
        active: clientCount,
        total: clientCount, // In production, track total connections over time
        averageAge,
        averageMessageCount,
      },
      rateLimiting: {
        totalMessages,
        rateLimitedClients: rateLimitedCount,
        averageTokens,
      },
      performance: {
        uptime: this.isRunning ? Date.now() : 0,
        memoryUsage: process.memoryUsage().heapUsed,
        subscriptionDistribution,
      },
    };
  }

  /**
   * Get connection health metrics
   */
  getHealthMetrics(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: {
      connectionCount: number;
      subscriptionCount: number;
      averageLatency: number;
      errorRate: number;
      memoryUsage: number;
      uptime: number;
    };
    issues: string[];
  } {
    const stats = this.getStatistics();
    const issues: string[] = [];
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Check connection count
    if (stats.clients > this.maxConnections * 0.9) {
      issues.push('High connection count approaching limit');
      status = 'degraded';
    }

    // Check memory usage
    const memoryUsageMB = stats.performance.memoryUsage / 1024 / 1024;
    if (memoryUsageMB > 500) {
      issues.push('High memory usage');
      status = 'degraded';
    }

    // Check rate limiting
    if (stats.rateLimiting.rateLimitedClients > stats.clients * 0.1) {
      issues.push('High rate limiting activity');
      status = 'degraded';
    }

    // Check subscription distribution
    const maxSubscriptionsPerKey = Math.max(...Object.values(stats.performance.subscriptionDistribution));
    if (maxSubscriptionsPerKey > 1000) {
      issues.push('High subscription concentration on single target');
      status = 'degraded';
    }

    if (issues.length > 3) {
      status = 'unhealthy';
    }

    return {
      status,
      details: {
        connectionCount: stats.clients,
        subscriptionCount: stats.subscriptions.total,
        averageLatency: 0, // Would be calculated from ping/pong timing
        errorRate: 0, // Would be calculated from error tracking
        memoryUsage: memoryUsageMB,
        uptime: stats.performance.uptime,
      },
      issues,
    };
  }

  /**
   * Force disconnect clients based on criteria
   */
  async forceDisconnectClients(criteria: {
    unauthenticated?: boolean;
    idle?: boolean;
    rateLimited?: boolean;
    maxAge?: number;
  }): Promise<number> {
    let disconnectedCount = 0;
    const now = Date.now();

    for (const [clientId, client] of this.clients.entries()) {
      let shouldDisconnect = false;
      let reason = '';

      if (criteria.unauthenticated && !client.isAuthenticated) {
        shouldDisconnect = true;
        reason = 'Unauthenticated';
      }

      if (criteria.idle && (now - client.lastPing) > 300000) { // 5 minutes idle
        shouldDisconnect = true;
        reason = 'Idle';
      }

      if (criteria.rateLimited && client.rateLimitTokens < this.rateLimitConfig.maxTokens * 0.1) {
        shouldDisconnect = true;
        reason = 'Rate limited';
      }

      if (criteria.maxAge && (now - client.connectedAt.getTime()) > criteria.maxAge) {
        shouldDisconnect = true;
        reason = 'Max age exceeded';
      }

      if (shouldDisconnect) {
        logger.info('Force disconnecting client', { clientId, reason });
        client.socket.close(1000, `Disconnected: ${reason}`);
        disconnectedCount++;
      }
    }

    logger.info('Force disconnect completed', { disconnectedCount, criteria });
    return disconnectedCount;
  }

  /**
   * Force refresh all subscriptions
   */
  async refreshAllSubscriptions(): Promise<void> {
    logger.info('Refreshing all subscriptions');

    for (const [subscriptionKey, subscribers] of this.subscriptions.entries()) {
      const [type, target] = subscriptionKey.split(':');
      
      for (const clientId of subscribers) {
        try {
          await this.sendInitialData(clientId, type, target);
        } catch (error) {
          logger.error('Error refreshing subscription', { clientId, subscriptionKey, error });
        }
      }
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.stop();
    logger.info('RealTimeDataService cleanup completed');
  }
}

// Export singleton instance
export const realTimeDataService = new RealTimeDataService();