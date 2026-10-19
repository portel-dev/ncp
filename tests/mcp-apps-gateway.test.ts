import { afterEach, describe, expect, it } from '@jest/globals';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { McpAppsGateway, MCP_APP_HTML_MIME_TYPE } from '../src/server/mcp-apps-gateway.js';

describe('MCP Apps gateway', () => {
  const directories: string[] = [];
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map(client => client.close().catch(() => {})));
    await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
  });

  it('keeps app-only callbacks in the host catalog and routes tools/resources through real MCP stdio', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mcp-apps-gateway-'));
    directories.push(directory);
    const statePath = join(directory, 'state.json');
    await writeFile(statePath, JSON.stringify({ calls: [] }));

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', resolve('tests/fixtures/mcp-apps-gateway-stdio.ts'), statePath],
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    const client = new Client({ name: 'mcp-apps-gateway-test', version: '1.0.0' }, { capabilities: {} });
    clients.push(client);
    await client.connect(transport);

    const listed = await client.listTools();
    expect(listed.tools.map(tool => tool.name)).toEqual(['show_dashboard', 'refresh_dashboard']);
    expect(listed.tools.find(tool => tool.name === 'refresh_dashboard')?._meta).toEqual({
      ui: { visibility: ['app'] },
    });

    const shown = await client.callTool({ name: 'show_dashboard', arguments: { section: 'sales' } });
    expect(shown.structuredContent).toEqual({ args: { section: 'sales' } });

    const resource = await client.readResource({ uri: 'ui://dashboard/main' });
    expect(resource.contents[0]).toMatchObject({
      uri: 'ui://dashboard/main',
      mimeType: MCP_APP_HTML_MIME_TYPE,
      text: expect.stringContaining('dashboard'),
      _meta: { ui: { csp: { connectDomains: ['https://api.example.test'] }, prefersBorder: true } },
    });
    expect(resource._meta).toEqual({ provenance: 'dashboard-backend' });

    const callback = await client.callTool({ name: 'refresh_dashboard', arguments: { force: true } });
    expect(callback.structuredContent).toEqual({ args: { force: true } });
    expect(JSON.parse(await readFile(statePath, 'utf8')).calls).toEqual([
      { serverName: 'dashboard-backend', toolName: 'show_dashboard', args: { section: 'sales' } },
      { serverName: 'dashboard-backend', toolName: 'refresh_dashboard', args: { force: true } },
    ]);
  }, 20000);

  it('filters model visibility while retaining app-only callback tools for the host', async () => {
    const gateway = new McpAppsGateway({
      getServers: () => [{
        serverName: 'app',
        tools: [
          { name: 'open', _meta: { ui: { resourceUri: 'ui://app/view' } } },
          { name: 'callback', _meta: { ui: { resourceUri: 'ui://app/view', visibility: ['app'] } } },
          { name: 'ordinary' },
        ],
      }],
      readResource: async () => ({ contents: [] }),
      callTool: async (_server, name) => ({ name }),
    });

    expect((await gateway.getTools()).map(tool => tool.name)).toEqual(['open', 'callback']);
    expect((await gateway.getModelTools()).map(tool => tool.name)).toEqual(['open']);
    expect((await gateway.getToolsForHost(false)).map(tool => tool.name)).toEqual(['open']);
    expect((await gateway.getToolsForHost(true)).map(tool => tool.name)).toEqual(['open', 'callback']);
    expect((await gateway.getAppCallbackTools('ui://app/view')).map(tool => tool.name)).toEqual(['open', 'callback']);
    expect(await gateway.callTool('callback', {})).toEqual({ name: 'callback' });
    await expect(gateway.callAppTool('ui://other/view', 'callback', {})).rejects.toThrow('not callable by the app');
  });

  it('binds callbacks without a resourceUri to same-server UIs and routes standard tools/call by original name', async () => {
    const calls: string[] = [];
    const gateway = new McpAppsGateway({
      getServers: () => [{
        serverName: 'multi-ui',
        tools: [
          { name: 'open_first', _meta: { ui: { resourceUri: 'ui://multi/first' } } },
          { name: 'open_second', _meta: { ui: { resourceUri: 'ui://multi/second' } } },
          { name: 'refresh', inputSchema: { type: 'object' }, _meta: { ui: { visibility: ['app'] } } },
        ],
      }],
      readResource: async (_server, uri) => ({ contents: [{ uri }] }),
      callTool: async (server, name) => {
        calls.push(`${server}:${name}`);
        return { content: [{ type: 'text', text: 'called' }] };
      },
    });

    const advertised = await gateway.getTools();
    expect(advertised.map(tool => tool.name)).toEqual(['open_first', 'open_second', 'refresh']);
    expect(advertised.find(tool => tool.name === 'refresh')?._meta).toEqual({ ui: { visibility: ['app'] } });
    expect((await gateway.getAppCallbackTools('ui://multi/first')).map(tool => tool.name)).toEqual(['open_first', 'refresh']);
    expect((await gateway.getAppCallbackTools('ui://multi/second')).map(tool => tool.name)).toEqual(['open_second', 'refresh']);
    expect(await gateway.callTool('refresh', {})).toEqual({ content: [{ type: 'text', text: 'called' }] });
    expect(await gateway.callAppTool('ui://multi/second', 'refresh', {})).toEqual({ content: [{ type: 'text', text: 'called' }] });
    expect(calls).toEqual(['multi-ui:refresh', 'multi-ui:refresh']);
  });

  it('omits colliding app server groups and preserves untrusted resource metadata without rewriting it', async () => {
    const diagnostics: string[] = [];
    const gateway = new McpAppsGateway({
      getServers: () => [
        { serverName: 'one', tools: [{ name: 'launch', _meta: { ui: { resourceUri: 'ui://one/view' } } }] },
        { serverName: 'two', tools: [{ name: 'launch', _meta: { ui: { resourceUri: 'ui://two/view' } } }] },
        { serverName: 'three', tools: [{ name: 'safe', _meta: { ui: { resourceUri: 'ui://three/view' } } }] },
      ],
      readResource: async () => ({ contents: [{ mimeType: 'text/html', text: '<html></html>', _meta: { ui: { domain: 'untrusted.example' } } }] }),
      callTool: async (_server, name) => ({ name }),
      onDiagnostic: message => diagnostics.push(message),
    });

    expect((await gateway.getTools()).map(tool => tool.name)).toEqual(['safe']);
    expect(diagnostics.join('\n')).toContain('ambiguous across downstream servers');
    await expect(gateway.readResource('ui://one/view')).rejects.toThrow('Unknown or ambiguous');
    expect(await gateway.readResource('ui://three/view')).toEqual({
      contents: [{ mimeType: 'text/html', text: '<html></html>', _meta: { ui: { domain: 'untrusted.example' } } }],
    });
    await expect(gateway.callTool('launch', {})).rejects.toThrow('Unknown or ambiguous');
  });

  it('omits complete app groups on resource URI or outer tool name collisions', async () => {
    const gateway = new McpAppsGateway({
      getServers: () => [
        { serverName: 'one', tools: [{ name: 'one-tool', _meta: { ui: { resourceUri: 'ui://shared/view' } } }] },
        { serverName: 'two', tools: [{ name: 'two-tool', _meta: { ui: { resourceUri: 'ui://shared/view' } } }] },
        { serverName: 'three', tools: [{ name: 'reserved', _meta: { ui: { resourceUri: 'ui://three/view' } } }] },
      ],
      readResource: async () => ({ contents: [] }),
      callTool: async () => ({}),
      reservedToolNames: ['reserved'],
    });

    expect(await gateway.getTools()).toEqual([]);
    expect(await gateway.listResources()).toEqual([]);
    await expect(gateway.readResource('ui://shared/view')).rejects.toThrow();
  });

  it('recognizes the deprecated URI metadata and refuses malformed resource URIs', async () => {
    const diagnostics: string[] = [];
    const gateway = new McpAppsGateway({
      getServers: () => [{ serverName: 'legacy', tools: [
        { name: 'legacy_app', _meta: { 'ui/resourceUri': 'ui://legacy/view' } },
        { name: 'malformed', _meta: { ui: { resourceUri: 'https://example.test/app' } } },
      ] }],
      readResource: async () => ({ contents: [] }),
      callTool: async () => ({}),
      onDiagnostic: message => diagnostics.push(message),
    });

    expect((await gateway.getTools()).map(tool => tool.name)).toEqual(['legacy_app']);
    expect(diagnostics.join('\n')).toContain('must use ui://');
  });
});
