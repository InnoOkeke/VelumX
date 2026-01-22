/**
 * End-to-End Integration Tests for Liquidity Swap Integration
 * 
 * Tests complete liquidity workflows from frontend to contract:
 * - Pool discovery and selection
 * - Add liquidity operations
 * - Remove liquidity operations
 * - Real-time data flow through WebSocket
 * - Error handling across all system components
 * - Performance under concurrent load
 * 
 * Validates Requirements: All requirements from liquidity-swap-integration spec
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';

// Import services and routes
import { liquidityService } from '../services/LiquidityService';
import { poolDiscoveryService } from '../services/PoolDiscoveryService';
import { poolAnalyticsService } from '../services/PoolAnalyticsService';
import { positionTrackingService } from '../services/PositionTrackingService';
import { realTimeDataService } from '../services/RealTimeDataService';
import liquidityRoutes from '../routes/liquidity';
import { getCache } from '../cache/redis';

// Test configuration
const TEST_PORT = 3001;
const WS_PORT = 3002;
const TEST_USER_ADDRESS = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
const TEST_TOKEN_A = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx';
const TEST_TOKEN_B = 'STX';

describe('Liquidity Integration E2E Tests', () => {
  let app: Express;
  let server: Server;
  let wsServer: WebSocketServer;

  beforeAll(async () => {
    // Setup Express app
    app = express();
    app.use(express.json());
    app.use('/api/liquidity', liquidityRoutes);

    // Start HTTP server
    server = app.listen(TEST_PORT);

    // Start WebSocket server
    wsServer = new WebSocketServer({ port: WS_PORT });
    
    // Setup WebSocket handlers
    wsServer.on('connection', (ws) => {
      realTimeDataService.handleClientConnection(ws as any);
      
      ws.on('close', () => {
        // Handle disconnection
      });
    });

    // Wait for services to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    // Cleanup
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (wsServer) {
      await new Promise<void>((resolve) => {
        wsServer.close(() => resolve());
      });
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Complete Liquidity Workflow - Pool Discovery to Add Liquidity', () => {
    it('should complete full workflow: discover pools -> select pool -> add liquidity', async () => {
      // Step 1: Discover available pools
      const poolsResponse = await request(app)
        .get('/api/liquidity/pools')
        .expect(200);

      expect(poolsResponse.body.success).toBe(true);
      expect(poolsResponse.body.data).toBeInstanceOf(Array);

      // Step 2: Get analytics for a specific pool
      const poolId = `${TEST_TOKEN_A}-${TEST_TOKEN_B}`;
      const analyticsResponse = await request(app)
        .get(`/api/liquidity/analytics/${poolId}`)
        .expect(200);

      expect(analyticsResponse.body.success).toBe(true);
      expect(analyticsResponse.body.data).toHaveProperty('tvl');
      expect(analyticsResponse.body.data).toHaveProperty('apr');
      expect(analyticsResponse.body.data).toHaveProperty('volume24h');

      // Step 3: Prepare add liquidity transaction
      const addLiquidityResponse = await request(app)
        .post('/api/liquidity/add')
        .send({
          tokenA: TEST_TOKEN_A,
          tokenB: TEST_TOKEN_B,
          amountA: '1000000', // 1 USDC (6 decimals)
          amountB: '2000000', // 2 STX (6 decimals)
          minAmountA: '995000', // 0.5% slippage
          minAmountB: '1990000',
          userAddress: TEST_USER_ADDRESS,
          gaslessMode: true,
        })
        .expect(200);

      expect(addLiquidityResponse.body.success).toBe(true);
      expect(addLiquidityResponse.body.data).toHaveProperty('contractAddress');
      expect(addLiquidityResponse.body.data).toHaveProperty('functionName');
      expect(addLiquidityResponse.body.data).toHaveProperty('functionArgs');
      expect(addLiquidityResponse.body.data.gaslessMode).toBe(true);
    });

    it('should validate parameters before preparing transaction', async () => {
      // Test with invalid amounts
      const response = await request(app)
        .post('/api/liquidity/add')
        .send({
          tokenA: TEST_TOKEN_A,
          tokenB: TEST_TOKEN_B,
          amountA: '-1000', // Invalid negative amount
          amountB: '2000000',
          minAmountA: '995000',
          minAmountB: '1990000',
          userAddress: TEST_USER_ADDRESS,
          gaslessMode: true,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('Complete Liquidity Workflow - Remove Liquidity', () => {
    it('should complete full workflow: check position -> remove liquidity', async () => {
      // Step 1: Get user positions
      const positionsResponse = await request(app)
        .get(`/api/liquidity/positions/${TEST_USER_ADDRESS}`)
        .expect(200);

      expect(positionsResponse.body.success).toBe(true);
      expect(positionsResponse.body.data).toHaveProperty('positions');
      expect(positionsResponse.body.data).toHaveProperty('totalValue');

      // Step 2: Prepare remove liquidity transaction
      const removeLiquidityResponse = await request(app)
        .post('/api/liquidity/remove')
        .send({
          tokenA: TEST_TOKEN_A,
          tokenB: TEST_TOKEN_B,
          lpTokenAmount: '500000', // 0.5 LP tokens (6 decimals)
          minAmountA: '495000',
          minAmountB: '990000',
          userAddress: TEST_USER_ADDRESS,
          gaslessMode: true,
        })
        .expect(200);

      expect(removeLiquidityResponse.body.success).toBe(true);
      expect(removeLiquidityResponse.body.data).toHaveProperty('contractAddress');
      expect(removeLiquidityResponse.body.data).toHaveProperty('functionName');
      expect(removeLiquidityResponse.body.data.functionName).toMatch(/remove-liquidity/);
    });

    it('should calculate expected output amounts when removing liquidity', async () => {
      const response = await request(app)
        .post('/api/liquidity/remove')
        .send({
          tokenA: TEST_TOKEN_A,
          tokenB: TEST_TOKEN_B,
          lpTokenAmount: '1000000', // 1 LP token
          minAmountA: '0',
          minAmountB: '0',
          userAddress: TEST_USER_ADDRESS,
          gaslessMode: false,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('expectedAmountA');
      expect(response.body.data).toHaveProperty('expectedAmountB');
    });
  });

  describe('Real-Time Data Flow Through WebSocket', () => {
    it('should receive real-time pool updates via WebSocket', async () => {
      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('WebSocket connection timeout'));
        }, 5000);

        ws.on('open', () => {
          // Subscribe to pool updates
          ws.send(JSON.stringify({
            type: 'subscribe',
            channel: 'pool',
            poolId: `${TEST_TOKEN_A}-${TEST_TOKEN_B}`,
          }));
        });

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'pool-update') {
              expect(message).toHaveProperty('poolId');
              expect(message).toHaveProperty('data');
              expect(message.data).toHaveProperty('reserveA');
              expect(message.data).toHaveProperty('reserveB');
              
              clearTimeout(timeout);
              ws.close();
              resolve();
            }
          } catch (error) {
            clearTimeout(timeout);
            ws.close();
            reject(error);
          }
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });

        // Trigger a pool update after connection
        setTimeout(() => {
          realTimeDataService.broadcastPoolUpdate(`${TEST_TOKEN_A}-${TEST_TOKEN_B}`, {
            poolId: `${TEST_TOKEN_A}-${TEST_TOKEN_B}`,
            reserveA: BigInt(1000000),
            reserveB: BigInt(2000000),
            totalSupply: BigInt(1414213),
            timestamp: new Date(),
          });
        }, 1000);
      });
    });

    it('should receive real-time position updates via WebSocket', async () => {
      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('WebSocket connection timeout'));
        }, 5000);

        ws.on('open', () => {
          // Subscribe to user position updates
          ws.send(JSON.stringify({
            type: 'subscribe',
            channel: 'positions',
            userAddress: TEST_USER_ADDRESS,
          }));
        });

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'position-update') {
              expect(message).toHaveProperty('userAddress');
              expect(message).toHaveProperty('positions');
              
              clearTimeout(timeout);
              ws.close();
              resolve();
            }
          } catch (error) {
            clearTimeout(timeout);
            ws.close();
            reject(error);
          }
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });

    it('should handle WebSocket reconnection gracefully', async () => {
      const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
      
      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      // Close connection
      ws.close();

      await new Promise<void>((resolve) => {
        ws.on('close', () => resolve());
      });

      // Reconnect
      const ws2 = new WebSocket(`ws://localhost:${WS_PORT}`);
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws2.close();
          reject(new Error('Reconnection timeout'));
        }, 5000);

        ws2.on('open', () => {
          clearTimeout(timeout);
          ws2.close();
          resolve();
        });

        ws2.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });
  });

  describe('Error Handling Across System Components', () => {
    it('should handle contract call failures gracefully', async () => {
      // Mock contract failure
      vi.spyOn(liquidityService, 'addLiquidity').mockRejectedValue(
        new Error('Contract call failed')
      );

      const response = await request(app)
        .post('/api/liquidity/add')
        .send({
          tokenA: TEST_TOKEN_A,
          tokenB: TEST_TOKEN_B,
          amountA: '1000000',
          amountB: '2000000',
          minAmountA: '995000',
          minAmountB: '1990000',
          userAddress: TEST_USER_ADDRESS,
          gaslessMode: true,
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should handle network errors with retry mechanism', async () => {
      let attempts = 0;
      vi.spyOn(poolDiscoveryService, 'getAllPools').mockImplementation(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Network timeout');
        }
        return [];
      });

      const response = await request(app)
        .get('/api/liquidity/pools')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(attempts).toBeGreaterThanOrEqual(1);
    });

    it('should handle cache failures gracefully', async () => {
      const cache = getCache();
      vi.spyOn(cache, 'get').mockRejectedValue(new Error('Cache unavailable'));

      // Should still work by falling back to direct contract calls
      const response = await request(app)
        .get('/api/liquidity/pools')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Performance Under Concurrent Load', () => {
    it('should handle multiple concurrent pool requests', async () => {
      const requests = Array.from({ length: 10 }, () =>
        request(app).get('/api/liquidity/pools')
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    it('should handle concurrent add liquidity requests', async () => {
      const requests = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/api/liquidity/add')
          .send({
            tokenA: TEST_TOKEN_A,
            tokenB: TEST_TOKEN_B,
            amountA: `${1000000 + i * 100000}`,
            amountB: `${2000000 + i * 200000}`,
            minAmountA: '995000',
            minAmountB: '1990000',
            userAddress: TEST_USER_ADDRESS,
            gaslessMode: true,
          })
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    it('should handle concurrent WebSocket connections', async () => {
      const connections = Array.from({ length: 5 }, () => {
        return new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Connection timeout'));
          }, 5000);

          ws.on('open', () => {
            clearTimeout(timeout);
            ws.close();
            resolve();
          });

          ws.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });
      });

      await expect(Promise.all(connections)).resolves.not.toThrow();
    });
  });

  describe('Cache Performance and Consistency', () => {
    it('should cache pool data and serve from cache on subsequent requests', async () => {
      const cache = getCache();
      const getSpy = vi.spyOn(cache, 'get');
      const setSpy = vi.spyOn(cache, 'set');

      // First request - should set cache
      await request(app).get('/api/liquidity/pools').expect(200);

      expect(setSpy).toHaveBeenCalled();

      // Second request - should get from cache
      await request(app).get('/api/liquidity/pools').expect(200);

      expect(getSpy).toHaveBeenCalled();
    });

    it('should invalidate cache when liquidity is added', async () => {
      const cache = getCache();
      const delSpy = vi.spyOn(cache, 'delPattern');

      await request(app)
        .post('/api/liquidity/add')
        .send({
          tokenA: TEST_TOKEN_A,
          tokenB: TEST_TOKEN_B,
          amountA: '1000000',
          amountB: '2000000',
          minAmountA: '995000',
          minAmountB: '1990000',
          userAddress: TEST_USER_ADDRESS,
          gaslessMode: true,
        })
        .expect(200);

      // Cache should be invalidated
      expect(delSpy).toHaveBeenCalled();
    });
  });
});
