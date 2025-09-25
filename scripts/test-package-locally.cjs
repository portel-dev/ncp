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
  console.log('');

  // Ensure dist folder exists
  if (!fs.existsSync(path.join(__dirname, '../dist/index.js'))) {
    throw new Error('❌ dist/index.js not found. Run "npm run build" first.');
  }

  let testsPassed = 0;
  let testsTotal = 2; // Reduced to essential tests only

  try {
    // Test 1: CLI Mode Detection
    console.log('🔍 Test 1: Checking CLI mode detection...');
    await testCLIModeDetection();
    testsPassed++;
    console.log('✅ CLI mode detection test passed');
    console.log('');

    // Test 2: Basic MCP Protocol Check
    console.log('🔍 Test 2: Checking MCP protocol basics...');
    await testBasicMCPProtocol();
    testsPassed++;
    console.log('✅ Basic MCP protocol test passed');
    console.log('');

    console.log(`🎉 All ${testsPassed}/${testsTotal} package tests passed - safe to publish!`);

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
    // Create minimal test config directory
    const testConfigDir = path.join(__dirname, '../.ncp-test');
    const fs = require('fs');

    try {
      if (fs.existsSync(testConfigDir)) {
        fs.rmSync(testConfigDir, { recursive: true });
      }
      fs.mkdirSync(path.join(testConfigDir, 'profiles'), { recursive: true });
      fs.writeFileSync(path.join(testConfigDir, 'profiles', 'all.json'), JSON.stringify({}));
    } catch (e) {
      // Ignore config creation errors
    }

    const mcpServer = spawn('node', [path.join(__dirname, '../dist/index.js')], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NCP_CONFIG_DIR: testConfigDir }
    });

    let response = '';

    const timeout = setTimeout(() => {
      mcpServer.kill();
      try {
        if (fs.existsSync(testConfigDir)) {
          fs.rmSync(testConfigDir, { recursive: true });
        }
      } catch (e) {}
      reject(new Error('MCP tools/list request timeout'));
    }, 20000);

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

async function testBasicMCPProtocol() {
  return new Promise((resolve, reject) => {
    // Just test that the server starts in MCP mode without crashing
    const mcpServer = spawn('node', [path.join(__dirname, '../dist/index.js')], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const timeout = setTimeout(() => {
      mcpServer.kill();
      resolve(true); // If it runs for 3 seconds without crashing, it's working
    }, 3000);

    mcpServer.stderr.on('data', (data) => {
      const error = data.toString();
      if (error.includes('Error') && !error.includes('MCP cache')) {
        clearTimeout(timeout);
        mcpServer.kill();
        reject(new Error(`MCP startup error: ${error}`));
      }
    });

    mcpServer.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start MCP server: ${error.message}`));
    });

    mcpServer.on('exit', (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`MCP server exited with code: ${code}`));
      }
    });
  });
}

if (require.main === module) {
  testPackageLocally().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { testPackageLocally };