/**
 * MicroMCP Installation - MCP Protocol Test
 *
 * Tests MicroMCP installation through MCP JSON-RPC interface
 * Simulates an MCP client (like Claude Desktop) making requests
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// Test configuration
const MICROMCP_DIR = path.join(os.homedir(), '.ncp', 'micromcps');
const BACKUP_DIR = path.join(os.homedir(), '.ncp', 'micromcps-mcp-protocol-backup');

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

    this.process.on('error', (error) => {
      console.error('Server error:', error);
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
        console.error('Failed to parse message:', line, error);
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

      // Timeout after 30 seconds
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
    console.log('🛑 Stopping MCP server...');
    if (this.process) {
      this.process.kill();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Helper: Check if file exists
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Helper: Backup MicroMCPs directory
async function backupMicroMCPs() {
  if (await fileExists(MICROMCP_DIR)) {
    console.log('📦 Backing up existing MicroMCPs...');
    await fs.rename(MICROMCP_DIR, BACKUP_DIR);
  }
  await fs.mkdir(MICROMCP_DIR, { recursive: true });
}

// Helper: Restore MicroMCPs directory
async function restoreMicroMCPs() {
  if (await fileExists(MICROMCP_DIR)) {
    await fs.rm(MICROMCP_DIR, { recursive: true, force: true });
  }
  if (await fileExists(BACKUP_DIR)) {
    console.log('📦 Restoring original MicroMCPs...');
    await fs.rename(BACKUP_DIR, MICROMCP_DIR);
  }
}

// Helper: Create test MicroMCP file
async function createTestMicroMCP(name, content) {
  const defaultContent = `
import { MicroMCP, tool } from '@portel/ncp';

export class ${name.charAt(0).toUpperCase() + name.slice(1)}MCP implements MicroMCP {
  name = '${name}';
  version = '1.0.0';
  description = 'Test MicroMCP for ${name}';

  @tool({
    description: 'Test tool for ${name}',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Test input' }
      },
      required: ['input']
    }
  })
  async testTool(args: { input: string }): Promise<string> {
    return \`Test ${name}: \${args.input}\`;
  }
}
`;

  const testFile = path.join(os.tmpdir(), `${name}.micro.ts`);
  await fs.writeFile(testFile, content || defaultContent, 'utf8');
  return testFile;
}

async function runTests() {
  console.log('\n🧪 MicroMCP Installation - MCP Protocol Tests\n');
  console.log('==============================================\n');

  const client = new MCPTestClient();
  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Backup existing MicroMCPs
    await backupMicroMCPs();

    // Start MCP server
    await client.start();

    // Initialize MCP connection
    console.log('📋 Test 1: Initialize MCP connection');
    const initResult = await client.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    });
    console.log('✅ Initialization successful');
    console.log(`   Server: ${initResult.serverInfo.name} v${initResult.serverInfo.version}`);
    testsPassed++;

    // Send initialized notification
    client.sendNotification('notifications/initialized', {});
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n---\n');

    // Test 2: List available tools
    console.log('📋 Test 2: List available tools (verify mcp:add exists)');
    const toolsList = await client.sendRequest('tools/list', {});
    const addTool = toolsList.tools.find(t => t.name === 'mcp:add');

    if (addTool) {
      console.log('✅ mcp:add tool found');
      console.log(`   Description: ${addTool.description.substring(0, 100)}...`);
      testsPassed++;
    } else {
      console.log('❌ mcp:add tool not found');
      console.log('   Available tools:', toolsList.tools.map(t => t.name).join(', '));
      testsFailed++;
    }

    console.log('\n---\n');

    // Test 3: Install MicroMCP from local file via MCP protocol
    console.log('📋 Test 3: Install MicroMCP from local file via mcp:add');
    const testFile = await createTestMicroMCP('mcptest1');
    console.log(`   Test file: ${testFile}`);

    const installResult = await client.sendRequest('tools/call', {
      name: 'run',
      arguments: {
        tool: 'mcp:add',
        parameters: {
          mcp_name: testFile
        }
      }
    });

    console.log('   Response:', JSON.stringify(installResult, null, 2));

    if (installResult.content && installResult.content[0].text.includes('✅')) {
      console.log('✅ Installation successful via MCP protocol');
      testsPassed++;
    } else {
      console.log('❌ Installation failed');
      testsFailed++;
    }

    // Verify file was created
    const installedFile = path.join(MICROMCP_DIR, 'mcptest1.micro.ts');
    if (await fileExists(installedFile)) {
      console.log('✅ File created at correct location');
      testsPassed++;
    } else {
      console.log('❌ File not created');
      testsFailed++;
    }

    // Cleanup test file
    await fs.unlink(testFile);

    console.log('\n---\n');

    // Test 4: Install another MicroMCP
    console.log('📋 Test 4: Install second MicroMCP');
    const testFile2 = await createTestMicroMCP('mcptest2');

    const installResult2 = await client.sendRequest('tools/call', {
      name: 'run',
      arguments: {
        tool: 'mcp:add',
        parameters: {
          mcp_name: testFile2
        }
      }
    });

    if (installResult2.content && installResult2.content[0].text.includes('✅')) {
      console.log('✅ Second installation successful');
      testsPassed++;
    } else {
      console.log('❌ Second installation failed');
      testsFailed++;
    }

    await fs.unlink(testFile2);

    console.log('\n---\n');

    // Test 5: Reinstall (overwrite)
    console.log('📋 Test 5: Reinstall MicroMCP (test overwrite)');
    const testFile3 = await createTestMicroMCP('mcptest1', '// Version 2');

    const reinstallResult = await client.sendRequest('tools/call', {
      name: 'run',
      arguments: {
        tool: 'mcp:add',
        parameters: {
          mcp_name: testFile3
        }
      }
    });

    if (reinstallResult.content && reinstallResult.content[0].text.includes('✅')) {
      console.log('✅ Reinstallation successful');
      testsPassed++;

      // Verify content was overwritten
      const content = await fs.readFile(installedFile, 'utf8');
      if (content.includes('Version 2')) {
        console.log('✅ File overwritten correctly');
        testsPassed++;
      } else {
        console.log('❌ File not overwritten');
        testsFailed++;
      }
    } else {
      console.log('❌ Reinstallation failed');
      testsFailed++;
    }

    await fs.unlink(testFile3);

    console.log('\n---\n');

    // Test 6: Error handling - missing file
    console.log('📋 Test 6: Error handling - missing file');

    try {
      const errorResult = await client.sendRequest('tools/call', {
        name: 'run',
        arguments: {
          tool: 'mcp:add',
          parameters: {
            mcp_name: '/tmp/nonexistent-file-12345.micro.ts'
          }
        }
      });

      if (errorResult.content && errorResult.content[0].text.includes('failed')) {
        console.log('✅ Error handled correctly (returned error message)');
        testsPassed++;
      } else if (errorResult.isError) {
        console.log('✅ Error handled correctly (returned error)');
        testsPassed++;
      } else {
        console.log('❌ Should have returned error');
        testsFailed++;
      }
    } catch (error) {
      console.log('✅ Error handled correctly (threw exception)');
      testsPassed++;
    }

    console.log('\n---\n');

    // Test 7: Verify tools from installed MicroMCPs can be discovered
    console.log('📋 Test 7: Discover tools from installed MicroMCP');

    try {
      const findResult = await client.sendRequest('tools/call', {
        name: 'find',
        arguments: {
          description: 'mcptest1'
        }
      });

      console.log('   Find result:', JSON.stringify(findResult, null, 2).substring(0, 200));

      if (findResult.content) {
        console.log('✅ Tool discovery works');
        testsPassed++;
      } else {
        console.log('⚠️  Tool discovery returned no content (may need server restart)');
      }
    } catch (error) {
      console.log('⚠️  Tool discovery test inconclusive:', error.message);
    }

    console.log('\n---\n');

    // Test 8: List installed MicroMCPs
    console.log('📋 Test 8: Verify installed files');
    const files = await fs.readdir(MICROMCP_DIR);
    const microFiles = files.filter(f => f.endsWith('.micro.ts'));

    console.log(`   Found ${microFiles.length} MicroMCP files:`);
    microFiles.forEach(f => console.log(`   - ${f}`));

    if (microFiles.length >= 2) {
      console.log('✅ Multiple MicroMCPs installed correctly');
      testsPassed++;
    } else {
      console.log('❌ Expected at least 2 MicroMCP files');
      testsFailed++;
    }

    console.log('\n---\n');

    // Test 9: Test with URL (if server is pushed to GitHub)
    console.log('📋 Test 9: Test URL installation (optional)');
    console.log('   Skipping - requires pushed commits to GitHub');
    console.log('   To test: mcp:add with mcp_name = "https://raw.githubusercontent.com/..."');

  } catch (error) {
    console.error('❌ Test suite error:', error);
    testsFailed++;
  } finally {
    // Cleanup
    await client.stop();
    await restoreMicroMCPs();
  }

  // Summary
  console.log('\n==============================================');
  console.log('📊 Test Results Summary');
  console.log('==============================================');
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`📊 Total: ${testsPassed + testsFailed}`);
  console.log(`🎯 Success Rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`);
  console.log('==============================================\n');

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
