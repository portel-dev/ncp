#!/usr/bin/env node
/**
 * Test script for custom registry discovery
 */

import { CustomRegistryClient } from './src/services/custom-registry-client.js';

async function main() {
  const client = new CustomRegistryClient();

  console.log('🔍 Testing Custom Registry Discovery\n');
  console.log('=' .repeat(60));

  try {
    // Test 1: Get stats
    console.log('\n📊 Registry Statistics:');
    const stats = await client.getStats();
    console.log(`   Total MCPs: ${stats.totalMCPs}`);
    console.log(`   Total Downloads: ${stats.totalDownloads}`);
    console.log(`   Verified MCPs: ${stats.verifiedMCPs}`);

    // Test 2: Get trending
    console.log('\n🔥 Top 5 Trending MCPs:');
    const trending = await client.getTrending(5);
    trending.forEach((mcp, i) => {
      console.log(`\n   ${i + 1}. ${mcp.displayName || mcp.name}`);
      console.log(`      ${mcp.description.substring(0, 60)}...`);
      console.log(`      Downloads: ${mcp.stats?.downloads || 0} | Stars: ${mcp.stats?.stars || 0}`);
      console.log(`      Install: ${mcp.installCommand}`);
    });

    // Test 3: Search
    console.log('\n\n🔎 Search Results for "file":');
    const searchResults = await client.search({ q: 'file', limit: 3 });
    searchResults.forEach((mcp, i) => {
      console.log(`\n   ${i + 1}. ${mcp.displayName || mcp.name}`);
      console.log(`      ${mcp.description.substring(0, 60)}...`);
      console.log(`      Install: ${mcp.installCommand}`);
    });

    // Test 4: Get specific MCP
    if (trending.length > 0) {
      const firstMCP = trending[0];
      console.log(`\n\n📦 Detailed Info for "${firstMCP.displayName}":`);

      const details = await client.getMCP(firstMCP.id);
      console.log(`   Name: ${details.name}`);
      console.log(`   Version: ${details.version}`);
      console.log(`   Author: ${details.author.name}`);
      console.log(`   Repository: ${details.repository?.url || 'N/A'}`);
      console.log(`   License: ${details.license}`);
      console.log(`   Transport: ${details.transport.type}`);
      console.log(`   Install: ${details.installCommand}`);
    }

    // Test 5: Search for selection (formatted for CLI)
    console.log('\n\n📋 Formatted Search Results (CLI-ready):');
    const formatted = await client.searchForSelection('git', 5);
    formatted.forEach(mcp => {
      const verified = mcp.verified ? '✓' : ' ';
      console.log(`   [${verified}] ${mcp.number}. ${mcp.displayName}`);
      console.log(`       ${mcp.description.substring(0, 55)}...`);
      console.log(`       ⬇ ${mcp.downloads} | ⭐ ${mcp.stars} | 📊 ${mcp.score.toFixed(2)}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests passed!\n');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
