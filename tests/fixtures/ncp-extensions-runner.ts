import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { MCPServer } from '../../src/server/mcp-server.js';
import { resetPathsCache, setOverrideWorkingDirectory } from '../../src/utils/ncp-paths.js';
import {
  appCatalog,
  createExtensionOrchestrator,
  dashboardUri,
  remoteSkillEntry,
  remoteSkillText,
  remoteSkillUri,
  writeLocalSkill,
} from './ncp-extensions-server.js';

const UI_EXTENSION = 'io.modelcontextprotocol/ui';
const SKILLS_EXTENSION = 'io.modelcontextprotocol/skills';
const ANY_RESULT = {
  '~standard': { version: 1, vendor: 'ncp-extension-fixture', validate: (value: unknown) => ({ value }) },
};
let rawRequestId = 0;

const mode = process.argv[2];
if (mode === 'apps') await runAppsScenario();
else if (mode === 'skills') await runSkillsScenario();
else if (mode === 'tasks') await runTasksScenario();
else throw new Error(`Unknown extension fixture mode: ${mode}`);
process.stdout.write('ok\n');

async function runAppsScenario(): Promise<void> {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'ncp-extensions-apps-'));
  setOverrideWorkingDirectory(workDir);
  const capable = await createHarness(workDir, 'apps-capable', { [UI_EXTENSION]: { mimeTypes: ['text/html;profile=mcp-app'] } });
  const textOnly = await createHarness(workDir, 'apps-text-only', {});
  try {
    const capableTools = await capable.client.listTools();
    assert.deepEqual(
      capableTools.tools.map((tool) => tool.name).sort(),
      ['code', 'find', 'refresh_dashboard', 'run', 'show_dashboard'],
    );
    assert.deepEqual(capableTools.tools.find((tool) => tool.name === 'refresh_dashboard')?._meta, {
      ui: { resourceUri: dashboardUri, visibility: ['app'] },
    });

    const ui = await capable.client.readResource({ uri: dashboardUri });
    assert.match(ui.contents[0].text ?? '', /dashboard fixture/);
    assert.equal(ui.contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.deepEqual((ui.contents[0] as any)._meta, {
      ui: { csp: { connectDomains: ['https://dashboard.example.test'] }, prefersBorder: true },
    });
    assert.deepEqual(ui._meta, { origin: 'dashboard-backend' });

    const callback = await capable.client.callTool({
      name: 'refresh_dashboard',
      arguments: { force: true },
      _meta: { ui: { resourceUri: dashboardUri } },
    } as any);
    assert.deepEqual(callback.structuredContent, {
      tool: 'dashboard-backend:refresh_dashboard',
      parameters: { force: true },
    });
    assert.ok(capable.calls.some((call) => call.tool === 'dashboard-backend:refresh_dashboard'));

    const textTools = await textOnly.client.listTools();
    assert.ok(textTools.tools.some((tool) => tool.name === 'show_dashboard'));
    assert.ok(!textTools.tools.some((tool) => tool.name === 'refresh_dashboard'));
  } finally {
    await closeHarness(capable);
    await closeHarness(textOnly);
    resetPathsCache();
    await rm(workDir, { recursive: true, force: true });
  }
}

