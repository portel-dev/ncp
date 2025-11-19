#!/usr/bin/env node
/**
 * Quick performance test for tools/list
 */

const { spawn } = require('child_process');

async function testToolsListPerformance() {
  console.log('Testing tools/list performance...\n');

  const proc = spawn('node', ['dist/index.js', '--profile', 'integration-test'], {
    stdio: ['pipe', 'pipe', 'ignore'],
    env: { ...process.env, NCP_STDIO: 'true' }
  });

  const responses = new Map();
  let buffer = '';

  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id) responses.set(msg.id, msg);
      } catch (e) {}
    }
  });

  // Wait for server to start
  await new Promise(r => setTimeout(r, 500));

  // Send initialize
  const initMsg = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0' }
    }
  };
  proc.stdin.write(JSON.stringify(initMsg) + '\n');

  // Wait for init response
  await new Promise(r => setTimeout(r, 1000));

  // Send tools/list and measure
  const toolsStart = Date.now();
  const toolsMsg = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };
  proc.stdin.write(JSON.stringify(toolsMsg) + '\n');

  // Wait for response
  return new Promise((resolve) => {
    const checkResponse = setInterval(() => {
      if (responses.has(2)) {
        const elapsed = Date.now() - toolsStart;
        console.log('✓ tools/list response time:', elapsed + 'ms');

        if (elapsed < 250) {
          console.log('✅ PASS: Under 250ms threshold');
        } else {
          console.log('❌ FAIL: Exceeded 250ms threshold');
        }

        clearInterval(checkResponse);
        proc.kill();
        resolve();
      }
    }, 10);

    setTimeout(() => {
      console.log('❌ TIMEOUT: No response after 2000ms');
      clearInterval(checkResponse);
      proc.kill();
      resolve();
    }, 2000);
  });
}

testToolsListPerformance().then(() => process.exit(0));
