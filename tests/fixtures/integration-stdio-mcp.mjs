import { Server } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

serveStdio(() => {
  const server = new Server({ name: 'ncp-integration-fixture', version: '1.0.0' }, {
    capabilities: { tools: {} },
  });

  server.setRequestHandler('tools/list', async () => ({
    tools: [{
      name: 'read_text_file',
      description: 'Read a local text file by path',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Path to the text file' } },
        required: ['path'],
      },
    }],
  }));

  server.setRequestHandler('tools/call', async ({ params }) => ({
    content: [{ type: 'text', text: `Fixture call: ${params.name}` }],
  }));

  return server;
});
