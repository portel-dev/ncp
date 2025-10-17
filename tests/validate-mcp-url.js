#!/usr/bin/env node
/**
 * Validate MCP URL
 *
 * Attempts to connect to a URL using MCP protocol to validate it's a real MCP server.
 * Then auto-discovers tools, auth requirements, and configuration.
 *
 * Usage:
 *   node tests/validate-mcp-url.js <url>
 *   node tests/validate-mcp-url.js https://api.example.com/mcp/sse
 */

import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { AuthDetector } from '../dist/auth/auth-detector.js';
import chalk from 'chalk';

const url = process.argv[2];

if (!url || process.argv.includes('--help')) {
  console.log(`
${chalk.bold('MCP URL Validator')}

Validates if a URL is a real MCP server by attempting MCP protocol connection.

${chalk.cyan('Usage:')}
  node tests/validate-mcp-url.js <url>

${chalk.cyan('Examples:')}
  node tests/validate-mcp-url.js https://api.example.com/mcp/sse
  node tests/validate-mcp-url.js http://localhost:3000/sse

${chalk.cyan('What it does:')}
  1. Detects auth requirements (401/403 responses)
  2. Attempts MCP protocol handshake (initialize)
  3. Lists available tools (if successful)
  4. Reports server capabilities
  5. Suggests config for import

${chalk.cyan('Output:')}
  - Validation result (✅ valid MCP or ❌ not MCP)
  - Auth requirements (bearer, oauth, apiKey, etc.)
  - Available tools
  - Server info
  - Suggested config for batch import CSV
  `);
  process.exit(0);
}

console.log(chalk.bold('\n🔍 Validating MCP URL\n'));
console.log(`URL: ${chalk.cyan(url)}\n`);

// Step 1: Detect auth requirements
console.log(chalk.yellow('Step 1: Detecting authentication requirements...'));
const authDetector = new AuthDetector();

let authRequirements;
try {
  authRequirements = await authDetector.detect(url);

  if (authRequirements.type === 'none') {
    console.log(chalk.green('✅ No authentication required\n'));
  } else {
    console.log(chalk.yellow(`🔐 Requires: ${authRequirements.type}`));

    if (authRequirements.detected.wwwAuthenticate) {
      console.log(chalk.dim(`   WWW-Authenticate: ${authRequirements.detected.wwwAuthenticate}`));
    }
    if (authRequirements.detected.oauthEndpoints?.deviceAuthUrl) {
      console.log(chalk.dim('   OAuth endpoints discovered'));
    }

    console.log(chalk.dim('\n   ℹ️  Will attempt connection without auth (may fail)\n'));
  }
} catch (error) {
  console.log(chalk.red(`❌ Auth detection failed: ${error.message}\n`));
  authRequirements = { type: 'unknown', required: true, fields: [], detected: {} };
}

// Step 2: Attempt MCP protocol connection
console.log(chalk.yellow('Step 2: Attempting MCP protocol connection...'));

let isValidMCP = false;
let serverInfo = null;
let capabilities = null;
let tools = [];
let error = null;

