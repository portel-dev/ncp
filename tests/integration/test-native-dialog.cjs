#!/usr/bin/env node
/**
 * Test: Native Dialog Fallback
 *
 * Simulates an MCP client (like Claude Desktop without elicitation support)
 * calling ncp:add to trigger the native OS dialog confirmation.
 *
 * Expected behavior:
 * 1. Client calls tools/call with ncp:add
 * 2. Server attempts elicitation (will fail - client doesn't support it)
 * 3. Server falls back to native OS dialog
 * 4. Native macOS dialog appears with Approve/Cancel buttons
 * 5. User clicks Approve/Cancel
 * 6. Server returns success/failure based on user choice
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Test configuration
const NCP_DIR = path.join(os.homedir(), '.ncp');
const PROFILES_DIR = path.join(NCP_DIR, 'profiles');
const TEST_PROFILE = 'dialog-test';

// ANSI colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(emoji, message, color = 'reset') {
  console.log(`${emoji} ${colors[color]}${message}${colors.reset}`);
}

function logError(message) {
  log('❌', message, 'red');
}

function logSuccess(message) {
  log('✅', message, 'green');
}

function logInfo(message) {
  log('ℹ️', message, 'blue');
}

function logWarning(message) {
  log('⚠️', message, 'yellow');
}

// Setup test profile
function setupTestProfile() {
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
  }

  const profilePath = path.join(PROFILES_DIR, `${TEST_PROFILE}.json`);
  const testProfile = {
    mcpServers: {
      // Start with empty profile - we'll add time MCP via the test
    }
  };

  fs.writeFileSync(profilePath, JSON.stringify(testProfile, null, 2));
  logInfo(`Created test profile at ${profilePath}`);
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
      logInfo('Starting NCP MCP server in extension mode...');

      this.ncp = spawn('node', ['dist/index-mcp.js', '--profile', TEST_PROFILE], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NCP_MODE: 'extension',  // Run in extension mode (like .dxt)
          NCP_CONFIG_PATH: NCP_DIR,
          NCP_PROFILE: TEST_PROFILE,
          NCP_CONFIRM_BEFORE_RUN: 'true',  // Enable confirmations
          NO_COLOR: 'true',
          NCP_DEBUG: 'true'
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

              // Log responses for debugging
              if (response.error) {
                logWarning(`Response ${response.id}: ERROR ${response.error.code} - ${response.error.message}`);
              } else if (response.result) {
                logInfo(`Response ${response.id}: ${JSON.stringify(response.result).substring(0, 100)}...`);
              }
            } catch (e) {
              // Ignore non-JSON lines (logs, etc.)
            }
          }
        });

        this.responseBuffer = lines[lines.length - 1];
      });

      this.ncp.stderr.on('data', (data) => {
        const msg = data.toString();
        console.log(colors.cyan + msg.trim() + colors.reset);
      });

      this.ncp.on('error', reject);
      this.ncp.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          logError(`NCP exited with code ${code}`);
        }
      });

      // Give it a moment to start
      setTimeout(resolve, 500);
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

    logInfo(`Sending: ${method} (id=${this.requestId})`);
    this.ncp.stdin.write(JSON.stringify(request) + '\n');
    return this.requestId;
  }

  waitForResponse(id, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkResponse = () => {
        const response = this.responses.find(r => r.id === id);
        if (response) {
          resolve(response);
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          reject(new Error(`Timeout waiting for response to request ${id} after ${timeoutMs}ms`));
          return;
        }

        setTimeout(checkResponse, 100);
      };

      checkResponse();
    });
  }

  async stop() {
    if (this.ncp) {
      this.ncp.kill();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

async function testNativeDialogFallback() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 Testing Native Dialog Fallback for Confirmations');
  console.log('='.repeat(70) + '\n');

  setupTestProfile();

  const client = new MCPClientSimulator();
  await client.start();

  try {
    // Initialize the connection
    logInfo('Step 1: Initializing MCP connection...');
    const initId = client.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        // Note: NOT including elicitation capability
        // This simulates Claude Desktop without elicitation support
      },
      clientInfo: { name: 'test-client-no-elicitation', version: '1.0.0' }
    });

    const initResponse = await client.waitForResponse(initId, 5000);
    if (initResponse.error) {
      logError(`Initialize failed: ${initResponse.error.message}`);
      await client.stop();
      return false;
    }
    logSuccess('Initialized successfully');

    // Send initialized notification
    client.ncp.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    }) + '\n');

    await new Promise(resolve => setTimeout(resolve, 1000));

    // List available tools
    logInfo('\nStep 2: Listing available tools...');
    const listId = client.sendRequest('tools/list');
    const listResponse = await client.waitForResponse(listId, 5000);

    if (listResponse.error) {
      logError(`tools/list failed: ${listResponse.error.message}`);
      await client.stop();
      return false;
    }

    const tools = listResponse.result?.tools || [];
    const runTool = tools.find(t => t.name === 'run');

    if (!runTool) {
      logError('run tool not found in tools list');
      logInfo('Available tools: ' + tools.map(t => t.name).join(', '));
      await client.stop();
      return false;
    }
    logSuccess(`Found run tool (used to call internal management tools)`);

    // Try to add a test MCP - this should trigger native dialog
    console.log('\n' + '='.repeat(70));
    logWarning('⏰ WATCH FOR NATIVE DIALOG BOX!');
    console.log('   A macOS dialog should appear asking to confirm MCP installation.');
    console.log('   You have 45 seconds to click Approve or Cancel.');
    console.log('='.repeat(70) + '\n');

    logInfo('Step 3: Calling ncp:add via run tool (triggering native dialog)...');
    const addId = client.sendRequest('tools/call', {
      name: 'run',
      arguments: {
        tool: 'ncp:add',
        parameters: {
          mcp_name: 'time',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-time'],
          profile: TEST_PROFILE
        }
      }
    });

    logInfo('Waiting for response (up to 60 seconds)...');
    logWarning('Check your screen for a dialog box!');

    const addResponse = await client.waitForResponse(addId, 60000);

    console.log('\n' + '='.repeat(70));
    if (addResponse.error) {
      // Check if it's a timeout/cancellation error
      const errorMsg = addResponse.error.message || '';

      if (errorMsg.includes('⏳ Waiting for user confirmation')) {
        logWarning('TIMEOUT: Dialog timed out waiting for user response');
        logInfo('This is expected if you didn\'t click within 45 seconds');
        logInfo('Error message:\n' + errorMsg);
        console.log('='.repeat(70) + '\n');

        logInfo('You can now test RETRY by running this test again within 60 seconds');
        logInfo('If you clicked Approve already, the retry should proceed immediately');

        await client.stop();
        return true; // Test passed (timeout behavior is correct)
      } else {
        logError(`ncp:add failed: ${errorMsg}`);
        console.log('='.repeat(70) + '\n');
        await client.stop();
        return false;
      }
    }

    const result = addResponse.result?.content?.[0]?.text || '';

    if (result.includes('✅') || result.includes('added')) {
      logSuccess('MCP added successfully!');
      logInfo('User clicked APPROVE in the native dialog');
      console.log('\nResult:\n' + result);
    } else if (result.includes('cancelled') || result.includes('⛔')) {
      logWarning('MCP addition cancelled by user');
      logInfo('User clicked CANCEL in the native dialog');
      console.log('\nResult:\n' + result);
    } else {
      logError('Unexpected result from ncp:add');
      console.log('\nResult:\n' + result);
      await client.stop();
      return false;
    }

    console.log('='.repeat(70) + '\n');

    await client.stop();
    return true;

  } catch (error) {
    logError(`Test failed with error: ${error.message}`);
    console.error(error);
    await client.stop();
    return false;
  }
}

// Run the test
testNativeDialogFallback().then(success => {
  if (success) {
    console.log('✅ Native dialog fallback test completed successfully\n');
    process.exit(0);
  } else {
    console.log('❌ Native dialog fallback test failed\n');
    process.exit(1);
  }
}).catch(error => {
  logError(`Test crashed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
