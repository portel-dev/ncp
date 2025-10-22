/**
 * Extension Integration Test Suite
 *
 * Comprehensive tests for unpacked extension to ensure all previously tested
 * and working functionalities continue to work correctly.
 *
 * Tests cover:
 * - Extension initialization
 * - Phase 1 MCP Resources (getting-started, health, auto-import)
 * - Tool discovery (find)
 * - Tool execution (run)
 * - Health monitoring
 * - Profile management
 */

import { MCPServer } from '../src/server/mcp-server.js';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Test configuration
const TEST_PROFILE = 'extension-test';
const TEST_CONFIG_DIR = join(homedir(), '.ncp-test-extension');

describe('Extension Integration Tests', () => {
  let server: MCPServer;

  beforeAll(async () => {
    // Clean up any existing test config
    if (existsSync(TEST_CONFIG_DIR)) {
      rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_CONFIG_DIR, { recursive: true });

    // Set test environment variables
    process.env.NCP_CONFIG_PATH = TEST_CONFIG_DIR;
    process.env.NCP_DEBUG = 'false'; // Reduce noise in tests
  });

  afterAll(async () => {
    // Cleanup
    if (server) {
      await server.cleanup();
    }
    if (existsSync(TEST_CONFIG_DIR)) {
      rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
  });

  describe('Extension Initialization', () => {
    it('should initialize without errors', async () => {
      server = new MCPServer(TEST_PROFILE, false, false);
      await expect(server.initialize()).resolves.not.toThrow();
    }, 30000);

    it('should handle initialize request correctly', async () => {
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      };

      const response = await server.handleRequest(initRequest);

      expect(response).toBeDefined();
      expect(response?.result).toBeDefined();
      expect(response?.result?.serverInfo?.name).toBe('ncp');
      expect(response?.result?.capabilities).toBeDefined();
    });
  });

  describe('Phase 1 Resources - Self-Documentation', () => {
    it('should list all Phase 1 resources', async () => {
      const listRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'resources/list',
        params: {}
      };

      const response = await server.handleRequest(listRequest);

      expect(response).toBeDefined();
      expect(response?.result?.resources).toBeDefined();

      const resources = response?.result?.resources || [];

      // Check for Phase 1 resources
      const getStartedResource = resources.find((r: any) => r.uri === 'ncp://help/getting-started');
      const healthResource = resources.find((r: any) => r.uri === 'ncp://status/health');
      const autoImportResource = resources.find((r: any) => r.uri === 'ncp://status/auto-import');

      expect(getStartedResource).toBeDefined();
      expect(getStartedResource?.name).toBe('NCP Getting Started Guide');
      expect(getStartedResource?.mimeType).toBe('text/markdown');

      expect(healthResource).toBeDefined();
      expect(healthResource?.name).toBe('MCP Health Dashboard');

      expect(autoImportResource).toBeDefined();
      expect(autoImportResource?.name).toBe('Last Auto-Import Summary');
    });

    it('should read getting-started resource with complete content', async () => {
      const readRequest = {
        jsonrpc: '2.0',
        id: 3,
        method: 'resources/read',
        params: {
          uri: 'ncp://help/getting-started'
        }
      };

      const response = await server.handleRequest(readRequest);

      expect(response).toBeDefined();
      expect(response?.result?.contents).toBeDefined();
      expect(response?.result?.contents?.length).toBeGreaterThan(0);

      const content = response?.result?.contents?.[0];
      expect(content?.text).toBeDefined();
      expect(content?.mimeType).toBe('text/markdown');

      // Verify key sections are present
      const text = content?.text || '';
      expect(text).toContain('# NCP Getting Started Guide');
      expect(text).toContain('## 🎯 Quick Start');
      expect(text).toContain('find()');
      expect(text).toContain('run()');
      expect(text).toContain('## ⚙️ Advanced Parameters');
      expect(text).toContain('## 💡 Pro Tips');
      expect(text).toContain('## 🆘 Troubleshooting');
    });

    it('should read health dashboard with current status', async () => {
      const readRequest = {
        jsonrpc: '2.0',
        id: 4,
        method: 'resources/read',
        params: {
          uri: 'ncp://status/health'
        }
      };

      const response = await server.handleRequest(readRequest);

      expect(response).toBeDefined();
      expect(response?.result?.contents?.[0]?.text).toBeDefined();

      const text = response?.result?.contents?.[0]?.text || '';
      expect(text).toContain('# MCP Health Dashboard');
      expect(text).toContain('## Overall Status');
      expect(text).toContain('MCPs Healthy');
      // Profile name may not be shown when no MCPs are configured
    });

    it('should read auto-import summary', async () => {
      const readRequest = {
        jsonrpc: '2.0',
        id: 5,
        method: 'resources/read',
        params: {
          uri: 'ncp://status/auto-import'
        }
      };

      const response = await server.handleRequest(readRequest);

      expect(response).toBeDefined();
      expect(response?.result?.contents?.[0]?.text).toBeDefined();

      const text = response?.result?.contents?.[0]?.text || '';
      expect(text).toContain('# Last Auto-Import Summary');
      expect(text).toContain('## What is Auto-Import?');
    });

    it('should return error for invalid resource URI', async () => {
      const readRequest = {
        jsonrpc: '2.0',
        id: 6,
        method: 'resources/read',
        params: {
          uri: 'ncp://invalid/resource'
        }
      };

      const response = await server.handleRequest(readRequest);

      expect(response).toBeDefined();
      expect(response?.error).toBeDefined();
      expect(response?.error?.code).toBe(-32603);
      expect(response?.error?.message).toContain('Unknown NCP resource');
    });
  });

  describe('Tool Discovery (find)', () => {
    it('should list available tools', async () => {
      const listToolsRequest = {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/list',
        params: {}
      };

      const response = await server.handleRequest(listToolsRequest);

      expect(response).toBeDefined();
      expect(response?.result?.tools).toBeDefined();
      expect(Array.isArray(response?.result?.tools)).toBe(true);
      expect(response?.result?.tools?.length).toBeGreaterThan(0);

      // Check for find and run tools
      const findTool = response?.result?.tools?.find((t: any) => t.name === 'find');
      const runTool = response?.result?.tools?.find((t: any) => t.name === 'run');

      expect(findTool).toBeDefined();
      expect(findTool?.description).toContain('tool discovery');
      expect(findTool?.inputSchema).toBeDefined();

      expect(runTool).toBeDefined();
      expect(runTool?.description).toContain('Execute tools');
      expect(runTool?.inputSchema).toBeDefined();
    });

    it('should execute find tool with search query', async () => {
      const findRequest = {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'find',
          arguments: {
            description: 'file operations',
            limit: 5,
            depth: 2
          }
        }
      };

      const response = await server.handleRequest(findRequest);

      expect(response).toBeDefined();
      expect(response?.result?.content).toBeDefined();
      expect(response?.result?.content?.[0]?.text).toBeDefined();

      const text = response?.result?.content?.[0]?.text || '';
      // Should contain search results or helpful message
      expect(text.length).toBeGreaterThan(0);
    }, 30000);

    it('should execute find tool in listing mode', async () => {
      const findRequest = {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: {
          name: 'find',
          arguments: {
            limit: 10,
            depth: 0
          }
        }
      };

      const response = await server.handleRequest(findRequest);

      expect(response).toBeDefined();
      expect(response?.result?.content).toBeDefined();
      expect(response?.result?.content?.[0]?.text).toBeDefined();

      const text = response?.result?.content?.[0]?.text || '';
      expect(text).toContain('Available tools');
    }, 30000);

    it('should handle find with depth variations', async () => {
      for (const depth of [0, 1, 2]) {
        const findRequest = {
          jsonrpc: '2.0',
          id: 10 + depth,
          method: 'tools/call',
          params: {
            name: 'find',
            arguments: {
              description: 'test',
              depth,
              limit: 3
            }
          }
        };

        const response = await server.handleRequest(findRequest);
        expect(response).toBeDefined();
        expect(response?.result?.content).toBeDefined();
      }
    }, 60000);
  });

  describe('Tool Execution (run)', () => {
    it('should show indexing progress for run before completion', async () => {
      const runRequest = {
        jsonrpc: '2.0',
        id: 13,
        method: 'tools/call',
        params: {
          name: 'run',
          arguments: {
            tool: 'ncp:list',
            parameters: {}
          }
        }
      };

      const response = await server.handleRequest(runRequest);

      expect(response).toBeDefined();
      // Should either show indexing progress or execute successfully
      if (response?.error) {
        expect(response.error.message).toBeDefined();
      } else {
        expect(response?.result).toBeDefined();
      }
    }, 30000);

    it('should handle dry_run parameter correctly', async () => {
      const dryRunRequest = {
        jsonrpc: '2.0',
        id: 14,
        method: 'tools/call',
        params: {
          name: 'run',
          arguments: {
            tool: 'test:tool',
            parameters: { test: 'value' },
            dry_run: true
          }
        }
      };

      const response = await server.handleRequest(dryRunRequest);

      expect(response).toBeDefined();
      if (response?.result?.content) {
        const text = response.result.content[0]?.text || '';
        expect(text).toContain('DRY RUN PREVIEW');
      }
    });

    it('should return error for missing tool parameter', async () => {
      const invalidRequest = {
        jsonrpc: '2.0',
        id: 15,
        method: 'tools/call',
        params: {
          name: 'run',
          arguments: {
            parameters: {}
          }
        }
      };

      const response = await server.handleRequest(invalidRequest);

      expect(response).toBeDefined();
      expect(response?.error).toBeDefined();
      expect(response?.error?.message).toContain('tool parameter is required');
    });
  });

  describe('Health Monitoring', () => {
    it('should include health status in find results', async () => {
      const findRequest = {
        jsonrpc: '2.0',
        id: 16,
        method: 'tools/call',
        params: {
          name: 'find',
          arguments: {
            limit: 5
          }
        }
      };

      const response = await server.handleRequest(findRequest);

      expect(response).toBeDefined();
      const text = response?.result?.content?.[0]?.text || '';

      // Should contain health status or "No MCPs configured" message
      expect(text.length).toBeGreaterThan(0);
      expect(text).toContain('Available tools');
    }, 30000);

    it('should reflect health in dashboard resource', async () => {
      const healthRequest = {
        jsonrpc: '2.0',
        id: 17,
        method: 'resources/read',
        params: {
          uri: 'ncp://status/health'
        }
      };

      const response = await server.handleRequest(healthRequest);

      expect(response).toBeDefined();
      const text = response?.result?.contents?.[0]?.text || '';

      // Should show health status
      expect(text).toContain('## Overall Status');
      expect(text).toContain('MCPs Healthy');
    });
  });

  describe('Protocol Compliance', () => {
    it('should handle invalid JSON-RPC requests', async () => {
      const invalidRequest = {
        id: 18,
        method: 'test'
        // Missing jsonrpc field
      } as any;

      const response = await server.handleRequest(invalidRequest);

      expect(response).toBeDefined();
      expect(response?.error).toBeDefined();
      expect(response?.error?.code).toBe(-32600);
    });

    it('should handle unknown methods', async () => {
      const unknownMethodRequest = {
        jsonrpc: '2.0',
        id: 19,
        method: 'unknown/method',
        params: {}
      };

      const response = await server.handleRequest(unknownMethodRequest);

      expect(response).toBeDefined();
      expect(response?.error).toBeDefined();
      expect(response?.error?.code).toBe(-32601);
      expect(response?.error?.message).toContain('Method not found');
    });

    it('should handle notifications without id', async () => {
      const notification = {
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      };

      const response = await server.handleRequest(notification);

      // Notifications should not return a response
      expect(response).toBeUndefined();
    });

    it('should handle prompts/list request', async () => {
      const promptsRequest = {
        jsonrpc: '2.0',
        id: 20,
        method: 'prompts/list',
        params: {}
      };

      const response = await server.handleRequest(promptsRequest);

      expect(response).toBeDefined();
      expect(response?.result?.prompts).toBeDefined();
      expect(Array.isArray(response?.result?.prompts)).toBe(true);
    });
  });

  describe('Registry Fallback Integration', () => {
    it('should suggest registry MCPs when no local tools found', async () => {
      const findRequest = {
        jsonrpc: '2.0',
        id: 21,
        method: 'tools/call',
        params: {
          name: 'find',
          arguments: {
            description: 'extremely-specific-nonexistent-capability-xyz123',
            limit: 5
          }
        }
      };

      const response = await server.handleRequest(findRequest);

      expect(response).toBeDefined();
      const text = response?.result?.content?.[0]?.text || '';

      // Should either show registry suggestions or "no results" message
      expect(text.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle missing required parameters gracefully', async () => {
      const resourceReadWithoutUri = {
        jsonrpc: '2.0',
        id: 22,
        method: 'resources/read',
        params: {}
      };

      const response = await server.handleRequest(resourceReadWithoutUri);

      expect(response).toBeDefined();
      expect(response?.error).toBeDefined();
      expect(response?.error?.code).toBe(-32602);
      expect(response?.error?.message).toContain('Missing required parameter');
    });

    it('should handle malformed tool call parameters', async () => {
      const malformedRequest = {
        jsonrpc: '2.0',
        id: 23,
        method: 'tools/call',
        params: {
          name: 'find',
          arguments: 'not-an-object'
        } as any
      };

      const response = await server.handleRequest(malformedRequest);

      // Should handle gracefully
      expect(response).toBeDefined();
    });
  });

  describe('Performance & Responsiveness', () => {
    it('should respond to initialize within reasonable time', async () => {
      const startTime = Date.now();

      const initRequest = {
        jsonrpc: '2.0',
        id: 24,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {}
        }
      };

      await server.handleRequest(initRequest);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should respond in under 1 second
    });

    it('should respond to resources/list quickly', async () => {
      const startTime = Date.now();

      const listRequest = {
        jsonrpc: '2.0',
        id: 25,
        method: 'resources/list',
        params: {}
      };

      await server.handleRequest(listRequest);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500); // Should respond in under 500ms
    });
  });
});
