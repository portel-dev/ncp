#!/usr/bin/env node
/**
 * Integration Test: MCP Client Simulation
 *
 * Simulates real AI client behavior (Claude Desktop, Perplexity) to catch bugs
 * that unit tests miss. This should be run before EVERY release.
 *
 * Tests:
 * 1. Server responds to initialize immediately
 * 2. tools/list returns tools < 250ms even during indexing
 * 3. find returns partial results during indexing (not empty)
 * 4. Cache profileHash persists across restarts
 * 5. Second startup uses cache (no re-indexing)
 *
 * The suite blocks network access and exercises the keyword-discovery fallback;
 * semantic model quality is not covered here.
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');

// Test configuration
// Keep integration state isolated from both the checkout and the user's NCP config.
let TEST_ROOT;
let NCP_DIR;
let PROFILES_DIR;
let CACHE_DIR;
const TEST_PROFILE = 'integration-test';
const FIXTURE_MCP_NAME = 'local_fixture';
const TIMEOUT_MS = 10000;
const CACHE_POLL_TIMEOUT_MS = 30000;
const activeClients = new Set();

// Ensure test profile exists
function setupTestProfile() {
  TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ncp-client-simulation-'));
  NCP_DIR = path.join(TEST_ROOT, '.ncp');
  PROFILES_DIR = path.join(NCP_DIR, 'profiles');
  CACHE_DIR = path.join(NCP_DIR, 'cache');
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  // Use a deterministic local MCP fixture so indexing never installs packages or uses the network.
  const fixturePath = path.resolve(__dirname, '../fixtures/integration-stdio-mcp.mjs');
  const profilePath = path.join(PROFILES_DIR, `${TEST_PROFILE}.json`);
  const testProfile = {
    name: TEST_PROFILE, // IMPORTANT: profile.name must match filename for ProfileManager to load it correctly
    description: 'Integration test profile',
    mcpServers: {
      [FIXTURE_MCP_NAME]: {
        command: process.execPath,
        args: [fixturePath]
      }
    },
    metadata: {
      created: new Date().toISOString(),
      modified: new Date().toISOString()
    }
  };

  fs.writeFileSync(profilePath, JSON.stringify(testProfile, null, 2));
  logInfo(`Created test profile at ${profilePath}`);
}

// ANSI colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(emoji, message, color = 'reset') {
  console.log(`${emoji} ${colors[color]}${message}${colors.reset}`);
}

function logError(message) {
  log('❌', `FAIL: ${message}`, 'red');
}

function logSuccess(message) {
  log('✓', message, 'green');
}

function logInfo(message) {
  log('ℹ️', message, 'blue');
}

class MCPClientSimulator {
  constructor() {
    this.ncp = null;
    this.responses = [];
    this.responseBuffer = '';
    this.requestId = 0;
    this.stderrBuffer = '';
    activeClients.add(this);
  }

  start() {
    return new Promise((resolve, reject) => {
      logInfo('Starting NCP MCP server...');

      const offlinePreload = path.resolve(__dirname, '../fixtures/offline-fetch-preload.mjs');
      this.ncp = spawn(process.execPath, [
        '--import', pathToFileURL(offlinePreload).href,
        path.resolve(process.cwd(), 'dist/index-mcp.js')
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NCP_WORKING_DIR: TEST_ROOT,
          NCP_CONFIG_PATH: NCP_DIR,
          NCP_PROFILE: TEST_PROFILE,  // Use env var instead of CLI arg
          NO_COLOR: 'true',  // Disable colors in output
          NCP_DEBUG: 'true'  // Enable debug logging
        }
      });

      this.ncp.stdout.on('data', (data) => {
        this.responseBuffer += data.toString();
        const lines = this.responseBuffer.split('\n');

        lines.slice(0, -1).forEach(line => {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              this.responses.push(response);
            } catch (e) {
              // Ignore non-JSON lines (logs, etc.)
            }
          }
        });

        this.responseBuffer = lines[lines.length - 1];
      });

      this.ncp.stderr.on('data', (data) => {
        // Collect stderr for debugging
        const msg = data.toString();
        this.stderrBuffer += msg;
        if (msg.includes('[DEBUG]') || msg.includes('ERROR') || msg.includes('WARN')) {
          console.log(msg.trim());
        }
      });

      this.ncp.on('error', reject);
      this.ncp.once('spawn', resolve);
    });
  }

  sendRequest(method, params = {}) {
    this.requestId++;
    const request = {
      jsonrpc: '2.0',
      id: this.requestId,
      method,
      params
    };

    this.ncp.stdin.write(JSON.stringify(request) + '\n');
    return this.requestId;
  }

  async initializeLegacy() {
    const id = this.sendRequest('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'ncp-integration-test', version: '1.0.0' }
    });
    const response = await this.waitForResponse(id, TIMEOUT_MS);
    if (response.error) {
      throw new Error(`initialize failed: ${response.error.message}`);
    }
    this.ncp.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    }) + '\n');
    return response;
  }

  waitForResponse(id, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkResponse = () => {
        const response = this.responses.find(r => r.id === id);
        if (response) {
          resolve(response);
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          const stderr = this.stderrBuffer.trim().slice(-4000);
          reject(new Error(`Timeout waiting for response to request ${id}${stderr ? `\nChild stderr:\n${stderr}` : ''}`));
          return;
        }

        setTimeout(checkResponse, 10);
      };

      checkResponse();
    });
  }

  async stop() {
    if (this.ncp) {
      const child = this.ncp;
      if (child.exitCode !== null || child.signalCode !== null) {
        activeClients.delete(this);
        return;
      }

      // Close stdin to trigger graceful shutdown (allows cache finalization).
      await new Promise(resolve => {
        let settled = false;
        let forceKillTimer;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (forceKillTimer) clearTimeout(forceKillTimer);
          activeClients.delete(this);
          resolve();
        };
        child.once('exit', finish);
        forceKillTimer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) child.kill();
          finish();
        }, 2000);
        child.stdin.end();
      });
    }
  }
}

async function test1_Initialize() {
  logInfo('Test 1: Initialize request responds immediately');

  const client = new MCPClientSimulator();
  await client.start();

  const startTime = Date.now();
  const id = client.sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' }
  });

  const response = await client.waitForResponse(id);
  const duration = Date.now() - startTime;

  await client.stop();

  if (response.error) {
    logError(`Initialize failed: ${response.error.message}`);
    return false;
  }

  // This includes cold Node/module startup on shared runners. Protocol
  // responsiveness after initialization is checked separately below.
  const maxDuration = process.platform === 'win32' || process.env.CI ? 5000 : 1000;
  if (duration > maxDuration) {
    logError(`Initialize took ${duration}ms (should be < ${maxDuration}ms)`);
    return false;
  }

  if (!response.result?.protocolVersion) {
    logError('Initialize response missing protocolVersion');
    return false;
  }

  logSuccess(`Initialize responded in ${duration}ms`);
  return true;
}

async function test2_ToolsListDuringIndexing() {
  logInfo('Test 2: tools/list responds < 250ms even during indexing');

  const client = new MCPClientSimulator();
  await client.start();

  // Send initialize first (required by MCP protocol)
  const initId = client.sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' }
  });
  await client.waitForResponse(initId);
  client.ncp.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    method: 'notifications/initialized'
  }) + '\n');

  // Call tools/list immediately after initialize (during indexing)
  const startTime = Date.now();
  const id = client.sendRequest('tools/list');

  const response = await client.waitForResponse(id);
  const duration = Date.now() - startTime;

  await client.stop();

  if (response.error) {
    logError(`tools/list failed: ${response.error.message}`);
    return false;
  }

  if (duration > 250) {
    logError(`tools/list took ${duration}ms (should be < 250ms)`);
    return false;
  }

  if (!response.result?.tools || response.result.tools.length === 0) {
    logError('tools/list returned no tools');
    return false;
  }

  const toolNames = response.result.tools.map(t => t.name);
  // Code mode is enabled by default, so we expect 'find' and 'code'
  // If code mode were disabled, we'd expect 'find' and 'run'
  if (!toolNames.includes('find') || (!toolNames.includes('code') && !toolNames.includes('run'))) {
    logError(`tools/list missing required tools. Got: ${toolNames.join(', ')}`);
    return false;
  }

  logSuccess(`tools/list responded in ${duration}ms with ${response.result.tools.length} tools`);
  return true;
}

async function test3_FindDuringIndexing() {
  logInfo('Test 3: find returns results or useful guidance while startup indexing settles');

  const client = new MCPClientSimulator();
  await client.start();

  await client.initializeLegacy();

  // Call find immediately (during indexing) - like Perplexity does
  const id = client.sendRequest('tools/call', {
    name: 'find',
    arguments: { description: 'read file' }
  });

  const response = await client.waitForResponse(id, 10000);

  await client.stop();

  if (response.error) {
    logError(`find failed: ${response.error.message}`);
    return false;
  }

  const text = response.result?.content?.[0]?.text || '';

  // Should either:
  // 1. Return partial results with indexing message
  // 2. Return "indexing in progress" message
  // Should NOT return blank or "No tools found" without context

  const hasUsefulFallback = text.includes('explore these available MCPs') || text.includes('Try broader search terms');
  if (text.includes('No tools found') && !text.includes('Indexing') && !hasUsefulFallback) {
    logError(`find returned no results without guidance: ${JSON.stringify(response)}`);
    return false;
  }

  if (text.length === 0) {
    logError('find returned empty response');
    return false;
  }

  const hasIndexingMessage = text.includes('Indexing in progress') || text.includes('indexing');
  const hasResults = text.includes('**') || text.includes('tools') || text.includes('MCP');

  if (!hasIndexingMessage && !hasResults) {
    logError('find response has neither indexing message nor results');
    return false;
  }

  logSuccess(`find returned ${hasResults ? 'partial results' : 'indexing message'}`);
  return true;
}

async function test4_CacheProfileHashPersists() {
  logInfo('Test 4: Cache profileHash persists correctly');

  // Clear cache first
  const metaPath = path.join(CACHE_DIR, `${TEST_PROFILE}-cache-meta.json`);
  const csvPath = path.join(CACHE_DIR, `${TEST_PROFILE}-tools.csv`);

  if (fs.existsSync(metaPath)) {
    fs.unlinkSync(metaPath);
  }
  if (fs.existsSync(csvPath)) {
    fs.unlinkSync(csvPath);
  }

  // Start server and let it create cache
  const client1 = new MCPClientSimulator();
  await client1.start();
  await client1.initializeLegacy();

  const id1 = client1.sendRequest('tools/call', {
    name: 'find',
    arguments: { description: 'read a local file' }
  });

  const response = await client1.waitForResponse(id1, TIMEOUT_MS);
  if (response.error) {
    throw new Error(`find failed while indexing cache: ${response.error.message}`);
  }

  // Wait for the profile hash and complete fixture catalog, not a guessed delay.
  const completedCache = await waitForCompletedCatalog(metaPath, csvPath, client1);
  await client1.stop();

  // Check cache metadata
  const metadata = completedCache.metadata;

  logSuccess(`Cache profileHash saved: ${metadata.profileHash.substring(0, 16)}...`);
  return true;
}

async function waitForCompletedCatalog(metaPath, csvPath, client, timeoutMs = CACHE_POLL_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastState = 'cache metadata not written yet';
  let lastMetadata;

  while (Date.now() < deadline) {
    try {
      const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      lastMetadata = metadata;
      const indexedMCPs = metadata.indexedMCPs || {};
      const rows = fs.readFileSync(csvPath, 'utf-8').split(/\r?\n/).filter(Boolean).slice(1);
      const fixtureIndexed = Object.prototype.hasOwnProperty.call(indexedMCPs, FIXTURE_MCP_NAME);
      const complete = Boolean(metadata.profileHash)
        && fixtureIndexed
        && Number(metadata.totalMCPs) >= 1
        && Number(metadata.totalTools) >= 1
        && rows.length >= Number(metadata.totalTools);

      lastState = `profileHash=${metadata.profileHash ? 'present' : 'empty'}, totalMCPs=${metadata.totalMCPs}, totalTools=${metadata.totalTools}, indexed=${Object.keys(indexedMCPs).join(',') || 'none'}, csvRows=${rows.length}`;
      if (complete) return { metadata, rows };
    } catch (error) {
      lastState = error.message;
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const stderr = client?.stderrBuffer?.trim();
  const stderrDiagnostics = stderr
    ? stderr.length <= 16000
      ? stderr
      : `${stderr.slice(0, 4000)}\n... ${stderr.length - 12000} characters omitted ...\n${stderr.slice(-8000)}`
    : '';
  let debugLogDiagnostics = '';
  const logsDir = path.join(NCP_DIR, 'logs');
  if (fs.existsSync(logsDir)) {
    const debugLogs = fs.readdirSync(logsDir)
      .filter(file => file.startsWith('ncp-debug-') && file.endsWith('.log'))
      .map(file => ({ file, modified: fs.statSync(path.join(logsDir, file)).mtimeMs }))
      .sort((a, b) => a.modified - b.modified)
      .map(({ file }) => `--- ${file} ---\n${fs.readFileSync(path.join(logsDir, file), 'utf-8')}`)
      .join('\n');
    if (debugLogs) debugLogDiagnostics = debugLogs.length <= 24000
      ? debugLogs
      : `${debugLogs.slice(0, 6000)}\n... ${debugLogs.length - 18000} characters omitted ...\n${debugLogs.slice(-12000)}`;
  }
  const failedMCPs = lastMetadata?.failedMCPs
    ? `\nFailed MCP records:\n${JSON.stringify(lastMetadata.failedMCPs, null, 2)}`
    : '';
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for the completed ${FIXTURE_MCP_NAME} catalog (${lastState})` +
    `${failedMCPs}` +
    `${stderrDiagnostics ? `\nChild stderr:\n${stderrDiagnostics}` : ''}` +
    `${debugLogDiagnostics ? `\nNCP debug logs:\n${debugLogDiagnostics}` : ''}`
  );
}

async function test5_NoReindexingOnRestart() {
  logInfo('Test 5: Second startup uses cache (no re-indexing)');

  const metaPath = path.join(CACHE_DIR, `${TEST_PROFILE}-cache-meta.json`);

  // Get initial cache state
  const metaBefore = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  const hashBefore = metaBefore.profileHash;
  if (!hashBefore || !metaBefore.indexedMCPs?.[FIXTURE_MCP_NAME] || Number(metaBefore.totalTools) < 1) {
    throw new Error('Cannot verify cache reuse: the initial profile hash and completed fixture catalog must be present');
  }

  // Start server again
  const client = new MCPClientSimulator();
  await client.start();
  await client.initializeLegacy();

  const id = client.sendRequest('tools/call', {
    name: 'find',
    arguments: { description: 'read a local file' }
  });

  const response = await client.waitForResponse(id, TIMEOUT_MS);
  if (response.error) {
    throw new Error(`find failed on cached restart: ${response.error.message}`);
  }
  const completedCache = await waitForCompletedCatalog(metaPath, path.join(CACHE_DIR, `${TEST_PROFILE}-tools.csv`), client);
  await client.stop();

  // Check cache wasn't regenerated
  const metaAfter = completedCache.metadata;
  const hashAfter = metaAfter.profileHash;

  if (!hashAfter) {
    logError('profileHash is empty after restart; equality with an empty hash cannot verify cache reuse');
    return false;
  }

  if (hashBefore !== hashAfter) {
    logError(`profileHash changed on restart (cache invalidated):\n  Before: ${hashBefore}\n  After: ${hashAfter}`);
    return false;
  }

  // Note: lastUpdated might change slightly due to timestamp updates, that's OK
  // The key is profileHash stays the same

  logSuccess('Cache persisted correctly (profileHash unchanged on restart)');
  return true;
}

async function test6_CredentialsJsonOutput() {
  logInfo('Test 6: credentials --json returns well-formed output');

  const result = spawnSync(process.execPath, [
    'dist/index.js', '--working-dir', TEST_ROOT, 'credentials', '--json'
  ], {
    env: {
      ...process.env,
      NO_COLOR: 'true'
    },
    encoding: 'utf-8'
  });

  if (result.status !== 0) {
    logError(`credentials --json exited with code ${result.status}`);
    if (result.stderr) {
      logInfo(`stderr:\n${result.stderr}`);
    }
    return false;
  }

  const raw = result.stdout.trim();
  if (!raw) {
    logError('credentials --json produced empty output');
    return false;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.secureStore) || !Array.isArray(parsed.vault)) {
      logError('credentials --json missing secureStore or vault arrays');
      return false;
    }
  } catch (error) {
    logError(`credentials --json output was not valid JSON: ${error.message}`);
    logInfo(`Output:\n${raw}`);
    return false;
  }

  logSuccess('credentials --json produced valid JSON payload');
  return true;
}

async function cleanupTestEnvironment() {
  await Promise.all([...activeClients].map(client => client.stop()));
  if (TEST_ROOT && fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  }
}

async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 NCP Integration Test Suite');
  console.log('   Simulating Real AI Client Behavior');
  console.log('='.repeat(60) + '\n');

  const tests = [
    test1_Initialize,
    test2_ToolsListDuringIndexing,
    test3_FindDuringIndexing,
    test4_CacheProfileHashPersists,
    test5_NoReindexingOnRestart,
    test6_CredentialsJsonOutput
  ];

  let passed = 0;
  let failed = 0;

  try {
    setupTestProfile();

    for (const test of tests) {
      try {
        const result = await test();
        if (result) {
          passed++;
        } else {
          failed++;
        }
      } catch (error) {
        logError(`${test.name} threw error: ${error.message}`);
        failed++;
      }
      console.log(''); // Blank line between tests
    }
  } finally {
    await cleanupTestEnvironment();
  }

  console.log('='.repeat(60));
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60) + '\n');

  if (failed > 0) {
    console.log('❌ INTEGRATION TESTS FAILED - DO NOT RELEASE\n');
    process.exitCode = 1;
  } else {
    console.log('✅ ALL INTEGRATION TESTS PASSED - Safe to release\n');
    process.exitCode = 0;
  }
}

// Run tests
runAllTests().catch(error => {
  logError(`Test suite crashed: ${error.message}`);
  console.error(error);
  cleanupTestEnvironment().catch(cleanupError => {
    console.error(`Failed to clean integration test temp directory: ${cleanupError.message}`);
  }).finally(() => {
    process.exitCode = 1;
  });
});
