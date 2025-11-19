/**
 * Workflow Mode Verification Test
 *
 * Tests that workflow mode filtering actually works by querying tools/list
 * for each mode and verifying the correct tools are exposed.
 */

const { spawn } = require('child_process');
const path = require('path');

class WorkflowModeTest {
  constructor(mode) {
    this.mode = mode;
    this.serverProcess = null;
    this.requestId = 1;
    this.pendingRequests = new Map();
  }

  async startServer() {
    return new Promise((resolve, reject) => {
      console.log(`🚀 Starting server with mode: ${this.mode}`);

      const serverPath = path.join(__dirname, '../../dist/index-mcp.js');

      // Set workflow mode via environment variable
      const env = {
        ...process.env,
        NCP_WORKFLOW_MODE: this.mode
      };

      this.serverProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env
      });

      // Collect stdout for JSON-RPC messages
      this.serverProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const message = JSON.parse(line);
            if (message.id && this.pendingRequests.has(message.id)) {
              const { resolve } = this.pendingRequests.get(message.id);
              this.pendingRequests.delete(message.id);
              resolve(message.result);
            }
          } catch (e) {
            // Not JSON, skip
          }
        }
      });

      // Log stderr only for important messages
      this.serverProcess.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Workflow mode:') || output.includes('ERROR') || output.includes('FATAL')) {
          console.log(`   [Server] ${output.trim()}`);
        }
      });

      this.serverProcess.on('error', (error) => {
        reject(new Error(`Server error: ${error.message}`));
      });

      // Give server time to start
      setTimeout(() => resolve(), 1500);
    });
  }

  sendRequest(method, params = {}) {
    const id = this.requestId++;
    const request = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.serverProcess.stdin.write(JSON.stringify(request) + '\n');

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 5000);
    });
  }

  sendNotification(method, params = {}) {
    const notification = { jsonrpc: '2.0', method, params };
    this.serverProcess.stdin.write(JSON.stringify(notification) + '\n');
  }

  async testMode() {
    try {
      // Start server
      await this.startServer();

      // Initialize
      await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' }
      });

      this.sendNotification('notifications/initialized', {});

      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get tools list
      const result = await this.sendRequest('tools/list', {});

      const toolNames = result.tools.map(t => t.name).sort();

      console.log(`   Exposed tools: ${toolNames.join(', ')}`);

      // Verify expectations
      let passed = false;
      switch (this.mode) {
        case 'find-and-run':
          passed = toolNames.includes('find') &&
                   toolNames.includes('run') &&
                   !toolNames.includes('code');
          break;
        case 'find-and-code':
          passed = toolNames.includes('find') &&
                   toolNames.includes('code') &&
                   !toolNames.includes('run');
          break;
        case 'code-only':
          passed = toolNames.includes('code') &&
                   !toolNames.includes('find') &&
                   !toolNames.includes('run');
          break;
      }

      return { passed, toolNames };

    } finally {
      // Cleanup
      if (this.serverProcess) {
        this.serverProcess.kill('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
}

async function runTests() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Workflow Mode Verification Test                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const modes = ['find-and-run', 'find-and-code', 'code-only'];
  const results = {};

  for (const mode of modes) {
    console.log(`\n📝 Testing: ${mode}`);
    console.log('─'.repeat(60));

    try {
      const test = new WorkflowModeTest(mode);
      const { passed, toolNames } = await test.testMode();

      results[mode] = { passed, toolNames };

      if (passed) {
        console.log(`   ✅ PASSED - Correct tools exposed\n`);
      } else {
        console.log(`   ❌ FAILED - Wrong tools exposed\n`);
      }
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}\n`);
      results[mode] = { passed: false, error: error.message };
    }
  }

  // Summary
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  Test Summary                                            ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  for (const [mode, result] of Object.entries(results)) {
    const status = result.passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`${status} - ${mode}`);
    if (result.toolNames) {
      console.log(`         Tools: ${result.toolNames.join(', ')}`);
    }
    if (result.error) {
      console.log(`         Error: ${result.error}`);
    }
  }

  console.log('\nExpected behavior:');
  console.log('  • find-and-run: find + run (no code)');
  console.log('  • find-and-code: find + code (no run)');
  console.log('  • code-only: code (no find/run)\n');

  const allPassed = Object.values(results).every(r => r.passed);

  if (allPassed) {
    console.log('🎉 All workflow modes working correctly!\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check implementation.\n');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
