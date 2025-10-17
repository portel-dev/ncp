#!/usr/bin/env node
/**
 * Discover Real HTTP/SSE MCP Servers
 *
 * Searches for actual, publicly available HTTP/SSE MCP endpoints
 */

import { RegistryClient } from '../dist/services/registry-client.js';
import { stringify } from 'csv-stringify/sync';
import { writeFileSync } from 'fs';
import chalk from 'chalk';

console.log(chalk.bold('\n🔍 Discovering Real HTTP/SSE MCP Servers\n'));

const foundMCPs = [];

// Source 1: MCP Official Registry (check for remotes)
console.log(chalk.cyan('📡 Checking MCP Official Registry...\n'));

try {
  const client = new RegistryClient();

  // Get ALL servers and filter for remotes
  const allServers = await client.search('', 500); // Get up to 500 servers

  console.log(chalk.dim(`   Scanning ${allServers.length} registry entries...\n`));

  for (const result of allServers) {
    if (result.server.remotes && result.server.remotes.length > 0) {
      const remote = result.server.remotes[0];

      foundMCPs.push({
        name: result.server.name.split('/').pop() || result.server.name,
        fullName: result.server.name,
        url: remote.url,
        type: remote.type,
        description: result.server.description || 'No description',
        source: 'mcp-registry',
        version: result.server.version,
        requiresAuth: remote.environmentVariables?.some(v => v.isSecret) ? 'yes' : 'unknown'
      });

      console.log(chalk.green(`   ✅ Found: ${result.server.name}`));
      console.log(chalk.dim(`      Type: ${remote.type}`));
      console.log(chalk.dim(`      URL: ${remote.url}`));
      console.log('');
    }
  }

  if (foundMCPs.length === 0) {
    console.log(chalk.yellow('   ⚠️  No HTTP/SSE MCPs found in official registry\n'));
    console.log(chalk.dim('      The registry currently contains mostly stdio MCPs'));
    console.log(chalk.dim('      HTTP/SSE MCPs will be added as the ecosystem grows\n'));
  }

} catch (error) {
  console.log(chalk.red(`   ❌ Registry error: ${error.message}\n`));
}

// Source 2: Known public MCP services (community curated)
console.log(chalk.cyan('🌐 Checking known public MCP services...\n'));

const knownPublicMCPs = [
  // Add real public MCPs here as they become available
  // Format:
  // {
  //   name: 'service-name',
  //   fullName: 'com.example/service-name',
  //   url: 'https://api.example.com/mcp',
  //   type: 'sse',
  //   description: 'Service description',
  //   source: 'public-api',
  //   version: '1.0.0',
  //   requiresAuth: 'yes'
  // }
];

if (knownPublicMCPs.length > 0) {
  knownPublicMCPs.forEach(mcp => {
    foundMCPs.push(mcp);
    console.log(chalk.green(`   ✅ ${mcp.fullName}`));
    console.log(chalk.dim(`      URL: ${mcp.url}`));
    console.log('');
  });
} else {
  console.log(chalk.yellow('   ⚠️  No known public HTTP/SSE MCPs configured\n'));
  console.log(chalk.dim('      This list will grow as public MCP services are deployed\n'));
}

// Source 3: GitHub awesome lists / community resources
console.log(chalk.cyan('📚 Checking community resources...\n'));

const communityResources = [
  'https://github.com/modelcontextprotocol/servers',
  'https://github.com/topics/mcp-server',
  'https://github.com/topics/model-context-protocol'
];

console.log(chalk.dim('   Community lists to check:'));
communityResources.forEach(url => {
  console.log(chalk.dim(`   • ${url}`));
});
console.log(chalk.dim('\n   Visit these to find HTTP/SSE MCP servers\n'));

// Results
console.log(chalk.bold('━'.repeat(60)));
console.log(chalk.bold('\n📊 Discovery Results\n'));

if (foundMCPs.length > 0) {
  console.log(chalk.green(`✅ Found ${foundMCPs.length} real HTTP/SSE MCP server(s)\n`));

  // Group by source
  const bySource = foundMCPs.reduce((acc, mcp) => {
    acc[mcp.source] = (acc[mcp.source] || 0) + 1;
    return acc;
  }, {});

  console.log('By source:');
  Object.entries(bySource).forEach(([source, count]) => {
    console.log(chalk.dim(`   ${source}: ${count}`));
  });

  // Group by type
  const byType = foundMCPs.reduce((acc, mcp) => {
    acc[mcp.type] = (acc[mcp.type] || 0) + 1;
    return acc;
  }, {});

  console.log('\nBy type:');
  Object.entries(byType).forEach(([type, count]) => {
    console.log(chalk.dim(`   ${type}: ${count}`));
  });

  // Save to CSV
  const csv = stringify(foundMCPs.map(m => ({
    name: m.name,
    url: m.url,
    description: m.description,
    type: m.type,
    source: m.source,
    requiresAuth: m.requiresAuth
  })), { header: true });

  const outputPath = 'tests/real-http-mcps.csv';
  writeFileSync(outputPath, csv);
  console.log(chalk.green(`\n✅ Saved to: ${outputPath}\n`));

  // Save detailed JSON
  const jsonPath = 'tests/real-http-mcps.json';
  writeFileSync(jsonPath, JSON.stringify(foundMCPs, null, 2));
  console.log(chalk.dim(`   Details: ${jsonPath}\n`));

  console.log(chalk.cyan('🚀 Next steps:\n'));
  console.log(chalk.dim('   1. Review: cat tests/real-http-mcps.csv'));
  console.log(chalk.dim('   2. Test discovery: node tests/batch-import-mcps.js tests/real-http-mcps.csv --dry-run'));
  console.log(chalk.dim('   3. Import: node tests/batch-import-mcps.js tests/real-http-mcps.csv --profile http-sse-test'));

} else {
  console.log(chalk.yellow('⚠️  No real HTTP/SSE MCPs discovered yet\n'));

  console.log(chalk.cyan('💡 Why this is expected:\n'));
  console.log(chalk.dim('   • MCP is a new protocol (announced Dec 2024)'));
  console.log(chalk.dim('   • Most early adopters are using stdio (easier to deploy)'));
  console.log(chalk.dim('   • HTTP/SSE MCPs require hosting infrastructure'));
  console.log(chalk.dim('   • Ecosystem is growing - check back soon!\n'));

  console.log(chalk.cyan('🔧 What you can do:\n'));
  console.log(chalk.dim('   1. Check community resources manually:'));
  communityResources.forEach(url => {
    console.log(chalk.dim(`      ${url}`));
  });
  console.log(chalk.dim('\n   2. Monitor MCP registry for new HTTP/SSE entries'));
  console.log(chalk.dim('   3. Deploy your own HTTP/SSE MCP (when you have a use case)'));
  console.log(chalk.dim('   4. Test unified discovery with stdio MCPs (works identically)\n'));

  console.log(chalk.cyan('📋 Alternative test:\n'));
  console.log(chalk.dim('   Test the unified discovery with stdio MCPs from registry:'));
  console.log(chalk.dim('   node tests/create-stdio-test-csv.js\n'));
}

console.log(chalk.bold('━'.repeat(60)));
console.log('');
