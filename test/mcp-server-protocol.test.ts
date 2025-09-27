/**
 * MCP Server Protocol Integration Tests
 * Tests the actual MCP protocol behavior during different server states
 *
 * CRITICAL: These tests would have caught the indexing blocking bug
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MCPServer } from '../src/server/mcp-server.js';

describe('MCP Server Protocol Integration', () => {
  let server: MCPServer;

  beforeEach(() => {
    // Use a test profile with minimal MCPs to speed up tests
    server = new MCPServer('test', false); // No progress spinner in tests
  });

  afterEach(async () => {
    if (server) {
      await server.cleanup?.();
    }
  });

  describe('Protocol Responsiveness During Initialization', () => {
    it('should respond to tools/list IMMEDIATELY even during indexing', async () => {
      // Start server initialization (but don't await it)
      const initPromise = server.initialize();

      // CRITICAL TEST: tools/list should respond immediately, not wait for indexing
      const startTime = Date.now();
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 'test-1',
        method: 'tools/list'
      });
      const responseTime = Date.now() - startTime;

      // Should respond within 100ms, not wait for full indexing
      expect(responseTime).toBeLessThan(100);
      expect(response?.result?.tools).toBeDefined();
      expect(response?.result?.tools).toHaveLength(2); // find + run

      // Wait for initialization to complete
      await initPromise;
    });

    it('should respond to initialize request immediately', async () => {
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 'test-init',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {}
        }
      });

      expect(response?.result?.protocolVersion).toBe('2024-11-05');
      expect(response?.result?.capabilities).toBeDefined();
      expect(response?.result?.serverInfo?.name).toBe('ncp');
    });

    it('should show progress when find is called during indexing', async () => {
      // Start initialization but don't wait
      const initPromise = server.initialize();

      // Call find during indexing - should get progress message
      const response = await server.handleFind(
        { jsonrpc: '2.0', id: 'test-find', method: 'tools/call' },
        { description: 'test query' }
      );

      // Should get either results or progress message, but not hang
      expect(response).toBeDefined();
      expect(response.result?.content).toBeDefined();

      const content = response.result.content[0]?.text;
      // Either got results or indexing progress message
      expect(
        content.includes('Found tools') || content.includes('Indexing in progress')
      ).toBe(true);

      await initPromise;
    });

    it('should handle concurrent tools/list requests during indexing', async () => {
      // Start initialization
      const initPromise = server.initialize();

      // Send multiple concurrent tools/list requests
      const requests = Array.from({ length: 5 }, (_, i) =>
        server.handleRequest({
          jsonrpc: '2.0',
          id: `concurrent-${i}`,
          method: 'tools/list'
        })
      );

      // All should respond quickly without hanging
      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      // All requests combined should complete quickly
      expect(totalTime).toBeLessThan(500);

      // All should return valid tool lists
      responses.forEach(response => {
        expect(response?.result?.tools).toHaveLength(2);
      });

      await initPromise;
    });
  });

  describe('Protocol Error Handling', () => {
    it('should handle invalid JSON-RPC requests gracefully', async () => {
      await server.initialize();

      const response = await server.handleRequest({
        // Missing required fields
        method: 'tools/list'
      } as any);

      expect(response?.error?.code).toBe(-32600);
      expect(response?.error?.message).toBe('Invalid request');
    });

    it('should handle unknown methods', async () => {
      await server.initialize();

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 'test',
        method: 'unknown/method'
      });

      expect(response?.error?.code).toBe(-32601);
      expect(response?.error?.message).toContain('Method not found');
    });
  });

  describe('Performance Requirements', () => {
    it('should respond to tools/list within 50ms after initialization', async () => {
      await server.initialize();

      const startTime = Date.now();
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 'perf-test',
        method: 'tools/list'
      });
      const responseTime = Date.now() - startTime;

      expect(responseTime).toBeLessThan(50);
      expect(response?.result?.tools).toBeDefined();
    });

    it('should handle tools/call within reasonable time', async () => {
      await server.initialize();

      const startTime = Date.now();
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 'call-test',
        method: 'tools/call',
        params: {
          name: 'find',
          arguments: { description: 'test' }
        }
      });
      const responseTime = Date.now() - startTime;

      // Should respond within 2 seconds even for complex queries
      expect(responseTime).toBeLessThan(2000);
      expect(response?.result).toBeDefined();
    });
  });

  describe('State Management', () => {
    it('should maintain correct initialization state', async () => {
      // Before initialization
      const preInitResponse = await server.handleRequest({
        jsonrpc: '2.0',
        id: 'pre-init',
        method: 'tools/list'
      });

      // Should still respond (not block)
      expect(preInitResponse?.result?.tools).toBeDefined();

      // After initialization
      await server.initialize();

      const postInitResponse = await server.handleRequest({
        jsonrpc: '2.0',
        id: 'post-init',
        method: 'tools/list'
      });

      expect(postInitResponse?.result?.tools).toHaveLength(2);
    });
  });
});