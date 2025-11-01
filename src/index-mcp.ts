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

// Using official SDK-based server implementation
import { MCPServer } from './server/mcp-server.js';
import { setOverrideWorkingDirectory } from './utils/ncp-paths.js';

// Global error handlers to catch uncaught exceptions and log to stderr
// This ensures errors appear in Claude Desktop logs
process.on('uncaughtException', (error) => {
  console.error('[NCP FATAL] Uncaught exception:', error);
  console.error('[NCP FATAL] Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[NCP FATAL] Unhandled promise rejection:', reason);
  console.error('[NCP FATAL] Promise:', promise);
  process.exit(1);
});

// Wrap entire startup in async function
(async () => {
  try {
    // Configuration priority: ENV VAR > command-line arg > default

    // Working directory: NCP_WORKING_DIR env var or --working-dir arg
    const workingDir = process.env.NCP_WORKING_DIR || (() => {
      const workingDirIndex = process.argv.indexOf('--working-dir');
      return workingDirIndex !== -1 && workingDirIndex + 1 < process.argv.length
        ? process.argv[workingDirIndex + 1]
        : null;
    })();

    if (workingDir) {
      setOverrideWorkingDirectory(workingDir);
    }

    // Profile: NCP_PROFILE env var or --profile arg or 'all' default
    const profileName = process.env.NCP_PROFILE || (() => {
      const profileIndex = process.argv.indexOf('--profile');
      return profileIndex !== -1 ? (process.argv[profileIndex + 1] || 'all') : 'all';
    })();

    // Debug logging for integration tests
    if (process.env.NCP_DEBUG === 'true') {
      console.error(`[DEBUG] MCP-only mode`);
      console.error(`[DEBUG] Working directory: ${workingDir || 'default'}`);
      console.error(`[DEBUG] Profile: ${profileName}`);
      console.error(`[DEBUG] process.argv: ${process.argv.join(' ')}`);
    }

    // Start MCP server and await it to keep process alive
    const server = new MCPServer(profileName);
    await server.run();
  } catch (error: any) {
    console.error('[NCP FATAL] Failed to initialize server:', error);
    console.error('[NCP FATAL] Stack:', error.stack);
    process.exit(1);
  }
})();
