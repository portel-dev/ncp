#!/usr/bin/env node
/**
 * Test code execution using official Anthropic MCP SDK Client
 * Reproduces exact sequence that Claude Desktop sends
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { spawn } = require('child_process');

async function testCodeExecution() {
  console.log('🧪 Testing Code Execution with MCP SDK Client\n');
  console.log('='.repeat(60));

  // Start NCP server
  const serverProcess = spawn('node', ['dist/index-mcp.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NCP_ENABLE_CODE_MODE: 'true',
      NCP_ENABLE_SKILLS: 'true',
      NO_COLOR: 'true'
    }
  });

  // Capture stderr for debugging
  const stderrLines = [];
  serverProcess.stderr.on('data', (data) => {
    const msg = data.toString();
    stderrLines.push(msg);
    if (process.env.DEBUG) {
      console.log('[SERVER STDERR]', msg.trim());
    }
  });

  try {
    // Create transport and client
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['dist/index-mcp.js'],
      env: {
        ...process.env,
        NCP_ENABLE_CODE_MODE: 'true',
        NCP_ENABLE_SKILLS: 'true',
        NO_COLOR: 'true'
      }
    });

    const client = new Client({
      name: 'claude-ai',
      version: '0.1.0'
    }, {
      capabilities: {}
    });

    // Connect
    console.log('1️⃣  Connecting to NCP server...');
    await client.connect(transport);
    console.log('✅ Connected\n');

    // List tools
    console.log('2️⃣  Listing tools...');
    const toolsResponse = await client.listTools();
    console.log('✅ Tools available:', toolsResponse.tools.map(t => t.name).join(', '));

    const hasCodeTool = toolsResponse.tools.some(t => t.name === 'code');
    if (!hasCodeTool) {
      console.error('❌ ERROR: "code" tool not found! Available:', toolsResponse.tools.map(t => t.name));
      console.error('   This means code mode is not enabled properly.');
      await client.close();
      serverProcess.kill();
      process.exit(1);
    }
    console.log('');

    // Execute simple code EXACTLY as Claude Desktop sends it (with newlines)
    console.log('3️⃣  Executing code (with newlines like Claude Desktop): return "test"');
    const codeResult = await client.callTool({
      name: 'code',
      arguments: {
        code: '\nreturn "test"\n'
      }
    });

    console.log('');
    console.log('='.repeat(60));
    console.log('📊 RESULT:');
    console.log('='.repeat(60));
    console.log(JSON.stringify(codeResult, null, 2));
    console.log('='.repeat(60));
    console.log('');

    // Check for success
    if (codeResult.content && codeResult.content[0]) {
      const text = codeResult.content[0].text;
      if (text.includes('Unexpected token') || text.includes('Arg string terminates')) {
        console.log('❌ FAILED: Got parameter parsing error');
        console.log('Error text:', text);
      } else if (text.includes('"test"')) {
        console.log('✅ SUCCESS: Code executed correctly and returned "test"!');
        console.log('');

        // Test more complex code
        console.log('4️⃣  Testing complex code with await...');
        const complexResult = await client.callTool({
          name: 'code',
          arguments: {
            code: `
const result = await Promise.resolve({ success: true, message: "Async works!" });
return result;
            `.trim()
          }
        });

        console.log('');
        console.log('='.repeat(60));
        console.log('📊 COMPLEX CODE RESULT:');
        console.log('='.repeat(60));
        console.log(JSON.stringify(complexResult, null, 2));
        console.log('='.repeat(60));

        if (complexResult.content[0].text.includes('Async works!')) {
          console.log('✅ SUCCESS: Complex async code works!');
        } else {
          console.log('❌ FAILED: Complex code did not execute correctly');
        }
      } else {
        console.log('⚠️  UNEXPECTED: Got response but not the expected result');
        console.log('Response text:', text);
      }
    } else if (codeResult.isError) {
      console.log('❌ FAILED: Code execution returned error');
    }

    // Close connection
    await client.close();
    serverProcess.kill();

    console.log('');
    console.log('='.repeat(60));
    console.log('🏁 Test Complete');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('');
    console.error('='.repeat(60));
    console.error('💥 ERROR:');
    console.error('='.repeat(60));
    console.error(error.message);
    console.error('');
    console.error('Stack:', error.stack);
    console.error('='.repeat(60));

    if (stderrLines.length > 0) {
      console.error('');
      console.error('Server stderr:');
      console.error(stderrLines.join(''));
    }

    serverProcess.kill();
    process.exit(1);
  }
}

// Run test
testCodeExecution().catch(error => {
  console.error('Test crashed:', error);
  process.exit(1);
});
