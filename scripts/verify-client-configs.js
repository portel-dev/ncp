#!/usr/bin/env node
/**
 * Client Config Verification Script
 *
 * Checks which MCP clients are installed on the system
 * and whether their config files exist for auto-import testing.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { CLIENT_REGISTRY, getClientConfigPath } from '../dist/utils/client-registry.js';

const platform = process.platform;
const homeDir = os.homedir();

function expandPath(configPath) {
  if (!configPath) return null;

  return configPath
    .replace(/^~/, homeDir)
    .replace(/%APPDATA%/g, process.env.APPDATA || '')
    .replace(/%USERPROFILE%/g, process.env.USERPROFILE || '');
}

function checkConfigExists(clientId, definition) {
  const configPath = definition.configPaths[platform];
  if (!configPath) {
    return { exists: false, reason: `Not supported on ${platform}`, path: null };
  }

  const expandedPath = expandPath(configPath);
  const exists = fs.existsSync(expandedPath);

  return {
    exists,
    reason: exists ? '✓ Config found' : '✗ Config not found',
    path: expandedPath
  };
}

function checkExtensionsDir(clientId, definition) {
  if (!definition.extensionsDir) {
    return { exists: false, reason: 'No extensions support', path: null };
  }

  const extDir = definition.extensionsDir[platform];
  if (!extDir) {
    return { exists: false, reason: `Not supported on ${platform}`, path: null };
  }

  const expandedPath = expandPath(extDir);
  const exists = fs.existsSync(expandedPath);

  return {
    exists,
    reason: exists ? '✓ Extensions dir found' : '✗ Extensions dir not found',
    path: expandedPath
  };
}

console.log('\n' + '='.repeat(70));
console.log('🔍 MCP CLIENT AUTO-IMPORT VERIFICATION');
console.log(`   Platform: ${platform}`);
console.log('='.repeat(70) + '\n');

const results = [];

for (const [clientId, definition] of Object.entries(CLIENT_REGISTRY)) {
  const configResult = checkConfigExists(clientId, definition);
  const extResult = checkExtensionsDir(clientId, definition);

  results.push({
    clientId,
    displayName: definition.displayName,
    configExists: configResult.exists,
    configPath: configResult.path,
    configReason: configResult.reason,
    extExists: extResult.exists,
    extPath: extResult.path,
    extReason: extResult.reason,
    testable: configResult.exists || extResult.exists
  });
}

// Group by testability
const testable = results.filter(r => r.testable);
const notTestable = results.filter(r => !r.testable);

if (testable.length > 0) {
  console.log('✅ INSTALLED CLIENTS (Can Test Auto-Import)\n');
  testable.forEach(r => {
    console.log(`📦 ${r.displayName}`);
    console.log(`   Client ID: ${r.clientId}`);
    if (r.configExists) {
      console.log(`   Config: ${r.configPath}`);
    }
    if (r.extExists) {
      console.log(`   Extensions: ${r.extPath}`);
    }
    console.log();
  });
}

if (notTestable.length > 0) {
  console.log('❌ NOT INSTALLED (Cannot Test)\n');
  notTestable.forEach(r => {
    console.log(`   ${r.displayName}: ${r.configReason}`);
  });
  console.log();
}

console.log('='.repeat(70));
console.log(`📊 Summary: ${testable.length} testable, ${notTestable.length} not installed`);
console.log('='.repeat(70) + '\n');

if (testable.length > 0) {
  console.log('💡 To test auto-import:\n');
  console.log('1. Clear NCP profile: rm ~/.ncp/profiles/all.json');
  console.log('2. Start NCP from the client (or use clientInfo.name in test)');
  console.log('3. Check if MCPs were imported: cat ~/.ncp/profiles/all.json\n');
  console.log('For detailed testing instructions, see:');
  console.log('  docs/testing-client-auto-import.md\n');
} else {
  console.log('💡 No MCP clients found on this system.');
  console.log('   Install Claude Desktop, Cursor, or other clients to test auto-import.\n');
}