async function runSkillsScenario(): Promise<void> {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'ncp-extensions-skills-'));
  setOverrideWorkingDirectory(workDir);
  await writeLocalSkill(workDir);
  const harness = await createModernHarness(workDir, 'skills');
  try {
    const listing = await harness.client.request({ method: 'skills/list', params: {} } as any, ANY_RESULT as any) as any;
    assert.equal(listing.skills.length, 2);
    const local = listing.skills.find((skill: any) => skill.uri === 'skill://local/local-guide/SKILL.md');
    const remote = listing.skills.find((skill: any) => skill.frontmatter.name === 'remote-guide');
    assert.ok(local);
    assert.equal(local.frontmatter.license, undefined);
    assert.deepEqual(local.frontmatter.tags, ['ncp', 'local']);
    assert.match(local.resources[0].digest, /^sha256:[a-f0-9]{64}$/);
    assert.ok(remote.uri.startsWith('skill://remote-'));
    assert.deepEqual(remote.frontmatter, remoteSkillEntry.frontmatter);

    // Resolve a skill URI directly without a prior skills/list call.
    const direct = await harness.client.request(
      { method: 'skills/get', params: { uri: 'skill://local/local-guide/SKILL.md' } } as any,
      ANY_RESULT as any,
    ) as any;
    assert.equal(direct.skill.uri, local.uri);

    const remoteGet = await harness.client.request(
      { method: 'skills/get', params: { uri: remote.uri } } as any,
      ANY_RESULT as any,
    ) as any;
    assert.equal(remoteGet.skill.uri, remote.uri);
    assert.equal(remoteGet.skill.resources[0].digest, remoteSkillEntry.resources[0].digest);

    const localRead = await harness.client.readResource({ uri: local.uri });
    assert.match(localRead.contents[0].text ?? '', /Local workflow/);
    await writeFile(path.join(workDir, '.change-skill-origin'), 'changed');
    await assert.rejects(() => harness.client.readResource({ uri: remote.resources[0].uri }));
  } finally {
    await closeModernHarness(harness);
    resetPathsCache();
    await rm(workDir, { recursive: true, force: true });
  }
}

async function runTasksScenario(): Promise<void> {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'ncp-extensions-tasks-'));
  setOverrideWorkingDirectory(workDir);
  const harness = await createModernHarness(workDir, 'tasks');
  try {
    const created = await rawExtensionRequest(harness.transport, 'tools/call', {
      name: 'run',
      arguments: { tool: 'fixture:run', parameters: { needInput: true } },
      _meta: { 'io.modelcontextprotocol/clientCapabilities': { extensions: { 'io.modelcontextprotocol/tasks': {} } } },
    });
    assert.match(created.taskId, /^[a-f0-9-]{36}$/i);
    const taskHandle = created;
    assert.equal(taskHandle.resultType, 'task');
    assert.equal(taskHandle.taskId, created.taskId);
    assert.equal(taskHandle.status, 'working');
    assert.equal(taskHandle.statusMessage, 'Running NCP run');
    assert.equal(typeof taskHandle.createdAt, 'string');
    assert.equal(typeof taskHandle.lastUpdatedAt, 'string');
    assert.equal(taskHandle.ttlMs, 86_400_000);
    assert.equal(taskHandle.pollIntervalMs, 1_000);

    const waiting = await waitForTaskStatus(harness.transport, created.taskId, 'input_required');
    const [inputId] = Object.keys(waiting.inputRequests);
    const update = await rawExtensionRequest(harness.transport, 'tasks/update', {
      taskId: created.taskId,
      inputResponses: { [inputId]: { action: 'accept', content: { approved: true } } },
    });
    assert.equal(update.resultType, 'complete');
    const completed = await waitForTaskStatus(harness.transport, created.taskId, 'completed');
    assert.equal(completed.result.content[0].text, 'approved=true');
  } finally {
    await closeModernHarness(harness);
    resetPathsCache();
    await rm(workDir, { recursive: true, force: true });
  }
}

