#!/usr/bin/env node
/**
 * Configurable Dummy MCP Server
 *
 * This server loads tool definitions from a JSON file and provides realistic MCP interfaces
 * for testing the semantic enhancement system. All tool calls return dummy results.
 *
 * Usage:
 *   node dummy-mcp-server.js --mcp-name shell
 *   node dummy-mcp-server.js --mcp-name postgres
 *   node dummy-mcp-server.js --definitions-file custom.json --mcp-name myMcp
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

interface McpDefinition {
  name: string;
  version: string;
  description: string;
  category: string;
  tools: Record<string, ToolDefinition>;
}

interface McpDefinitionsFile {
  mcps: Record<string, McpDefinition>;
}

class DummyMcpServer {
  private mcpDefinition: McpDefinition;
  private server: Server;

  constructor(definitionsFile: string, mcpName: string) {
    // Load MCP definition from JSON
    this.mcpDefinition = this.loadMcpDefinition(definitionsFile, mcpName);

    // Create MCP server
    this.server = new Server(
      {
        name: this.mcpDefinition.name,
        version: this.mcpDefinition.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private loadMcpDefinition(definitionsFile: string, mcpName: string): McpDefinition {
    try {
      const fullPath = path.resolve(definitionsFile);
      const fileContent = fs.readFileSync(fullPath, 'utf-8');
      const definitions: McpDefinitionsFile = JSON.parse(fileContent);

      if (!definitions.mcps[mcpName]) {
        throw new Error(`MCP '${mcpName}' not found in definitions file. Available: ${Object.keys(definitions.mcps).join(', ')}`);
      }

      const mcpDef = definitions.mcps[mcpName];
      console.error(`[${mcpName}] Loaded MCP with ${Object.keys(mcpDef.tools).length} tools: ${Object.keys(mcpDef.tools).join(', ')}`);

      return mcpDef;
    } catch (error: any) {
      console.error(`Failed to load MCP definition: ${error.message}`);
      process.exit(1);
    }
  }

  private setupHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = Object.values(this.mcpDefinition.tools).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));

      return { tools };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const tool = this.mcpDefinition.tools[name];
      if (!tool) {
        throw new McpError(ErrorCode.MethodNotFound, `Tool '${name}' not found`);
      }

      // Generate dummy result based on tool type and MCP category
      const result = this.generateDummyResult(name, args, this.mcpDefinition);

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    });
  }

  private generateDummyResult(toolName: string, args: any, mcpDef: McpDefinition): string {
    const mcpName = mcpDef.name;
    const category = mcpDef.category;

    // Generate contextually appropriate dummy responses
    switch (category) {
      case 'system-operations':
        if (toolName === 'run_command') {
          return `[DUMMY] Command executed: ${args.command}\nOutput: Command completed successfully\nExit code: 0`;
        }
        if (toolName === 'build') {
          return `[DUMMY] Docker build completed for tag: ${args.tag}\nImage ID: sha256:abc123def456\nSize: 45.2MB`;
        }
        if (toolName === 'run') {
          return `[DUMMY] Container started from image: ${args.image}\nContainer ID: abc123def456\nStatus: running`;
        }
        break;

      case 'developer-tools':
        if (toolName === 'commit') {
          return `[DUMMY] Git commit created\nCommit hash: abc123def456\nMessage: ${args.message}\nFiles changed: ${args.files?.length || 'all'} files`;
        }
        if (toolName === 'push') {
          return `[DUMMY] Pushed to ${args.remote || 'origin'}/${args.branch || 'main'}\nObjects pushed: 3 commits, 12 files\nStatus: up-to-date`;
        }
        if (toolName === 'create_repository') {
          return `[DUMMY] Repository created: ${args.name}\nURL: https://github.com/user/${args.name}\nPrivate: ${args.private || false}`;
        }
        if (toolName === 'create_issue') {
          return `[DUMMY] Issue created in ${args.repository}\nIssue #42: ${args.title}\nLabels: ${args.labels?.join(', ') || 'none'}`;
        }
        break;

      case 'database':
        if (toolName === 'query') {
          return `[DUMMY] Query executed: ${args.sql}\nRows returned: 15\nExecution time: 2.3ms`;
        }
        if (toolName === 'insert') {
          return `[DUMMY] Data inserted into ${args.table}\nRows affected: 1\nReturning: ${JSON.stringify(args.returning || ['id'])}`;
        }
        break;

      case 'financial':
        if (toolName === 'charge') {
          return `[DUMMY] Payment processed\nAmount: $${(args.amount / 100).toFixed(2)}\nCharge ID: ch_dummy123456\nStatus: succeeded`;
        }
        if (toolName === 'refund') {
          return `[DUMMY] Refund processed\nCharge ID: ${args.charge_id}\nRefund ID: re_dummy123456\nAmount: $${args.amount ? (args.amount / 100).toFixed(2) : 'full'}\nStatus: succeeded`;
        }
        break;

      case 'cloud-infrastructure':
        if (toolName === 'deploy') {
          return `[DUMMY] Deployment to AWS ${args.service} in ${args.region}\nDeployment ID: deploy-dummy123\nStatus: successful\nEndpoint: https://api.example.com`;
        }
        if (toolName === 's3_upload') {
          return `[DUMMY] File uploaded to S3\nBucket: ${args.bucket}\nKey: ${args.key}\nSize: 2.4MB\nETag: "abc123def456"`;
        }
        break;

      case 'ai-ml':
        if (toolName === 'completion' || toolName === 'generate') {
          const prompt = args.prompt || args.messages?.[0]?.content || 'user prompt';
          return `[DUMMY] AI Response Generated\nModel: ${args.model || 'gpt-4'}\nPrompt: "${prompt.substring(0, 50)}..."\nResponse: "This is a dummy AI-generated response for testing purposes. The actual response would be contextually relevant to your prompt."\nTokens: 45`;
        }
        break;

      default:
        return `[DUMMY] Tool '${toolName}' executed successfully\nMCP: ${mcpName}\nArguments: ${JSON.stringify(args, null, 2)}\nResult: Operation completed`;
    }

    // Fallback generic response
    return `[DUMMY] Tool '${toolName}' from ${mcpName} MCP executed successfully\nArguments: ${JSON.stringify(args, null, 2)}\nResult: Operation completed`;
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`[${this.mcpDefinition.name}] Dummy MCP Server started - providing ${Object.keys(this.mcpDefinition.tools).length} tools`);
  }
}

// Command line interface
function parseArgs(): { definitionsFile: string; mcpName: string } {
  const args = process.argv.slice(2);
  let definitionsFile = path.join(__dirname, 'mcp-definitions.json');
  let mcpName = '';

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--definitions-file':
        definitionsFile = args[++i];
        break;
      case '--mcp-name':
        mcpName = args[++i];
        break;
      case '--help':
        console.log(`
Usage: node dummy-mcp-server.js --mcp-name <name> [--definitions-file <path>]

Options:
  --mcp-name <name>           Name of MCP to simulate (required)
  --definitions-file <path>   Path to JSON definitions file (default: mcp-definitions.json)
  --help                      Show this help message

Examples:
  node dummy-mcp-server.js --mcp-name shell
  node dummy-mcp-server.js --mcp-name postgres
  node dummy-mcp-server.js --mcp-name github --definitions-file custom.json
        `);
        process.exit(0);
        break;
    }
  }

  if (!mcpName) {
    console.error('Error: --mcp-name is required');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  return { definitionsFile, mcpName };
}

// Main execution
async function main(): Promise<void> {
  try {
    const { definitionsFile, mcpName } = parseArgs();
    const server = new DummyMcpServer(definitionsFile, mcpName);
    await server.start();
  } catch (error) {
    console.error('Failed to start dummy MCP server:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { DummyMcpServer };