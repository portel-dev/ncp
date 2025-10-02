#!/usr/bin/env node

/**
 * Test MCP Server with Configuration Schema
 *
 * This is a minimal MCP server that demonstrates configurationSchema support.
 * It requires a TEST_TOKEN environment variable for testing schema-based configuration.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Create server instance
const server = new Server(
  {
    name: 'test-schema-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      experimental: {
        // Configuration schema in experimental capabilities
        // TODO: Move to top-level once MCP spec is updated
        configurationSchema: {
          environmentVariables: [
            {
              name: 'TEST_TOKEN',
              description: 'Test API token for validation',
              type: 'string',
              required: true,
              sensitive: true,
              pattern: '^test_[a-zA-Z0-9]{32}$',
              examples: ['test_abcdefghijklmnopqrstuvwxyz123456']
            },
            {
              name: 'TEST_OPTION',
              description: 'Optional test configuration',
              type: 'string',
              required: false,
              default: 'default-value'
            }
          ],
          arguments: [
            {
              name: 'data-dir',
              description: 'Directory for test data',
              type: 'path',
              required: false,
              default: '/tmp/test-mcp'
            }
          ]
        }
      }
    },
  }
);

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'echo',
        description: 'Echo back the input message',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Message to echo back'
            }
          },
          required: ['message']
        }
      },
      {
        name: 'get_config',
        description: 'Show current configuration status',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'echo') {
    return {
      content: [
        {
          type: 'text',
          text: `Echo: ${args.message}`
        }
      ]
    };
  }

  if (name === 'get_config') {
    const token = process.env.TEST_TOKEN;
    const option = process.env.TEST_OPTION || 'default-value';

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            tokenProvided: !!token,
            tokenValue: token ? '***' + token.slice(-4) : null,
            option: option,
            dataDir: process.argv[2] || '/tmp/test-mcp'
          }, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // If TEST_TOKEN is not provided, log a warning but continue
  // (This allows NCP to detect the schema and prompt for it)
  if (!process.env.TEST_TOKEN) {
    console.error('[WARN] TEST_TOKEN not provided - some features may not work');
  }
}

main().catch((error) => {
  console.error('[ERROR] Server failed to start:', error);
  process.exit(1);
});
