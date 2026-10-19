import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Client, InMemoryResponseCacheStore, InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { Server } from '@modelcontextprotocol/server';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { guardMCPResponseCacheStore, MCPResponseCacheRegistry } from '../../src/orchestrator/services/mcp-response-cache.js';
import { NCPOrchestrator } from '../../src/orchestrator/ncp-orchestrator.js';

const SERVER_INFO = { name: 'catalog-cache-fixture', version: '1.0.0' };

async function connectFixture(options: ConstructorParameters<typeof Client>[1], state: { calls: number; tools: any[]; ttlMs: number }) {
  const server = new Server(SERVER_INFO, {
    capabilities: { tools: { listChanged: true } },
    cacheHints: { 'tools/list': { ttlMs: state.ttlMs, cacheScope: 'private' } },
  });
  server.setRequestHandler('tools/list', async () => {
    state.calls += 1;
    return { tools: state.tools };
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverConnection = server.connect(serverTransport);
  const client = new Client({ name: 'cache-test-client', version: '1.0.0' }, {
    versionNegotiation: { mode: 'legacy' },
    defaultCacheTtlMs: state.ttlMs,
    ...options,
  });
  await client.connect(clientTransport);
  await serverConnection;
  return { server, client };
}

describe('MCP response cache and list changes', () => {
  const clients: Client[] = [];
  const servers: Server[] = [];
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map(client => client.close().catch(() => {})));
    await Promise.all(servers.splice(0).map(server => server.close().catch(() => {})));
    await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
  });

  it('shares SDK cache hits across reconnects and isolates private principals', async () => {
    const store = new InMemoryResponseCacheStore({ maxEntries: 8 });
    const state = { calls: 0, tools: [{ name: 'private_tool', inputSchema: { type: 'object' } }], ttlMs: 60_000 };
    const connect = async (partition: string) => {
      const result = await connectFixture({ responseCacheStore: store, cachePartition: partition }, state);
      clients.push(result.client);
      servers.push(result.server);
      return result.client;
    };

    await (await connect('principal-a')).listTools();
    expect(state.calls).toBe(1);
    await (await connect('principal-a')).listTools();
    expect(state.calls).toBe(1);
    await (await connect('principal-b')).listTools();
    expect(state.calls).toBe(2);
  }, 15000);

  it('uses modern server TTL/private hints with production defaultCacheTtlMs=0 across stdio reconnects', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mcp-response-cache-'));
    directories.push(directory);
    const statePath = join(directory, 'state.json');
    const ttlMs = 900;
    await writeFile(statePath, JSON.stringify({ calls: 0 }));
    const store = new InMemoryResponseCacheStore({ maxEntries: 8 });
    const connect = async (partition: string) => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: ['--import', 'tsx', resolve('tests/fixtures/mcp-cache-stdio.ts'), statePath, String(ttlMs)],
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      });
      const client = new Client({ name: 'modern-cache-test-client', version: '1.0.0' }, {
        versionNegotiation: { mode: { pin: '2026-07-28' } },
        responseCacheStore: store,
        cachePartition: partition,
        defaultCacheTtlMs: 0,
      });
      clients.push(client);
      await client.connect(transport);
      return client;
    };

    await (await connect('principal-a')).listTools();
    await (await connect('principal-a')).listTools();
    expect(JSON.parse(await readFile(statePath, 'utf8')).calls).toBe(1);
    await (await connect('principal-b')).listTools();
    expect(JSON.parse(await readFile(statePath, 'utf8')).calls).toBe(2);
    await new Promise(resolve => setTimeout(resolve, ttlMs + 100));
    await (await connect('principal-a')).listTools();
    expect(JSON.parse(await readFile(statePath, 'utf8')).calls).toBe(3);
  }, 20000);

  it('omits unavailable stale app catalogs without breaking outer tool discovery', async () => {
    const orchestrator = Object.create(NCPOrchestrator.prototype) as any;
    orchestrator.definitions = new Map([['offline-app', {
      name: 'offline-app',
      tools: [{ name: 'show', _meta: { ui: { resourceUri: 'ui://offline/view' } } }],
      catalogNeedsRefresh: true,
    }]]);
    orchestrator.connections = new Map();
    orchestrator.ensureFreshCatalog = async () => { throw new Error('offline'); };
    orchestrator.getMCPServerCatalogs = () => [{ serverName: 'offline-app', tools: [] }];
    await expect(orchestrator.refreshMCPServerCatalogs()).resolves.toEqual([]);
  });

  it('refreshes stale external catalogs on detailed find without connecting to local definitions', async () => {
    const refreshedTools = [{
      name: 'fresh_tool',
      description: 'Fresh external fixture tool',
      inputSchema: { type: 'object', properties: { value: { type: 'string' } } },
    }];
    const listTools = jest.fn(async () => ({ tools: refreshedTools, ttlMs: 60_000 }));
    const orchestrator = Object.create(NCPOrchestrator.prototype) as any;
    orchestrator.waitForInitialization = async () => {};
    orchestrator.definitions = new Map([
      ['ncp', {
        name: 'ncp', config: { name: 'ncp', command: 'internal' },
        tools: [{ name: 'status', description: 'Local management status' }],
      }],
      ['cached-cli', {
        name: 'cached-cli',
        config: { name: 'cached-cli', command: 'cached-cli', env: { NCP_CLI_TOOL: 'true' } },
        tools: [{ name: 'inspect', description: 'Cached CLI operation' }],
      }],
      ['fixture', {
        name: 'fixture', config: { name: 'fixture', command: 'fixture-command' },
        tools: [{ name: 'cached_tool', description: 'Stale external fixture tool' }],
        catalogNeedsRefresh: true,
      }],
    ]);
    orchestrator.internalMCPManager = { isInternalMCP: (name: string) => name === 'ncp' };
    orchestrator.connections = new Map();
    orchestrator.getOrCreateConnection = jest.fn(async (name: string) => {
      if (name !== 'fixture') throw new Error(`Unexpected connection for local catalog ${name}`);
      return { client: { listTools }, tools: [] };
    });
    orchestrator.allTools = [
      { name: 'ncp:status', description: 'ncp: Local management status', mcpName: 'ncp' },
      { name: 'cached-cli:inspect', description: 'cached-cli: Cached CLI operation', mcpName: 'cached-cli' },
      { name: 'fixture:cached_tool', description: 'fixture: Stale external fixture tool', mcpName: 'fixture' },
    ];
    orchestrator.toolToMCP = new Map([
      ['ncp:status', 'ncp'], ['cached-cli:inspect', 'cached-cli'], ['fixture:cached_tool', 'fixture'],
    ]);
    orchestrator.healthMonitor = { getHealthyMCPs: (names: string[]) => names };
    orchestrator.discovery = { replaceMCPTools: jest.fn(async () => {}) };
    orchestrator.newlyIndexedMCPs = new Set();

    const results = await orchestrator.find('', 10, true);

    expect(results.map((result: any) => result.mcpName)).toEqual(['ncp', 'cached-cli', 'fixture']);
    expect(orchestrator.getOrCreateConnection).toHaveBeenCalledTimes(1);
    expect(orchestrator.getOrCreateConnection).toHaveBeenCalledWith('fixture');
    expect(listTools).toHaveBeenCalledTimes(1);
    expect(orchestrator.definitions.get('fixture').tools).toEqual(refreshedTools);
  });

  it('bounds the number of cached server stores', () => {
    const registry = new MCPResponseCacheRegistry(2, 4);
    const first = registry.get('server-a');
    registry.get('server-b');
    expect(registry.get('server-a')).toBe(first);
    registry.get('server-c');
    expect(registry.size).toBe(2);
    expect(registry.get('server-b')).not.toBe(first);
  });

  it('bypasses cache reads and writes if the credential changes mid-connection', async () => {
    const baseStore = new InMemoryResponseCacheStore({ maxEntries: 8 });
    let currentPartition = 'principal-a';
    const guardedStore = guardMCPResponseCacheStore(baseStore, 'principal-a', async () => currentPartition);
    const state = { calls: 0, tools: [{ name: 'private_tool', inputSchema: { type: 'object' } }], ttlMs: 60_000 };
    const result = await connectFixture({ responseCacheStore: guardedStore, cachePartition: 'principal-a' }, state);
    clients.push(result.client);
    servers.push(result.server);
    await result.client.listTools();
    expect(state.calls).toBe(1);

    currentPartition = 'principal-b';
    await result.client.listTools();
    expect(state.calls).toBe(2);
  });

  it('propagates tools/list_changed to the live catalog, aliases, and discovery index', async () => {
    const state = {
      calls: 0,
      tools: [
        { name: 'keep_tool', description: 'keep current tool', inputSchema: { type: 'object' as const } },
        { name: 'remove_tool', description: 'removed tool', inputSchema: { type: 'object' as const } },
      ],
      ttlMs: 60_000,
    };
    const replaceMCPTools: any = jest.fn(async () => {});
    const orchestrator = Object.create(NCPOrchestrator.prototype) as any;
    orchestrator.clientInfo = { name: 'cache-test-client', version: '1.0.0' };
    orchestrator.elicitationHandlerClients = new WeakSet<Client>();
    orchestrator.responseCacheRegistry = new MCPResponseCacheRegistry();
    orchestrator.transportFactory = { getAuthToken: async () => '' };
    orchestrator.definitions = new Map([['fixture', {
      name: 'fixture', config: { name: 'fixture' }, tools: state.tools,
    }]]);
    orchestrator.connections = new Map();
    orchestrator.allTools = state.tools.map(tool => ({ name: `fixture:${tool.name}`, description: tool.description, mcpName: 'fixture' }));
    orchestrator.toolToMCP = new Map([['keep_tool', 'fixture'], ['remove_tool', 'fixture'], ['fixture:keep_tool', 'fixture'], ['fixture:remove_tool', 'fixture']]);
    orchestrator.discovery = { replaceMCPTools };
    orchestrator.newlyIndexedMCPs = new Set();

    // Use the configured client from the real orchestrator so its SDK
    // listChanged callback updates the same maps used by find/run.
    const routedClient = await orchestrator.createMCPClient({ name: 'fixture', command: 'unused' });
    const [routedTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const routeServer = new Server(SERVER_INFO, {
      capabilities: { tools: { listChanged: true } },
      cacheHints: { 'tools/list': { ttlMs: state.ttlMs, cacheScope: 'private' } },
    });
    routeServer.setRequestHandler('tools/list', async () => ({ tools: state.tools }));
    servers.push(routeServer);
    const routeServerConnection = routeServer.connect(serverTransport);
    await routedClient.connect(routedTransport);
    await routeServerConnection;
    clients.push(routedClient);
    orchestrator.connections.set('fixture', { client: routedClient, tools: state.tools });
    await routedClient.listTools();

    state.tools = [state.tools[0]];
    await routeServer.sendToolListChanged();
    for (let attempt = 0; attempt < 40 && orchestrator.definitions.get('fixture').tools.length !== 1; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }

    expect(orchestrator.definitions.get('fixture').tools.map((tool: any) => tool.name)).toEqual(['keep_tool']);
    expect(orchestrator.allTools.map((tool: any) => tool.name)).toEqual(['fixture:keep_tool']);
    expect(orchestrator.toolToMCP.has('remove_tool')).toBe(false);
    expect(orchestrator.toolToMCP.has('fixture:remove_tool')).toBe(false);
    expect(replaceMCPTools).toHaveBeenCalledWith('fixture', [expect.objectContaining({ id: 'fixture:keep_tool' })]);
  }, 15000);

  it('returns native descriptors on detailed active-orchestrator find results', async () => {
    const descriptor = {
      name: 'rich_tool',
      description: 'A rich downstream tool',
      inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { answer: { type: 'string' } } },
      annotations: { readOnlyHint: true },
      _meta: { vendor: { trace: 'preserved' } },
    };
    const orchestrator = Object.create(NCPOrchestrator.prototype) as any;
    orchestrator.waitForInitialization = async () => {};
    orchestrator.definitions = new Map([['fixture', {
      name: 'fixture', config: { name: 'fixture' }, tools: [descriptor], catalogExpiresAt: Date.now() + 60_000,
    }]]);
    orchestrator.connections = new Map();
    orchestrator.allTools = [{ name: 'fixture:rich_tool', description: 'fixture: A rich downstream tool', mcpName: 'fixture' }];
    orchestrator.toolToMCP = new Map([['rich_tool', 'fixture'], ['fixture:rich_tool', 'fixture']]);
    orchestrator.healthMonitor = { getHealthyMCPs: () => ['fixture'] };
    orchestrator.discovery = { findRelevantTools: async () => [{ name: 'fixture:rich_tool', confidence: 0.99 }] };
    orchestrator.adjustScoresUniversally = (results: any[]) => results;

    const listed = await orchestrator.find('', 5, true);
    const searched = await orchestrator.find('rich tool', 5, true);
    expect(listed[0].descriptor).toEqual(descriptor);
    expect(searched[0].descriptor).toEqual(descriptor);
    expect(searched[0].schema).toEqual(descriptor.inputSchema);
  });
});
