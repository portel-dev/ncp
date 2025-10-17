#!/usr/bin/env node
/**
 * Find HTTP/SSE MCPs Script
 *
 * Searches for publicly available HTTP/SSE MCP servers and creates a CSV
 *
 * Sources:
 * 1. GitHub search for "MCP SSE server" or "MCP HTTP server"
 * 2. MCP Registry (check for remotes field)
 * 3. Known hosted MCP services
 * 4. Community lists
 */

import { RegistryClient } from '../dist/services/registry-client.js';
import { stringify } from 'csv-stringify/sync';
import { writeFileSync } from 'fs';
import chalk from 'chalk';

console.log(chalk.bold('\n🔍 Finding HTTP/SSE MCP Servers\n'));

const foundMCPs = [];

// Method 1: Search MCP Registry for remotes
console.log(chalk.cyan('Method 1: Searching MCP Registry for HTTP/SSE servers...'));
try {
  const client = new RegistryClient();

  // Search for common terms
  const searchTerms = ['api', 'http', 'sse', 'remote', 'cloud', 'service'];

  for (const term of searchTerms) {
    const results = await client.search(term, 100);

    for (const result of results) {
      // Check if it has remotes field
      if (result.server.remotes && result.server.remotes.length > 0) {
        const remote = result.server.remotes[0];
        foundMCPs.push({
          name: result.server.name.split('/').pop() || result.server.name,
          url: remote.url,
          description: result.server.description || '',
          source: 'registry',
          authHint: remote.environmentVariables?.some(v => v.isSecret) ? 'required' : 'unknown'
        });

        console.log(chalk.green(`  ✅ Found: ${result.server.name}`));
        console.log(chalk.dim(`     URL: ${remote.url}`));
      }
    }
  }

  if (foundMCPs.length === 0) {
    console.log(chalk.yellow('  ⚠️  No HTTP/SSE MCPs found in registry (yet)'));
    console.log(chalk.dim('     The registry currently has mostly stdio MCPs'));
  }
} catch (error) {
  console.log(chalk.red(`  ❌ Registry search failed: ${error.message}`));
}

console.log('');

// Method 2: Known hosted MCPs (community curated)
console.log(chalk.cyan('Method 2: Checking known hosted MCP services...'));

const knownHosted = [
  // Add known HTTP/SSE MCPs here as they become available
  // Example:
  // {
  //   name: 'github-api',
  //   url: 'https://api.github.com/mcp/sse',
  //   description: 'GitHub MCP via SSE',
  //   source: 'known',
  //   authHint: 'bearer'
  // }
];

if (knownHosted.length === 0) {
  console.log(chalk.yellow('  ⚠️  No known hosted MCPs configured yet'));
  console.log(chalk.dim('     Add entries to knownHosted array in this script'));
} else {
  knownHosted.forEach(mcp => {
    foundMCPs.push(mcp);
    console.log(chalk.green(`  ✅ Found: ${mcp.name}`));
    console.log(chalk.dim(`     URL: ${mcp.url}`));
  });
}

console.log('');

// Method 3: GitHub API search (requires token for higher rate limits)
console.log(chalk.cyan('Method 3: GitHub search (requires GITHUB_TOKEN for best results)...'));

if (process.env.GITHUB_TOKEN) {
  console.log(chalk.dim('  🔑 Using GITHUB_TOKEN for authenticated search'));

  const queries = [
    'mcp sse server',
    'model context protocol http',
    'mcp remote server'
  ];

  try {
    for (const query of queries) {
      const response = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=10`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log(chalk.dim(`  📦 Query "${query}": ${data.total_count} repos found`));

        // Note: We'd need to check README/docs for actual MCP endpoints
        // This is just showing the approach
      }
    }
  } catch (error) {
    console.log(chalk.red(`  ❌ GitHub search failed: ${error.message}`));
  }
} else {
  console.log(chalk.dim('  ℹ️  Set GITHUB_TOKEN env var for GitHub API search'));
}

console.log('');

// Generate results
console.log(chalk.bold('📊 Results:\n'));
console.log(`Total found: ${foundMCPs.length}`);

if (foundMCPs.length > 0) {
  console.log('\nBy source:');
  const bySource = foundMCPs.reduce((acc, mcp) => {
    acc[mcp.source] = (acc[mcp.source] || 0) + 1;
    return acc;
  }, {});
  Object.entries(bySource).forEach(([source, count]) => {
    console.log(`  ${source}: ${count}`);
  });

  // Save to CSV
  const csv = stringify(foundMCPs, { header: true });
  const outputPath = 'tests/mcp-urls-found.csv';
  writeFileSync(outputPath, csv);
  console.log(chalk.green(`\n✅ Saved to: ${outputPath}`));

  console.log(chalk.cyan(`\n💡 Next steps:`));
  console.log(chalk.dim('   1. Review the CSV file'));
  console.log(chalk.dim('   2. Test with: node tests/batch-import-mcps.js tests/mcp-urls-found.csv --dry-run'));
  console.log(chalk.dim('   3. Import: node tests/batch-import-mcps.js tests/mcp-urls-found.csv'));
} else {
  console.log(chalk.yellow('\n⚠️  No HTTP/SSE MCPs found yet.'));
  console.log(chalk.cyan('\n💡 Recommendations:'));
  console.log(chalk.dim('   1. Create test servers (see tests/create-test-mcps.js)'));
  console.log(chalk.dim('   2. Check MCP community Discord/forums for hosted services'));
  console.log(chalk.dim('   3. Wait for HTTP/SSE MCPs to appear in registry'));
  console.log(chalk.dim('   4. Test with local servers using mcp-urls-sample.csv'));
}

console.log('');
