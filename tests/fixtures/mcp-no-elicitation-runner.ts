import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const workDir = await mkdtemp(join(tmpdir(), 'ncp-no-elicitation-'));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve('dist/index-mcp.js'), '--profile', 'no-elicitation-test'],
  env: { ...process.env, NCP_WORKING_DIR: workDir, NCP_PROFILE: 'no-elicitation-test' } as Record<string, string>,
});
const client = new Client(
  { name: 'ncp-no-elicitation-runner', version: '1.0.0' },
  {
    capabilities: {},
    versionNegotiation: { mode: { pin: '2026-07-28' } },
  },
);

try {
  await client.connect(transport);
  await assert.rejects(
    client.callTool(
      {
        name: 'run',
        arguments: {
          tool: 'mcp:optimize_client',
          parameters: { client_name: 'nonexistent-test-client' },
        },
      },
      { allowInputRequired: true },
    ),
    /elicitation|input|required|capabilit/i,
  );
  process.stdout.write('ok\n');
} finally {
  await client.close().catch(() => undefined);
  await rm(workDir, { recursive: true, force: true });
}
