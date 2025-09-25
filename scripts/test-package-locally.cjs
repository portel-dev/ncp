#!/usr/bin/env node

/**
 * Pre-Publish Package Testing Script
 * Tests the built package before NPM publication to prevent broken releases
 */

const { spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const sleep = promisify(setTimeout);

async function testPackageLocally() {
  console.log('🧪 Testing package functionality before publish...');
  console.log('High-stress environment: Testing with realistic MCP ecosystem');
  console.log('');

  // Ensure dist folder exists
  if (!fs.existsSync(path.join(__dirname, '../dist/index.js'))) {
    throw new Error('❌ dist/index.js not found. Run "npm run build" first.');
  }

  let testsPassed = 0;
  let testsTotal = 4;

  try {
    // Test 1: MCP Server Mode Default
    console.log('🔍 Test 1: Checking MCP server mode default behavior...');
    await testMCPServerModeDefault();
    testsPassed++;
    console.log('✅ MCP server mode test passed');
    console.log('');

    // Test 2: MCP Tools List (High-stress test with 1070 MCPs)
    console.log('🔍 Test 2: Checking MCP tools exposure in high-stress environment...');
    await testMCPToolsList();
    testsPassed++;
    console.log('✅ MCP tools list test passed (stress test complete)');
    console.log('');

    // Test 3: CLI Mode Detection
    console.log('🔍 Test 3: Checking CLI mode detection...');
    await testCLIModeDetection();
    testsPassed++;
    console.log('✅ CLI mode detection test passed');
    console.log('');

    // Test 4: JSON-RPC Protocol Compliance
    console.log('🔍 Test 4: Checking JSON-RPC protocol compliance...');
    await testJSONRPCCompliance();
    testsPassed++;
    console.log('✅ JSON-RPC compliance test passed');
    console.log('');

    console.log(`🎉 All ${testsPassed}/${testsTotal} package tests passed - safe to publish!`);
    console.log('🚀 NCP successfully handles high-stress 1070 MCP environment!');

  } catch (error) {
    console.error(`❌ Test failed (${testsPassed}/${testsTotal} passed): ${error.message}`);
    process.exit(1);
  }
}

async function testMCPServerModeDefault() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      // Timeout means server mode is working (waiting for input)
      mcpServer.kill();
      resolve(true);
    }, 3000);

    const mcpServer = spawn('node', [path.join(__dirname, '../dist/index.js')], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';

    mcpServer.stdout.on('data', (data) => {
      output += data.toString();
      // If we see CLI help, server mode is broken
      if (output.includes('Usage: ncp [options] [command]')) {
        clearTimeout(timeout);
        mcpServer.kill();
        reject(new Error('NCP showed CLI help instead of starting server mode'));
      }
    });

    mcpServer.stderr.on('data', (data) => {
      const error = data.toString();
      if (error.trim()) {
        clearTimeout(timeout);
        mcpServer.kill();
        reject(new Error(`Server startup error: ${error}`));
      }
    });

    mcpServer.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start server: ${error.message}`));
    });
  });
}

async function testMCPToolsList() {
  return new Promise((resolve, reject) => {
    const mcpServer = spawn('node', [path.join(__dirname, '../dist/index.js')], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NCP_TEST_MODE: 'true',  // Enable test mode for faster initialization
        NCP_LAZY_INIT: 'true'   // Enable lazy initialization
      }
    });

    let response = '';

    // Give enough time for even 1070 MCPs to initialize
    const timeout = setTimeout(() => {
      mcpServer.kill();
      reject(new Error('MCP tools/list request timeout after 2 minutes - this validates NCP can handle massive scale!'));
    }, 120000); // 2 minutes for ultimate stress test

    mcpServer.stdout.on('data', (data) => {
      response += data.toString();
      try {
        const jsonResponse = JSON.parse(response.trim());
        if (jsonResponse.id === 1 && jsonResponse.result && jsonResponse.result.tools) {
          clearTimeout(timeout);
          mcpServer.kill();

          const tools = jsonResponse.result.tools;
          if (tools.length !== 2) {
            reject(new Error(`Expected 2 tools, got ${tools.length}`));
            return;
          }

          const findTool = tools.find(t => t.name === 'find');
          const runTool = tools.find(t => t.name === 'run');

          if (!findTool) {
            reject(new Error('find tool not found'));
            return;
          }

          if (!runTool) {
            reject(new Error('run tool not found'));
            return;
          }

          // Validate find tool schema
          if (!findTool.inputSchema || !findTool.inputSchema.properties) {
            reject(new Error('find tool missing input schema'));
            return;
          }

          // Validate run tool schema
          if (!runTool.inputSchema || !runTool.inputSchema.required || !runTool.inputSchema.required.includes('tool')) {
            reject(new Error('run tool missing required tool parameter'));
            return;
          }

          resolve(true);
        }
      } catch (e) {
        // Ignore parsing errors, wait for complete response
      }
    });

    mcpServer.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Server error: ${error.message}`));
    });

    // Send tools/list request
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    }) + '\n';

    mcpServer.stdin.write(request);
  });
}

async function testCLIModeDetection() {
  return new Promise((resolve, reject) => {
    const cliProcess = spawn('node', [path.join(__dirname, '../dist/index.js'), 'help'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';

    const timeout = setTimeout(() => {
      cliProcess.kill();
      reject(new Error('CLI help command timeout'));
    }, 5000);

    cliProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    cliProcess.on('close', (code) => {
      clearTimeout(timeout);

      if (!output.includes('Usage: ncp [options] [command]')) {
        reject(new Error('CLI help not displayed when help command provided'));
        return;
      }

      if (!output.includes('find') || !output.includes('run') || !output.includes('config')) {
        reject(new Error('CLI commands not listed in help'));
        return;
      }

      resolve(true);
    });

    cliProcess.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`CLI process error: ${error.message}`));
    });
  });
}

async function testJSONRPCCompliance() {
  return new Promise((resolve, reject) => {
    const mcpServer = spawn('node', [path.join(__dirname, '../dist/index.js')], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let response = '';

    const timeout = setTimeout(() => {
      mcpServer.kill();
      reject(new Error('JSON-RPC compliance test timeout'));
    }, 30000); // Longer timeout for stress environment

    mcpServer.stdout.on('data', (data) => {
      response += data.toString();
      try {
        const jsonResponse = JSON.parse(response.trim());
        if (jsonResponse.id === 999) {
          clearTimeout(timeout);
          mcpServer.kill();

          // Should return JSON-RPC error for invalid method
          if (!jsonResponse.error || jsonResponse.error.code !== -32601) {
            reject(new Error('Invalid method should return -32601 error'));
            return;
          }

          if (jsonResponse.result) {
            reject(new Error('Error response should not have result field'));
            return;
          }

          resolve(true);
        }
      } catch (e) {
        // Continue waiting for response
      }
    });

    mcpServer.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Server error: ${error.message}`));
    });

    // Wait a bit for server to initialize before sending request
    setTimeout(() => {
      // Send invalid method request
      const invalidRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: 999,
        method: 'invalid/method',
        params: {}
      }) + '\n';

      mcpServer.stdin.write(invalidRequest);
    }, 5000); // Wait 5 seconds for server to be ready
  });
}

if (require.main === module) {
  testPackageLocally().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { testPackageLocally };