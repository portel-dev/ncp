#!/usr/bin/env node
/**
 * Batch MCP Import Test Script
 *
 * Processes a CSV of MCP URLs, auto-discovers auth requirements,
 * prompts for credentials, and sets up MCPs in a test profile.
 *
 * Usage:
 *   node tests/batch-import-mcps.js tests/mcp-urls.csv --profile http-sse-test
 */

import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { AuthDetector } from '../dist/auth/auth-detector.js';
import { AuthPrompter } from '../dist/auth/auth-prompter.js';
import { ProfileManager } from '../dist/profiles/profile-manager.js';
import chalk from 'chalk';

const args = process.argv.slice(2);
const csvPath = args[0] || 'tests/mcp-urls.csv';
const profileName = args.find(a => a.startsWith('--profile='))?.split('=')[1] || 'http-sse-test';
const dryRun = args.includes('--dry-run');
const skipPrompts = args.includes('--skip-prompts');

if (!csvPath || args.includes('--help')) {
  console.log(`
${chalk.bold('Batch MCP Import Script')}

Processes HTTP/SSE MCP URLs, detects auth requirements, and sets them up.

${chalk.cyan('Usage:')}
  node tests/batch-import-mcps.js <csv-file> [options]

${chalk.cyan('Options:')}
  --profile=<name>    Profile to add MCPs to (default: http-sse-test)
  --dry-run           Don't actually add MCPs, just test discovery
  --skip-prompts      Skip auth prompts (for testing discovery only)
  --help              Show this help

${chalk.cyan('CSV Format:')}
  name,url,description
  github-api,https://api.github.com/mcp/sse,GitHub MCP via HTTP
  openai-mcp,https://api.openai.com/v1/mcp,OpenAI MCP

${chalk.cyan('Examples:')}
  # Test discovery without adding
  node tests/batch-import-mcps.js tests/mcp-urls.csv --dry-run

  # Add to custom profile with prompts
  node tests/batch-import-mcps.js tests/mcp-urls.csv --profile=production

  # Just test auth detection
  node tests/batch-import-mcps.js tests/mcp-urls.csv --skip-prompts
  `);
  process.exit(0);
}

