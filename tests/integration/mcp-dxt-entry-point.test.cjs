#!/usr/bin/env node
/**
 * Integration Test: DXT Entry Point (index-mcp.js)
 *
 * Tests the ACTUAL entry point used by Claude Desktop DXT packages.
 * This is CRITICAL - the CLI entry point (index.js) has different behavior
 * and cannot substitute for testing the DXT entry point.
 *
 * Key differences:
 * - index.js is CLI entry with commander parsing
 * - index-mcp.js uses MCPServer with fully async initialization for DXT
 *
 * This test caught the "Could not attach" bug where index-mcp.js wasn't
 * awaiting server.run(), causing the process to exit immediately.
 */

const { spawn } = require('child_process');
const path = require('path');

// Test configuration
const TIMEOUT_MS = 10000;

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
  constructor(entryPoint) {
    this.entryPoint = entryPoint;
    this.ncp = null;
    this.responses = [];
    this.responseBuffer = '';
    this.requestId = 0;
    this.stderr = '';
  }

  start() {
    return new Promise((resolve, reject) => {
      logInfo(`Starting ${path.basename(this.entryPoint)}...`);

      this.ncp = spawn('node', [this.entryPoint, '--profile', 'all'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NCP_MODE: 'mcp',
          NO_COLOR: 'true',
          NCP_DEBUG: 'false'
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
              // Ignore non-JSON lines
            }
          }
        });

        this.responseBuffer = lines[lines.length - 1];
      });

      this.ncp.stderr.on('data', (data) => {
        this.stderr += data.toString();
      });

      this.ncp.on('error', reject);

      this.ncp.on('exit', (code, signal) => {
        if (code !== 0 && code !== null && signal === null) {
          reject(new Error(`Process exited with code ${code}. stderr: ${this.stderr}`));
        }
      });

      // Give it a moment to start
      setTimeout(resolve, 200);
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

  sendNotification(method, params = {}) {
    const notification = {
      jsonrpc: '2.0',
      method,
      params
    };

    this.ncp.stdin.write(JSON.stringify(notification) + '\n');
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
          reject(new Error(`Timeout waiting for response to request ${id}. stderr: ${this.stderr}`));
          return;
        }

        setTimeout(checkResponse, 10);
      };

      checkResponse();
    });
  }

  async stop() {
    if (this.ncp) {
      this.ncp.stdin.end();
      await new Promise(resolve => {
        this.ncp.once('exit', resolve);
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

async function testDXTEntryPoint_Initialize() {
  logInfo('Test 1: DXT entry point responds to initialize');

  const entryPoint = path.join(process.cwd(), 'dist/index-mcp.js');
  const client = new MCPClientSimulator(entryPoint);

  try {
    await client.start();

    const startTime = Date.now();
    const id = client.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'claude-desktop', version: '0.14.0' }  // Simulate Claude Desktop
    });

    const response = await client.waitForResponse(id, 5000);
    const duration = Date.now() - startTime;

    await client.stop();

    if (response.error) {
      logError(`Initialize failed: ${response.error.message}`);
      return false;
    }

    if (duration > 2000) {
      logError(`Initialize took ${duration}ms (should be < 2000ms for DXT)`);
      return false;
    }

    if (!response.result?.protocolVersion) {
      logError('Initialize response missing protocolVersion');
      return false;
    }

    logSuccess(`DXT entry point initialized in ${duration}ms`);
    return true;
  } catch (error) {
    await client.stop();
    logError(`Test threw error: ${error.message}`);
    return false;
  }
}

async function testDXTEntryPoint_ToolsList() {
  logInfo('Test 2: DXT entry point responds to tools/list');

  const entryPoint = path.join(process.cwd(), 'dist/index-mcp.js');
  const client = new MCPClientSimulator(entryPoint);

  try {
    await client.start();

    const id = client.sendRequest('tools/list');
    const response = await client.waitForResponse(id, 5000);

    await client.stop();

    if (response.error) {
      logError(`tools/list failed: ${response.error.message}`);
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

    logSuccess(`DXT entry point returned ${response.result.tools.length} tools`);
    return true;
  } catch (error) {
    await client.stop();
    logError(`Test threw error: ${error.message}`);
    return false;
  }
}

async function testDXTEntryPoint_StaysAlive() {
  logInfo('Test 3: DXT entry point stays alive (no premature exit)');

  const entryPoint = path.join(process.cwd(), 'dist/index-mcp.js');
  const client = new MCPClientSimulator(entryPoint);

  try {
    await client.start();

    // Wait 2 seconds to see if process exits prematurely
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Try to send a request - if process died, this will timeout
    const id = client.sendRequest('tools/list');
    const response = await client.waitForResponse(id, 3000);

    await client.stop();

    if (response.error) {
      logError(`Process stayed alive but request failed: ${response.error.message}`);
      return false;
    }

    logSuccess('DXT entry point stayed alive and responsive');
    return true;
  } catch (error) {
    await client.stop();
    logError(`Process exited prematurely or became unresponsive: ${error.message}`);
    return false;
  }
}

async function testDXTEntryPoint_MultipleRequests() {
  logInfo('Test 4: DXT entry point handles multiple sequential requests');

  const entryPoint = path.join(process.cwd(), 'dist/index-mcp.js');
  const client = new MCPClientSimulator(entryPoint);

  try {
    await client.start();

    // Send 3 requests sequentially
    const id1 = client.sendRequest('tools/list');
    const response1 = await client.waitForResponse(id1, 3000);

    const id2 = client.sendRequest('tools/list');
    const response2 = await client.waitForResponse(id2, 3000);

    const id3 = client.sendRequest('tools/list');
    const response3 = await client.waitForResponse(id3, 3000);

    await client.stop();

    if (response1.error || response2.error || response3.error) {
      logError('One or more requests failed');
      return false;
    }

    logSuccess('DXT entry point handled 3 sequential requests successfully');
    return true;
  } catch (error) {
    await client.stop();
    logError(`Test threw error: ${error.message}`);
    return false;
  }
}

async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 DXT Entry Point Test Suite');
  console.log('   Testing dist/index-mcp.js (Used by Claude Desktop)');
  console.log('='.repeat(60) + '\n');

  const tests = [
    testDXTEntryPoint_Initialize,
    testDXTEntryPoint_ToolsList,
    testDXTEntryPoint_StaysAlive,
    testDXTEntryPoint_MultipleRequests
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
    console.log('');
  }

  console.log('='.repeat(60));
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60) + '\n');

  if (failed > 0) {
    console.log('❌ DXT ENTRY POINT TESTS FAILED - DO NOT RELEASE DXT\n');
    process.exit(1);
  } else {
    console.log('✅ ALL DXT ENTRY POINT TESTS PASSED - DXT is safe to release\n');
    process.exit(0);
  }
}

// Run tests
runAllTests().catch(error => {
  logError(`Test suite crashed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
