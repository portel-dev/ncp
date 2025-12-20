/**
 * Tests for ToolDiscoveryService
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  ToolDiscoveryService,
  createToolDiscoveryService,
} from '../../src/orchestrator/services/tool-discovery.js';
import type { OrchestratorContext } from '../../src/orchestrator/interfaces/orchestrator-context.js';
import type { MCPDefinition, MCPConnection } from '../../src/orchestrator/types/connection.js';
import type { ToolInfo } from '../../src/orchestrator/types/discovery.js';

// Mock dependencies
const createMockDiscoveryEngine = () => ({
  findRelevantTools: jest.fn<
    (
      desc: string,
      limit: number,
      threshold: number
    ) => Promise<Array<{ name: string; confidence: number; reason?: string; description?: string }>>
  >(),
  findBestTool: jest.fn(),
  initialize: jest.fn(),
});

const createMockHealthMonitor = () => ({
  getHealthyMCPs: jest.fn<(mcps: string[]) => string[]>(),
  markHealthy: jest.fn(),
  markUnhealthy: jest.fn(),
});

const createMockContext = (
  definitions: Map<string, MCPDefinition>,
  connections: Map<string, MCPConnection>,
  toolToMCP: Map<string, string>,
  allTools: ToolInfo[]
): OrchestratorContext => ({
  state: {
    definitions,
    connections,
    toolToMCP,
    allTools,
    skillPrompts: new Map(),
  },
  events: {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    once: jest.fn(),
  } as any,
  getService: <T>(_name: string): T => ({} as T),
  profileName: 'test',
  clientInfo: { name: 'test', version: '1.0.0' },
});

describe('ToolDiscoveryService', () => {
  let discoveryService: ToolDiscoveryService;
  let mockDiscovery: ReturnType<typeof createMockDiscoveryEngine>;
  let mockHealthMonitor: ReturnType<typeof createMockHealthMonitor>;
  let mockContext: OrchestratorContext;

  const sampleTools: ToolInfo[] = [
    { name: 'github:create_issue', description: 'Create GitHub issue', mcpName: 'github' },
    { name: 'github:list_repos', description: 'List repositories', mcpName: 'github' },
    { name: 'slack:send_message', description: 'Send Slack message', mcpName: 'slack' },
    { name: 'shell:execute', description: 'Execute shell command', mcpName: 'shell' },
  ];

  const sampleDefinitions = new Map<string, MCPDefinition>([
    [
      'github',
      {
        name: 'github',
        config: { name: 'github', command: 'mcp-github' },
        tools: [
          { name: 'create_issue', description: 'Create GitHub issue', inputSchema: { type: 'object', properties: { title: { type: 'string' } } } },
          { name: 'list_repos', description: 'List repositories', inputSchema: { type: 'object', properties: {} } },
        ],
      },
    ],
    [
      'slack',
      {
        name: 'slack',
        config: { name: 'slack', command: 'mcp-slack' },
        tools: [{ name: 'send_message', description: 'Send Slack message', inputSchema: { type: 'object', properties: { channel: { type: 'string' } } } }],
      },
    ],
    [
      'shell',
      {
        name: 'shell',
        config: { name: 'shell', command: 'mcp-shell' },
        tools: [{ name: 'execute', description: 'Execute shell command', inputSchema: { type: 'object', properties: { command: { type: 'string' } } } }],
      },
    ],
  ]);

  const sampleToolToMCP = new Map([
    ['create_issue', 'github'],
    ['list_repos', 'github'],
    ['send_message', 'slack'],
    ['execute', 'shell'],
    ['github:create_issue', 'github'],
    ['github:list_repos', 'github'],
    ['slack:send_message', 'slack'],
    ['shell:execute', 'shell'],
  ]);

  beforeEach(() => {
    mockDiscovery = createMockDiscoveryEngine();
    mockHealthMonitor = createMockHealthMonitor();
    mockContext = createMockContext(
      sampleDefinitions,
      new Map(),
      sampleToolToMCP,
      sampleTools
    );

    // Default: all MCPs are healthy
    mockHealthMonitor.getHealthyMCPs.mockImplementation((mcps) => mcps);

    discoveryService = createToolDiscoveryService(
      mockContext,
      mockDiscovery as any,
      mockHealthMonitor as any
    );
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await discoveryService.initialize();
      // Should not throw
    });

    it('should be idempotent', async () => {
      await discoveryService.initialize();
      await discoveryService.initialize();
      // Should not throw
    });
  });

  describe('find with no query', () => {
    it('should list all healthy tools when no query provided', async () => {
      const results = await discoveryService.find('');

      expect(results.length).toBe(4);
      expect(results[0].confidence).toBe(1.0);
      expect(results.every((r) => r.toolName.includes(':'))).toBe(true);
    });

    it('should respect limit when listing tools', async () => {
      const results = await discoveryService.find('', { limit: 2 });

      expect(results.length).toBe(2);
    });

    it('should filter out unhealthy MCPs when listing', async () => {
      mockHealthMonitor.getHealthyMCPs.mockImplementation((mcps) =>
        mcps.filter((m) => m !== 'slack')
      );

      const results = await discoveryService.find('');

      expect(results.some((r) => r.mcpName === 'slack')).toBe(false);
      expect(results.some((r) => r.mcpName === 'github')).toBe(true);
    });

    it('should include description and schema when detailed is true', async () => {
      const results = await discoveryService.find('', { detailed: true, limit: 2 });

      expect(results[0].description).toBeDefined();
      expect(results[0].schema).toBeDefined();
    });
  });

  describe('find with query', () => {
    it('should search using discovery engine', async () => {
      mockDiscovery.findRelevantTools.mockResolvedValue([
        { name: 'github:create_issue', confidence: 0.9, reason: 'exact match' },
        { name: 'github:list_repos', confidence: 0.5, reason: 'partial match' },
      ]);

      const results = await discoveryService.find('create issue');

      expect(mockDiscovery.findRelevantTools).toHaveBeenCalledWith(
        'create issue',
        10, // double limit
        0.35
      );
      expect(results.length).toBe(2);
      expect(results[0].toolName).toBe('github:create_issue');
    });

    it('should filter results by health', async () => {
      mockDiscovery.findRelevantTools.mockResolvedValue([
        { name: 'github:create_issue', confidence: 0.9 },
        { name: 'slack:send_message', confidence: 0.8 },
      ]);
      mockHealthMonitor.getHealthyMCPs.mockImplementation((mcps) =>
        mcps.filter((m) => m !== 'slack')
      );

      const results = await discoveryService.find('send message');

      expect(results.some((r) => r.mcpName === 'slack')).toBe(false);
    });

    it('should sort by confidence after score adjustment', async () => {
      mockDiscovery.findRelevantTools.mockResolvedValue([
        { name: 'github:list_repos', confidence: 0.8 },
        { name: 'github:create_issue', confidence: 0.7 },
      ]);

      const results = await discoveryService.find('repos');

      // First result should have higher or equal confidence
      expect(results[0].confidence).toBeGreaterThanOrEqual(results[1]?.confidence ?? 0);
    });

    it('should respect confidence threshold', async () => {
      mockDiscovery.findRelevantTools.mockResolvedValue([]);

      const results = await discoveryService.find('obscure query', {
        confidenceThreshold: 0.9,
      });

      expect(mockDiscovery.findRelevantTools).toHaveBeenCalledWith(
        'obscure query',
        10,
        0.9
      );
    });

    it('should handle special skill prefix', async () => {
      mockDiscovery.findRelevantTools.mockResolvedValue([
        { name: 'skill:my_skill', confidence: 0.8 },
      ]);

      const results = await discoveryService.find('my skill');

      // Skills use __skills__ as mcpName
      expect(results[0].mcpName).toBe('__skills__');
    });
  });

  describe('score adjustment', () => {
    it('should boost scores for exact name matches', async () => {
      mockDiscovery.findRelevantTools.mockResolvedValue([
        { name: 'github:create_issue', confidence: 0.5, description: 'Create issue' },
        { name: 'slack:send_message', confidence: 0.5, description: 'Send message' },
      ]);

      const results = await discoveryService.find('create');

      // create_issue should be boosted because "create" matches the name
      const createIssue = results.find((r) => r.toolName.includes('create'));
      const sendMessage = results.find((r) => r.toolName.includes('send'));

      expect(createIssue?.confidence).toBeGreaterThan(sendMessage?.confidence ?? 0);
    });
  });

  describe('getToolSchema', () => {
    it('should return schema from definitions', () => {
      const schema = discoveryService.getToolSchema('github', 'create_issue');

      expect(schema).toBeDefined();
      expect(schema.type).toBe('object');
      expect(schema.properties.title).toBeDefined();
    });

    it('should return undefined for unknown tool', () => {
      const schema = discoveryService.getToolSchema('unknown', 'tool');

      expect(schema).toBeUndefined();
    });
  });

  describe('getToolSchemaByIdentifier', () => {
    it('should parse identifier and return schema', () => {
      const schema = discoveryService.getToolSchemaByIdentifier('github:create_issue');

      expect(schema).toBeDefined();
      expect(schema.properties.title).toBeDefined();
    });

    it('should return undefined for invalid identifier', () => {
      const schema = discoveryService.getToolSchemaByIdentifier('invalid');

      expect(schema).toBeUndefined();
    });
  });

  describe('CLI enhancement', () => {
    it('should set CLI scanner', () => {
      const mockScanner = {
        searchTools: jest.fn<() => Promise<Array<{ name: string; description?: string; capabilities: string[] }>>>(),
      };

      discoveryService.setCLIScanner(mockScanner);
      // Should not throw
    });

    it('should enhance shell tools with CLI info when detailed', async () => {
      const mockScanner = {
        searchTools: jest.fn<() => Promise<any[]>>().mockResolvedValue([
          { name: 'git', description: 'Version control', capabilities: ['commit', 'push', 'pull'] },
        ]),
      };
      discoveryService.setCLIScanner(mockScanner);

      mockDiscovery.findRelevantTools.mockResolvedValue([
        { name: 'shell:execute', confidence: 0.8, description: 'Execute shell command' },
      ]);

      const results = await discoveryService.find('git command', { detailed: true });

      const shellTool = results.find((r) => r.toolName.includes('shell'));
      expect(shellTool?.description).toContain('git');
      expect(shellTool?.description).toContain('Relevant CLI tools');
    });
  });

  describe('error handling', () => {
    it('should fallback to healthy tools on vector search failure', async () => {
      mockDiscovery.findRelevantTools.mockRejectedValue(new Error('Vector search failed'));

      const results = await discoveryService.find('some query');

      // Should return some results from fallback (listAllTools with confidence 1.0)
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].confidence).toBe(1.0); // Fallback lists all tools
    });
  });

  describe('cleanup', () => {
    it('should cleanup without error', async () => {
      await discoveryService.cleanup();
      // Should not throw
    });
  });
});
