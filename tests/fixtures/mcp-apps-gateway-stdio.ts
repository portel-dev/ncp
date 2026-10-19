import { readFileSync, writeFileSync } from 'node:fs';
import { Server } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { McpAppsGateway, MCP_APP_HTML_MIME_TYPE } from '../../src/server/mcp-apps-gateway.js';

const statePath = process.argv[2];
const resourceUri = 'ui://dashboard/main';
const tools = [
  {
    name: 'show_dashboard',
    description: 'Show the dashboard',
    inputSchema: { type: 'object', properties: { section: { type: 'string' } } },
    _meta: { ui: { resourceUri, visibility: ['model', 'app'] } },
  },
  {
    name: 'refresh_dashboard',
    description: 'Refresh dashboard data',
    inputSchema: { type: 'object', properties: { force: { type: 'boolean' } } },
    _meta: { ui: { visibility: ['app'] } },
  },
];

function record(value: unknown) {
  writeFileSync(statePath, JSON.stringify(value));
}

const gateway = new McpAppsGateway({
  getServers: () => [{ serverName: 'dashboard-backend', tools }],
  readResource: async (serverName, uri) => ({
    contents: [{
      uri,
      mimeType: MCP_APP_HTML_MIME_TYPE,
      text: '<!doctype html><html><body>dashboard</body></html>',
      _meta: { ui: { csp: { connectDomains: ['https://api.example.test'] }, prefersBorder: true } },
    }],
    _meta: { provenance: serverName },
  }),
  callTool: async (serverName, toolName, args, meta) => {
    const prior = JSON.parse(readFileSync(statePath, 'utf8'));
    prior.calls.push({ serverName, toolName, args, meta });
    record(prior);
    return { content: [{ type: 'text', text: `${serverName}:${toolName}` }], structuredContent: { args } };
  },
});

serveStdio(() => {
  const server = new Server({ name: 'mcp-apps-gateway-fixture', version: '1.0.0' }, {
    capabilities: { tools: {}, resources: {} },
  });
  server.setRequestHandler('tools/list', async () => ({ tools: await gateway.getTools() }));
  server.setRequestHandler('tools/call', async (request) => {
    const { name, arguments: args } = request.params;
    return gateway.callTool(name, (args ?? {}) as Record<string, unknown>, request.params._meta as Record<string, unknown> | undefined);
  });
  server.setRequestHandler('resources/list', async () => ({ resources: await gateway.listResources() }));
  server.setRequestHandler('resources/read', async (request) => gateway.readResource(request.params.uri));
  return server;
});