try {
  const transport = new SSEClientTransport(new URL(url));
  const client = new Client(
    {
      name: 'ncp-validator',
      version: '1.0.0'
    },
    {
      capabilities: {}
    }
  );

  // Connect with timeout
  const connectPromise = client.connect(transport);
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Connection timeout (10s)')), 10000);
  });

  await Promise.race([connectPromise, timeoutPromise]);

  console.log(chalk.green('✅ Connected via MCP protocol\n'));

  // Get server info
  serverInfo = client.getServerVersion?.() || { name: 'unknown', version: 'unknown' };
  capabilities = client.getServerCapabilities?.() || {};

  console.log(chalk.cyan('Server Info:'));
  console.log(`   Name: ${serverInfo.name || 'unknown'}`);
  console.log(`   Version: ${serverInfo.version || 'unknown'}`);

  if (Object.keys(capabilities).length > 0) {
    console.log(`\nCapabilities: ${Object.keys(capabilities).join(', ')}`);
  }

  // Try to list tools
  try {
    const toolsResponse = await client.request(
      { method: 'tools/list' },
      { timeout: 5000 }
    );

    tools = toolsResponse.tools || [];
    console.log(chalk.green(`\n✅ Found ${tools.length} tools:`));

    tools.forEach(tool => {
      console.log(`   • ${chalk.bold(tool.name)}`);
      if (tool.description) {
        console.log(chalk.dim(`     ${tool.description.substring(0, 60)}${tool.description.length > 60 ? '...' : ''}`));
      }
    });
  } catch (toolsError) {
    console.log(chalk.yellow(`\n⚠️  Could not list tools: ${toolsError.message}`));
  }

  isValidMCP = true;

  // Close connection
  await client.close();

} catch (connectionError) {
  error = connectionError;
  console.log(chalk.red(`❌ MCP connection failed: ${connectionError.message}`));

  // Provide helpful diagnostics
  if (connectionError.message.includes('401') || connectionError.message.includes('403')) {
    console.log(chalk.yellow('\n💡 This might be a valid MCP that requires authentication'));
    console.log(chalk.dim('   The server rejected the connection due to missing credentials'));
  } else if (connectionError.message.includes('timeout')) {
    console.log(chalk.yellow('\n💡 The server did not respond in time'));
    console.log(chalk.dim('   It might be offline or very slow'));
  } else if (connectionError.message.includes('ECONNREFUSED')) {
    console.log(chalk.yellow('\n💡 Connection refused'));
    console.log(chalk.dim('   The server is not running or not accessible'));
  } else {
    console.log(chalk.yellow('\n💡 This might not be an MCP server'));
    console.log(chalk.dim('   Or it uses a different protocol/format'));
  }
}

// Step 3: Generate report
console.log(chalk.bold('\n━'.repeat(60)));
console.log(chalk.bold('\n📊 Validation Report\n'));

const status = isValidMCP ? chalk.green('✅ VALID MCP SERVER') : chalk.red('❌ NOT A VALID MCP SERVER');
console.log(status + '\n');

// Summary
console.log(chalk.cyan('Summary:'));
console.log(`   URL: ${url}`);
console.log(`   Auth Type: ${authRequirements.type}`);
console.log(`   MCP Protocol: ${isValidMCP ? 'Supported' : 'Not detected'}`);
if (serverInfo) {
  console.log(`   Server: ${serverInfo.name} v${serverInfo.version}`);
}
console.log(`   Tools: ${tools.length}`);

// Next steps
if (isValidMCP && authRequirements.type === 'none') {
  console.log(chalk.bold('\n✨ Ready to Import!\n'));

  console.log(chalk.cyan('Add to CSV:'));
  const serverName = serverInfo?.name?.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'unknown-mcp';
  const description = serverInfo?.name || 'MCP Server';
  console.log(chalk.dim(`${serverName},${url},${description}`));

  console.log(chalk.cyan('\nOr import directly via AI:'));
  console.log(chalk.dim(`Tell AI: "Add MCP from ${url}"`));

} else if (isValidMCP && authRequirements.type !== 'none') {
  console.log(chalk.bold('\n⚠️  Requires Authentication\n'));

  console.log(chalk.cyan('Auth Requirements:'));
  console.log(`   Type: ${authRequirements.type}`);
  authRequirements.fields.forEach(field => {
    const req = field.required ? '(required)' : '(optional)';
    console.log(`   • ${field.label} ${req}`);
    if (field.description) {
      console.log(chalk.dim(`     ${field.description}`));
    }
  });

  console.log(chalk.cyan('\nTo import:'));
  console.log(chalk.dim('1. Prepare credentials in clipboard format'));
  console.log(chalk.dim('2. Add to CSV with URL'));
  console.log(chalk.dim('3. Run batch-import-mcps.js'));

} else {
  console.log(chalk.bold('\n❌ Cannot Import\n'));

  console.log(chalk.yellow('Possible reasons:'));
  console.log(chalk.dim('• Not an MCP server'));
  console.log(chalk.dim('• Wrong URL or path'));
  console.log(chalk.dim('• Server offline'));
  console.log(chalk.dim('• Incompatible protocol version'));

  if (error) {
    console.log(chalk.dim(`• Error: ${error.message}`));
  }
}

console.log(chalk.bold('\n━'.repeat(60)));
console.log('');

// Exit code
process.exit(isValidMCP ? 0 : 1);
