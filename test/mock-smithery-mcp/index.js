#!/usr/bin/env node

/**
 * Mock MCP Server for Testing Smithery Config Detection
 * This server intentionally DOES NOT include configurationSchema in capabilities
 * to test fallback to smithery.yaml detection
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Create server WITHOUT configurationSchema in capabilities
const server = new Server(
  {
    name: 'test-smithery-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      // Intentionally NO configurationSchema here
      // to test smithery.yaml fallback
    },
  }
);

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'test_tool',
        description: 'A test tool for Smithery config detection',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Test message'
            }
          }
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'test_tool') {
    return {
      content: [
        {
          type: 'text',
          text: `Test tool executed: ${args.message || 'no message'}`
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
  console.error('[INFO] Mock Smithery MCP server running');
}

main().catch((error) => {
  console.error('[ERROR] Server failed:', error);
  process.exit(1);
});
