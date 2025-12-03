#!/usr/bin/env node
/**
 * Integration Test: ncp:code tool
 *
 * Tests the ncp:code tool to reproduce parameter passing issues
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Test configuration
const NCP_DIR = path.join(process.cwd(), '.ncp');
const PROFILES_DIR = path.join(NCP_DIR, 'profiles');
const TEST_PROFILE = 'code-test';

// Ensure test profile exists
function setupTestProfile() {
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
  }

  const profilePath = path.join(PROFILES_DIR, `${TEST_PROFILE}.json`);
  const testProfile = {
    name: TEST_PROFILE,
    description: 'Test profile for ncp:code',
    mcpServers: {},
    metadata: {
      created: new Date().toISOString(),
      modified: new Date().toISOString()
    }
  };

  fs.writeFileSync(profilePath, JSON.stringify(testProfile, null, 2));
  console.log(`✓ Created test profile at ${profilePath}`);
}

class MCPClientSimulator {
  constructor() {
    this.ncp = null;
    this.responses = [];
    this.responseBuffer = '';
    this.requestId = 0;
    this.stderrLines = [];
  }

  start() {
    return new Promise((resolve, reject) => {
      console.log('Starting NCP MCP server...');

      this.ncp = spawn('node', ['dist/index.js', '--profile', TEST_PROFILE], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NCP_MODE: 'mcp',
          NO_COLOR: 'true'
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
        const msg = data.toString();
        this.stderrLines.push(msg);
        console.log('[STDERR]', msg.trim());
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

async function testCodeExecution() {
  console.log('\n' + '='.repeat(60));
  console.log('Testing ncp:code tool');
  console.log('='.repeat(60) + '\n');

  const client = new MCPClientSimulator();
  await client.start();

  try {
    // 1. Initialize
    console.log('Step 1: Initialize...');
    const initId = client.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });

    const initResponse = await client.waitForResponse(initId);
    if (initResponse.error) {
      console.error('❌ Initialize failed:', initResponse.error);
      return false;
    }
    console.log('✓ Initialize successful');

    // 2. Send initialized notification
    console.log('\nStep 2: Send initialized notification...');
    client.sendNotification('notifications/initialized', {});
    console.log('✓ Notification sent');

    // 3. Test simple code execution
    console.log('\nStep 3: Call ncp:code with simple code...');
    const codeId = client.sendRequest('tools/call', {
      name: 'code',
      arguments: {
        code: 'return "Hello World"'
      }
    });

    console.log('Waiting for response...');
    const codeResponse = await client.waitForResponse(codeId, 10000);

    console.log('\n' + '='.repeat(60));
    console.log('RESPONSE:');
    console.log('='.repeat(60));
    console.log(JSON.stringify(codeResponse, null, 2));
    console.log('='.repeat(60) + '\n');

    if (codeResponse.error) {
      console.error('❌ Code execution failed!');
      console.error('Error:', codeResponse.error);

      // Check for the specific error
      if (JSON.stringify(codeResponse.error).includes('Arg string terminates')) {
        console.error('\n⚠️  FOUND THE BUG: "Arg string terminates parameters early"');
      }

      return false;
    }

    console.log('✓ Code execution successful!');
    console.log('Result:', codeResponse.result);
    return true;

  } catch (error) {
    console.error('❌ Test threw error:', error.message);
    console.error(error.stack);
    return false;
  } finally {
    console.log('\nStopping server...');
    await client.stop();

    // Print all stderr for debugging
    if (client.stderrLines.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('STDERR OUTPUT:');
      console.log('='.repeat(60));
      console.log(client.stderrLines.join(''));
      console.log('='.repeat(60));
    }
  }
}

async function main() {
  setupTestProfile();
  const success = await testCodeExecution();

  console.log('\n' + '='.repeat(60));
  if (success) {
    console.log('✅ TEST PASSED');
  } else {
    console.log('❌ TEST FAILED');
  }
  console.log('='.repeat(60) + '\n');

  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('Test crashed:', error);
  process.exit(1);
});
