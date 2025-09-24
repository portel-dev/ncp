/**
 * Standalone Smithery MCP Server
 * Lightweight version without AI dependencies for successful bundling
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { spawn } from 'child_process';

// Simple config schema
const configSchema = {
  type: "object",
  properties: {
    profile: {
      type: "string",
      description: "NCP profile to use (optional)",
      default: "default"
    }
  }
};

// Main server creation function that Smithery expects
export default function createServer(options: { config: any }) {
  const { config = {} } = options;

  const server = new McpServer({
    name: "Natural Context Provider",
    version: "1.0.4",
  });

  // Add NCP's unified "find" tool
  server.registerTool("find", {
    title: "Find Tools",
    description: "Discover tools across all connected MCP servers using natural language",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language description of what you want to do"
        }
      },
      required: ["query"]
    } as any
  }, async ({ query }: { query: string }) => {
    try {
      const result = await executeNCP(['find', query], config.profile);
      return {
        content: [{ type: "text", text: result }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  });

  // Add NCP's unified "run" tool
  server.registerTool("run", {
    title: "Run Tool",
    description: "Execute a tool on a specific MCP server",
    inputSchema: {
      type: "object",
      properties: {
        toolName: {
          type: "string",
          description: "Name of the tool to execute"
        },
        mcpName: {
          type: "string",
          description: "Name of the MCP server"
        },
        params: {
          type: "object",
          description: "Parameters for the tool",
          additionalProperties: true
        }
      },
      required: ["toolName", "mcpName"]
    } as any
  }, async ({ toolName, mcpName, params = {} }: { toolName: string, mcpName: string, params?: any }) => {
    try {
      const toolRef = `${mcpName}:${toolName}`;
      const args = ['run', toolRef, '--params', JSON.stringify(params)];
      const result = await executeNCP(args, config.profile);
      return {
        content: [{ type: "text", text: result }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  });

  // Add list tools functionality
  server.registerTool("list", {
    title: "List Available Tools",
    description: "List all available tools across configured MCP servers",
    inputSchema: {
      type: "object",
      properties: {
        mcpName: {
          type: "string",
          description: "Optional: filter by specific MCP server name"
        }
      }
    } as any
  }, async ({ mcpName }: { mcpName?: string }) => {
    try {
      const args = mcpName ? ['list', '--mcp', mcpName] : ['list'];
      const result = await executeNCP(args, config.profile);
      return {
        content: [{ type: "text", text: result }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  });

  return server.server;
}

// Execute NCP CLI command by spawning the installed package
async function executeNCP(args: string[], profile?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ncpArgs = profile && profile !== 'default' ? ['--profile', profile, ...args] : args;

    const child = spawn('npx', ['@portel/ncp', ...ncpArgs], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `Process exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start NCP: ${error.message}`));
    });
  });
}

// Export config schema for Smithery
export { configSchema };