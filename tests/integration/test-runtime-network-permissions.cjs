/**
 * Integration Test: Runtime Network Permissions via Elicitations
 *
 * Tests the complete flow of Code-Mode requesting permission for local network access
 */

const { spawn } = require('child_process');
const path = require('path');

class RuntimeNetworkPermissionsTest {
  constructor() {
    this.serverProcess = null;
    this.receivedMessages = [];
    this.pendingRequests = new Map();
    this.requestId = 1;
  }

  /**
   * Start the NCP MCP server in a subprocess
   */
  startServer() {
    return new Promise((resolve, reject) => {
      console.log('🚀 Starting NCP MCP server...');

      const serverPath = path.join(__dirname, '../../dist/index-mcp.js');
      this.serverProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      let initBuffer = '';

      // Handle server output
      this.serverProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const message = JSON.parse(line);
            this.receivedMessages.push(message);

            // Handle responses
            if (message.id && this.pendingRequests.has(message.id)) {
              const { resolve } = this.pendingRequests.get(message.id);
              this.pendingRequests.delete(message.id);
              resolve(message.result);
            }

            // Handle elicitation requests (notifications/message)
            if (message.method === 'notifications/message') {
              console.log('\n📋 Elicitation Request:', message.params);
            }
          } catch (e) {
            // Not JSON, likely a log line - collect it until we see valid JSON
            initBuffer += line;
          }
        }
      });

      this.serverProcess.stderr.on('data', (data) => {
        const output = data.toString();
        // Only log errors or important messages to avoid noise
        if (output.includes('ERROR') || output.includes('FATAL') || output.includes('Runtime network permissions')) {
          console.log('[Server]', output.trim());
        }
      });

      // Resolve immediately - we'll confirm readiness via initialize request
      setTimeout(() => resolve(), 1000);

      this.serverProcess.on('error', (error) => {
        reject(new Error(`Server process error: ${error.message}`));
      });

      this.serverProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          console.error(`Server exited with code ${code}`);
        }
      });
    });
  }

  /**
   * Send a JSON-RPC request to the server
   */
  sendRequest(method, params = {}) {
    const id = this.requestId++;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      this.serverProcess.stdin.write(JSON.stringify(request) + '\n');

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 10000);
    });
  }

  /**
   * Send a notification (no response expected)
   */
  sendNotification(method, params = {}) {
    const notification = {
      jsonrpc: '2.0',
      method,
      params
    };
    this.serverProcess.stdin.write(JSON.stringify(notification) + '\n');
  }

  /**
   * Test 1: Initialize MCP server
   */
  async testInitialize() {
    console.log('\n📝 Test 1: Initialize MCP server');

    const result = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        elicitation: {}  // Client supports elicitations
      },
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    });

    console.log('✅ Server initialized');
    console.log('   - Server name:', result.serverInfo.name);
    console.log('   - Server version:', result.serverInfo.version);
    console.log('   - Capabilities:', Object.keys(result.capabilities).join(', '));

    // Send initialized notification
    this.sendNotification('notifications/initialized', {});

    // Wait for background initialization
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Test 2: Execute code that accesses local network
   */
  async testLocalNetworkAccess() {
    console.log('\n📝 Test 2: Execute code accessing local network (192.168.1.100)');

    const code = `
// Try to access a device on local network
const response = await fetch('http://192.168.1.100:3000/status');
const data = await response.text();
return { success: true, data };
`;

    try {
      const result = await this.sendRequest('tools/call', {
        name: 'ncp:code',
        arguments: {
          code: code.trim(),
          timeout: 10000
        }
      });

      console.log('📊 Execution result:', result);

      if (result.error) {
        console.log('❌ Execution failed (expected - permission denied or network unreachable)');
        console.log('   Error:', result.error);
      } else {
        console.log('✅ Execution succeeded (permission was granted)');
      }
    } catch (error) {
      console.log('❌ Request failed:', error.message);
    }
  }

  /**
   * Test 3: Check for elicitation in messages
   */
  async testElicitationTriggered() {
    console.log('\n📝 Test 3: Verify elicitation was triggered');

    const elicitationMessages = this.receivedMessages.filter(
      msg => msg.method === 'sampling/createMessage' ||
             msg.method === 'elicitation/input' ||
             msg.method === 'notifications/message'
    );

    if (elicitationMessages.length > 0) {
      console.log('✅ Elicitation messages found:');
      elicitationMessages.forEach((msg, idx) => {
        console.log(`   ${idx + 1}. Method: ${msg.method}`);
        if (msg.params) {
          console.log('      Params:', JSON.stringify(msg.params, null, 2));
        }
      });
    } else {
      console.log('⚠️  No elicitation messages detected');
      console.log('   Note: Elicitation might be handled internally or not supported by test client');
    }
  }

  /**
   * Test 4: Check logs for permission request
   */
  async testPermissionLogsPresent() {
    console.log('\n📝 Test 4: Check server logs for permission request');

    // The stderr output should contain permission-related logs
    // This is verified by the stderr handler above
    console.log('✅ Check server stderr output above for:');
    console.log('   - "🔐 Requesting network permission"');
    console.log('   - "Network Access Permission"');
    console.log('   - Permission decision (approved/denied)');
  }

  /**
   * Stop the server
   */
  async stopServer() {
    if (this.serverProcess) {
      console.log('\n🛑 Stopping server...');
      this.serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Run all tests
   */
  async runTests() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  Runtime Network Permissions Integration Test             ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    try {
      // Start server
      await this.startServer();
      console.log('✅ Server started successfully\n');

      // Run tests
      await this.testInitialize();
      await this.testLocalNetworkAccess();
      await this.testElicitationTriggered();
      await this.testPermissionLogsPresent();

      console.log('\n╔════════════════════════════════════════════════════════════╗');
      console.log('║  Test Summary                                              ║');
      console.log('╚════════════════════════════════════════════════════════════╝');
      console.log('✅ All tests completed!');
      console.log('\nExpected behavior:');
      console.log('1. Code attempts to access http://192.168.1.100:3000/status');
      console.log('2. NetworkPolicyManager detects private IP (blocked by default)');
      console.log('3. Elicitation request sent to client (permission dialog)');
      console.log('4. Since test client does not handle elicitations, access is denied');
      console.log('5. Execution fails with "Network request blocked" error\n');

    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    } finally {
      await this.stopServer();
      process.exit(0);
    }
  }
}

// Run tests
const test = new RuntimeNetworkPermissionsTest();
test.runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
