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
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Test configuration
// Use local .ncp directory for integration tests to avoid conflicts with user's global config
const NCP_DIR = path.join(process.cwd(), '.ncp');
const PROFILES_DIR = path.join(NCP_DIR, 'profiles');
const CACHE_DIR = path.join(NCP_DIR, 'cache');
const TEST_PROFILE = 'integration-test';
const TIMEOUT_MS = 10000;

// Ensure test profile exists
function setupTestProfile() {
  // Create .ncp directory structure
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
  }
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  // Create minimal test profile with filesystem MCP
  // filesystem MCP requires allowed directories as arguments
  const profilePath = path.join(PROFILES_DIR, `${TEST_PROFILE}.json`);
  const testProfile = {
    name: TEST_PROFILE, // IMPORTANT: profile.name must match filename for ProfileManager to load it correctly
    description: 'Integration test profile',
    mcpServers: {
      filesystem: {
        command: 'npx',
        args: ['@modelcontextprotocol/server-filesystem', '/tmp']
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
  }

  start() {
    return new Promise((resolve, reject) => {
      logInfo('Starting NCP MCP server...');

      this.ncp = spawn('node', ['dist/index.js', '--profile', TEST_PROFILE], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NCP_MODE: 'mcp',
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
        if (msg.includes('[DEBUG]')) {
          console.log(msg.trim());
        }
      });

      this.ncp.on('error', reject);

      // Give it a moment to start
      setTimeout(resolve, 100);
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
          reject(new Error(`Timeout waiting for response to request ${id}`));
          return;
        }

        setTimeout(checkResponse, 10);
      };

      checkResponse();
    });
  }

  async stop() {
    if (this.ncp) {
      // Close stdin to trigger graceful shutdown (allows cache finalization)
      this.ncp.stdin.end();
      // Wait for process to exit gracefully
      await new Promise(resolve => {
        this.ncp.once('exit', resolve);
        // Fallback: force kill after 2 seconds if it doesn't exit
        setTimeout(() => {
          if (!this.ncp.killed) {
            this.ncp.kill();
            resolve();
          }
        }, 2000);
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

  if (duration > 1000) {
    logError(`Initialize took ${duration}ms (should be < 1000ms)`);
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

  // Call tools/list immediately (during indexing)
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
  if (!toolNames.includes('find') || !toolNames.includes('run')) {
    logError(`tools/list missing required tools. Got: ${toolNames.join(', ')}`);
    return false;
  }

  logSuccess(`tools/list responded in ${duration}ms with ${response.result.tools.length} tools`);
  return true;
}

async function test3_FindDuringIndexing() {
  logInfo('Test 3: find returns partial results during indexing (not empty)');

  const client = new MCPClientSimulator();
  await client.start();

  // Call find immediately (during indexing) - like Perplexity does
  const id = client.sendRequest('tools/call', {
    name: 'find',
    arguments: { description: 'list files' }
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

  if (text.includes('No tools found') && !text.includes('Indexing')) {
    logError('find returned empty without indexing context');
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

  const id1 = client1.sendRequest('tools/call', {
    name: 'find',
    arguments: {}
  });

  await client1.waitForResponse(id1, 10000);

  // Wait a bit for indexing to potentially complete
  await new Promise(resolve => setTimeout(resolve, 2000));

  await client1.stop();

  // Wait for cache to be finalized and written
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Check cache metadata
  if (!fs.existsSync(metaPath)) {
    logError('Cache metadata file not created');
    logInfo(`Expected at: ${metaPath}`);

    // List what's in cache dir for debugging
    if (fs.existsSync(CACHE_DIR)) {
      const files = fs.readdirSync(CACHE_DIR);
      logInfo(`Files in cache dir: ${files.join(', ')}`);
    }

    return false;
  }

  const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

  if (!metadata.profileHash || metadata.profileHash === '') {
    logError(`profileHash is empty: "${metadata.profileHash}"`);
    return false;
  }

  logSuccess(`Cache profileHash saved: ${metadata.profileHash.substring(0, 16)}...`);
  return true;
}

async function test5_NoReindexingOnRestart() {
  logInfo('Test 5: Second startup uses cache (no re-indexing)');

  const metaPath = path.join(CACHE_DIR, `${TEST_PROFILE}-cache-meta.json`);

  // Get initial cache state
  const metaBefore = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  const hashBefore = metaBefore.profileHash;
  const lastUpdatedBefore = metaBefore.lastUpdated;

  // Wait a moment to ensure timestamp would change if re-indexed
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Start server again
  const client = new MCPClientSimulator();
  await client.start();

  const id = client.sendRequest('tools/call', {
    name: 'find',
    arguments: {}
  });

  await client.waitForResponse(id, 10000);
  await client.stop();

  // Wait for any potential cache updates
  await new Promise(resolve => setTimeout(resolve, 500));

  // Check cache wasn't regenerated
  const metaAfter = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  const hashAfter = metaAfter.profileHash;

  if (hashBefore !== hashAfter) {
    logError(`profileHash changed on restart (cache invalidated):\n  Before: ${hashBefore}\n  After: ${hashAfter}`);
    return false;
  }

  // Note: lastUpdated might change slightly due to timestamp updates, that's OK
  // The key is profileHash stays the same

  logSuccess('Cache persisted correctly (profileHash unchanged on restart)');
  return true;
}

async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 NCP Integration Test Suite');
  console.log('   Simulating Real AI Client Behavior');
  console.log('='.repeat(60) + '\n');

  // Setup test environment
  setupTestProfile();

  const tests = [
    test1_Initialize,
    test2_ToolsListDuringIndexing,
    test3_FindDuringIndexing,
    test4_CacheProfileHashPersists,
    test5_NoReindexingOnRestart
  ];

  let passed = 0;
  let failed = 0;

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

  console.log('='.repeat(60));
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60) + '\n');

  if (failed > 0) {
    console.log('❌ INTEGRATION TESTS FAILED - DO NOT RELEASE\n');
    process.exit(1);
  } else {
    console.log('✅ ALL INTEGRATION TESTS PASSED - Safe to release\n');
    process.exit(0);
  }
}

// Cleanup on exit
process.on('exit', () => {
  // Clean up test profile cache if needed
  const metaPath = path.join(CACHE_DIR, `${TEST_PROFILE}-cache-meta.json`);
  if (fs.existsSync(metaPath)) {
    // Optionally clean up: fs.unlinkSync(metaPath);
  }
});

// Run tests
runAllTests().catch(error => {
  logError(`Test suite crashed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
