#!/usr/bin/env node
/**
 * Create Test HTTP/SSE MCP Servers
 *
 * Quickly spin up test MCP servers with different auth types for testing
 */

import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import express from 'express';
import chalk from 'chalk';

const TEST_SERVERS = [
  {
    port: 3000,
    path: '/sse',
    name: 'test-public',
    description: 'Public test MCP (no auth)',
    authType: 'none',
    tools: ['test_tool', 'ping']
  },
  {
    port: 3001,
    path: '/sse',
    name: 'test-bearer',
    description: 'Bearer token auth MCP',
    authType: 'bearer',
    token: 'test-token-123',
    tools: ['secure_tool', 'get_data']
  },
  {
    port: 3002,
    path: '/sse',
    name: 'test-apikey',
    description: 'API key auth MCP',
    authType: 'apikey',
    apiKey: 'sk-test-key-456',
    tools: ['api_call', 'fetch_data']
  }
];

console.log(chalk.bold('\n🚀 Creating Test HTTP/SSE MCP Servers\n'));

const servers = [];

for (const config of TEST_SERVERS) {
  const app = express();

  // Add authentication middleware
  if (config.authType === 'bearer') {
    app.use((req, res, next) => {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${config.token}`) {
        return res.status(401).json({
          error: 'unauthorized',
          message: 'Bearer token required',
          hint: `Use: Authorization: Bearer ${config.token}`
        });
      }
      next();
    });
  } else if (config.authType === 'apikey') {
    app.use((req, res, next) => {
      const apiKey = req.headers['x-api-key'];
      if (apiKey !== config.apiKey) {
        return res.status(401).json({
          error: 'unauthorized',
          message: 'API key required',
          hint: `Use: X-API-Key: ${config.apiKey}`
        });
      }
      next();
    });
  }

  // Create MCP server
  const mcpServer = new Server(
    {
      name: config.name,
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // Add tools
  mcpServer.setRequestHandler('tools/list', async () => ({
    tools: config.tools.map(name => ({
      name,
      description: `Test tool from ${config.name}`,
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Test message'
          }
        }
      }
    }))
  }));

  mcpServer.setRequestHandler('tools/call', async (request) => ({
    content: [{
      type: 'text',
      text: `✅ Tool ${request.params.name} executed successfully!\nAuth: ${config.authType}\nMessage: ${request.params.arguments?.message || 'none'}`
    }]
  }));

  // Create SSE transport
  const transport = new SSEServerTransport(config.path, mcpServer);
  app.use(transport.router);

  // Start server
  const server = app.listen(config.port, () => {
    const url = `http://localhost:${config.port}${config.path}`;
    console.log(chalk.green(`✅ ${config.name}`));
    console.log(chalk.dim(`   URL: ${url}`));
    console.log(chalk.dim(`   Auth: ${config.authType}`));
    if (config.authType === 'bearer') {
      console.log(chalk.dim(`   Token: ${config.token}`));
    } else if (config.authType === 'apikey') {
      console.log(chalk.dim(`   API Key: ${config.apiKey}`));
    }
    console.log(chalk.dim(`   Tools: ${config.tools.join(', ')}`));
    console.log('');
  });

  servers.push({ server, config });
}

// Generate CSV for batch import
const csvLines = ['name,url,description'];
TEST_SERVERS.forEach(config => {
  const url = `http://localhost:${config.port}${config.path}`;
  csvLines.push(`${config.name},${url},${config.description}`);
});

const csvContent = csvLines.join('\n');
const { writeFileSync } = await import('fs');
writeFileSync('tests/mcp-urls-test.csv', csvContent);

console.log(chalk.cyan('📄 Generated CSV: tests/mcp-urls-test.csv\n'));

// Instructions
console.log(chalk.bold('📋 Testing Instructions:\n'));
console.log(chalk.cyan('1. Test auth detection:'));
console.log(chalk.dim('   node tests/batch-import-mcps.js tests/mcp-urls-test.csv --dry-run --skip-prompts\n'));

console.log(chalk.cyan('2. Test with prompts (interactive):'));
console.log(chalk.dim('   node tests/batch-import-mcps.js tests/mcp-urls-test.csv --dry-run\n'));

console.log(chalk.cyan('3. Actually import to test profile:'));
console.log(chalk.dim('   node tests/batch-import-mcps.js tests/mcp-urls-test.csv --profile http-sse-test\n'));

console.log(chalk.cyan('4. View imported MCPs:'));
console.log(chalk.dim('   ncp list --profile http-sse-test\n'));

console.log(chalk.cyan('5. Test discovery:'));
console.log(chalk.dim('   ncp find "test" --profile http-sse-test\n'));

console.log(chalk.yellow('📝 Auth Credentials:'));
console.log(chalk.dim('   test-bearer: Authorization: Bearer test-token-123'));
console.log(chalk.dim('   test-apikey: X-API-Key: sk-test-key-456'));
console.log(chalk.dim('   test-public: No auth needed\n'));

console.log(chalk.green('✨ Test servers are running!'));
console.log(chalk.dim('   Press Ctrl+C to stop\n'));

// Handle shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n🛑 Shutting down test servers...\n'));
  servers.forEach(({ server, config }) => {
    server.close();
    console.log(chalk.dim(`   Stopped: ${config.name}`));
  });
  console.log(chalk.green('\n✅ All servers stopped\n'));
  process.exit(0);
});
