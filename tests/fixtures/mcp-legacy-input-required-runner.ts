import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const workDir = await mkdtemp(join(tmpdir(), 'ncp-legacy-input-'));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve('dist/index-mcp.js'), '--profile', 'legacy-input-test'],
  env: { ...process.env, NCP_WORKING_DIR: workDir, NCP_PROFILE: 'legacy-input-test' } as Record<string, string>,
});
const client = new Client(
  { name: 'ncp-legacy-input-runner', version: '1.0.0' },
  {
    capabilities: { elicitation: { form: {} } },
    versionNegotiation: { mode: 'legacy' },
  },
);
let requests = 0;
client.setRequestHandler('elicitation/create', async () => {
  requests += 1;
  return { action: 'cancel' };
});

try {
  await client.connect(transport);
  const result = await client.callTool({
    name: 'run',
    arguments: {
      tool: 'mcp:optimize_client',
      parameters: { client_name: 'nonexistent-test-client' },
    },
  });
  assert.equal(client.getProtocolEra(), 'legacy');
  assert.equal(requests, 1);
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), /cancelled/);
  process.stdout.write('ok\n');
} finally {
  await client.close().catch(() => undefined);
  await rm(workDir, { recursive: true, force: true });
}
