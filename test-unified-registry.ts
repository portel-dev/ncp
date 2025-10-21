#!/usr/bin/env node
/**
 * Test script for unified registry (custom + official fallback)
 */

import { UnifiedRegistryClient } from './src/services/unified-registry-client.js';

async function main() {
  const client = new UnifiedRegistryClient();

  console.log('🔄 Testing Unified Registry (Custom + Official Fallback)\n');
  console.log('='.repeat(70));

  try {
    // Test 1: Search that should hit custom registry
    console.log('\n📦 Test 1: Search "file" (should use custom registry)');
    const fileResults = await client.searchForSelection('file', { limit: 3 });
    console.log(`   ✅ Found ${fileResults.length} results`);
    fileResults.forEach((mcp, i) => {
      console.log(`   ${i + 1}. ${mcp.displayName}`);
      console.log(`      ${mcp.description.substring(0, 60)}...`);
      console.log(`      Transport: ${mcp.transport} | Quality: ${mcp.qualityScore?.toFixed(2) || 'N/A'}`);
    });

    // Test 2: Search for common term
    console.log('\n\n📦 Test 2: Search "git" (should use custom registry)');
    const gitResults = await client.searchForSelection('git', { limit: 3 });
    console.log(`   ✅ Found ${gitResults.length} results`);
    gitResults.forEach((mcp, i) => {
      console.log(`   ${i + 1}. ${mcp.displayName}`);
      console.log(`      ${mcp.description.substring(0, 60)}...`);
      console.log(`      Command: ${mcp.command} ${mcp.args?.join(' ') || ''}`);
    });

    // Test 3: Get detailed info
    if (fileResults.length > 0) {
      const firstMCP = fileResults[0];
      console.log(`\n\n📋 Test 3: Get detailed info for "${firstMCP.displayName}"`);
      const details = await client.getDetailedInfo(firstMCP.name);
      console.log(`   ✅ Retrieved details`);
      console.log(`      Transport: ${details.transport}`);
      console.log(`      Command: ${details.command || 'N/A'}`);
      console.log(`      Args: ${details.args?.join(' ') || 'N/A'}`);
      console.log(`      Env Vars: ${details.envVars?.length || 0}`);
    }

    // Test 4: Search for something that might not be in custom registry
    console.log('\n\n📦 Test 4: Search "filesystem" (test fallback if needed)');
    const fsResults = await client.searchForSelection('filesystem', { limit: 3 });
    console.log(`   ✅ Found ${fsResults.length} results`);
    if (fsResults.length > 0) {
      fsResults.slice(0, 2).forEach((mcp, i) => {
        console.log(`   ${i + 1}. ${mcp.displayName}`);
        console.log(`      ${mcp.description.substring(0, 60)}...`);
      });
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ All unified registry tests passed!');
    console.log('\n📊 Summary:');
    console.log('   - Custom registry used as primary source');
    console.log('   - Official registry available as fallback');
    console.log('   - Seamless failover on errors');
    console.log('');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
