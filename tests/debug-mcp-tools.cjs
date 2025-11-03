/**
 * Debug script to see what tools are exposed by NCP MCP server
 */

const { spawn } = require('child_process');

class MCPTestClient {
  constructor() {
    this.process = null;
    this.messageId = 0;
    this.pendingRequests = new Map();
    this.buffer = '';
  }

  async start() {
    console.log('🚀 Starting MCP server...');

    this.process = spawn('node', ['dist/index-mcp.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    this.process.stdout.on('data', (data) => {
      this.buffer += data.toString();
      this.processMessages();
    });

    this.process.stderr.on('data', (data) => {
      console.error('Server stderr:', data.toString());
    });

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  processMessages() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);

        if (message.id && this.pendingRequests.has(message.id)) {
          const { resolve, reject } = this.pendingRequests.get(message.id);
          this.pendingRequests.delete(message.id);

          if (message.error) {
            reject(new Error(message.error.message || 'Request failed'));
          } else {
            resolve(message.result);
          }
        }
      } catch (error) {
        // Ignore parse errors
      }
    }
  }

  sendRequest(method, params = {}) {
    const id = ++this.messageId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    const promise = new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);
    });

    this.process.stdin.write(JSON.stringify(request) + '\n');
    return promise;
  }

  sendNotification(method, params = {}) {
    const notification = {
      jsonrpc: '2.0',
      method,
      params
    };
    this.process.stdin.write(JSON.stringify(notification) + '\n');
  }

  async stop() {
    if (this.process) {
      this.process.kill();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

async function debug() {
  const client = new MCPTestClient();

  try {
    await client.start();

    // Initialize
    console.log('\n📋 Initializing MCP connection...');
    const initResult = await client.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'debug-client',
        version: '1.0.0'
      }
    });
    console.log(`✅ Connected to ${initResult.serverInfo.name} v${initResult.serverInfo.version}`);

    // Send initialized notification
    client.sendNotification('notifications/initialized', {});
    await new Promise(resolve => setTimeout(resolve, 2000));

    // List all tools
    console.log('\n📋 Listing all available tools...\n');
    const toolsList = await client.sendRequest('tools/list', {});

    console.log(`Found ${toolsList.tools.length} tools:\n`);

    // Group tools by prefix
    const grouped = {};
    toolsList.tools.forEach(tool => {
      const prefix = tool.name.includes(':') ? tool.name.split(':')[0] : 'other';
      if (!grouped[prefix]) grouped[prefix] = [];
      grouped[prefix].push(tool);
    });

    // Display grouped
    Object.keys(grouped).sort().forEach(prefix => {
      console.log(`\n${prefix.toUpperCase()} (${grouped[prefix].length} tools):`);
      console.log('─'.repeat(60));
      grouped[prefix].forEach(tool => {
        console.log(`  • ${tool.name}`);
        console.log(`    ${tool.description.substring(0, 80)}...`);
      });
    });

    // Check specifically for ncp tools
    console.log('\n\n🔍 Checking for NCP management tools...');
    const ncpTools = toolsList.tools.filter(t => t.name.startsWith('ncp:'));
    if (ncpTools.length > 0) {
      console.log(`✅ Found ${ncpTools.length} ncp: tools`);
      ncpTools.forEach(t => console.log(`   - ${t.name}`));
    } else {
      console.log('❌ No ncp: tools found');
      console.log('\nℹ️  Available tool prefixes:');
      const prefixes = new Set(toolsList.tools.map(t => t.name.split(':')[0]));
      prefixes.forEach(p => console.log(`   - ${p}:`));
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.stop();
  }
}

debug();
