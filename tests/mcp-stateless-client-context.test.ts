import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
  type ServerContext,
} from '@modelcontextprotocol/server';
import { MCPServer } from '../src/server/mcp-server.js';

describe('MCP stateless request client context', () => {
  let server: MCPServer | undefined;

  afterEach(async () => {
    await server?.cleanup?.();
    server = undefined;
  });

  it('continues to negotiate the 2025-11-25 protocol revision', async () => {
    server = new MCPServer('test', false);
    expect((server as any).server._supportedProtocolVersions).toContain('2025-11-25');
  });

  it('uses the modern request envelope for downstream identity and structured find results', async () => {
    server = new MCPServer('test', false);
    const internal = server as any;
    const orchestrator = internal.orchestrator;
    const setClientInfo = jest.spyOn(orchestrator, 'setClientInfo');

    const ctx = {
      mcpReq: {
        id: 'modern-request',
        method: 'tools/call',
        envelope: {
          [PROTOCOL_VERSION_META_KEY]: '2026-07-28',
          [CLIENT_INFO_META_KEY]: { name: 'ModernHost', version: '9.2.1' },
          [CLIENT_CAPABILITIES_META_KEY]: {},
        },
      },
    } as unknown as ServerContext;

    // This is the same per-request context the SDK supplies to modern
    // stateless handlers; it deliberately does not depend on oninitialized.
    internal.updateClientContextFromRequest(ctx);

    expect(setClientInfo).toHaveBeenLastCalledWith({ name: 'ModernHost', version: '9.2.1' });
    expect(internal.clientIdentity).toBe('ModernHost@9.2.1');
    expect(server?.getClientCapabilities()).toContain('structuredContent');

    jest.spyOn(orchestrator, 'waitForInitialization').mockResolvedValue(undefined);
    jest.spyOn(orchestrator, 'find').mockResolvedValue([{
      mcpName: 'mock-mcp',
      toolName: 'mock-mcp:lookup_item',
      description: 'Look up an item',
      confidence: 0.97,
      schema: { type: 'object', properties: { id: { type: 'string' } } },
    }]);
    jest.spyOn(orchestrator, 'getIndexingProgress').mockReturnValue(null);
    jest.spyOn(orchestrator, 'getMCPHealthStatus').mockReturnValue({
      total: 1,
      healthy: 1,
      unhealthy: 0,
      mcps: [{ name: 'mock-mcp', healthy: true }],
    });

    const result = await internal.handleFind({});
    expect(result.structuredContent.tools).toHaveLength(1);
    expect(result.structuredContent.tools[0].tool).toBe('lookup_item');
  });
});
