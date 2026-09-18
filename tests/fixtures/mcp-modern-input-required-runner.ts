import assert from 'node:assert/strict';
import { Client, isInputRequiredResult } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const workDir = await mkdtemp(join(tmpdir(), 'ncp-modern-input-'));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve('dist/index-mcp.js'), '--profile', 'modern-input-test'],
  env: { ...process.env, NCP_WORKING_DIR: workDir, NCP_PROFILE: 'modern-input-test' } as Record<string, string>,
});
const client = new Client(
  { name: 'ncp-modern-input-runner', version: '1.0.0' },
  {
    capabilities: { elicitation: { form: {} } },
    versionNegotiation: { mode: { pin: '2026-07-28' } },
  },
);

try {
  await client.connect(transport);
  assert.equal(client.getProtocolEra(), 'modern');
  const tools = await client.listTools();
  assert.equal(tools.tools.some((tool) => tool.name === 'find'), true);
  assert.equal(tools.tools.some((tool) => tool.name === 'code'), true);
  const call = {
    name: 'run',
    arguments: {
      tool: 'mcp:optimize_client',
      parameters: { client_name: 'nonexistent-test-client' },
    },
  };
  const interaction = await client.callTool(call, { allowInputRequired: true }) as unknown;
  assert.equal(isInputRequiredResult(interaction), true);
  if (!isInputRequiredResult(interaction)) throw new Error('expected input_required');
  assert.equal(interaction.inputRequests?.input_1?.method, 'elicitation/create');
  assert.equal(typeof interaction.requestState, 'string');

  const completion = await client.callTool({
    ...call,
    inputResponses: { input_1: { action: 'cancel' } },
    requestState: interaction.requestState,
  } as any, { allowInputRequired: true });
  assert.equal(completion.isError, true);
  assert.match(JSON.stringify(completion.content), /cancelled/);
  process.stdout.write('ok\n');
} finally {
  await client.close().catch(() => undefined);
  await rm(workDir, { recursive: true, force: true });
}
