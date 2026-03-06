/**
 * Test ncp.do() intent execution with embedding-based param matching
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Setup test directories
const NCP_DIR = path.join(os.homedir(), '.ncp');
const PROFILES_DIR = path.join(NCP_DIR, 'profiles');
const TEST_PROFILE = 'ncp-do-test';

function setupTestProfile() {
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
  }

  const profilePath = path.join(PROFILES_DIR, `${TEST_PROFILE}.json`);
  const testProfile = {
    name: TEST_PROFILE,
    description: 'Test profile for ncp.do() testing',
    mcpServers: {
      // Add filesystem MCP for file operations
      filesystem: {
        command: 'npx',
        args: ['@modelcontextprotocol/server-filesystem', '/tmp']
      }
    }
  };

  fs.writeFileSync(profilePath, JSON.stringify(testProfile, null, 2));
  console.log(`Created test profile at ${profilePath}`);
}

class NCPDoTester {
  constructor() {
    this.process = null;
    this.buffer = '';
    this.responseHandlers = new Map();
    this.nextId = 1;
  }

  async start() {
    return new Promise((resolve, reject) => {
      const serverPath = path.join(__dirname, '../../dist/index-mcp.js');

      this.process = spawn('node', [serverPath, '--profile', TEST_PROFILE], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NCP_PROFILE: TEST_PROFILE,
          NO_COLOR: 'true'
        }
      });

      this.process.stdout.on('data', (data) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.process.stderr.on('data', (data) => {
        // Ignore stderr for now
      });

      // Initialize
      setTimeout(async () => {
        try {
          await this.initialize();
          resolve();
        } catch (e) {
          reject(e);
        }
      }, 2000);
    });
  }

  processBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const msg = JSON.parse(line);
          if (msg.id && this.responseHandlers.has(msg.id)) {
            this.responseHandlers.get(msg.id)(msg);
            this.responseHandlers.delete(msg.id);
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
    }
  }

  sendRequest(method, params) {
    const id = this.nextId++;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.responseHandlers.set(id, (response) => {
        if (response.error) {
          reject(response.error);
        } else {
          resolve(response.result);
        }
      });

      this.process.stdin.write(JSON.stringify(request) + '\n');

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  sendNotification(method, params) {
    const notification = {
      jsonrpc: '2.0',
      method,
      params
    };
    this.process.stdin.write(JSON.stringify(notification) + '\n');
  }

  async initialize() {
    const result = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'ncp-do-tester', version: '1.0.0' },
      capabilities: {}
    });
    this.sendNotification('notifications/initialized', {});
    return result;
  }

  async callTool(name, args) {
    return await this.sendRequest('tools/call', { name, arguments: args });
  }

  stop() {
    if (this.process) {
      this.process.kill();
    }
  }
}

async function runTests() {
  console.log('Setting up test profile...');
  setupTestProfile();

  const tester = new NCPDoTester();

  console.log('Starting NCP server...');
  await tester.start();
  console.log('Server started!\n');

  // Wait for indexing and model loading
  console.log('Waiting for indexing and model loading (15s)...\n');
  await new Promise(r => setTimeout(r, 15000));

  // Create a test file
  fs.writeFileSync('/tmp/ncp-do-test.txt', 'Hello from ncp.do() test!');

  const tests = [
    {
      name: 'File read with pseudo params (filepath → path)',
      intent: 'read file',
      context: { filepath: '/tmp/ncp-do-test.txt' }
    },
    {
      name: 'List directory with pseudo param (folder → path)',
      intent: 'list directory',
      context: { folder: '/tmp' }
    },
    {
      name: 'Natural language intent with path',
      intent: 'read a file',
      context: { location: '/tmp/ncp-do-test.txt' }
    },
    {
      name: 'Without context (should show available params)',
      intent: 'read file',
      context: {}
    },
    {
      name: 'With similar but different param name',
      intent: 'list files',
      context: { directory: '/tmp' }
    }
  ];

  for (const test of tests) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST: ${test.name}`);
    console.log(`Intent: "${test.intent}"`);
    console.log(`Context: ${JSON.stringify(test.context)}`);
    console.log('='.repeat(60));

    try {
      const code = `
        const result = await ncp.do("${test.intent}", ${JSON.stringify(test.context)});
        return result;
      `;

      const result = await tester.callTool('code', { code, timeout: 15000 });

      if (result.content && result.content[0]) {
        const output = result.content[0].text || result.content[0];
        console.log('\nRESULT:');

        // Try to parse as JSON for better formatting
        try {
          const parsed = typeof output === 'string' ? JSON.parse(output) : output;
          console.log(JSON.stringify(parsed, null, 2));
        } catch {
          console.log(output);
        }
      }
    } catch (error) {
      console.log('\nERROR:', error.message || error);
    }
  }

  console.log('\n\nTests complete!');
  tester.stop();
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
