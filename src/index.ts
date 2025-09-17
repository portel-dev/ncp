#!/usr/bin/env node
/**
 * NCP-OSS Entry Point
 * Simple CLI that starts the MCP server
 */

import { MCPServer } from './server/mcp-server.js';
import { enhancedOutput } from './utils/markdown-renderer.js';
import { enableOutputFilter, shouldApplyFilter, withFilteredOutput } from './transports/filtered-stdio-transport.js';

// Simple CLI argument parsing
function parseArgs() {
  const args = process.argv.slice(2);
  const result: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith('--')) {
        result[key] = nextArg;
        i++; // Skip next argument as it's a value
      } else {
        result[key] = true;
      }
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();
  const profileName = args.profile as string || 'all';

  // Check for CLI commands
  if (args.find !== undefined) {
    return await handleFindCommand(args, profileName);
  }

  if (args.run) {
    return await handleRunCommand(args, profileName);
  }

  if (args.help) {
    return showHelp();
  }

  if (args.server) {
    // Explicit server mode
    const server = new MCPServer(profileName);
    await server.run();
    return;
  }

  // Check if any CLI arguments were provided
  const hasAnyArgs = Object.keys(args).length > 0;

  if (!hasAnyArgs) {
    // Default: Start MCP server (for Claude Desktop integration)
    const server = new MCPServer(profileName);
    await server.run();
    return;
  }

  // Unknown arguments - show help
  console.log('\n❌ Unknown command. Here are the available options:\n');
  return showHelp();
}

async function handleFindCommand(args: any, profileName: string) {
  const { MCPServer } = await import('./server/mcp-server.js');
  const server = new MCPServer(profileName);

  // Initialize with filtered output
  await withFilteredOutput(async () => {
    await server.initialize();
  });

  const description = args.find === true ? '' : args.find as string;
  const limit = args.limit ? parseInt(args.limit as string) : (description ? 5 : 20);
  const page = args.page ? parseInt(args.page as string) : 1;
  const depth = args.depth !== undefined ? parseInt(args.depth as string) : 2;

  // Use the same handleFind method as the MCP server to get tree structure
  const result = await server.handleFind({ jsonrpc: '2.0', id: 'cli', method: 'tools/call' }, { description, limit, page, depth });

  // Render markdown content with colors and formatting
  const formattedOutput = enhancedOutput(result.result.content[0].text);
  console.log('\n' + formattedOutput);

  await withFilteredOutput(async () => {
    await server.cleanup();
  });
}

async function handleRunCommand(args: any, profileName: string) {
  const toolName = args.run as string;
  const parameters = args.params ? JSON.parse(args.params as string) : {};

  const { NCPOrchestrator } = await import('./orchestrator/ncp-orchestrator.js');
  const orchestrator = new NCPOrchestrator(profileName);

  await orchestrator.initialize();

  console.log(`\n🚀 Running ${toolName}...\n`);

  // Execute with filtered output to suppress MCP server messages
  const result = await withFilteredOutput(async () => {
    return await orchestrator.run(toolName, parameters);
  });

  if (result.success) {
    console.log('✅ Success:');
    console.log(JSON.stringify(result.content, null, 2));
  } else {
    console.log('❌ Error:');
    console.log(result.error);
  }

  // Cleanup with filtered output
  await withFilteredOutput(async () => {
    await orchestrator.cleanup();
  });
}

function showHelp() {
  console.log(`
🔧 NCP-OSS Command Line Interface

USAGE:
  ncp [command] [options]
  # Or with npx: npx @portel/ncp [command] [options]

COMMANDS:
  --find [query]         Find tools (no query = MCP overview)
  --run <tool>          Execute a specific tool
  --server              Start MCP server mode for Claude Desktop
  --help                Show this help

OPTIONS:
  --profile <name>      Use specific profile (default: 'all')
  --limit <number>      Number of results per page (default: 5 for search, 20 for list)
  --page <number>       Page number for pagination (default: 1)
  --depth <0|1|2>       Tree depth: 0=MCPs only, 1=MCPs+Tools, 2=Full details (default: 2)
  --params <json>       Parameters for tool execution

EXAMPLES:
  # Tool Discovery
  ncp --find                                          # Show MCP overview
  ncp --find "file operations"                        # Search for file tools
  ncp --find "filesystem"                             # Show all filesystem tools
  ncp --find "memory" --depth 0                       # Quick MCP overview

  # Tool Execution
  ncp --run filesystem:read_file --params '{"path": "/tmp/test.txt"}'

  # MCP Server Mode (for Claude Desktop)
  ncp --server --profile all                          # Start MCP server

  # Installation: npm install -g @portel/ncp

📚 More info: Use find() and run() through Claude Desktop MCP interface
`);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

main().catch((error) => {
  // Only log errors if not in MCP server mode to avoid interfering with protocol
  if (process.env.NODE_ENV === 'development') {
    console.error('Fatal error:', error);
  }
  process.exit(1);
});