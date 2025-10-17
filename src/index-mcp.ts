#!/usr/bin/env node
/**
 * NCP MCP-Only Entry Point
 *
 * This is a slim entry point for .mcpb bundles that runs ONLY as an MCP server.
 * It does NOT include CLI functionality to minimize bundle size and improve performance.
 *
 * For CLI tools (ncp add, ncp find, etc.), install via npm:
 *   npm install -g @portel/ncp
 *
 * Configuration:
 *   - Reads from ~/.ncp/profiles/all.json (or specified profile)
 *   - Manually edit the JSON file to add/remove MCPs
 *   - No CLI commands needed
 */

// Testing SDK-based server implementation
import { MCPServerSDK as MCPServer } from './server/mcp-server-sdk.js';
import { setOverrideWorkingDirectory } from './utils/ncp-paths.js';

// Handle --working-dir parameter for MCP server mode
const workingDirIndex = process.argv.indexOf('--working-dir');
if (workingDirIndex !== -1 && workingDirIndex + 1 < process.argv.length) {
  const workingDirValue = process.argv[workingDirIndex + 1];
  setOverrideWorkingDirectory(workingDirValue);
}

// Handle --profile parameter
const profileIndex = process.argv.indexOf('--profile');
const profileName = profileIndex !== -1 ? (process.argv[profileIndex + 1] || 'all') : 'all';

// Debug logging for integration tests
if (process.env.NCP_DEBUG === 'true') {
  console.error(`[DEBUG] MCP-only mode`);
  console.error(`[DEBUG] profileIndex: ${profileIndex}`);
  console.error(`[DEBUG] process.argv: ${process.argv.join(' ')}`);
  console.error(`[DEBUG] Selected profile: ${profileName}`);
}

// Start MCP server
const server = new MCPServer(profileName);
server.run().catch(console.error);
