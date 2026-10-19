import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { MCPServer } from '../src/server/mcp-server.js';
import { NCPMCPTransport } from '../src/internal-mcps/mcp-client-factory.js';
import { FindResultRenderer } from '../src/services/find-result-renderer.js';

jest.mock('../src/utils/global-settings.js', () => ({
  loadGlobalSettings: async () => ({
    confirmBeforeRun: { enabled: false, modifierPattern: '', vectorThreshold: 1, approvedTools: [] },
    logRotation: { enabled: false, maxDebugFiles: 0, maxProtocolLines: 0 },
    enableCodeMode: false,
    enableSkills: false,
    enablePhotonRuntime: false,
  }),
  isToolWhitelisted: async () => false,
  addToolToWhitelist: async () => {},
}));

describe('MCP result fidelity', () => {
  let server: InstanceType<typeof MCPServer> | undefined;

  afterEach(async () => {
    await server?.cleanup?.();
    server = undefined;
  });

  it('returns the original downstream result from run, including mixed blocks and protocol metadata', async () => {
    server = new MCPServer('test', false);
    const downstreamResult = {
      content: [
        { type: 'text', text: 'Created the report.' },
        { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
        { type: 'audio', data: 'YXVkaW8=', mimeType: 'audio/wav' },
        { type: 'resource', resource: { uri: 'file:///report.csv', mimeType: 'text/csv', text: 'a,b\n1,2' } },
        { type: 'resource_link', uri: 'file:///report.csv', name: 'report.csv' },
      ],
      isError: true,
      structuredContent: { reportId: 'r-123', rows: 1 },
      _meta: { 'ui/hidden': { ephemeral: true } },
    };

    (server as any).isInitialized = true;
    (server as any).orchestrator = {
      waitForInitialization: async () => {},
      find: async () => [],
      getMCPHealthStatus: () => ({ total: 0, healthy: 0, unhealthy: 0, mcps: [] }),
      run: async () => ({ success: false, content: downstreamResult.content, error: 'downstream error', mcpResult: downstreamResult }),
    };

    const result = await server.callTool('run', { tool: 'reports:create' });

    expect(result).toBe(downstreamResult);
    expect(result).toEqual(downstreamResult);
    expect(result.content).toHaveLength(5);
    expect(result.structuredContent).toEqual({ reportId: 'r-123', rows: 1 });
    expect(result.isError).toBe(true);
    expect(result._meta).toEqual({ 'ui/hidden': { ephemeral: true } });
    expect(result.content.some((block: any) => block.type === 'text' && block.text.includes('ephemeral'))).toBe(false);
  });

  it('passes the complete result through the Photon MCP transport without JSON text conversion', async () => {
    const downstreamResult = {
      content: [
        { type: 'text', text: 'ok' },
        { type: 'audio', data: 'YXVkaW8=', mimeType: 'audio/wav' },
        { type: 'resource_link', uri: 'https://example.test/report', name: 'report' },
      ],
      isError: true,
      structuredContent: { ok: false },
      _meta: { 'ui/hidden': { ephemeral: true } },
    };
    const transport = new NCPMCPTransport({
      run: async () => ({ success: false, error: 'downstream error', mcpResult: downstreamResult }),
      getConnectionNames: () => [],
      isConnected: () => true,
      getToolsForMCP: () => [],
    });

    const result = await transport.callTool('reports', 'create', {});

    expect(result).toBe(downstreamResult);
    expect(result.content).toEqual(downstreamResult.content);
    expect(result.content.some((block: any) => block.type === 'text' && block.text.includes('structuredContent'))).toBe(false);
    expect(result.isError).toBe(true);
    expect((result as any).structuredContent).toEqual({ ok: false });
    expect((result as any)._meta).toEqual({ 'ui/hidden': { ephemeral: true } });
  });

  it('omits a fixed run output schema because the selected downstream tool controls the result shape', () => {
    server = new MCPServer('test', false);
    const runTool = (server as any).getToolDefinitions().find((tool: any) => tool.name === 'run');
    expect(runTool).not.toHaveProperty('outputSchema');
  });

  it('preserves discovered descriptor metadata without rendering app metadata into find text', () => {
    server = new MCPServer('test', false);
    (server as any).supportsCapability = () => true;
    const descriptor = {
      name: 'render_report',
      description: 'Render a report',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { url: { type: 'string' } } },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: 'ui://reports/view.html', csp: { resourceDomains: ['https://reports.test'] } } },
    };
    const structuredTool = (server as any).convertToStructuredTool({
      toolName: 'reports:render_report',
      confidence: 0.9,
      descriptor,
    });

    expect(structuredTool.outputSchema).toEqual(descriptor.outputSchema);
    expect(structuredTool.annotations).toEqual(descriptor.annotations);
    expect(structuredTool._meta.ui).toEqual(descriptor._meta.ui);
    expect(structuredTool._meta.ncp.uiHints).toBeDefined();

    const text = FindResultRenderer.render({
      tools: [structuredTool],
      pagination: { page: 1, totalPages: 1, totalResults: 1, resultsInPage: 1 },
      health: { total: 1, healthy: 1, unhealthy: 0, mcps: [{ name: 'reports', healthy: true }] },
      isListing: true,
    });
    expect(text).not.toContain('ui://reports/view.html');
    expect(text).not.toContain('reports.test');
  });
});
