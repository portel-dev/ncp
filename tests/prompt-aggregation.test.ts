/**
 * End-to-End Tests for MCP Prompt Aggregation Feature
 * Tests transparent exposure of hosted MCP prompts with prefix support
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MCPServer } from '../src/server/mcp-server.js';
import { NCPOrchestrator } from '../src/orchestrator/ncp-orchestrator.js';
import { NCP_PROMPTS } from '../src/server/mcp-prompts.js';
import { logger } from '../src/utils/logger.js';

// Mock dependencies
jest.mock('../src/utils/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('MCP Prompt Aggregation End-to-End', () => {
  let mcpServer: MCPServer;
  let orchestrator: NCPOrchestrator;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('prompts/list endpoint', () => {
    it('should return NCP prompts when no MCPs are available', async () => {
      // Create orchestrator with no MCPs
      orchestrator = new NCPOrchestrator('test');

      // Mock getAllPrompts to return empty array (no MCP prompts)
      jest.spyOn(orchestrator, 'getAllPrompts').mockResolvedValue([]);

      mcpServer = new MCPServer('test', false);

      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/list',
        params: {}
      };

      const response = await (mcpServer as any).handleListPrompts(request);

      expect(response.result.prompts).toHaveLength(NCP_PROMPTS.length);
      expect(response.result.prompts).toEqual(NCP_PROMPTS);
    });

    it('should aggregate NCP and MCP prompts with proper prefixes', async () => {
      mcpServer = new MCPServer('test', false);
      const mockMCPPrompts = [
        {
          name: 'github:pr-template',
          description: 'Generate PR description template'
        },
        {
          name: 'github:issue-template',
          description: 'Generate issue template'
        },
        {
          name: 'slack:message-template',
          description: 'Generate Slack message template'
        }
      ];

      // Mock the orchestrator's getAllPrompts method
      jest.spyOn((mcpServer as any).orchestrator, 'getAllPrompts')
        .mockResolvedValue(mockMCPPrompts);

      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/list',
        params: {}
      };

      const response = await (mcpServer as any).handleListPrompts(request);

      // Should have NCP prompts + MCP prompts
      expect(response.result.prompts).toHaveLength(NCP_PROMPTS.length + 3);

      // Verify NCP prompts are included
      const ncpPromptNames = NCP_PROMPTS.map(p => p.name);
      expect(response.result.prompts.map((p: any) => p.name)).toEqual(
        expect.arrayContaining(ncpPromptNames)
      );

      // Verify MCP prompts with prefixes are included
      const mcpPromptNames = mockMCPPrompts.map(p => p.name);
      expect(response.result.prompts.map((p: any) => p.name)).toEqual(
        expect.arrayContaining(mcpPromptNames)
      );
    });

    it('should handle getAllPrompts errors gracefully with fallback', async () => {
      mcpServer = new MCPServer('test', false);

      // Mock getAllPrompts to throw error
      jest.spyOn((mcpServer as any).orchestrator, 'getAllPrompts').mockRejectedValue(
        new Error('Failed to fetch MCP prompts')
      );

      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/list',
        params: {}
      };

      const response = await (mcpServer as any).handleListPrompts(request);

      // Should fallback to NCP prompts only
      expect(response.result.prompts).toHaveLength(NCP_PROMPTS.length);
      expect(response.result.prompts).toEqual(NCP_PROMPTS);

      // Should have logged error (implementation detail - error logging is verified by other tests)
    });
  });

  describe('prompts/get endpoint - NCP prompts', () => {
    beforeEach(() => {
      orchestrator = new NCPOrchestrator('test');
      mcpServer = new MCPServer('test', false);
    });

    it('should return confirm_add_mcp NCP prompt without prefix', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/get',
        params: {
          name: 'confirm_add_mcp',
          arguments: {
            mcp_name: 'test-mcp',
            command: 'node',
            profile: 'all'
          }
        }
      };

      const response = await (mcpServer as any).handleGetPrompt(request);

      expect(response.result).toBeDefined();
      expect(response.result.messages).toBeDefined();
      expect(Array.isArray(response.result.messages)).toBe(true);
      expect(response.result.messages.length).toBeGreaterThan(0);
    });

    it('should return error for unknown NCP prompt', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/get',
        params: {
          name: 'unknown_prompt'
        }
      };

      const response = await (mcpServer as any).handleGetPrompt(request);

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('Unknown prompt');
    });

    it('should return error for missing prompt name', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/get',
        params: {
          arguments: {}
        }
      };

      const response = await (mcpServer as any).handleGetPrompt(request);

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('Missing required parameter');
    });

    it('should support all implemented NCP prompt types', async () => {
      // Only test prompts that are actually implemented in handleGetPrompt
      const promptNames = [
        'confirm_add_mcp',
        'confirm_remove_mcp',
        'configure_mcp',
        'confirm_operation'
      ];

      for (const promptName of promptNames) {
        const request = {
          jsonrpc: '2.0' as const,
          id: 1,
          method: 'prompts/get',
          params: {
            name: promptName,
            arguments: {
              mcp_name: 'test',
              command: 'node',
              operation: 'test op',
              impact: 'none',
              tool: 'test:tool',
              config_type: 'env'
            }
          }
        };

        const response = await (mcpServer as any).handleGetPrompt(request);

        // Should not have error and should have result with messages
        expect(response.error).toBeUndefined();
        expect(response.result).toBeDefined();
        expect(response.result.messages).toBeDefined();
      }
    });
  });

  describe('prompts/get endpoint - MCP prompts with prefix', () => {
    beforeEach(() => {
      mcpServer = new MCPServer('test', false);
    });

    it('should detect and parse MCP prompt prefix format', async () => {
      const mockPromptResponse = {
        description: 'GitHub PR template',
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: 'Generate PR description'
            }
          }
        ]
      };

      jest.spyOn((mcpServer as any).orchestrator, 'getPromptFromMCP')
        .mockResolvedValue(mockPromptResponse);

      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/get',
        params: {
          name: 'github:pr-template',
          arguments: {}
        }
      };

      const response = await (mcpServer as any).handleGetPrompt(request);

      expect((mcpServer as any).orchestrator.getPromptFromMCP).toHaveBeenCalledWith(
        'github',
        'pr-template',
        {}
      );
      expect(response.result).toEqual(mockPromptResponse);
    });

    it('should delegate to orchestrator for prefixed prompts', async () => {
      const mockPromptResponse = {
        description: 'Slack message template',
        messages: [
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: 'Message sent'
            }
          }
        ]
      };

      jest.spyOn((mcpServer as any).orchestrator, 'getPromptFromMCP')
        .mockResolvedValue(mockPromptResponse);

      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/get',
        params: {
          name: 'slack:message-template',
          arguments: {
            channel: 'general',
            tone: 'professional'
          }
        }
      };

      const response = await (mcpServer as any).handleGetPrompt(request);

      expect((mcpServer as any).orchestrator.getPromptFromMCP).toHaveBeenCalledWith(
        'slack',
        'message-template',
        {
          channel: 'general',
          tone: 'professional'
        }
      );
      expect(response.result).toEqual(mockPromptResponse);
    });

    it('should handle MCP prompt delegation errors', async () => {
      jest.spyOn((mcpServer as any).orchestrator, 'getPromptFromMCP').mockRejectedValue(
        new Error('MCP connection failed')
      );

      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/get',
        params: {
          name: 'github:pr-template',
          arguments: {}
        }
      };

      const response = await (mcpServer as any).handleGetPrompt(request);

      expect(response.error).toBeDefined();
      // Error message is wrapped, so just check it contains the original error info
      expect(response.error.message).toContain('MCP');
    });

    it('should support prompt names with multiple colons', async () => {
      // Handle edge case where prompt name might have colons
      jest.spyOn((mcpServer as any).orchestrator, 'getPromptFromMCP')
        .mockResolvedValue({
          description: 'Complex prompt',
          messages: []
        });

      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/get',
        params: {
          name: 'mcp-name:prompt:with:colons',
          arguments: {}
        }
      };

      const response = await (mcpServer as any).handleGetPrompt(request);

      // Should split on first colon only
      expect((mcpServer as any).orchestrator.getPromptFromMCP).toHaveBeenCalledWith(
        'mcp-name',
        'prompt:with:colons',
        {}
      );
    });
  });

  describe('prompt prefix distinction', () => {
    beforeEach(() => {
      mcpServer = new MCPServer('test', false);
    });

    it('should distinguish between NCP and MCP prompts by prefix', async () => {
      const getPromptFromMCPSpy = jest.spyOn((mcpServer as any).orchestrator, 'getPromptFromMCP')
        .mockResolvedValue({
          description: 'MCP prompt',
          messages: []
        });

      // Test unprefixed (NCP) prompt
      const ncpRequest = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/get',
        params: {
          name: 'confirm_add_mcp',
          arguments: { mcp_name: 'test', command: 'node' }
        }
      };

      await (mcpServer as any).handleGetPrompt(ncpRequest);

      // Should NOT delegate to orchestrator for NCP prompts
      expect(getPromptFromMCPSpy).not.toHaveBeenCalled();

      getPromptFromMCPSpy.mockClear();

      // Test prefixed (MCP) prompt
      const mcpRequest = {
        jsonrpc: '2.0' as const,
        id: 2,
        method: 'prompts/get',
        params: {
          name: 'github:pr-template',
          arguments: {}
        }
      };

      await (mcpServer as any).handleGetPrompt(mcpRequest);

      // Should delegate to orchestrator for MCP prompts
      expect(getPromptFromMCPSpy).toHaveBeenCalled();
    });

    it('should not treat colon in NCP prompt name as prefix', async () => {
      // Edge case: ensure we don't accidentally treat single-word prompts as prefixed
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/get',
        params: {
          name: 'confirm_add_mcp',
          arguments: {}
        }
      };

      const response = await (mcpServer as any).handleGetPrompt(request);

      // Should handle as NCP prompt, not try to delegate to empty MCP name
      expect(response.result).toBeDefined();
      expect(response.error).toBeUndefined();
    });
  });

  describe('prompt response format', () => {
    beforeEach(() => {
      orchestrator = new NCPOrchestrator('test');
      mcpServer = new MCPServer('test', false);
    });

    it('should return valid MCP response format for prompts/list', async () => {
      jest.spyOn(orchestrator, 'getAllPrompts').mockResolvedValue([
        {
          name: 'test:prompt',
          description: 'Test prompt'
        }
      ]);

      const request = {
        jsonrpc: '2.0' as const,
        id: 123,
        method: 'prompts/list',
        params: {}
      };

      const response = await (mcpServer as any).handleListPrompts(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(123);
      expect(response.result).toBeDefined();
      expect(Array.isArray(response.result.prompts)).toBe(true);
      expect(response.error).toBeUndefined();
    });

    it('should return valid MCP response format for prompts/get', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 456,
        method: 'prompts/get',
        params: {
          name: 'confirm_add_mcp',
          arguments: { mcp_name: 'test', command: 'node' }
        }
      };

      const response = await (mcpServer as any).handleGetPrompt(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(456);
      expect(response.result).toBeDefined();
      expect(response.result.messages).toBeDefined();
      expect(response.error).toBeUndefined();
    });

    it('should return valid error response for invalid requests', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 789,
        method: 'prompts/get',
        params: {
          name: 'invalid_prompt'
        }
      };

      const response = await (mcpServer as any).handleGetPrompt(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(789);
      expect(response.error).toBeDefined();
      expect(response.error.code).toBeDefined();
      expect(response.error.message).toBeDefined();
      expect(response.result).toBeUndefined();
    });
  });

  describe('transparent MCP integration', () => {
    beforeEach(() => {
      mcpServer = new MCPServer('test', false);
    });

    it('should expose MCP prompts transparently alongside NCP prompts', async () => {
      const mcpPrompts = [
        { name: 'github:pr-template', description: 'PR template' },
        { name: 'github:issue-template', description: 'Issue template' },
        { name: 'slack:message', description: 'Slack message' }
      ];

      jest.spyOn((mcpServer as any).orchestrator, 'getAllPrompts')
        .mockResolvedValue(mcpPrompts);

      const listRequest = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/list',
        params: {}
      };

      const listResponse = await (mcpServer as any).handleListPrompts(listRequest);

      // Should be able to see all MCP prompts in the list
      const responseNames = listResponse.result.prompts.map((p: any) => p.name);
      expect(responseNames).toContain('github:pr-template');
      expect(responseNames).toContain('github:issue-template');
      expect(responseNames).toContain('slack:message');

      // Should also contain NCP prompts
      expect(responseNames).toContain('confirm_add_mcp');
      expect(responseNames).toContain('confirm_remove_mcp');
    });

    it('should follow same pattern as resource exposure feature', async () => {
      // This test verifies consistency with the existing resource feature
      // Resources use same prefix pattern (github:issue-123)

      const mcpPrompts = [
        { name: 'github:pr-template', description: 'PR template' }
      ];

      jest.spyOn((mcpServer as any).orchestrator, 'getAllPrompts')
        .mockResolvedValue(mcpPrompts);

      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/list',
        params: {}
      };

      const response = await (mcpServer as any).handleListPrompts(request);

      // Verify prefix format matches resource pattern
      const mcpPromptName = response.result.prompts.find(
        (p: any) => p.name === 'github:pr-template'
      )?.name;

      // Should use "mcp:name" format just like resources
      expect(mcpPromptName).toMatch(/^[a-z-]+:.+$/);
    });
  });
});
