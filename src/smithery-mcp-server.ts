/**
 * Smithery MCP Server wrapper for NCP
 * Based on the official Smithery template structure
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { spawn } from 'child_process';

// Config schema that matches smithery template pattern
export const configSchema = z.object({
  profile: z.string().default("default").describe("NCP profile to use (optional)"),
});

// Default export function that Smithery expects
export default function createServer({
  config,
}: {
  config: z.infer<typeof configSchema>;
}) {
  const server = new McpServer({
    name: "Natural Context Provider",
    version: "1.0.4",
  });

  // Add NCP's unified "find" tool
  server.registerTool(
    "find",
    {
      title: "Find Tools",
      description: "Discover tools across all connected MCP servers using natural language",
      inputSchema: {
        query: z.string().describe("Natural language description of what you want to do"),
      },
    },
    async ({ query }) => {
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
    }
  );

  // Add NCP's unified "run" tool
  server.registerTool(
    "run",
    {
      title: "Run Tool",
      description: "Execute a tool on a specific MCP server",
      inputSchema: {
        toolName: z.string().describe("Name of the tool to execute"),
        mcpName: z.string().describe("Name of the MCP server"),
        params: z.record(z.any()).optional().describe("Parameters for the tool"),
      },
    },
    async ({ toolName, mcpName, params = {} }) => {
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
    }
  );

  return server.server;
}

// Execute NCP CLI command
async function executeNCP(args: string[], profile: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ncpArgs = profile !== 'default' ? ['--profile', profile, ...args] : args;
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