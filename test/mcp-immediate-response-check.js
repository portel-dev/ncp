#!/usr/bin/env node
/**
 * Test MCP Server Immediate Response
 *
 * Verifies that NCP MCP server:
 * 1. Responds to initialize immediately
 * 2. Responds to tools/list immediately (without waiting for indexing)
 * 3. Advertises 'find' and 'run' tools
 * 4. Does not block on indexing
 */

import { MCPServer } from '../dist/server/mcp-server.js';

async function testMCPImmediateResponse() {
  console.log('========================================');
  console.log('Testing MCP Server Immediate Response');
  console.log('========================================\n');

  const server = new MCPServer('default', false, false); // No progress output

  // Test 1: Initialize should return immediately
  console.log('Test 1: Initialize returns immediately');
  console.log('----------------------------------------');
  const initStartTime = Date.now();
  await server.initialize();
  const initDuration = Date.now() - initStartTime;

  if (initDuration < 100) {
    console.log(`✓ PASS: Initialize returned in ${initDuration}ms (non-blocking)`);
  } else {
    console.log(`✗ FAIL: Initialize took ${initDuration}ms (should be < 100ms)`);
  }
  console.log('');

  // Test 2: tools/list should return immediately
  console.log('Test 2: tools/list returns immediately (even during indexing)');
  console.log('----------------------------------------');
  const listStartTime = Date.now();
  const toolsResponse = await server.handleRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list'
  });
  const listDuration = Date.now() - listStartTime;

  if (listDuration < 100) {
    console.log(`✓ PASS: tools/list returned in ${listDuration}ms (non-blocking)`);
  } else {
    console.log(`✗ FAIL: tools/list took ${listDuration}ms (should be < 100ms)`);
  }
  console.log('');

  // Test 3: Verify tools are advertised
  console.log('Test 3: Advertises find and run tools');
  console.log('----------------------------------------');
  const tools = toolsResponse.result?.tools || [];
  const toolNames = tools.map(t => t.name);

  console.log(`Found ${tools.length} tools: ${toolNames.join(', ')}`);

  if (toolNames.includes('find')) {
    console.log('✓ PASS: find tool advertised');
  } else {
    console.log('✗ FAIL: find tool NOT advertised');
  }

  if (toolNames.includes('run')) {
    console.log('✓ PASS: run tool advertised');
  } else {
    console.log('✗ FAIL: run tool NOT advertised');
  }
  console.log('');

  // Test 4: Initialize request returns immediately
  console.log('Test 4: Initialize request returns immediately');
  console.log('----------------------------------------');
  const initReqStartTime = Date.now();
  const initResponse = await server.handleRequest({
    jsonrpc: '2.0',
    id: 2,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  });
  const initReqDuration = Date.now() - initReqStartTime;

  if (initReqDuration < 50) {
    console.log(`✓ PASS: Initialize request returned in ${initReqDuration}ms`);
  } else {
    console.log(`✗ FAIL: Initialize request took ${initReqDuration}ms (should be < 50ms)`);
  }

  if (initResponse.result?.protocolVersion) {
    console.log(`✓ PASS: Initialize returned protocol version ${initResponse.result.protocolVersion}`);
  } else {
    console.log('✗ FAIL: Initialize did not return protocol version');
  }
  console.log('');

  await server.cleanup();

  console.log('========================================');
  console.log('Test Summary');
  console.log('========================================');
  console.log('Expected behavior:');
  console.log('  - initialize() returns immediately (< 100ms)');
  console.log('  - tools/list returns immediately (< 100ms)');
  console.log('  - Advertises find and run tools');
  console.log('  - Indexing happens in background');
}

testMCPImmediateResponse().catch(error => {
  console.error('Test failed with error:', error);
  process.exit(1);
});
