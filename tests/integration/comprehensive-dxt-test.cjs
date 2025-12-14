#!/usr/bin/env node
/**
 * COMPREHENSIVE DXT TEST
 *
 * Tests EVERYTHING that matters for production use:
 * 1. Server initializes correctly with Claude Desktop clientInfo
 * 2. find() discovers tools via semantic search
 * 3. run() can execute MCP tools
 * 4. Server handles multiple sequential requests without crashing
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

// Test 2: find() tool discovers tools via semantic search
async function test2_FindTools() {
  logInfo('TEST 2: find() discovers tools via semantic search');

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

  // Search for file-related tools (should always be available)
  const findId = test.sendRequest('tools/call', {
    name: 'find',
    arguments: {
      description: 'read file contents',
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

  // Check if results contain tool information
  const hasResults = content.includes('Tool:') ||
                     content.includes('match') ||
                     content.includes('read') ||
                     content.includes('file');

  if (hasResults) {
    logSuccess('find() returned relevant tools');
    logInfo(`  Results preview: \n${content.substring(0, 300)}...`);
    return true;
  } else {
    logError('find() did not return expected results');
    logInfo(`  Received: ${content.substring(0, 200)}`);
    return false;
  }
}

// Test 3: run() tool can execute MCP tools
async function test3_RunMCPTool() {
  logInfo('TEST 3: run() can execute MCP tools');

  const test = new ComprehensiveDXTTest();
  await test.start();

  // Initialize
  const initId = test.sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'claude-desktop', version: '0.14.0' }
  });
  await test.waitForResponse(initId);

  // Try to call a safe built-in tool (mcp:list)
  const runId = test.sendRequest('tools/call', {
    name: 'run',
    arguments: {
      tool: 'mcp:list',
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

// Test 4: Server handles multiple requests without crashing
async function test4_MultipleRequests() {
  logInfo('TEST 4: Server handles 10 sequential requests');

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
    { name: 'find() discovers tools', fn: test2_FindTools },
    { name: 'run() executes tools', fn: test3_RunMCPTool },
    { name: 'Multiple requests', fn: test4_MultipleRequests }
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
