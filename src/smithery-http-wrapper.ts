/**
 * Smithery HTTP wrapper for NCP
 * Creates an HTTP server that exposes NCP's capabilities via MCP protocol
 */

import express from 'express';
import { spawn } from 'child_process';
import { z } from 'zod';

// Config schema for Smithery
export const configSchema = z.object({
  profile: z.string().default('default').describe('NCP profile to use'),
});

const app = express();
app.use(express.json());

// MCP Protocol endpoints
app.post('/mcp', async (req, res) => {
  const { method, params, id } = req.body;

  try {
    if (method === 'initialize') {
      // Respond to MCP initialize request
      res.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: {
            tools: {},
            resources: {},
            prompts: {}
          },
          serverInfo: {
            name: 'NCP - Natural Context Provider',
            version: '1.0.4',
            description: 'N-to-1 MCP orchestration - transforms 50+ tools into 2 unified tools'
          }
        }
      });
    } else if (method === 'tools/list') {
      // Return NCP's unified tools
      res.json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'find',
              description: 'Discover tools across all connected MCP servers using natural language',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Natural language description of what you want to do' }
                },
                required: ['query']
              }
            },
            {
              name: 'run',
              description: 'Execute a tool on a specific MCP server',
              inputSchema: {
                type: 'object',
                properties: {
                  toolName: { type: 'string', description: 'Name of the tool to execute' },
                  mcpName: { type: 'string', description: 'Name of the MCP server' },
                  params: { type: 'object', description: 'Parameters for the tool' }
                },
                required: ['toolName', 'mcpName']
              }
            }
          ]
        }
      });
    } else if (method === 'tools/call') {
      // Proxy tool calls to NCP CLI
      const { name, arguments: args } = params;

      // Execute NCP command and return results
      const ncpArgs = name === 'find'
        ? ['find', args.query]
        : ['run', `${args.mcpName}:${args.toolName}`, '--params', JSON.stringify(args.params || {})];

      const result = await executeNCP(ncpArgs);

      res.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            { type: 'text', text: result }
          ]
        }
      });
    } else {
      res.status(404).json({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: 'Method not found' }
      });
    }
  } catch (error) {
    res.status(500).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: error.message }
    });
  }
});

// Execute NCP CLI command
async function executeNCP(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['@portel/ncp', ...args], {
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
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Process exited with code ${code}`));
      }
    });
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`NCP HTTP wrapper running on port ${PORT}`);
});

export default app;