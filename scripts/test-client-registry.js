#!/usr/bin/env node

/**
 * Client Registry Test Suite
 * Tests the 14-client registry expansion feature
 */

import { listRegisteredClients, getClientConfigPath, getClientDefinition } from '../dist/utils/client-registry.js';
import assert from 'assert';

console.log('========================================');
console.log('Client Registry Test Suite');
console.log('========================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${error.message}\n`);
    failed++;
  }
}

// Test 1: All 14 clients registered
test('Should have 14 clients registered', () => {
  const clients = listRegisteredClients();
  assert.strictEqual(clients.length, 14, `Expected 14 clients, got ${clients.length}`);
});

// Test 2: Original clients still exist
test('Should include original clients (Claude Desktop, Cursor, Cline, Continue, Perplexity)', () => {
  const clients = listRegisteredClients();
  const originalClients = ['claude-desktop', 'cursor', 'cline', 'continue', 'perplexity'];
  originalClients.forEach(client => {
    assert(clients.includes(client), `Missing original client: ${client}`);
  });
});

// Test 3: New clients exist
test('Should include all 9 new clients', () => {
  const clients = listRegisteredClients();
  const newClients = ['zed', 'windsurf', 'enconvo', 'raycast', 'vscode',
                      'github-copilot', 'pieces', 'tabnine', 'claude-code'];
  newClients.forEach(client => {
    assert(clients.includes(client), `Missing new client: ${client}`);
  });
});

// Test 4: Client definition structure
test('Should have valid definition for Zed', () => {
  const zedDef = getClientDefinition('zed');
  assert(zedDef, 'Zed definition not found');
  assert.strictEqual(zedDef.displayName, 'Zed');
  assert.strictEqual(zedDef.configFormat, 'json');
  assert.strictEqual(zedDef.mcpServersPath, 'context_servers');
  assert(zedDef.configPaths.darwin, 'Missing macOS config path');
});

// Test 5: Client definition structure for Windsurf
test('Should have valid definition for Windsurf', () => {
  const windsurfDef = getClientDefinition('windsurf');
  assert(windsurfDef, 'Windsurf definition not found');
  assert.strictEqual(windsurfDef.displayName, 'Windsurf');
  assert(windsurfDef.configPaths.darwin, 'Missing macOS config path');
  assert(windsurfDef.configPaths.win32, 'Missing Windows config path');
  assert(windsurfDef.configPaths.linux, 'Missing Linux config path');
});

// Test 6: Config path resolution (macOS)
test('Should resolve config path for current platform', () => {
  const zedPath = getClientConfigPath('zed');
  assert(zedPath, 'Config path should not be null');

  if (process.platform === 'darwin') {
    assert(zedPath.includes('.config/zed/settings.json'), 'macOS path incorrect');
  }
});

// Test 7: Client lookup by normalized name
test('Should find client with normalized name (case insensitive)', () => {
  const def1 = getClientDefinition('claude-desktop');
  const def2 = getClientDefinition('Claude Desktop');
  const def3 = getClientDefinition('CLAUDE DESKTOP');

  assert(def1, 'Should find claude-desktop');
  assert(def2, 'Should find Claude Desktop');
  assert(def3, 'Should find CLAUDE DESKTOP');
});

// Test 8: Non-existent client
test('Should return null for non-existent client', () => {
  const def = getClientDefinition('non-existent-client');
  assert.strictEqual(def, null, 'Should return null for unknown client');
});

// Test 9: All clients have required fields
test('All clients should have required fields', () => {
  const clients = listRegisteredClients();
  clients.forEach(clientName => {
    const def = getClientDefinition(clientName);
    assert(def, `Definition missing for ${clientName}`);
    assert(def.displayName, `displayName missing for ${clientName}`);
    assert(def.configPaths, `configPaths missing for ${clientName}`);
    assert(def.configFormat, `configFormat missing for ${clientName}`);
    assert(def.mcpServersPath, `mcpServersPath missing for ${clientName}`);
  });
});

// Test 10: Platform-specific paths
test('Should have platform-specific paths where applicable', () => {
  // Claude Desktop should have all 3 platforms
  const claudeDef = getClientDefinition('claude-desktop');
  assert(claudeDef.configPaths.darwin, 'Claude Desktop missing macOS path');
  assert(claudeDef.configPaths.win32, 'Claude Desktop missing Windows path');
  assert(claudeDef.configPaths.linux, 'Claude Desktop missing Linux path');

  // Enconvo is macOS only
  const encovoDef = getClientDefinition('enconvo');
  assert(encovoDef.configPaths.darwin, 'Enconvo missing macOS path');
  assert(!encovoDef.configPaths.win32, 'Enconvo should not have Windows path');
  assert(!encovoDef.configPaths.linux, 'Enconvo should not have Linux path');
});

// Summary
console.log('\n========================================');
console.log('Test Summary');
console.log('========================================');
console.log(`Total: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('========================================\n');

if (failed > 0) {
  process.exit(1);
}

console.log('✅ All Client Registry Tests Passed!\n');
