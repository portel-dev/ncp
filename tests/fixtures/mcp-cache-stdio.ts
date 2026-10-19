import { readFileSync, writeFileSync } from 'node:fs';
import { Server } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

const statePath = process.argv[2];
const ttlMs = Number(process.argv[3] ?? 900);

serveStdio(() => {
  const server = new Server({ name: 'catalog-cache-stdio-fixture', version: '1.0.0' }, {
    capabilities: { tools: { listChanged: true } },
    cacheHints: { 'tools/list': { ttlMs, cacheScope: 'private' } },
  });
  server.setRequestHandler('tools/list', async () => {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.calls += 1;
    writeFileSync(statePath, JSON.stringify(state));
    return { tools: [{ name: 'private_tool', inputSchema: { type: 'object' } }] };
  });
  return server;
});