console.log(chalk.bold('\n🚀 Batch MCP Import\n'));
console.log(`📄 Input: ${csvPath}`);
console.log(`📋 Profile: ${profileName}`);
console.log(`🔧 Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

// Read CSV
let mcps;
try {
  const csvContent = readFileSync(csvPath, 'utf-8');
  mcps = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
  console.log(`✅ Loaded ${mcps.length} MCPs from CSV\n`);
} catch (error) {
  console.error(chalk.red(`❌ Failed to read CSV: ${error.message}`));
  process.exit(1);
}

// Results tracking
const results = [];
const authDetector = new AuthDetector();
const authPrompter = new AuthPrompter();

// Process each MCP
for (let i = 0; i < mcps.length; i++) {
  const mcp = mcps[i];
  const num = `[${i + 1}/${mcps.length}]`;

  console.log(chalk.cyan(`${num} Processing: ${chalk.bold(mcp.name)}`));
  console.log(`    URL: ${mcp.url}`);
  if (mcp.description) {
    console.log(chalk.dim(`    ${mcp.description}`));
  }

  const result = {
    name: mcp.name,
    url: mcp.url,
    description: mcp.description || '',
    status: 'pending',
    authType: null,
    authFields: [],
    error: null,
    config: null
  };

  try {
    // Step 1: Detect auth requirements
    console.log(chalk.dim('    🔍 Detecting authentication...'));
    const authReq = await authDetector.detect(mcp.url);

    result.authType = authReq.type;
    result.authFields = authReq.fields;

    if (authReq.type === 'none') {
      console.log(chalk.green('    ✅ No authentication required'));
    } else {
      console.log(chalk.yellow(`    🔐 Requires: ${authReq.type}`));

      if (authReq.detected.wwwAuthenticate) {
        console.log(chalk.dim(`       WWW-Authenticate: ${authReq.detected.wwwAuthenticate}`));
      }
      if (authReq.detected.oauthEndpoints?.deviceAuthUrl) {
        console.log(chalk.dim(`       OAuth endpoints discovered`));
      }
    }

    // Step 2: Build config
    let config = {
      url: mcp.url,
      auth: { type: authReq.type }
    };

    // Step 3: Prompt for credentials (if needed and not skipped)
    if (authReq.type !== 'none' && !skipPrompts) {
      console.log(chalk.cyan(`    📝 Authentication required for ${mcp.name}:`));

      // Auto-fill OAuth endpoints if discovered
      let fieldsToPrompt = authReq.fields;
      if (authReq.detected.oauthEndpoints) {
        fieldsToPrompt = authDetector.fillDiscoveredOAuthEndpoints(
          authReq.fields,
          authReq.detected.oauthEndpoints
        );
      }

      try {
        const authValues = await authPrompter.promptFields(fieldsToPrompt);

        // Merge auth values into config
        switch (authReq.type) {
          case 'bearer':
          case 'apiKey':
            config.auth.token = authValues.token;
            break;
          case 'basic':
            config.auth.username = authValues.username;
            config.auth.password = authValues.password;
            break;
          case 'oauth':
            config.auth.oauth = {
              clientId: authValues.clientId,
              clientSecret: authValues.clientSecret,
              deviceAuthUrl: authValues.deviceAuthUrl,
              tokenUrl: authValues.tokenUrl,
              scopes: authValues.scopes
            };
            break;
        }

        console.log(chalk.green('    ✅ Credentials configured'));
      } catch (promptError) {
        console.log(chalk.yellow(`    ⏭️  Skipped prompting: ${promptError.message}`));
        result.status = 'skipped';
        result.error = promptError.message;
        results.push(result);
        console.log('');
        continue;
      }
    } else if (authReq.type !== 'none' && skipPrompts) {
      console.log(chalk.dim(`    ⏭️  Skipped prompts (--skip-prompts)`));
    }

    result.config = config;
    result.status = 'configured';
    results.push(result);

  } catch (error) {
    console.log(chalk.red(`    ❌ Error: ${error.message}`));
    result.status = 'failed';
    result.error = error.message;
    results.push(result);
  }

  console.log('');
}

// Step 4: Add MCPs to profile (if not dry run)
if (!dryRun) {
  console.log(chalk.bold(`\n📋 Adding MCPs to profile: ${profileName}\n`));

  const manager = new ProfileManager();
  await manager.initialize();

  // Ensure profile exists
  let profile = await manager.getProfile(profileName);
  if (!profile) {
    console.log(chalk.yellow(`Creating new profile: ${profileName}`));
    await manager.createProfile(profileName, `HTTP/SSE MCP test profile`);
  }

  let added = 0;
  for (const result of results) {
    if (result.status === 'configured' && result.config) {
      try {
        await manager.addMCPToProfile(profileName, result.name, result.config);
        console.log(chalk.green(`✅ Added: ${result.name}`));
        added++;
      } catch (error) {
        console.log(chalk.red(`❌ Failed to add ${result.name}: ${error.message}`));
        result.status = 'add_failed';
        result.error = error.message;
      }
    }
  }

  console.log(chalk.bold(`\n✨ Added ${added}/${results.length} MCPs to profile: ${profileName}`));
}

// Step 5: Generate summary report
console.log(chalk.bold('\n📊 Summary Report\n'));

const summary = {
  total: results.length,
  configured: results.filter(r => r.status === 'configured').length,
  failed: results.filter(r => r.status === 'failed').length,
  skipped: results.filter(r => r.status === 'skipped').length,
  addFailed: results.filter(r => r.status === 'add_failed').length
};

console.log(`Total MCPs: ${summary.total}`);
console.log(chalk.green(`✅ Configured: ${summary.configured}`));
console.log(chalk.red(`❌ Failed: ${summary.failed}`));
console.log(chalk.yellow(`⏭️  Skipped: ${summary.skipped}`));
if (!dryRun) {
  console.log(chalk.red(`❌ Add Failed: ${summary.addFailed}`));
}

// Auth type breakdown
console.log('\n📋 Auth Types:');
const authTypes = {};
results.forEach(r => {
  const type = r.authType || 'unknown';
  authTypes[type] = (authTypes[type] || 0) + 1;
});
Object.entries(authTypes).forEach(([type, count]) => {
  const icon = type === 'none' ? '🔓' : '🔐';
  console.log(`   ${icon} ${type}: ${count}`);
});

// Save detailed results
const reportPath = csvPath.replace('.csv', '-results.json');
writeFileSync(reportPath, JSON.stringify({ summary, results }, null, 2));
console.log(chalk.dim(`\n💾 Detailed results saved to: ${reportPath}`));

// Generate results CSV
const resultsCSV = stringify(results.map(r => ({
  name: r.name,
  url: r.url,
  status: r.status,
  authType: r.authType || '',
  error: r.error || '',
  hasConfig: r.config ? 'yes' : 'no'
})), { header: true });

const resultsCsvPath = csvPath.replace('.csv', '-results.csv');
writeFileSync(resultsCsvPath, resultsCSV);
console.log(chalk.dim(`💾 Results CSV saved to: ${resultsCsvPath}\n`));

// Final message
if (dryRun) {
  console.log(chalk.cyan('ℹ️  This was a DRY RUN. No MCPs were added to profiles.'));
  console.log(chalk.cyan('   Run without --dry-run to actually add MCPs.\n'));
} else {
  console.log(chalk.green(`\n✅ MCPs added to profile: ${profileName}`));
  console.log(chalk.dim(`   View with: ncp list --profile ${profileName}\n`));
}

// Close prompter
authPrompter.close();

// Exit with error code if any failed
process.exit(summary.failed > 0 ? 1 : 0);
