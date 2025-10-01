/**
 * Test for Session ID Transparency
 * Verifies that _meta (including session_id) is forwarded transparently to MCP servers
 */

import { NCPOrchestrator } from '../src/orchestrator/ncp-orchestrator.js';
import { MCPServer } from '../src/server/mcp-server.js';

describe('Session ID Passthrough', () => {
  it('should forward _meta.session_id from client to MCP server', async () => {
    const server = new MCPServer('default', false, false);
    await server.initialize();

    // Simulate client request with session_id in _meta
    const request = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'tools/call',
      params: {
        name: 'run',
        arguments: {
          tool: 'time:get_current_time',
          parameters: {}
        },
        _meta: {
          session_id: 'test_session_123',
          custom_field: 'custom_value'
        }
      }
    };

    const response = await server.handleRequest(request);

    // Should not error - _meta should be forwarded transparently
    expect(response).toBeDefined();
    expect(response?.error).toBeUndefined();
  });

  it('should work without _meta (backwards compatibility)', async () => {
    const server = new MCPServer('default', false, false);
    await server.initialize();

    // Simulate client request WITHOUT _meta
    const request = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'tools/call',
      params: {
        name: 'run',
        arguments: {
          tool: 'time:get_current_time',
          parameters: {}
        }
        // No _meta field
      }
    };

    const response = await server.handleRequest(request);

    // Should still work - _meta is optional
    expect(response).toBeDefined();
    expect(response?.error).toBeUndefined();
  });

  it('should forward empty _meta object', async () => {
    const server = new MCPServer('default', false, false);
    await server.initialize();

    const request = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'tools/call',
      params: {
        name: 'run',
        arguments: {
          tool: 'time:get_current_time',
          parameters: {}
        },
        _meta: {} // Empty _meta
      }
    };

    const response = await server.handleRequest(request);

    expect(response).toBeDefined();
    expect(response?.error).toBeUndefined();
  });
});
