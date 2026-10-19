import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setOverrideWorkingDirectory } from '../../src/utils/ncp-paths.js';

// Exercise the actual NCP discovery and execution path against the official
// conformance server, using an isolated profile and no external integrations.
const serverUrl = process.argv[2];
if (!serverUrl) throw new Error('The conformance runner must supply a server URL');
const scenario = process.env.MCP_CONFORMANCE_SCENARIO;
if (scenario !== 'initialize' && scenario !== 'tools_call') {
  throw new Error(`Unsupported conformance scenario: ${scenario}`);
}
const workDir = await mkdtemp(join(tmpdir(), 'ncp-conformance-'));
setOverrideWorkingDirectory(workDir);
process.env.NCP_ENABLE_PHOTON_RUNTIME = 'false';
process.env.NCP_DISABLE_BACKGROUND_INIT = 'true';
process.env.NODE_ENV = 'test';
const { NCPOrchestrator } = await import('../../src/orchestrator/ncp-orchestrator.js');
const orchestrator = new NCPOrchestrator('conformance');
// The public initialization path imports the user's configured clients. Seed
// only the harness server after probing it through the production method.
const internals = orchestrator as any;
internals.updateChecker.shouldShowNotification = () => false;
try {
  const config = { name: 'conformance', url: serverUrl, transport: 'streamableHttp' };
  const discovered = await internals.probeMCPTools(config, 15_000);
  assert.ok(Array.isArray(discovered.tools));
  if (scenario === 'tools_call') {
    assert.ok(discovered.tools.length > 0, 'Harness must advertise a tool');
    internals.definitions.set(config.name, { name: config.name, config, ...discovered });
    const result = await orchestrator.run(`${config.name}:${discovered.tools[0].name}`, { a: 2, b: 3 });
    assert.equal(result.success, true, result.error);
    assert.ok(result.mcpResult, 'NCP must retain the downstream result envelope');
    assert.ok(Array.isArray(result.mcpResult.content));
  }
} finally {
  await orchestrator.cleanup();
  setOverrideWorkingDirectory(null);
  await rm(workDir, { recursive: true, force: true });
}
