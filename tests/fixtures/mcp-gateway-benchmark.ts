import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, Server } from '@modelcontextprotocol/server';
import { MCPServer } from '../../src/server/mcp-server.js';
import { NCPOrchestrator } from '../../src/orchestrator/ncp-orchestrator.js';

export const BENCHMARK_TOOL_COUNT = 192;
export const BENCHMARK_QUERY = 'look up invoice';
export const BENCHMARK_TOOL = 'billing:lookup_invoice';

export const benchmarkResult = {
  content: [
    { type: 'text', text: 'Invoice created: inv_0042' },
    { type: 'image', data: 'AQIDBA==', mimeType: 'image/png' },
  ],
  structuredContent: {
    invoice: { id: 'inv_0042', total: 4200, currency: 'USD' },
    warnings: ['tax estimate pending'],
  },
  _meta: { source: 'fixture', revision: 7 },
};

export function createCatalog() {
  return Array.from({ length: BENCHMARK_TOOL_COUNT }, (_, index) => {
    const target = index === 0;
    const mcp = target ? 'billing' : `service_${String(Math.floor(index / 32)).padStart(2, '0')}`;
    const name = target ? 'lookup_invoice' : `operation_${String(index).padStart(3, '0')}`;
    return {
      name: `${mcp}:${name}`,
      description: target
        ? 'Look up an invoice by customer and return the invoice record.'
        : `Fixture operation ${index}: performs a deterministic downstream action.`,
      inputSchema: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: 'Customer identifier.' },
          amount: { type: 'number', description: 'Invoice amount in minor units.' },
          memo: { type: 'string', description: 'Optional invoice memo.' },
        },
        required: ['customer_id', 'amount'],
      },
    };
  });
}

/** Connect the real NCP MCPServer handlers to an in-memory SDK client. */
export async function createNcpSession() {
  const catalog = createCatalog();
  const ncpServer = new MCPServer('benchmark', false);
  const orchestrator = (ncpServer as any).orchestrator as NCPOrchestrator;
  const internalOrchestrator = orchestrator as any;
  const targetTool = catalog[0];
  internalOrchestrator.waitForInitialization = async () => {};
  internalOrchestrator.allTools = catalog.map(tool => ({
    name: tool.name,
    description: tool.description,
    mcpName: tool.name.split(':')[0],
  }));
  internalOrchestrator.toolToMCP = new Map(catalog.map(tool => [tool.name.split(':')[1], tool.name.split(':')[0]]));
  internalOrchestrator.definitions = new Map([['billing', {
    name: 'billing',
    config: { name: 'billing' },
    tools: [{ name: 'lookup_invoice', description: targetTool.description, inputSchema: targetTool.inputSchema }],
  }]]);
  internalOrchestrator.discovery.findRelevantTools = async (query: string) => query === BENCHMARK_QUERY
    ? [{ name: BENCHMARK_TOOL, confidence: 0.99, description: targetTool.description }]
    : [];
  internalOrchestrator.ensureFreshCatalog = async () => {};
  internalOrchestrator.getOrCreateConnection = async () => ({
    client: { callTool: async () => structuredClone(benchmarkResult) },
  });
  const client = new Client({ name: 'ncp-gateway-benchmark', version: '1.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    (ncpServer as any).server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return {
    catalog,
    client,
    close: async () => {
      await client.close().catch(() => {});
      await ncpServer.cleanup().catch(() => {});
    },
  };
}

/** Connect a direct MCP server that advertises every downstream tool. */
export async function createDirectSession() {
  const catalog = createCatalog();
  const server = new Server({ name: 'direct-catalog-fixture', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler('tools/list', async () => ({ tools: catalog as any }));
  server.setRequestHandler('tools/call', async request => {
    if (request.params.name !== BENCHMARK_TOOL) return { content: [{ type: 'text', text: 'unknown tool' }], isError: true };
    return structuredClone(benchmarkResult) as any;
  });
  const client = new Client({ name: 'direct-gateway-benchmark', version: '1.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    catalog,
    client,
    close: async () => {
      await client.close().catch(() => {});
      await server.close().catch(() => {});
    },
  };
}
