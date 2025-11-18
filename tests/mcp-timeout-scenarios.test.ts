/**
 * MCP Timeout Scenario Tests
 * Tests that would have caught the blocking bug during indexing
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MCPServer } from '../src/server/mcp-server.js';

describe('MCP Timeout Prevention Tests', () => {
  let server: MCPServer;
  let timeoutIds: NodeJS.Timeout[] = [];

  beforeEach(() => {
    server = new MCPServer('test', false);
    timeoutIds = [];
  });

  afterEach(async () => {
    // Clear all pending timeouts
    timeoutIds.forEach(id => clearTimeout(id));
    timeoutIds = [];

    if (server) {
      await server.waitForInitialization();
      await server.cleanup?.();
    }
  });

  describe('Indexing Timeout Scenarios', () => {
    it('should never timeout on tools/list during heavy indexing', async () => {
      // Simulate the exact scenario where the bug occurred:
      // Large profile with many MCPs being indexed

      // Don't await initialization (simulating background indexing)
      const initPromise = server.initialize();

      // Multiple rapid-fire tools/list requests (like Claude Desktop does)
      const requests = Array.from({ length: 10 }, (_, i) =>
        Promise.race([
          server.handleRequest({
            jsonrpc: '2.0',
            id: `timeout-test-${i}`,
            method: 'tools/list'
          }),
          // Fail if any request takes more than 1 second
          new Promise((_, reject) => {
            const timeoutId = setTimeout(() => reject(new Error(`Request ${i} timed out`)), 1000);
            timeoutIds.push(timeoutId);
          })
        ])
      );

      // All requests should complete without timeout
      const responses = await Promise.all(requests);

      // Verify all responses are valid
      responses.forEach((response: any, i) => {
        expect(response).toBeDefined();
        expect(response?.result?.tools).toBeDefined();
        expect(response?.id).toBe(`timeout-test-${i}`);
      });

      // Wait for initialization to complete
      await initPromise;
    });

    it('should respond to initialize within 100ms even with slow indexing', async () => {
      const timeout = new Promise((_, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('Initialize timed out')), 100);
        timeoutIds.push(timeoutId);
      });

      const response = Promise.resolve(server.handleRequest({
        jsonrpc: '2.0',
        id: 'init-timeout-test',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {}
        }
      }));

      // Should complete before timeout
      const result = await Promise.race([response, timeout]);

      expect(result).toBeDefined();
      expect((result as any).result?.serverInfo?.name).toBe('ncp');
    });

    it('should handle burst requests during indexing startup', async () => {
      // Simulate Claude Desktop connecting and making rapid requests
      const burstRequests = [
        server.handleRequest({
          jsonrpc: '2.0',
          id: 'burst-1',
          method: 'initialize',
          params: { protocolVersion: '2024-11-05', capabilities: {} }
        }),
        server.handleRequest({
          jsonrpc: '2.0',
          id: 'burst-2',
          method: 'tools/list'
        }),
        server.handleRequest({
          jsonrpc: '2.0',
          id: 'burst-3',
          method: 'tools/list'
        }),
        server.handleRequest({
          jsonrpc: '2.0',
          id: 'burst-4',
          method: 'tools/call',
          params: { name: 'find', arguments: { description: 'test' } }
        })
      ];

      // Start initialization in parallel
      const initPromise = server.initialize();

      // All burst requests should complete quickly
      const startTime = Date.now();
      const results = await Promise.all(burstRequests);
      const totalTime = Date.now() - startTime;

      expect(totalTime).toBeLessThan(2000); // Should handle burst quickly

      // Verify all responses are valid
      expect(results[0]?.result?.serverInfo).toBeDefined(); // initialize
      expect(results[1]?.result?.tools).toBeDefined(); // tools/list
      expect(results[2]?.result?.tools).toBeDefined(); // tools/list
      expect(results[3]?.result?.content).toBeDefined(); // tools/call

      await initPromise;
    });
  });

  describe('Large Profile Simulation', () => {
    it('should handle tools/list with 1000+ MCP simulation', async () => {
      // Create server that would index many MCPs (use 'all' profile)
      const largeServer = new MCPServer('all', false);

      try {
        // Don't wait for full initialization
        const initPromise = largeServer.initialize();

        // Immediately request tools/list (the failing scenario)
        const startTime = Date.now();
        const response = await largeServer.handleRequest({
          jsonrpc: '2.0',
          id: 'large-profile-test',
          method: 'tools/list'
        });
        const responseTime = Date.now() - startTime;

        // Should respond quickly even with large profile
        expect(responseTime).toBeLessThan(500);
        expect(response).toBeDefined();
        expect(response?.result?.tools).toBeDefined();

        await initPromise;
      } finally {
        await largeServer.cleanup?.();
      }
    });
  });

  describe('Race Condition Tests', () => {
    it('should handle concurrent initialization and requests', async () => {
      // Start multiple operations simultaneously
      const operations = [
        server.initialize(),
        server.handleRequest({
          jsonrpc: '2.0',
          id: 'race-1',
          method: 'tools/list'
        }),
        server.handleRequest({
          jsonrpc: '2.0',
          id: 'race-2',
          method: 'tools/list'
        })
      ];

      // All should complete without hanging
      const results = await Promise.all(operations);

      // Verify responses (skip initialization result)
      expect(results[1]).toBeDefined();
      expect(results[2]).toBeDefined();
      expect((results[1] as any).result?.tools).toBeDefined();
      expect((results[2] as any).result?.tools).toBeDefined();
    });
  });
});