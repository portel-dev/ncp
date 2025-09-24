#!/usr/bin/env node

/**
 * Base Mock MCP Server
 * Provides a template for creating realistic MCP servers for testing
 * These servers respond to MCP protocol but don't actually execute tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

class MockMCPServer {
  constructor(serverInfo, tools, resources = []) {
    this.server = new Server(serverInfo, {
      capabilities: {
        tools: {},
        resources: {},
      },
    });

    this.tools = tools;
    this.resources = resources;
    this.setupHandlers();
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.tools,
    }));

    // Handle tool calls (always return success with mock data)
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Find the tool
      const tool = this.tools.find(t => t.name === name);
      if (!tool) {
        throw new McpError(ErrorCode.MethodNotFound, `Tool "${name}" not found`);
      }

      // Return mock successful response
      return {
        content: [
          {
            type: "text",
            text: `Mock execution of ${name} with args: ${JSON.stringify(args, null, 2)}\n\nThis is a test MCP server - no actual operation was performed.`
          }
        ]
      };
    });

    // List resources (if any)
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: this.resources,
    }));

    // Read resources (if any)
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const resource = this.resources.find(r => r.uri === request.params.uri);
      if (!resource) {
        throw new McpError(ErrorCode.InvalidRequest, `Resource not found: ${request.params.uri}`);
      }

      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: "text/plain",
            text: `Mock resource content for ${request.params.uri}`
          }
        ]
      };
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`Mock MCP server ${this.server.name} running on stdio`);
  }
}

export { MockMCPServer };