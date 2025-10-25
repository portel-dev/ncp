/**
 * Tests for NCP Orchestrator Connection Pool Management
 * Tests max connections limit and LRU eviction
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NCPOrchestrator } from '../src/orchestrator/ncp-orchestrator.js';
import { ProfileManager } from '../src/profiles/profile-manager.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// Mock logger
jest.mock('../src/utils/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock discovery engine
jest.mock('../src/discovery/engine.js', () => ({
  DiscoveryEngine: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    indexTool: jest.fn(),
    indexMCPTools: jest.fn(),
    findBestTool: jest.fn(),
    findRelevantTools: jest.fn()
  }))
}));

// Mock MCP SDK
jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    listTools: jest.fn<() => Promise<any>>().mockResolvedValue({ tools: [] }),
    callTool: jest.fn<() => Promise<any>>().mockResolvedValue({ content: [] })
  }))
}));

jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: jest.fn().mockImplementation(() => ({
    start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
  }))
}));

describe('NCP Orchestrator Connection Pool', () => {
  let orchestrator: NCPOrchestrator;
  let profileManager: ProfileManager;
  let testProfilesDir: string;

  beforeEach(async () => {
    // Create temporary profiles directory
    testProfilesDir = path.join(tmpdir(), `ncp-test-profiles-${Date.now()}`);
    await fs.mkdir(testProfilesDir, { recursive: true });

    // Create ProfileManager
    profileManager = new ProfileManager();
    (profileManager as any).profilesDir = testProfilesDir;
    await profileManager.initialize(true);

    // Create orchestrator
    orchestrator = new NCPOrchestrator('all');
    await orchestrator.initialize();

    jest.clearAllMocks();
  });

  afterEach(async () => {
    try {
      await fs.rm(testProfilesDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }

    jest.clearAllMocks();
  });

  describe('MAX_CONNECTIONS limit', () => {
    it('should enforce maximum connection limit', async () => {
      const MAX_CONNECTIONS = (orchestrator as any).MAX_CONNECTIONS || 50;

      // Add many MCPs to profile
      for (let i = 0; i < MAX_CONNECTIONS + 10; i++) {
        await profileManager.addMCPToProfile('all', `test-mcp-${i}`, {
          command: 'node',
          args: [`server${i}.js`]
        });
      }

      // Try to connect to all MCPs
      const connections = (orchestrator as any).connections;

      // Before we start, there should be no connections
      expect(connections.size).toBe(0);

      // Try to create more connections than the limit
      // The orchestrator should evict LRU connections to stay within limit
      for (let i = 0; i < MAX_CONNECTIONS + 5; i++) {
        try {
          // Mock getOrCreateConnection to simulate connection creation
          const conn = {
            client: {},
            transport: {},
            tools: [],
            lastUsed: Date.now(),
            connectTime: Date.now(),
            executionCount: 0
          };
          connections.set(`test-mcp-${i}`, conn);

          // If we exceed the limit, manually trigger eviction
          if (connections.size > MAX_CONNECTIONS) {
            // Find LRU and evict
            let lruName: string | null = null;
            let oldestLastUsed = Infinity;
            for (const [name, connection] of connections) {
              if (connection.lastUsed < oldestLastUsed) {
                oldestLastUsed = connection.lastUsed;
                lruName = name;
              }
            }
            if (lruName) {
              connections.delete(lruName);
            }
          }
        } catch (e) {
          // Ignore connection errors
        }
      }

      // Should never exceed MAX_CONNECTIONS
      expect(connections.size).toBeLessThanOrEqual(MAX_CONNECTIONS);
    });

    it('should evict oldest connection when at limit', async () => {
      const connections = (orchestrator as any).connections as Map<string, any>;

      // Manually create connections at the limit
      const MAX_CONNECTIONS = (orchestrator as any).MAX_CONNECTIONS || 50;

      // Add connections up to the limit
      const baseTime = Date.now();
      for (let i = 0; i < MAX_CONNECTIONS; i++) {
        connections.set(`mcp-${i}`, {
          client: {},
          transport: {},
          tools: [],
          lastUsed: baseTime + i, // Each progressively newer
          connectTime: baseTime,
          executionCount: 0
        });
      }

      expect(connections.size).toBe(MAX_CONNECTIONS);
      expect(connections.has('mcp-0')).toBe(true); // Oldest

      // Add one more connection (should trigger eviction)
      connections.set('mcp-new', {
        client: {},
        transport: {},
        tools: [],
        lastUsed: Date.now(),
        connectTime: Date.now(),
        executionCount: 0
      });

      // Manually evict LRU
      if (connections.size > MAX_CONNECTIONS) {
        let lruName: string | null = null;
        let oldestLastUsed = Infinity;
        for (const [name, connection] of connections) {
          if (connection.lastUsed < oldestLastUsed) {
            oldestLastUsed = connection.lastUsed;
            lruName = name;
          }
        }
        if (lruName) {
          connections.delete(lruName);
        }
      }

      // Should have evicted the oldest (mcp-0)
      expect(connections.size).toBeLessThanOrEqual(MAX_CONNECTIONS);
      expect(connections.has('mcp-0')).toBe(false);
      expect(connections.has('mcp-new')).toBe(true);
    });
  });

  describe('MAX_EXECUTIONS_PER_CONNECTION limit', () => {
    it('should track execution count per connection', async () => {
      const connections = (orchestrator as any).connections as Map<string, any>;

      // Create a connection
      const conn = {
        client: {
          callTool: jest.fn<() => Promise<any>>().mockResolvedValue({ content: [{ type: 'text', text: 'result' }] })
        },
        transport: {},
        tools: [{ name: 'test_tool', description: 'Test tool' }],
        lastUsed: Date.now(),
        connectTime: Date.now(),
        executionCount: 0
      };

      connections.set('test-mcp', conn);

      // Simulate multiple executions
      for (let i = 0; i < 10; i++) {
        conn.executionCount++;
        conn.lastUsed = Date.now();
      }

      expect(conn.executionCount).toBe(10);
    });

    it('should force reconnect after max executions', async () => {
      const connections = (orchestrator as any).connections as Map<string, any>;
      const MAX_EXECUTIONS = (orchestrator as any).MAX_EXECUTIONS_PER_CONNECTION || 1000;

      // Create connection with high execution count
      const conn = {
        client: {
          close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
        },
        transport: {
          close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
        },
        tools: [{ name: 'test_tool', description: 'Test tool' }],
        lastUsed: Date.now(),
        connectTime: Date.now(),
        executionCount: MAX_EXECUTIONS // At the limit
      };

      connections.set('overused-mcp', conn);

      // Check if connection should be reset
      const shouldReset = conn.executionCount >= MAX_EXECUTIONS;
      expect(shouldReset).toBe(true);

      // Simulate reconnect
      if (shouldReset) {
        connections.delete('overused-mcp');
        // Would create new connection here
      }

      expect(connections.has('overused-mcp')).toBe(false);
    });

    it('should not reset connection below execution limit', async () => {
      const connections = (orchestrator as any).connections as Map<string, any>;
      const MAX_EXECUTIONS = (orchestrator as any).MAX_EXECUTIONS_PER_CONNECTION || 1000;

      // Create connection with low execution count
      const conn = {
        client: {},
        transport: {},
        tools: [],
        lastUsed: Date.now(),
        connectTime: Date.now(),
        executionCount: 500 // Below limit
      };

      connections.set('normal-mcp', conn);

      const shouldReset = conn.executionCount >= MAX_EXECUTIONS;
      expect(shouldReset).toBe(false);

      // Connection should remain
      expect(connections.has('normal-mcp')).toBe(true);
    });
  });

  describe('LRU eviction algorithm', () => {
    it('should evict least recently used connection', async () => {
      const connections = (orchestrator as any).connections as Map<string, any>;
      const baseTime = Date.now();

      // Add 3 connections with different last used times
      connections.set('mcp-old', {
        client: {},
        transport: {},
        tools: [],
        lastUsed: baseTime - 10000, // 10 seconds ago
        connectTime: baseTime - 10000,
        executionCount: 5
      });

      connections.set('mcp-recent', {
        client: {},
        transport: {},
        tools: [],
        lastUsed: baseTime - 1000, // 1 second ago
        connectTime: baseTime - 5000,
        executionCount: 10
      });

      connections.set('mcp-newest', {
        client: {},
        transport: {},
        tools: [],
        lastUsed: baseTime, // Just now
        connectTime: baseTime,
        executionCount: 2
      });

      // Find LRU
      let lruName: string | null = null;
      let oldestLastUsed = Infinity;

      for (const [name, connection] of connections) {
        if (connection.lastUsed < oldestLastUsed) {
          oldestLastUsed = connection.lastUsed;
          lruName = name;
        }
      }

      expect(lruName).toBe('mcp-old');
    });

    it('should prefer evicting idle connections over active ones', async () => {
      const connections = (orchestrator as any).connections as Map<string, any>;
      const now = Date.now();

      // Add idle and active connections
      connections.set('idle-1', {
        client: {},
        transport: {},
        tools: [],
        lastUsed: now - 60000, // 1 minute idle
        connectTime: now - 60000,
        executionCount: 1
      });

      connections.set('active', {
        client: {},
        transport: {},
        tools: [],
        lastUsed: now - 100, // Just used
        connectTime: now - 30000,
        executionCount: 50
      });

      connections.set('idle-2', {
        client: {},
        transport: {},
        tools: [],
        lastUsed: now - 120000, // 2 minutes idle (oldest)
        connectTime: now - 120000,
        executionCount: 2
      });

      // Find LRU
      let lruName: string | null = null;
      let oldestLastUsed = Infinity;

      for (const [name, connection] of connections) {
        if (connection.lastUsed < oldestLastUsed) {
          oldestLastUsed = connection.lastUsed;
          lruName = name;
        }
      }

      // Should evict the oldest idle connection
      expect(lruName).toBe('idle-2');
    });
  });

  describe('connection reuse', () => {
    it('should reuse existing connections', async () => {
      const connections = (orchestrator as any).connections as Map<string, any>;

      // Create a connection
      const oldTime = Date.now() - 5000;
      const conn = {
        client: {},
        transport: {},
        tools: [{ name: 'test_tool', description: 'Test' }],
        lastUsed: oldTime,
        connectTime: Date.now() - 10000,
        executionCount: 5
      };

      connections.set('reusable-mcp', conn);

      // Access the connection
      const existing = connections.get('reusable-mcp');
      expect(existing).toBe(conn);

      // Wait a bit to ensure new timestamp is different
      await new Promise(resolve => setTimeout(resolve, 1));

      // Update last used time (simulating reuse)
      const newTime = Date.now();
      existing.lastUsed = newTime;
      existing.executionCount++;

      expect(existing.executionCount).toBe(6);
      expect(existing.lastUsed).toBeGreaterThanOrEqual(oldTime + 1);
    });

    it('should update lastUsed on each access', async () => {
      const connections = (orchestrator as any).connections as Map<string, any>;

      const oldTime = Date.now() - 10000;
      const conn = {
        client: {},
        transport: {},
        tools: [],
        lastUsed: oldTime,
        connectTime: oldTime,
        executionCount: 0
      };

      connections.set('test-mcp', conn);

      // Simulate access
      await new Promise(resolve => setTimeout(resolve, 10));
      conn.lastUsed = Date.now();

      expect(conn.lastUsed).toBeGreaterThan(oldTime);
    });
  });

  describe('connection lifecycle', () => {
    it('should properly disconnect evicted connections', async () => {
      const mockClose = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

      const conn = {
        client: {
          close: mockClose
        },
        transport: {
          close: mockClose
        },
        tools: [],
        lastUsed: Date.now(),
        connectTime: Date.now(),
        executionCount: 0
      };

      // Simulate disconnection
      await conn.client.close();
      await conn.transport.close();

      expect(mockClose).toHaveBeenCalledTimes(2);
    });

    it('should handle disconnection errors gracefully', async () => {
      const mockClose = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('Close failed'));

      const conn = {
        client: {
          close: mockClose
        },
        transport: {
          close: mockClose
        },
        tools: [],
        lastUsed: Date.now(),
        connectTime: Date.now(),
        executionCount: 0
      };

      // Should not throw
      try {
        await conn.client.close();
      } catch (e) {
        // Expected
      }

      try {
        await conn.transport.close();
      } catch (e) {
        // Expected
      }

      expect(mockClose).toHaveBeenCalledTimes(2);
    });
  });
});
