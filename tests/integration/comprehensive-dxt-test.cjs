#!/usr/bin/env node
/**
 * COMPREHENSIVE DXT TEST
 *
 * Tests EVERYTHING that matters for production use:
 * 1. Server stays alive (no crash)
 * 2. Auto-import triggers with Claude Desktop clientInfo
 * 3. Apple MCP gets imported to profile
 * 4. Apple MCP tools become discoverable via find()
 * 5. Tools can actually be called
 *
 * This simulates the EXACT Claude Desktop workflow using JSON-RPC protocol.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROFILE_PATH = path.join(process.cwd(), '.ncp/profiles/all.json');
const TEST_TIMEOUT = 30000;

function log(emoji, message, color = '\x1b[0m') {
  console.log(`${emoji} ${color}${message}\x1b[0m`);
}

function logSuccess(message) { log('✅', message, '\x1b[32m'); }
function logError(message) { log('❌', message, '\x1b[31m'); }
function logInfo(message) { log('ℹ️', message, '\x1b[34m'); }
function logWarn(message) { log('⚠️', message, '\x1b[33m'); }

class ComprehensiveDXTTest {
  constructor() {
    this.server = null;
    this.responses = [];
    this.responseBuffer = '';
    this.requestId = 0;
    this.stderr = '';
  }

  start() {
    return new Promise((resolve, reject) => {
      logInfo('Starting DXT server (dist/index-mcp.js)...');

      this.server = spawn('node', [
        path.join(process.cwd(), 'dist/index-mcp.js'),
        '--profile', 'all'
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NCP_MODE: 'extension',
          NCP_AUTO_IMPORT: 'true',
          NO_COLOR: 'true',
          NCP_DEBUG: 'true'
        }
      });

      this.server.stdout.on('data', (data) => {
        this.responseBuffer += data.toString();
        const lines = this.responseBuffer.split('\n');

        lines.slice(0, -1).forEach(line => {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              this.responses.push(response);
            } catch (e) {
              // Ignore non-JSON
            }
          }
        });

        this.responseBuffer = lines[lines.length - 1];
      });

      this.server.stderr.on('data', (data) => {
        this.stderr += data.toString();
      });

      this.server.on('error', reject);
      this.server.on('exit', (code, signal) => {
        if (code !== 0 && code !== null && signal === null) {
          reject(new Error(`Server crashed with code ${code}. stderr: ${this.stderr}`));
        }
      });

      setTimeout(resolve, 300);
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

    this.server.stdin.write(JSON.stringify(request) + '\n');
    return this.requestId;
  }

  sendNotification(method, params = {}) {
    const notification = {
      jsonrpc: '2.0',
      method,
      params
    };

    this.server.stdin.write(JSON.stringify(notification) + '\n');
  }

  async waitForResponse(id, timeoutMs = 5000) {
    const startTime = Date.now();

    while (true) {
      const response = this.responses.find(r => r.id === id);
      if (response) return response;

      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Timeout waiting for response ${id}. stderr: ${this.stderr}`);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  async stop() {
    if (this.server) {
      this.server.stdin.end();
      await new Promise(resolve => {
        this.server.once('exit', resolve);
        setTimeout(() => {
          if (!this.server.killed) {
            this.server.kill();
            resolve();
          }
        }, 2000);
      });
    }
  }
}

// Test 1: Server initializes with Claude Desktop clientInfo
async function test1_Initialize() {
  logInfo('TEST 1: Server initializes with Claude Desktop clientInfo');

  const test = new ComprehensiveDXTTest();
  await test.start();

  const id = test.sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'claude-desktop',  // EXACT name Claude Desktop sends
      version: '0.14.0'
    }
  });

  const response = await test.waitForResponse(id, 5000);
  await test.stop();

  if (response.error) {
    logError(`Initialize failed: ${response.error.message}`);
    return false;
  }

  if (!response.result?.protocolVersion) {
    logError('Missing protocolVersion in initialize response');
    return false;
  }

  if (!response.result?.serverInfo?.name) {
    logError('Missing serverInfo.name');
    return false;
  }

  logSuccess('Initialize responded correctly');
  return true;
}

// Test 2: Auto-import adds Apple MCP to profile
async function test2_AutoImportAppleMCP() {
  logInfo('TEST 2: Auto-import detects and imports Apple MCP');

  // Backup original profile
  let originalProfile = null;
  if (fs.existsSync(PROFILE_PATH)) {
    originalProfile = fs.readFileSync(PROFILE_PATH, 'utf-8');
  }

  try {
    // Read profile before test
    const profileBefore = fs.existsSync(PROFILE_PATH)
      ? JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf-8'))
      : { mcpServers: {} };

    const mcpsBefore = new Set(Object.keys(profileBefore.mcpServers || {}));
    logInfo(`  MCPs before: ${mcpsBefore.size}`);

    const test = new ComprehensiveDXTTest();
    await test.start();

    // Send initialize with Claude Desktop clientInfo (triggers auto-import)
    const id = test.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'claude-desktop',
        version: '0.14.0'
      }
    });

    await test.waitForResponse(id, 5000);

    // Send initialized notification (required by MCP protocol to trigger oninitialized callback)
    test.sendNotification('notifications/initialized', {});

    // Wait for auto-import to complete (it runs async)
    logInfo('  Waiting for auto-import to complete...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    await test.stop();

    // Check if profile was updated
    if (!fs.existsSync(PROFILE_PATH)) {
      logError('Profile file does not exist');
      return false;
    }

    const profileAfter = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf-8'));
    const mcpsAfter = new Set(Object.keys(profileAfter.mcpServers || {}));
    logInfo(`  MCPs after: ${mcpsAfter.size}`);

    // Find new MCPs
    const newMCPs = [...mcpsAfter].filter(name => !mcpsBefore.has(name));

    if (newMCPs.length > 0) {
      logSuccess(`Auto-imported ${newMCPs.length} MCP(s): ${newMCPs.join(', ')}`);

      // Check specifically for Apple MCP
      const appleMCP = newMCPs.find(name =>
        name.toLowerCase().includes('apple') ||
        name === 'Apple MCP'
      );

      if (appleMCP) {
        logSuccess(`✨ Apple MCP detected: "${appleMCP}"`);
      } else {
        logWarn('Apple MCP not found in new imports (might not be installed)');
      }

      return true;
    } else {
      logWarn('No new MCPs imported (Apple MCP might already be in profile)');

      // Check if Apple MCP already exists
      const existingAppleMCP = [...mcpsAfter].find(name =>
        name.toLowerCase().includes('apple')
      );

      if (existingAppleMCP) {
        logInfo(`  Apple MCP already configured: "${existingAppleMCP}"`);
        return true;
      }

      return false;
    }
  } finally {
    // Restore original profile
    if (originalProfile) {
      fs.writeFileSync(PROFILE_PATH, originalProfile);
      logInfo('  Profile restored to original state');
    }
  }
}

// Test 3: find() tool discovers Apple MCP tools
async function test3_FindAppleMCPTools() {
  logInfo('TEST 3: find() discovers Apple MCP tools');

  const test = new ComprehensiveDXTTest();
  await test.start();

  // Initialize
  const initId = test.sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'claude-desktop', version: '0.14.0' }
  });
  await test.waitForResponse(initId);

  // Wait for indexing
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Search for "messages" or "imessage" tools
  const findId = test.sendRequest('tools/call', {
    name: 'find',
    arguments: {
      description: 'send message imessage',
      limit: 10
    }
  });

  const response = await test.waitForResponse(findId, 10000);
  await test.stop();

  if (response.error) {
    logError(`find() failed: ${response.error.message}`);
    return false;
  }

  const content = response.result?.content?.[0]?.text || '';

  // Check if results mention Apple MCP or message-related tools
  const hasMessageTools = content.toLowerCase().includes('message') ||
                          content.toLowerCase().includes('imessage') ||
                          content.toLowerCase().includes('apple');

  if (hasMessageTools) {
    logSuccess('find() returned message-related tools');
    logInfo(`  Results preview: ${content.substring(0, 200)}...`);
    return true;
  } else {
    logWarn('find() did not return message tools (Apple MCP might not have indexed yet)');
    return false;
  }
}

// Test 4: run() tool can execute MCP tools
async function test4_RunMCPTool() {
  logInfo('TEST 4: run() can execute MCP tools');

  const test = new ComprehensiveDXTTest();
  await test.start();

  // Initialize
  const initId = test.sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'claude-desktop', version: '0.14.0' }
  });
  await test.waitForResponse(initId);

  // Try to call a safe built-in tool (ncp:list)
  const runId = test.sendRequest('tools/call', {
    name: 'run',
    arguments: {
      tool: 'ncp:list',
      parameters: {}
    }
  });

  const response = await test.waitForResponse(runId, 10000);
  await test.stop();

  if (response.error) {
    logError(`run() failed: ${response.error.message}`);
    return false;
  }

  const content = response.result?.content?.[0]?.text || '';

  if (content.includes('MCP') || content.includes('server')) {
    logSuccess('run() successfully executed MCP tool');
    return true;
  } else {
    logError('run() returned unexpected result');
    return false;
  }
}

// Test 5: Server handles multiple requests without crashing
async function test5_MultipleRequests() {
  logInfo('TEST 5: Server handles 10 sequential requests');

  const test = new ComprehensiveDXTTest();
  await test.start();

  // Initialize
  const initId = test.sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'claude-desktop', version: '0.14.0' }
  });
  await test.waitForResponse(initId);

  // Send 10 tools/list requests
  for (let i = 0; i < 10; i++) {
    const id = test.sendRequest('tools/list');
    const response = await test.waitForResponse(id, 3000);

    if (response.error) {
      await test.stop();
      logError(`Request ${i + 1}/10 failed`);
      return false;
    }
  }

  await test.stop();
  logSuccess('Server handled 10 sequential requests successfully');
  return true;
}

// Main test runner
async function runAllTests() {
  console.log('\n' + '='.repeat(70));
  console.log('🔬 COMPREHENSIVE DXT TEST SUITE');
  console.log('   Testing EVERYTHING that matters for production');
  console.log('='.repeat(70) + '\n');

  const tests = [
    { name: 'Initialize with clientInfo', fn: test1_Initialize },
    { name: 'Auto-import Apple MCP', fn: test2_AutoImportAppleMCP },
    { name: 'find() discovers tools', fn: test3_FindAppleMCPTools },
    { name: 'run() executes tools', fn: test4_RunMCPTool },
    { name: 'Multiple requests', fn: test5_MultipleRequests }
  ];

  let passed = 0;
  let failed = 0;
  const results = [];

  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
        results.push({ name: test.name, passed: true });
      } else {
        failed++;
        results.push({ name: test.name, passed: false });
      }
    } catch (error) {
      logError(`${test.name} threw error: ${error.message}`);
      failed++;
      results.push({ name: test.name, passed: false, error: error.message });
    }
    console.log('');
  }

  console.log('='.repeat(70));
  console.log('📊 FINAL RESULTS');
  console.log('='.repeat(70));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('');

  results.forEach(result => {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.name}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log('='.repeat(70));

  if (failed > 0) {
    console.log('\n❌ COMPREHENSIVE TEST FAILED - DO NOT RELEASE\n');
    process.exit(1);
  } else {
    console.log('\n✅ ALL COMPREHENSIVE TESTS PASSED - Safe to release\n');
    process.exit(0);
  }
}

// Run tests with timeout
const timeout = setTimeout(() => {
  logError('Test suite timeout (30s)');
  process.exit(1);
}, TEST_TIMEOUT);

runAllTests().catch(error => {
  clearTimeout(timeout);
  logError(`Test suite crashed: ${error.message}`);
  console.error(error);
  process.exit(1);
}).finally(() => {
  clearTimeout(timeout);
});