async function createHarness(
  workDir: string,
  profile: string,
  clientExtensions: Record<string, unknown>,
  options: { mode: 'legacy' } | { mode: { pin: string } } = { mode: 'legacy' },
  behaviors: { requestTaskInput?: boolean } = {},
) {
  const ncpServer = new MCPServer(profile, false) as any;
  const realOrchestrator = ncpServer.orchestrator;
  const fixture = createExtensionOrchestrator();
  ncpServer.orchestrator = fixture.orchestrator;
  ncpServer.getToolDefinitions = () => [
    { name: 'find', description: 'Find tools', inputSchema: { type: 'object' } },
    { name: 'run', description: 'Run a tool', inputSchema: { type: 'object' } },
    { name: 'code', description: 'Run code', inputSchema: { type: 'object' } },
  ];
  ncpServer.handleRun = async (params: any) => {
    fixture.calls.push(params);
    if (behaviors.requestTaskInput && params?.parameters?.needInput) {
      const answer = await ncpServer.requestInput({
        message: 'Approve this fixture run?',
        requestedSchema: { type: 'object', properties: { approved: { type: 'boolean' } }, required: ['approved'] },
      });
      return { content: [{ type: 'text', text: `approved=${answer.content?.approved}` }] };
    }
    return {
      content: [{ type: 'text', text: 'fixture run' }],
      structuredContent: { tool: params.tool, parameters: params.parameters },
    };
  };
  ncpServer.handleCode = async () => ({ content: [{ type: 'text', text: 'fixture code' }] });
  fixture.orchestrator.readMCPResource = (async (serverName: string, uri: string) => {
    if (serverName === 'documentation-server' && uri === remoteSkillUri) {
      return { contents: [{ uri, mimeType: 'text/markdown', text: remoteSkillText }] };
    }
    if (serverName === appCatalog.serverName && uri === dashboardUri) {
      return {
        contents: [{
          uri,
          mimeType: 'text/html;profile=mcp-app',
          text: '<html><body>dashboard fixture</body></html>',
          _meta: { ui: { csp: { connectDomains: ['https://dashboard.example.test'] }, prefersBorder: true } },
        }],
        _meta: { origin: 'dashboard-backend' },
      };
    }
    throw new Error(`Unknown fixture resource: ${serverName}:${uri}`);
  }) as any;

  const client = new Client(
    { name: 'ncp-extensions-test-client', version: '1.0.0' },
    { capabilities: { extensions: clientExtensions } as any, versionNegotiation: options as any },
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([ncpServer.server.connect(serverTransport), client.connect(clientTransport)]);
  return { server: ncpServer, client, clientTransport, realOrchestrator, calls: fixture.calls };
}

async function createModernHarness(workDir: string, mode: 'skills' | 'tasks') {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', path.resolve('tests/fixtures/ncp-extensions-modern-server.ts'), mode, workDir],
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test' } as Record<string, string>,
    stderr: 'pipe',
  });
  const client = new Client(
    { name: 'ncp-extensions-test-client', version: '1.0.0' },
    {
      capabilities: { extensions: {} } as any,
      versionNegotiation: { mode: { pin: '2026-07-28' } },
    },
  );
  await client.connect(transport);
  assert.equal(client.getProtocolEra(), 'modern');
  return { client, transport };
}

async function closeModernHarness(harness: Awaited<ReturnType<typeof createModernHarness>>): Promise<void> {
  await harness.client.close().catch(() => undefined);
}

async function closeHarness(harness: Awaited<ReturnType<typeof createHarness>>): Promise<void> {
  await harness.client.close().catch(() => undefined);
  await harness.server.shutdown();
  await Promise.resolve(harness.realOrchestrator.cleanup?.()).catch(() => undefined);
}

async function waitForTaskStatus(transport: StdioClientTransport, taskId: string, status: string): Promise<any> {
  // Durable task responses include file sync; this is not a latency benchmark.
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const task = await rawExtensionRequest(transport, 'tasks/get', { taskId });
    if (task.status === status) return task;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Task ${taskId} did not reach ${status}`);
}

async function rawExtensionRequest(transport: StdioClientTransport, method: string, params: Record<string, unknown>): Promise<any> {
  const id = `extension-test-${++rawRequestId}`;
  const previous = transport.onmessage;
  const response = new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), 10_000);
    transport.onmessage = (message: any) => {
      if (message?.id === id) {
        clearTimeout(timeout);
        if (message.error) reject(new Error(`${method} failed: ${message.error.message}`));
        else resolve(message.result);
        return;
      }
      previous?.(message);
    };
  });
  await transport.send({
    jsonrpc: '2.0',
    id,
    method,
    params: {
      ...params,
      _meta: {
        ...(params._meta as Record<string, unknown> | undefined),
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'ncp-extensions-test-client', version: '1.0.0' },
        'io.modelcontextprotocol/clientCapabilities': { extensions: { 'io.modelcontextprotocol/tasks': {} } },
      },
    },
  } as any);
  return response.finally(() => { transport.onmessage = previous; });
}
