#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync, existsSync } from 'fs';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ProfileManager } from '../profiles/profile-manager.js';
import { MCPServer } from '../server/mcp-server.js';
import { ConfigManager } from '../utils/config-manager.js';
import { formatCommandDisplay } from '../utils/security.js';
import { TextUtils } from '../utils/text-utils.js';
import { UIMessages } from '../utils/ui-messages.js';
import { OutputFormatter } from '../services/output-formatter.js';
import { ErrorHandler } from '../services/error-handler.js';
import { CachePatcher } from '../cache/cache-patcher.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mcpWrapper } from '../utils/mcp-wrapper.js';
import { withFilteredOutput } from '../transports/filtered-stdio-transport.js';
import { UpdateChecker } from '../utils/update-checker.js';
import { MCPUpdateChecker } from '../utils/mcp-update-checker.js';
import { logger } from '../utils/logger.js';
import { setOverrideWorkingDirectory, getNcpBaseDirectory } from '../utils/ncp-paths.js';
import { ConfigSchemaReader } from '../services/config-schema-reader.js';
import { ConfigPrompter } from '../services/config-prompter.js';
import { SchemaCache } from '../cache/schema-cache.js';
import { getCacheDirectory } from '../utils/ncp-paths.js';
import { setNCPTitle, updateNCPProgress } from '../utils/terminal-title.js';
import type { CredentialType } from '../auth/secure-credential-store.js';

// Check for no-color flag early
const noColor = process.argv.includes('--no-color') || process.env.NO_COLOR === 'true';
if (noColor) {
  chalk.level = 0; // Disable colors globally
} else {
  // Ensure colors are enabled for TTY and when FORCE_COLOR is set
  if (process.env.FORCE_COLOR || process.stdout?.isTTY) {
    chalk.level = 3; // Full color support
  }
}

/**
 * Auto-detect authentication requirements from HTTP/SSE endpoint
 * Makes a test request and parses WWW-Authenticate header from 401 response
 * Also checks for OAuth metadata
 */
async function detectAuthRequirements(url: string): Promise<{
  required: boolean;
  type?: 'bearer' | 'basic' | 'apiKey' | 'oauth';
  realm?: string;
  oauth?: {
    flowType: 'device' | 'authorization_code';
    deviceAuthUrl?: string;
    authorizationUrl?: string;
    tokenUrl: string;
    clientId?: string;
    scopes?: string[];
  };
  error?: string;
}> {
  try {
    // Make a test POST request to the MCP endpoint
    const testUrl = new URL(url);
    const response = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'ncp', version: '1.0.0' }
        }
      })
    });

    // If 200 OK, no auth required
    if (response.ok) {
      return { required: false };
    }

    // Check for 401 Unauthorized
    if (response.status === 401) {
      const wwwAuth = response.headers.get('www-authenticate');

      if (!wwwAuth) {
        // 401 without WWW-Authenticate header
        return {
          required: true,
          error: 'Authentication required but type could not be determined'
        };
      }

      // Parse WWW-Authenticate header
      // Examples:
      // - "Bearer realm=\"canva\""
      // - "Basic realm=\"My Server\""
      const authType = wwwAuth.split(' ')[0].toLowerCase();
      let realm: string | undefined;

      const realmMatch = wwwAuth.match(/realm="([^"]+)"/);
      if (realmMatch) {
        realm = realmMatch[1];
      }

      // Check for OAuth metadata in WWW-Authenticate header
      // Example: Bearer realm="OAuth" authorization_uri="https://..." token_uri="https://..."
      if (authType === 'bearer') {
        const authUriMatch = wwwAuth.match(/authorization_uri="([^"]+)"/);
        const tokenUriMatch = wwwAuth.match(/token_uri="([^"]+)"/);

        if (authUriMatch && tokenUriMatch) {
          // OAuth endpoints provided in header (assume authorization_code flow)
          return {
            required: true,
            type: 'oauth',
            realm,
            oauth: {
              flowType: 'authorization_code',
              authorizationUrl: authUriMatch[1],
              tokenUrl: tokenUriMatch[1]
            }
          };
        }

        // Try to fetch OAuth metadata from well-known endpoint
        const oauthMeta = await tryFetchOAuthMetadata(testUrl);
        if (oauthMeta) {
          return {
            required: true,
            type: 'oauth',
            realm,
            oauth: oauthMeta
          };
        }

        // Fallback to manual bearer token prompt if no OAuth metadata found
        // This ensures we gracefully degrade to simple token input for servers
        // that don't expose OAuth endpoints via headers or .well-known
        return { required: true, type: 'bearer', realm };
      } else if (authType === 'basic') {
        return { required: true, type: 'basic', realm };
      } else {
        return {
          required: true,
          error: `Unsupported auth type: ${authType}`
        };
      }
    }

    // Other status codes
    return {
      required: false,
      error: `Unexpected response: ${response.status} ${response.statusText}`
    };

  } catch (error: any) {
    throw new Error(`Failed to probe endpoint: ${error.message}`);
  }
}

/**
 * Try to fetch OAuth metadata from well-known endpoints
 */
async function tryFetchOAuthMetadata(serverUrl: URL): Promise<{
  flowType: 'device' | 'authorization_code';
  deviceAuthUrl?: string;
  authorizationUrl?: string;
  tokenUrl: string;
  clientId?: string;
  scopes?: string[];
} | null> {
  try {
    // Try RFC 8414 - OAuth 2.0 Authorization Server Metadata
    const wellKnownUrl = new URL('/.well-known/oauth-authorization-server', serverUrl.origin);

    const response = await fetch(wellKnownUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      return null;
    }

    const metadata = await response.json();
    const grantTypes: string[] = metadata.grant_types_supported || [];

    // Check for device authorization grant (RFC 8628)
    if (grantTypes.includes('urn:ietf:params:oauth:grant-type:device_code') &&
        metadata.device_authorization_endpoint &&
        metadata.token_endpoint) {
      return {
        flowType: 'device',
        deviceAuthUrl: metadata.device_authorization_endpoint,
        tokenUrl: metadata.token_endpoint,
        scopes: metadata.scopes_supported || []
      };
    }

    // Check for authorization code grant (standard OAuth)
    if (grantTypes.includes('authorization_code') &&
        metadata.authorization_endpoint &&
        metadata.token_endpoint) {
      return {
        flowType: 'authorization_code',
        authorizationUrl: metadata.authorization_endpoint,
        tokenUrl: metadata.token_endpoint,
        scopes: metadata.scopes_supported || []
      };
    }

    return null;
  } catch {
    // Silently fail - OAuth metadata is optional
    return null;
  }
}

// Fuzzy matching helper for finding similar names
function findSimilarNames(target: string, availableNames: string[], maxSuggestions = 3): string[] {
  const targetLower = target.toLowerCase();

  // Score each name based on similarity
  const scored = availableNames.map(name => {
    const nameLower = name.toLowerCase();
    let score = 0;

    // Exact match gets highest score
    if (nameLower === targetLower) score += 100;

    // Contains target or target contains name
    if (nameLower.includes(targetLower)) score += 50;
    if (targetLower.includes(nameLower)) score += 50;

    // First few characters match
    const minLen = Math.min(targetLower.length, nameLower.length);
    for (let i = 0; i < minLen && i < 3; i++) {
      if (targetLower[i] === nameLower[i]) score += 10;
    }

    // Similar length bonus
    const lengthDiff = Math.abs(targetLower.length - nameLower.length);
    if (lengthDiff <= 2) score += 5;

    return { name, score };
  });

  // Filter out low scores and sort by score
  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSuggestions)
    .map(item => item.name);
}

// Enhanced remove validation helper
async function validateRemoveCommand(name: string, manager: ProfileManager, profiles: string[]): Promise<{
  mcpExists: boolean;
  suggestions: string[];
  allMCPs: string[];
}> {
  const allMCPs = new Set<string>();

  // Collect all MCP names from specified profiles
  for (const profileName of profiles) {
    const profile = await manager.getProfile(profileName);
    if (profile?.mcpServers) {
      Object.keys(profile.mcpServers).forEach(mcpName => allMCPs.add(mcpName));
    }
  }

  const mcpList = Array.from(allMCPs);
  const mcpExists = mcpList.includes(name);

  let suggestions: string[] = [];
  if (!mcpExists && mcpList.length > 0) {
    suggestions = findSimilarNames(name, mcpList);
  }

  return {
    mcpExists,
    suggestions,
    allMCPs: mcpList
  };
}

// Simple validation helper for ADD command
async function validateAddCommand(name: string, command: string, args: any[]): Promise<{
  message: string;
  suggestions: Array<{ command: string; description: string }>
}> {
  const suggestions: Array<{ command: string; description: string }> = [];

  const fullCommand = `${command} ${args.join(' ')}`.trim();

  // Basic command format validation and helpful tips
  if (command === 'npx' && args.length > 0) {
    // Clean up the command format - avoid duplication
    const cleanedArgs = args.filter(arg => arg !== '-y' || args.indexOf(arg) === 0);
    suggestions.push({
      command: fullCommand,
      description: 'NPM package execution - health monitor will validate if package exists and starts correctly'
    });
  } else if (command.startsWith('/') || command.startsWith('./') || command.includes('\\')) {
    suggestions.push({
      command: fullCommand,
      description: 'Local executable - health monitor will validate if command works'
    });
  } else if (command.includes('@') && !command.startsWith('npx')) {
    suggestions.push({
      command: `npx -y ${fullCommand}`,
      description: 'Consider using npx for npm packages'
    });
  } else {
    // Show the command as provided
    suggestions.push({
      command: fullCommand,
      description: 'Custom command - health monitor will validate functionality'
    });
  }

  return {
    message: chalk.dim('💡 MCP will be validated by health monitor after adding'),
    suggestions
  };
}

// Simple emoji support detection for cross-platform compatibility
const supportsEmoji = () => {
  // Windows Command Prompt and PowerShell often don't support emojis well
  if (process.platform === 'win32') {
    // Check if it's Windows Terminal (supports emojis) vs cmd/powershell
    return process.env.WT_SESSION || process.env.TERM_PROGRAM === 'vscode';
  }
  // macOS and Linux terminals generally support emojis
  return true;
};

const getIcon = (emoji: string, fallback: string) =>
  supportsEmoji() ? emoji : fallback;

// Configure OutputFormatter
OutputFormatter.configure({ noColor: !!noColor, emoji: !!supportsEmoji() });

// Use centralized version utility
import { version } from '../utils/version.js';

// Discovery function for single MCP - extracted from NCPOrchestrator.probeMCPTools
async function discoverSingleMCP(name: string, command: string, args: string[] = [], env: Record<string, string> = {}): Promise<{
  tools: Array<{name: string; description: string; inputSchema?: any}>;
  serverInfo?: {
    name: string;
    title?: string;
    version: string;
    description?: string;
    websiteUrl?: string;
  };
  configurationSchema?: any;
}> {
  const config = { name, command, args, env };

  if (!config.command) {
    throw new Error(`Invalid config for ${config.name}`);
  }

  let client: Client | null = null;
  let transport: StdioClientTransport | null = null;
  const DISCOVERY_TIMEOUT = 8000; // 8 seconds

  try {
    // Create wrapper command for discovery phase
    const wrappedCommand = mcpWrapper.createWrapper(
      config.name,
      config.command,
      config.args || []
    );

    // Create temporary connection for discovery
    const silentEnv = {
      ...process.env,
      ...(config.env || {}),
      MCP_SILENT: 'true',
      QUIET: 'true',
      NO_COLOR: 'true'
    };

    transport = new StdioClientTransport({
      command: wrappedCommand.command,
      args: wrappedCommand.args,
      env: silentEnv as Record<string, string>
    });

    client = new Client(
      { name: 'ncp-oss', version: version },
      { capabilities: {} }
    );

    // Connect with timeout and filtered output
    await withFilteredOutput(async () => {
      await Promise.race([
        client!.connect(transport!),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Discovery timeout')), DISCOVERY_TIMEOUT)
        )
      ]);
    });

    // Capture server info after connection
    const serverInfo = client!.getServerVersion();

    // Capture configuration schema if available
    // Note: MCP SDK 1.18.0 provides configurationSchema via experimental capabilities.
    // If future SDK versions expose this at the top level, update to check both locations.
    const serverCapabilities = client!.getServerCapabilities();
    const configurationSchema = (serverCapabilities as any)?.experimental?.configurationSchema;

    // Get tool list with filtered output
    const response = await withFilteredOutput(async () => {
      return await client!.listTools();
    });

    const tools = response.tools.map(t => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || {}
    }));

    // Disconnect immediately
    await client.close();

    return {
      tools,
      serverInfo: serverInfo ? {
        name: serverInfo.name || config.name,
        title: serverInfo.title,
        version: serverInfo.version || 'unknown',
        description: serverInfo.title || serverInfo.name || undefined,
        websiteUrl: serverInfo.websiteUrl
      } : undefined,
      configurationSchema
    };

  } catch (error: any) {
    // Clean up connections
    try {
      if (client) {
        await client.close();
      }
    } catch (closeError) {
      // Ignore close errors
    }

    throw new Error(`Failed to discover tools from ${config.name}: ${error.message}`);
  }
}

const program = new Command();


// Set version
program.version(version, '-v, --version', 'output the current version');


// Custom help configuration with colors and enhanced content
program
  .name('ncp')
  .description(`
${chalk.bold.white('Natural Context Provider (NCP)')} ${chalk.dim('v' + version)} - ${chalk.cyan('1 MCP to rule them all')}

${chalk.dim('Your MCPs, supercharged.')}
${chalk.dim('Find any tool instantly, load on demand, run on schedule, ready for any client.')}
${chalk.dim('Smart loading saves tokens and energy.')}`)
  .option('--profile <name>', 'Profile to use (default: all)')
  .option('--working-dir <path>', 'Working directory for profile resolution (overrides current directory)')
  .option('--debug', 'Enable verbose debug logging (shows full requests/responses, timing info)')
  .option('--no-color', 'Disable colored output');


// Configure help with enhanced formatting, Quick Start, and examples
program.configureHelp({
  sortSubcommands: true,
  formatHelp: (cmd, helper) => {
    // Calculate proper padding based on actual command names and options separately
    const allCommands = cmd.commands.filter((cmd: any) => !cmd.hidden);
    const maxCmdLength = allCommands.length > 0 ? Math.max(...allCommands.map(cmd => cmd.name().length)) : 0;
    const maxOptionLength = cmd.options.length > 0 ? Math.max(...cmd.options.map(option => option.flags.length)) : 0;

    const cmdPad = maxCmdLength + 4; // Add extra space for command alignment
    const optionPad = maxOptionLength + 4; // Add extra space for option alignment
    const helpWidth = helper.helpWidth || 80;

    function formatItem(term: string, description?: string, padding?: number): string {
      if (description) {
        const pad = padding || cmdPad;
        return term.padEnd(pad) + description;
      }
      return term;
    }

    // Add description first
    let output = cmd.description() + '\n\n';

    // Then usage and config info
    output += `${chalk.bold.white('Usage:')} ${cmd.name()} [options] [command]\n`;
    output += `${chalk.yellow('NCP config files:')} ~/.ncp/profiles/\n`;
    output += chalk.dim('DXT/MCP bundles ignore ~/.ncp/settings.json; configure them via env vars in your client.') + '\n\n';

    // Options
    if (cmd.options.length) {
      output += chalk.bold.white('Options:') + '\n';
      cmd.options.forEach(option => {
        // Calculate padding based on raw flags, not styled version
        const rawPadding = '  ' + option.flags;
        const paddedRaw = rawPadding.padEnd(optionPad + 2);
        const styledFlags = chalk.cyan(option.flags);
        const description = chalk.white(option.description);

        output += '  ' + styledFlags + ' '.repeat(paddedRaw.length - rawPadding.length) + description + '\n';
      });
      output += '\n';
    }

    // Commands
    const commands = cmd.commands.filter((cmd: any) => !cmd.hidden);
    if (commands.length) {
      output += chalk.bold.white('Commands:') + '\n';
      commands.sort((a, b) => a.name().localeCompare(b.name()));

      commands.forEach(cmd => {
        // Group commands by category with enhanced styling
        const managementCommands = ['add', 'remove', 'import', 'list', 'config'];
        const discoveryCommands = ['find'];
        const executionCommands = ['run'];

        let cmdName = cmd.name();
        let styledCmdName = cmdName;
        if (managementCommands.includes(cmd.name())) {
          styledCmdName = chalk.cyan(cmd.name());
        } else if (discoveryCommands.includes(cmd.name())) {
          styledCmdName = chalk.green.bold(cmd.name());
        } else if (executionCommands.includes(cmd.name())) {
          styledCmdName = chalk.yellow.bold(cmd.name());
        }

        // Calculate padding based on raw command name, not styled version
        const rawPadding = '  ' + cmdName;
        const paddedRaw = rawPadding.padEnd(cmdPad + 2);  // Use cmdPad + 2 for consistency
        const description = chalk.white(cmd.description());

        output += '  ' + styledCmdName + ' '.repeat(paddedRaw.length - rawPadding.length) + description + '\n';
      });
    }

    return output;
  }
});


// Add help command
program
  .command('help [command]')
  .description('Show help for NCP or a specific command')
  .action((command) => {
    if (command) {
      const cmd = program.commands.find(cmd => cmd.name() === command);
      if (cmd) {
        cmd.help();
      } else {
        console.log(`Unknown command: ${command}`);
        program.help();
      }
    } else {
      program.help();
    }
  });

// Add Quick Start and Examples after all commands are defined
program.addHelpText('after', `
${chalk.bold.white('Quick Start:')}
  ${chalk.cyan('1')} Add MCPs: ${chalk.green('ncp add <name>')} ${chalk.dim('(from registry)')} or ${chalk.green('ncp add <file>')} ${chalk.dim('(import from file)')}
  ${chalk.cyan('2')} Configure NCP in AI client settings

${chalk.bold.white('Examples:')}
  $ ${chalk.yellow('ncp add github')} ${chalk.dim('                           # Add from registry')}
  $ ${chalk.yellow('ncp add "github|slack|stripe"')} ${chalk.dim('            # Bulk add')}
  $ ${chalk.yellow('ncp add ~/config.json')} ${chalk.dim('                    # Import from file')}
  $ ${chalk.yellow('ncp add filesystem npx @modelcontextprotocol/server-filesystem /tmp')}
  $ ${chalk.yellow('ncp find "file operations"')}
  $ ${chalk.yellow('ncp run filesystem:read_file --params \'{"path": "/tmp/example.txt"}\'')}
  $ ${chalk.yellow('ncp list --depth 1')}`);


// Check if we should run as MCP server
// MCP server mode detection follows DXT config pattern:
// 1. Any NCP_* environment variable → MCP mode (DXT pattern)
// 2. CLI commands present → CLI mode
// 3. No params at all → MCP mode (backward compat)
// 4. Otherwise (--profile, --working-dir) → MCP mode

const profileIndex = process.argv.indexOf('--profile');

// Check for NCP_* environment variables (DXT config pattern)
const hasNcpEnvVars = Object.keys(process.env).some(key => key.startsWith('NCP_'));

const hasCommands = process.argv.includes('find') ||
  process.argv.includes('add') ||
  process.argv.includes('list') ||
  process.argv.includes('remove') ||
  process.argv.includes('run') ||
  process.argv.includes('config') ||
  process.argv.includes('profile') ||
  process.argv.includes('help') ||
  process.argv.includes('--help') ||
  process.argv.includes('-h') ||
  process.argv.includes('--version') ||
  process.argv.includes('-v') ||
  process.argv.includes('analytics') ||
  process.argv.includes('schedule') ||
  process.argv.includes('doctor') ||
  process.argv.includes('credentials') ||
  process.argv.includes('update') ||
  process.argv.includes('photon') ||
  process.argv.includes('skills') ||
  process.argv.includes('_job-run') ||
  process.argv.includes('_timing-run') ||
  process.argv.includes('_task-execute') ||
  process.argv.includes('cleanup-runs');

// Decision logic:
// - NCP_* env vars + no CLI commands → MCP mode
// - CLI commands present → CLI mode
// - No CLI commands → MCP mode (default)
const shouldRunAsServer = !hasCommands;

if (shouldRunAsServer) {
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
  // ⚠️ CRITICAL: Default MUST be 'all' - DO NOT CHANGE to 'default' or anything else!
  const profileName = process.env.NCP_PROFILE || (() => {
    return profileIndex !== -1 ? (process.argv[profileIndex + 1] || 'all') : 'all';
  })();

  // Debug logging for integration tests
  if (process.env.NCP_DEBUG === 'true') {
    console.error(`[DEBUG] MCP server mode`);
    console.error(`[DEBUG] NCP_* env vars detected: ${hasNcpEnvVars}`);
    console.error(`[DEBUG] Working directory: ${workingDir || 'default'}`);
    console.error(`[DEBUG] Profile: ${profileName}`);
    console.error(`[DEBUG] process.argv: ${process.argv.join(' ')}`);
  }

  const server = new MCPServer(profileName);
  server.run().catch(console.error);
} else {
  // Handle --working-dir parameter for CLI mode
  const workingDirIndex = process.argv.indexOf('--working-dir');
  if (workingDirIndex !== -1 && workingDirIndex + 1 < process.argv.length) {
    const workingDirValue = process.argv[workingDirIndex + 1];
    setOverrideWorkingDirectory(workingDirValue);
  }

  // Running as CLI tool

/**
 * Handle adding a known provider from the registry
 */
async function handleKnownProvider(provider: any, options: any) {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  console.log(`\n${chalk.blue(`🌐 ${provider.name} MCP`)}`);
  console.log(chalk.dim(`   ${provider.description}`));
  console.log(chalk.dim(`   Website: ${provider.website}\n`));

  // Determine transport (user preference or recommendation)
  let transport = options.transport || provider.recommended;

  if (!options.transport) {
    console.log(chalk.dim(`   ✓ Recommended transport: ${provider.recommended}`));
  }

  const manager = new ProfileManager();
  await manager.initialize(true);

  // Handle stdio transport
  if (transport === 'stdio' && provider.stdio) {
    const stdioConfig = provider.stdio;

    // Check if setup is needed
    if (stdioConfig.setup?.needsSetup) {
      console.log(chalk.dim(`\n   ${stdioConfig.setup.description}`));
      console.log(chalk.dim(`   Command: ${chalk.cyan(stdioConfig.setup.command)}\n`));

      let runSetup = false;

      // Check if -y flag is provided (auto-run setup)
      if (options.yes) {
        runSetup = true;
        console.log(chalk.dim('   (-y flag detected, auto-running setup)'));
      } else {
        // Ask for confirmation
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const answer = await new Promise<string>(resolve => {
          rl.question(chalk.yellow('   Run authentication now? (y/n): '), answer => {
            rl.close();
            resolve(answer.toLowerCase());
          });
        });

        runSetup = (answer === 'y' || answer === 'yes');
      }

      if (runSetup) {
        console.log(chalk.dim('\n   🔐 Running authentication...'));
        try {
          const { stdout, stderr } = await execAsync(stdioConfig.setup.command);
          if (stdout) console.log(stdout);
          if (stderr) console.error(stderr);
          console.log(chalk.green('   ✅ Authentication complete!\n'));
        } catch (error: any) {
          console.log(chalk.red(`\n   ❌ Authentication failed: ${error.message}`));
          console.log(chalk.dim(`   Please run manually: ${stdioConfig.setup.command}\n`));
          return;
        }
      } else {
        console.log(chalk.yellow(`\n   ⚠️  Skipped authentication`));
        console.log(chalk.dim(`   Run this before using ${provider.name}:`));
        console.log(chalk.dim(`   ${stdioConfig.setup.command}\n`));
      }
    }

    // Add to profile
    console.log(chalk.dim(`   Adding ${provider.name} to profile...`));

    const mcpConfig: any = {
      command: stdioConfig.command,
      args: stdioConfig.args
    };

    // Parse environment variables if provided
    if (options.env) {
      const env: Record<string, string> = {};
      for (const envVar of options.env) {
        const [key, value] = envVar.split('=');
        if (key && value) {
          env[key] = value;
        }
      }
      if (Object.keys(env).length > 0) {
        mcpConfig.env = env;
      }
    }

    const profiles = options.profile || ['all'];
    for (const profileName of profiles) {
      await manager.addMCPToProfile(profileName, provider.id, mcpConfig);
      console.log(chalk.green(`   ✅ Added ${provider.name} to profile: ${profileName}`));
    }

    console.log(chalk.dim('\n💡 Next steps:'));
    console.log(chalk.dim('  •') + ' Test: ' + chalk.cyan(`ncp find <query>`));
    console.log(chalk.dim('  •') + ' View profiles: ' + chalk.cyan('ncp list'));

  } else if (transport === 'http' && provider.http) {
    // HTTP transport - add automatically
    console.log(chalk.dim(`   Adding ${provider.name} (HTTP) to profile...`));

    const httpConfig: any = {
      url: provider.http.url
    };

    // Add bearer token if provided via --token flag
    if (options.token) {
      httpConfig.auth = {
        type: 'bearer',
        token: options.token
      };
      console.log(chalk.dim(`   ✓ Bearer token configured`));
    } else if (provider.http.auth) {
      // Add auth type from registry if no token provided
      if (provider.http.auth === 'bearer') {
        // Bearer auth required but no token provided - will need manual config
        httpConfig.auth = { type: 'bearer' };
        console.log(chalk.yellow(`   ⚠️  Bearer token required but not provided`));
        console.log(chalk.dim(`   Add token later: ncp add ${provider.id} --token "your-token"`));
      } else {
        // Other auth types (oauth, etc.)
        httpConfig.auth = { type: provider.http.auth };
      }
    }

    // Show documentation if available
    if (provider.http.notes) {
      console.log(chalk.dim(`   Note: ${provider.http.notes}`));
    }

    const profiles = options.profile || ['all'];
    for (const profileName of profiles) {
      await manager.addMCPToProfile(profileName, provider.id, httpConfig);
      console.log(chalk.green(`   ✅ Added ${provider.name} to profile: ${profileName}`));
    }

    console.log(chalk.dim('\n💡 Next steps:'));
    console.log(chalk.dim('  •') + ' Test: ' + chalk.cyan(`ncp find <query>`));
    console.log(chalk.dim('  •') + ' View profiles: ' + chalk.cyan('ncp list'));
    if (provider.http.docs) {
      console.log(chalk.dim('  •') + ' Docs: ' + chalk.cyan(provider.http.docs));
    }

  } else {
    console.log(chalk.red(`\n   ❌ Transport '${transport}' not available for ${provider.name}`));
    console.log(chalk.dim(`   Available: ${provider.stdio ? 'stdio' : ''} ${provider.http ? 'http' : ''}\n`));
  }
}

/**
 * Handle manual add (legacy behavior)
 */
async function handleManualAdd(name: string, command: string, args: string[], options: any) {
  console.log(`\n${chalk.blue(`📦 Adding MCP server: ${chalk.bold(name)}`)}`);

  const manager = new ProfileManager();
  await manager.initialize(true);

  // Detect if "command" is actually a URL (HTTP/HTTPS)
  const isUrl = command && (command.startsWith('http://') || command.startsWith('https://'));

  let mcpConfig: any;

  if (isUrl) {
    // HTTP/SSE MCP configuration
    console.log(chalk.dim('🌐 Detected HTTP/SSE server'));

    mcpConfig = {
      url: command
    };

    // Add bearer token if provided
    if (options.token) {
      mcpConfig.auth = {
        type: 'bearer',
        token: options.token
      };
      console.log(chalk.dim('   ✓ Bearer token configured'));
    } else {
      console.log(chalk.yellow('   ⚠️  No token provided (use --token if authentication required)'));
    }
  } else {
    // stdio MCP configuration
    console.log(chalk.dim('💻 Detected stdio server'));

    // Parse environment variables
    const env: Record<string, string> = {};
    if (options.env) {
      console.log(chalk.dim('🔧 Processing environment variables...'));
      for (const envVar of options.env) {
        const [key, value] = envVar.split('=');
        if (key && value) {
          env[key] = value;
          console.log(chalk.dim(`   ${key}=${formatCommandDisplay(value)}`));
        }
      }
    }

    mcpConfig = {
      command,
      args: args || []
    };

    if (Object.keys(env).length > 0) {
      mcpConfig.env = env;
    }
  }

  const profiles = options.profile || ['all'];
  for (const profileName of profiles) {
    await manager.addMCPToProfile(profileName, name, mcpConfig);
    console.log(chalk.green(`\n✅ Added ${name} to profile: ${profileName}`));
  }

  console.log(chalk.dim('\n💡 Next steps:'));
  console.log(chalk.dim('  •') + ' Test: ' + chalk.cyan(`ncp find <query>`));
  console.log(chalk.dim('  •') + ' View profiles: ' + chalk.cyan('ncp list'));
}

// Simplified add command (checks registry first)
program
  .command('add <provider> [command] [args...]')
  .description('Add MCP server(s) to a profile')
  .option('--profile <names...>', 'Profile(s) to add to (can specify multiple, default: all)')
  .option('--transport <type>', 'Force transport type: stdio or http')
  .option('--env <vars...>', 'Environment variables (KEY=value)')
  .option('--token <value>', 'Bearer token for HTTP MCPs (skips interactive prompt)')
  .option('-y, --yes', 'Auto-run setup commands without prompting')
  .addHelpText('after', `
Arguments:
  <provider>   Registry name (e.g., github), pipe list ("github|slack"), config path, or Photon URL
  [command]    Executable to run when not using the registry/import modes (e.g., npx)
  [args...]    Additional arguments for the command form (e.g., @modelcontextprotocol/server-filesystem /tmp)

Examples:
  ncp add github
  ncp add "github|slack|stripe"             # Bulk install from registry
  ncp add filesystem npx @modelcontextprotocol/server-filesystem ~/Documents
  ncp add ~/Library/Application\ Support/Claude/claude_desktop_config.json
  ncp add https://example.com/my.photon.ts
`)
  .action(async (providerName, command, args, options) => {
    // Set branded terminal title with MCP being added
    setNCPTitle('Add', providerName.includes('|') ? 'multiple MCPs' : providerName);

    // Smart detection: Check if this is pipe-delimited bulk add
    if (providerName.includes('|') && !command) {
      // Bulk add mode: split by pipe and add each MCP
      const mcpNames = providerName.split('|').map((name: string) => name.trim()).filter((name: string) => name.length > 0);
      console.log(chalk.blue(`\n📦 Bulk add mode: Installing ${mcpNames.length} MCPs`));
      console.log(chalk.dim(`   ${mcpNames.join(', ')}\n`));

      const { fetchProvider } = await import('../registry/provider-registry.js');
      let successCount = 0;
      let failCount = 0;

      for (const mcpName of mcpNames) {
        try {
          console.log(chalk.cyan(`\n→ Adding ${mcpName}...`));
          const provider = await fetchProvider(mcpName);

          if (provider) {
            await handleKnownProvider(provider, options);
            successCount++;
          } else {
            console.log(chalk.yellow(`⚠️  MCP "${mcpName}" not found in registry`));
            failCount++;
          }
        } catch (error: any) {
          console.log(chalk.red(`✗ Failed to add ${mcpName}: ${error.message}`));
          failCount++;
        }
      }

      console.log(chalk.bold(`\n📊 Bulk add complete:`));
      console.log(chalk.green(`   ✓ ${successCount} successful`));
      if (failCount > 0) {
        console.log(chalk.red(`   ✗ ${failCount} failed`));
      }
      return;
    }

    // Smart detection: Check if this is a file import
    if ((providerName.endsWith('.json') || providerName.includes('/') || providerName.startsWith('~') || providerName.startsWith('./')) && !command) {
      console.log(chalk.blue(`\n📥 Importing from file: ${providerName}`));
      try {
        const manager = new ConfigManager();
        await manager.importConfig(providerName, options.profile?.[0] || 'all', false);
        return;
      } catch (error: any) {
        console.log(chalk.red(`\n✗ Import failed: ${error.message}`));
        process.exit(1);
      }
    }

    // Smart detection: Check if this is a URL
    if ((providerName.startsWith('http://') || providerName.startsWith('https://')) && !command) {
      // Check if it's a .photon.ts file URL
      if (providerName.endsWith('.photon.ts')) {
        console.log(chalk.blue(`\n📥 Downloading Photon from URL: ${providerName}`));
        try {
          const fs = await import('fs/promises');
          const path = await import('path');
          const os = await import('os');

          // Download the file
          const response = await fetch(providerName);
          if (!response.ok) {
            throw new Error(`Failed to download: ${response.statusText}`);
          }
          const tsContent = await response.text();

          // Extract filename from URL
          const urlPath = new URL(providerName).pathname;
          const fileName = path.basename(urlPath);
          const baseName = fileName.replace('.photon.ts', '');

          // Create destination directory
          const microDir = path.join(getNcpBaseDirectory(), 'micromcps');
          await fs.mkdir(microDir, { recursive: true });

          const destFile = path.join(microDir, fileName);

          // Save the file
          await fs.writeFile(destFile, tsContent, 'utf8');

          // Try to download optional schema file
          let schemaImported = false;
          const schemaUrl = providerName.replace('.photon.ts', '.micro.schema.json');
          try {
            const schemaResponse = await fetch(schemaUrl);
            if (schemaResponse.ok) {
              const schemaContent = await schemaResponse.text();
              const destSchema = path.join(microDir, `${baseName}.micro.schema.json`);
              await fs.writeFile(destSchema, schemaContent, 'utf8');
              schemaImported = true;
              console.log(chalk.green(`✅ Downloaded schema`));
            }
          } catch {
            // Schema is optional
          }

          console.log(chalk.green(`\n✅ Photon "${baseName}" downloaded successfully!`));
          console.log(chalk.dim(`📍 Location: ${destFile}`));
          if (schemaImported) {
            console.log(chalk.dim(`📋 Schema: ${path.join(microDir, `${baseName}.micro.schema.json`)}`));
          }
          console.log(chalk.blue(`\n${UIMessages.photonUsage(baseName)}`));
          console.log(chalk.blue(UIMessages.photonDiscovery(baseName)));
          return;
        } catch (error: any) {
          console.log(chalk.red(`\n✗ Download failed: ${error.message}`));
          process.exit(1);
        }
      }

      // Otherwise, treat as HTTP/SSE MCP server URL
      const urlObj = new URL(providerName);
      const name = urlObj.hostname.replace(/\./g, '-') || 'custom-http';

      // Call handleManualAdd with URL as command parameter
      await handleManualAdd(name, providerName, [], options);
      return;
    }

    // Standard single MCP add flow
    const { fetchProvider } = await import('../registry/provider-registry.js');

    // Check if this is a known provider (fetch from mcps.portel.dev)
    const provider = await fetchProvider(providerName);

    if (provider && !command) {
      // Known provider - use simplified flow
      await handleKnownProvider(provider, options);
    } else {
      // Unknown provider or manual command specified - use manual flow
      await handleManualAdd(providerName, command, args || [], options);
    }
  });


// Lightweight function to read MCP info from cache without full orchestrator initialization
async function loadMCPInfoFromCache(mcpDescriptions: Record<string, string>, mcpToolCounts: Record<string, number>, mcpVersions: Record<string, string>): Promise<boolean> {
  const { readFileSync, existsSync } = await import('fs');
  const { getCacheDirectory } = await import('../utils/ncp-paths.js');
  const { join } = await import('path');

  const cacheDir = getCacheDirectory();
  let foundAnyCache = false;

  // Try CSV cache first (most reliable for tool counts)
  const csvPath = join(cacheDir, 'all-tools.csv');
  if (existsSync(csvPath)) {
    try {
      const csvContent = readFileSync(csvPath, 'utf-8');
      const lines = csvContent.split('\n').slice(1); // Skip header

      // Count tools per MCP from CSV
      for (const line of lines) {
        if (!line.trim()) continue;
        const match = line.match(/^([^,]+),/);
        if (match) {
          const mcpName = match[1];
          mcpToolCounts[mcpName] = (mcpToolCounts[mcpName] || 0) + 1;
        }
      }
      foundAnyCache = true;
    } catch (error) {
      // Continue to try JSON cache
    }
  }

  // Try JSON cache for additional metadata
  const cachePath = join(cacheDir, 'all-tools.json');
  if (existsSync(cachePath)) {
    try {
      const cacheContent = readFileSync(cachePath, 'utf-8');
      const cache = JSON.parse(cacheContent);

      // Extract server info and tool counts from cache
      for (const [mcpName, mcpData] of Object.entries(cache.mcps || {})) {
        const data = mcpData as any;

        // Extract server description (without version)
        if (data.serverInfo?.description && data.serverInfo.description !== mcpName) {
          mcpDescriptions[mcpName] = data.serverInfo.description;
        } else if (data.serverInfo?.title) {
          mcpDescriptions[mcpName] = data.serverInfo.title;
        }

        // Extract version separately
        if (data.serverInfo?.version && data.serverInfo.version !== 'unknown') {
          mcpVersions[mcpName] = data.serverInfo.version;
        }

        // Count tools if not already counted from CSV
        if (!mcpToolCounts[mcpName] && data.tools && Array.isArray(data.tools)) {
          mcpToolCounts[mcpName] = data.tools.length;
        }
      }
      foundAnyCache = true;
    } catch (error) {
      // Ignore cache reading errors
    }
  }

  return foundAnyCache;
}


// List command
program
  .command('list [filter]')
  .description('List all profiles and their MCPs with intelligent filtering')
  .option('--limit <number>', 'Maximum number of items to show (default: 20)')
  .option('--page <number>', 'Page number for pagination (default: 1)')
  .option('--depth <number>', 'Display depth: 0=profiles only, 1=profiles+MCPs+description, 2=profiles+MCPs+description+tools (default: 2)')
  .option('--search <query>', 'Search in MCP names and descriptions')
  .option('--profile <name>', 'Show only specific profile')
  .option('--sort <field>', 'Sort by: name, tools, profiles (default: name)', 'name')
  .option('--non-empty', 'Show only profiles with configured MCPs')
  .action(async (filter, options) => {
    // Set branded terminal title
    setNCPTitle('List', options.profile || 'all profiles');

    const limit = parseInt(options.limit || '20');
    const page = parseInt(options.page || '1');
    const depth = parseInt(options.depth || '2');

    const manager = new ProfileManager();
    await manager.initialize();

    let profiles = manager.listProfiles();

    if (profiles.length === 0) {
      console.log(chalk.yellow('📋 No profiles configured'));
      console.log(chalk.dim('💡 Use: ncp add <name> <command> to add an MCP server'));
      return;
    }

    // Apply profile filtering first
    if (options.profile) {
      const targetProfile = options.profile.toLowerCase();
      profiles = profiles.filter(p => p.toLowerCase() === targetProfile);

      if (profiles.length === 0) {
        console.log(chalk.yellow(`⚠️  Profile "${options.profile}" not found`));

        // Suggest similar profiles
        const allProfiles = manager.listProfiles();
        const suggestions = findSimilarNames(options.profile, allProfiles);
        if (suggestions.length > 0) {
          console.log(chalk.yellow('\n💡 Did you mean:'));
          suggestions.forEach((suggestion, index) => {
            console.log(`  ${index + 1}. ${chalk.cyan(suggestion)}`);
          });
        } else {
          console.log(chalk.yellow('\n📋 Available profiles:'));
          allProfiles.forEach((profile, index) => {
            console.log(`  ${index + 1}. ${chalk.cyan(profile)}`);
          });
        }
        return;
      }
    }

    // Initialize orchestrator to get MCP descriptions and tool counts if needed
    let orchestrator;
    let mcpDescriptions: Record<string, string> = {};
    let mcpToolCounts: Record<string, number> = {};
    let mcpVersions: Record<string, string> = {};

    if (depth >= 1) {
      try {
        // Lightweight cache reading - no orchestrator initialization needed
        const cacheLoaded = await loadMCPInfoFromCache(mcpDescriptions, mcpToolCounts, mcpVersions);

        if (!cacheLoaded) {
          // Show helpful message about building cache
          console.log(chalk.dim('💡 No MCP cache found. Use `ncp find <query>` to discover tools and build cache.'));
        }
      } catch (error) {
        // If cache reading fails, continue without descriptions
        console.log(chalk.dim('Note: Could not load MCP descriptions and tool counts'));
      }
    }

    // Collect and filter data first
    const profileData: Array<{
      name: string;
      mcps: Record<string, any>;
      filteredMcps: Record<string, any>;
      originalCount: number;
      filteredCount: number;
    }> = [];

    for (const profileName of profiles) {
      const mcps = await manager.getProfileMCPs(profileName) || {};
      let filteredMcps = mcps;

      // Apply MCP filtering
      if (filter || options.search) {
        const query = filter || options.search;
        const queryLower = query.toLowerCase();

        filteredMcps = Object.fromEntries(
          Object.entries(mcps).filter(([mcpName, config]) => {
            const description = mcpDescriptions[mcpName] || mcpName;
            return (
              mcpName.toLowerCase().includes(queryLower) ||
              description.toLowerCase().includes(queryLower)
            );
          })
        );
      }

      // Apply non-empty filter
      if (options.nonEmpty && Object.keys(filteredMcps).length === 0) {
        continue; // Skip empty profiles when --non-empty is used
      }

      profileData.push({
        name: profileName,
        mcps,
        filteredMcps,
        originalCount: Object.keys(mcps).length,
        filteredCount: Object.keys(filteredMcps).length
      });
    }

    // Check if filtering returned no results
    if (profileData.length === 0) {
      const queryInfo = filter || options.search;
      console.log(chalk.yellow(`⚠️  No MCPs found${queryInfo ? ` matching "${queryInfo}"` : ''}`));

      // Suggest available MCPs if search was used
      if (queryInfo) {
        const allMcps = new Set<string>();
        for (const profile of manager.listProfiles()) {
          const mcps = await manager.getProfileMCPs(profile);
          if (mcps) {
            Object.keys(mcps).forEach(mcp => allMcps.add(mcp));
          }
        }

        if (allMcps.size > 0) {
          const suggestions = findSimilarNames(queryInfo, Array.from(allMcps));
          if (suggestions.length > 0) {
            console.log(chalk.yellow('\n💡 Did you mean:'));
            suggestions.forEach((suggestion, index) => {
              console.log(`  ${index + 1}. ${chalk.cyan(suggestion)}`);
            });
          } else {
            console.log(chalk.yellow('\n📋 Available MCPs:'));
            Array.from(allMcps).slice(0, 10).forEach((mcp, index) => {
              console.log(`  ${index + 1}. ${chalk.cyan(mcp)}`);
            });
          }
        }
      }
      return;
    }

    // Sort profiles if requested
    if (options.sort !== 'name') {
      profileData.sort((a, b) => {
        switch (options.sort) {
          case 'tools':
            return b.filteredCount - a.filteredCount;
          case 'profiles':
            return a.name.localeCompare(b.name);
          default:
            return a.name.localeCompare(b.name);
        }
      });
    }

    // Display results
    console.log('');
    console.log(chalk.bold.white('Profiles ▶ MCPs'));
    if (filter || options.search) {
      console.log(chalk.dim(`🔍 Filtered by: "${filter || options.search}"`));
    }
    console.log('');

    let totalMCPs = 0;

    for (const data of profileData) {
      const { name: profileName, filteredMcps, filteredCount } = data;
      totalMCPs += filteredCount;

      // Profile header with count
      const countBadge = filteredCount > 0 ? chalk.green(`${filteredCount} MCPs`) : chalk.dim('empty');
      console.log(`📦 ${chalk.bold.white(profileName)}`, chalk.dim(`(${countBadge})`));

      // Depth 0: profiles only - skip MCP details
      if (depth === 0) {
        // Already showing profile, nothing more needed
      } else if (filteredMcps && Object.keys(filteredMcps).length > 0) {
        const mcpEntries = Object.entries(filteredMcps);
        mcpEntries.forEach(([mcpName, config], index) => {
          const isLast = index === mcpEntries.length - 1;
          const connector = isLast ? '└──' : '├──';
          const indent = isLast ? '   ' : '│  ';

          // MCP name with tool count (following profile count style)
          const toolCount = mcpToolCounts[mcpName];
          const versionPart = mcpVersions[mcpName] ? chalk.magenta(`v${mcpVersions[mcpName]}`) : '';

          // If not in cache, it means MCP hasn't connected successfully
          const toolPart = toolCount !== undefined ? chalk.green(`${toolCount} tools`) : chalk.gray('not available');

          const badge = versionPart && toolPart ? chalk.dim(` (${versionPart} | ${toolPart})`) :
                       versionPart ? chalk.dim(` (${versionPart})`) :
                       toolPart ? chalk.dim(` (${toolPart})`) : '';
          console.log(`  ${connector} ${chalk.bold.cyanBright(mcpName)}${badge}`);

          // Depth 1+: Show description if available and meaningful
          if (depth >= 1 && mcpDescriptions[mcpName]) {
            const description = mcpDescriptions[mcpName];
            // Skip descriptions that just repeat the MCP name (no value added)
            if (description.toLowerCase() !== mcpName.toLowerCase()) {
              console.log(`  ${indent} ${chalk.white(description)}`);
            }
          }

          // Depth 2: Show command with reverse colors and text wrapping
          if (depth >= 2) {
            const commandText = formatCommandDisplay(config.command, config.args);
            const maxWidth = process.stdout.columns ? process.stdout.columns - 6 : 80; // Leave space for indentation
            const wrappedLines = TextUtils.wrapTextWithBackground(commandText, maxWidth, `  ${indent} `, (text: string) => chalk.bgGray.black(text));
            console.log(wrappedLines);
          }
        });
      } else if (depth > 0) {
        console.log(chalk.dim('  └── (empty)'));
      }
      console.log('');
    }

    // No cleanup needed for lightweight approach

  });


// Helper function to format find command output with consistent color scheme
function formatFindOutput(text: string): string {
  // First, extract and syntax-highlight code blocks
  text = text.replace(/```typescript\n([\s\S]*?)```/g, (match, code) => {
    return formatTypeScriptCode(code);
  });

  return text
    // Tool names in headers: # **toolname** -> bold light blue
    .replace(/^# \*\*([^*]+)\*\*/gm, (match, toolName) => chalk.bold.cyanBright(toolName))
    // Parameters: ### param: type (optional) - description
    .replace(/^### ([^:]+): (.+)$/gm, (match, param, rest) => {
      // Handle: type (optional) - description
      const optionalDescMatch = rest.match(/^(.+?)\s+\*\(optional\)\*\s*-\s*(.+)$/);
      if (optionalDescMatch) {
        return `${chalk.yellow(param)}: ${chalk.cyan(optionalDescMatch[1])} ${chalk.dim('(optional)')} - ${chalk.white(optionalDescMatch[2])}`;
      }

      // Handle: type - description
      const descMatch = rest.match(/^(.+?)\s*-\s*(.+)$/);
      if (descMatch) {
        return `${chalk.yellow(param)}: ${chalk.cyan(descMatch[1])} - ${chalk.white(descMatch[2])}`;
      }

      // Handle: type (optional)
      const optionalMatch = rest.match(/^(.+)\s+\*\(optional\)\*$/);
      if (optionalMatch) {
        return `${chalk.yellow(param)}: ${chalk.cyan(optionalMatch[1])} ${chalk.dim('(optional)')}`;
      }

      // Handle: type only
      return `${chalk.yellow(param)}: ${chalk.cyan(rest)}`;
    })
    // Parameter descriptions: #### description -> dim
    .replace(/^#### (.+)$/gm, (match, desc) => chalk.dim(desc))
    // Separators: --- -> dim
    .replace(/^---$/gm, chalk.dim('---'))
    // Bold text in general: **text** -> bold for tool names in lists
    .replace(/\*\*([^*]+)\*\*/g, (match, text) => {
      // Check if it's a tool name (contains colon)
      if (text.includes(':')) {
        return chalk.bold.cyanBright(text);
      } else {
        // MCP name or other bold text
        return chalk.bold(text);
      }
    })
    // [no parameters] -> dim
    .replace(/\*\[no parameters\]\*/g, chalk.dim('[no parameters]'))
    // Inline code: `text` -> cyan for Code-Mode examples in tips
    .replace(/`([^`]+)`/g, (match, code) => chalk.cyan(code))
    // Italic text: *text* -> dim for tips
    .replace(/\*([^*\[]+)\*/g, (match, text) => chalk.dim(text))
    // Confidence percentages: (XX% match) -> green percentage
    .replace(/\((\d+)% match\)/g, (match, percentage) => chalk.dim(`(${chalk.green(percentage + '%')} match)`))
    // Header search results - make query bold white
    .replace(/Found tools for "([^"]+)"/g, (match, query) => `Found tools for ${chalk.bold.white(`"${query}"`)}`)
    // No results message
    .replace(/❌ No tools found for "([^"]+)"/g, (match, query) => `❌ No tools found for ${chalk.bold.white(`"${query}"`)}`)
    // Usage tips
    .replace(/^💡 (.+)$/gm, (match, tip) => `💡 ${chalk.white(tip)}`);
}

/**
 * Syntax highlight TypeScript code for terminal display
 */
function formatTypeScriptCode(code: string): string {
  let highlighted = code
    // Keywords: const, let, var, await, async, return, etc.
    .replace(/\b(const|let|var|await|async|return|if|else|for|while|function|class|interface|type|import|export|from|new)\b/g,
      (match) => chalk.magenta(match))
    // Strings: "..." and '...'
    .replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, (match) => chalk.green(match))
    // Comments: // ...
    .replace(/\/\/.*$/gm, (match) => chalk.dim.gray(match))
    // Numbers
    .replace(/\b(\d+)\b/g, (match) => chalk.yellow(match))
    // Function calls: functionName(
    .replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g, (match, fn) => chalk.cyan(fn) + '(')
    // Object keys in { key: value }
    .replace(/(\w+):/g, (match, key) => chalk.blue(key) + ':')
    // console methods
    .replace(/\bconsole\./g, chalk.yellow('console') + '.');

  // Add box around code with nice borders
  const lines = highlighted.split('\n');
  const maxLength = Math.max(...lines.map(l => stripAnsi(l).length));
  const border = chalk.dim('─'.repeat(maxLength + 4));

  const boxed = [
    chalk.dim('┌') + border + chalk.dim('┐'),
    ...lines.map(line => {
      const padding = ' '.repeat(maxLength - stripAnsi(line).length);
      return chalk.dim('│ ') + line + padding + ' ' + chalk.dim('│');
    }),
    chalk.dim('└') + border + chalk.dim('┘')
  ].join('\n');

  return boxed;
}

/**
 * Strip ANSI color codes to get actual string length
 */
function stripAnsi(str: string): string {
  return str.replace(/\u001b\[\d+m/g, '');
}



// Remove command
program
  .command('remove <name>')
  .description('Remove an MCP server from profiles')
  .option('--profile <names...>', 'Profile(s) to remove from (can specify multiple, default: all)')
  .action(async (name, options) => {
    // Set branded terminal title
    setNCPTitle('Remove', name);

    console.log(chalk.blue(`🗑️  Removing MCP server: ${chalk.bold(name)}`));

    const manager = new ProfileManager();
    await manager.initialize();

    // ⚠️ CRITICAL: Default MUST be ['all'] - DO NOT CHANGE!
    const profiles = options.profile || ['all'];

    // Validate if MCP exists and get suggestions
    const validation = await validateRemoveCommand(name, manager, profiles);

    if (!validation.mcpExists) {
      console.log(chalk.yellow(`⚠️  MCP "${name}" not found in specified profiles`));

      if (validation.suggestions.length > 0) {
        console.log(chalk.yellow('\n💡 Did you mean:'));
        validation.suggestions.forEach((suggestion, index) => {
          console.log(`  ${index + 1}. ${chalk.cyan(suggestion)}`);
        });
        console.log(chalk.yellow('\n💡 Use the exact name from the list above'));
      } else if (validation.allMCPs.length > 0) {
        console.log(chalk.yellow('\n📋 Available MCPs in these profiles:'));
        validation.allMCPs.forEach((mcp, index) => {
          console.log(`  ${index + 1}. ${chalk.cyan(mcp)}`);
        });
      } else {
        console.log(chalk.dim('\n📋 No MCPs found in specified profiles'));
        console.log(chalk.dim('💡 Use \'ncp list\' to see all configured MCPs'));
      }

      console.log(chalk.yellow('\n⚠️  No changes made'));
      return;
    }

    // MCP exists, proceed with removal
    console.log(chalk.green('✅ MCP found, proceeding with removal...\n'));

    // Initialize cache patcher
    const cachePatcher = new CachePatcher();

    for (const profileName of profiles) {
      try {
        // 1. Remove from profile
        await manager.removeMCPFromProfile(profileName, name);
        console.log(OutputFormatter.success(`Removed ${name} from profile: ${profileName}`));

        // 2. Clean up caches
        console.log(chalk.dim('🔧 Cleaning up caches...'));

        try {
          // Remove from tool metadata cache
          await cachePatcher.patchRemoveMCP(name);

          // Remove from embeddings cache
          await cachePatcher.patchRemoveEmbeddings(name);

          // Update profile hash
          const profile = await manager.getProfile(profileName);
          if (profile) {
            const profileHash = cachePatcher.generateProfileHash(profile);
            await cachePatcher.updateProfileHash(profileHash);
          }

          console.log(`${chalk.green('✅')} Cache cleaned for ${name}`);

        } catch (cacheError: any) {
          console.log(`${chalk.yellow('⚠️')} Could not clean cache: ${cacheError.message}`);
          console.log(chalk.dim('   Profile updated successfully. Cache will rebuild on next discovery.'));
        }

      } catch (error: any) {
        const errorResult = ErrorHandler.handle(error, ErrorHandler.createContext('profile', 'remove', `${name} from ${profileName}`));
        console.log('\n' + ErrorHandler.formatForConsole(errorResult));
      }
    }
  });

// Config command group
const configCmd = program
  .command('config [key] [value]')
  .description('Manage NCP configuration settings')
  .configureHelp({
    formatHelp: () => {
      let output = '\n';
      output += chalk.bold.white('NCP Config Command') + ' - ' + chalk.cyan('Configuration Management') + '\n\n';
      output += chalk.dim('View and manage NCP settings interactively or via command-line.') + '\n';
      output += chalk.dim('Settings control behavior like confirmation dialogs and debug logging.') + '\n\n';
      output += chalk.bold.white('Usage:') + '\n';
      output += '  ' + chalk.yellow('ncp config') + '                              # Show configuration and prompt to edit\n';
      output += '  ' + chalk.yellow('ncp config <key> <value>') + '       # Set a configuration value directly\n\n';
      output += chalk.bold.white('Available Configuration Keys:') + '\n';
      output += '  ' + chalk.cyan('autoImport') + chalk.dim(' (boolean)') + '              Auto-import MCPs from Claude Desktop on startup\n';
      output += '  ' + chalk.cyan('debugLogging') + chalk.dim(' (boolean)') + '            Enable detailed debug logs for troubleshooting\n';
      output += '  ' + chalk.cyan('confirmModifications') + chalk.dim(' (boolean)') + '    Show confirmation dialog before modifying operations\n';
      output += '  ' + chalk.cyan('enableScheduler') + chalk.dim(' (boolean)') + '        Enable built-in scheduler for automated tasks\n';
      output += '  ' + chalk.cyan('enableMCPManagement') + chalk.dim(' (boolean)') + '    Enable adding/removing MCPs in your configuration\n\n';
      output += chalk.bold.white('Boolean Values:') + '\n';
      output += '  ' + chalk.gray('Accepts:') + ' true/false, yes/no, on/off, 1/0, enabled/disabled\n\n';
      output += chalk.bold.white('Examples:') + '\n';
      output += '  ' + chalk.gray('$ ') + chalk.yellow('ncp config') + '\n';
      output += chalk.dim('  Shows current settings and prompts to edit interactively\n\n');
      output += '  ' + chalk.gray('$ ') + chalk.yellow('ncp config debugLogging true') + '\n';
      output += chalk.dim('  Enable debug logging directly\n\n');
      output += '  ' + chalk.gray('$ ') + chalk.yellow('ncp config confirmModifications off') + '\n';
      output += chalk.dim('  Disable confirmation dialogs\n\n');
      output += chalk.bold.white('Tips:') + '\n';
      output += '  • Interactive mode shows current values and allows editing one setting at a time\n';
      output += '  • Direct mode (key + value) is useful for scripts and automation\n';
      output += '  • Settings are validated before being saved to prevent errors\n\n';
      return output;
    }
  })
  .action(async (key, value, options) => {
    setNCPTitle('Config', key || 'interactive');

    const { ConfigurationManager } = await import('./commands/config-interactive.js');
    const configManager = new ConfigurationManager();

    // If key and value provided, set the config directly
    if (key && value) {
      await configManager.setConfigValue(key, value);
      process.exit(0);
    } else if (key && !value) {
      // If only key provided (no value), show error
      console.error(chalk.red(`\n❌ Missing value for key "${key}"\n`));
      console.error(chalk.dim('Usage: ncp config <key> <value>\n'));
      process.exit(1);
    } else {
      // No key provided, run interactive mode
      await configManager.run();
    }
  });

// Profile management command group
const profileCmd = program
  .command('profile')
  .description('Manage NCP profiles');

profileCmd
  .command('edit')
  .description('Open config directory in default editor')
  .action(async () => {
    setNCPTitle('Profile', 'edit');
    const manager = new ConfigManager();
    await manager.editConfig();
  });

profileCmd
  .command('validate')
  .description('Validate current configuration')
  .action(async () => {
    setNCPTitle('Profile', 'validate');
    const manager = new ConfigManager();
    await manager.validateConfig();
  });

profileCmd
  .command('location')
  .description('Show configuration file locations')
  .action(async () => {
    setNCPTitle('Profile', 'location');
    const manager = new ConfigManager();
    await manager.showConfigLocations();
  });

// Test command group (internal - hidden from help)
const testCmd = program
  .command('test')
  .description('Run diagnostic tests and analysis');
(testCmd as any).hidden = true;

testCmd
  .command('confirm-pattern')
  .description('Test confirm-before-run tag pattern against all MCP tools with multiple thresholds')
  .option('--pattern <text>', 'Override tag pattern to test (space-separated tags with hyphens)')
  .option('--output <file>', 'Output CSV file path', './confirm-pattern-results.csv')
  .option('--profile <name>', 'Profile to test against (default: all)', 'all')
  .action(async (options) => {
    const { loadGlobalSettings } = await import('../utils/global-settings.js');
    const { getCacheDirectory } = await import('../utils/ncp-paths.js');
    const { CSVCache } = await import('../cache/csv-cache.js');
    const { writeFileSync } = await import('fs');

    console.log(chalk.bold.white('\n🧪 Testing Confirm-Before-Run Pattern\n'));

    // Load settings
    const settings = await loadGlobalSettings();
    const pattern = options.pattern ?? settings.confirmBeforeRun.modifierPattern;
    const profileName = options.profile;

    console.log(chalk.cyan('Profile:'), chalk.white(profileName));
    console.log(chalk.cyan('Pattern:'), chalk.dim(pattern.substring(0, 100) + '...'));
    console.log(chalk.cyan('Output:'), chalk.white(options.output));
    console.log();

    // Load cached tools (no MCP connections needed!)
    console.log(chalk.dim('Loading cached MCP tools...'));
    const cache = new CSVCache(getCacheDirectory(), profileName);
    await cache.initialize();
    const allTools = await cache.loadCachedTools();

    if (allTools.length === 0) {
      console.log(chalk.yellow('⚠️  No tools found in cache.'));
      console.log(chalk.dim('💡 Run "ncp start" first to index your MCPs\n'));
      return;
    }

    const uniqueMCPs = new Set(allTools.map((t: any) => t.mcpName));
    console.log(chalk.green(`✓ Loaded ${allTools.length} tools from ${uniqueMCPs.size} MCPs\n`));

    // Initialize embedding model (just load model, no indexing!)
    console.log(chalk.dim('Loading embedding model...'));
    const { pipeline } = await import('@xenova/transformers');
    const model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
    console.log(chalk.green('✓ Model loaded\n'));

    // Generate embedding for the pattern (ONCE!)
    console.log(chalk.dim('Creating embedding for modifier pattern...'));
    const patternEmbedding = await model(pattern, { pooling: 'mean', normalize: true });
    console.log(chalk.green('✓ Pattern embedding created\n'));

    // Helper function for cosine similarity
    const cosineSimilarity = (a: any, b: any): number => {
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;

      for (let i = 0; i < a.length; i++) {
        dotProduct += Number(a[i]) * Number(b[i]);
        normA += Number(a[i]) * Number(a[i]);
        normB += Number(b[i]) * Number(b[i]);
      }

      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    };

    // Test multiple threshold levels
    const thresholds = [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80];
    console.log(chalk.dim(`Testing ${thresholds.length} threshold levels: ${thresholds.join(', ')}\n`));

    // Analyze each tool against the pattern (with parallel processing)
    console.log(chalk.dim(`Analyzing ${allTools.length} tools with 10 parallel workers...\n`));

    // Escape CSV fields helper
    const escapeCsv = (field: string) => {
      if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    };

    // Process a single tool
    const processTool = async (tool: any) => {
      const toolText = `${tool.mcpName}:${tool.toolName} ${tool.description || ''}`;
      const toolEmbedding = await model(toolText, { pooling: 'mean', normalize: true });
      const confidence = cosineSimilarity(patternEmbedding.data, toolEmbedding.data);

      // Check against all thresholds
      const thresholdResults = thresholds.map(t => confidence >= t ? 'YES' : 'NO');

      return {
        mcpName: tool.mcpName,
        toolName: tool.toolName,
        description: tool.description || '',
        confidence,
        thresholdResults
      };
    };

    // Process tools in parallel batches
    const BATCH_SIZE = 10;
    const results: any[] = [];
    let processed = 0;
    const startTime = Date.now();

    for (let i = 0; i < allTools.length; i += BATCH_SIZE) {
      const batch = allTools.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(processTool));
      results.push(...batchResults);

      processed += batch.length;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (processed / (Date.now() - startTime) * 1000).toFixed(1);
      process.stdout.write(`\r  Processed: ${processed}/${allTools.length} (${rate} tools/sec, ${elapsed}s elapsed)`);
    }

    // Final progress update
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\r  Processed: ${processed}/${allTools.length} (completed in ${totalTime}s)        `);
    console.log();

    // Prepare CSV data
    const csvRows: string[] = [];
    const thresholdHeaders = thresholds.map(t => `Trigger_${t.toFixed(2)}`).join(',');
    csvRows.push(`MCP,Tool,Description,Confidence,${thresholdHeaders}`);

    for (const result of results) {
      csvRows.push([
        escapeCsv(result.mcpName),
        escapeCsv(result.toolName),
        escapeCsv(result.description),
        result.confidence.toFixed(4),
        ...result.thresholdResults
      ].join(','));
    }

    // Write CSV file
    writeFileSync(options.output, csvRows.join('\n'), 'utf-8');
    console.log(chalk.green(`✓ Results written to ${options.output}\n`));

    // Calculate statistics for each threshold
    console.log(chalk.bold.white('📊 Statistics by Threshold:\n'));
    console.log(`  Total tools: ${chalk.cyan(allTools.length.toString())}\n`);

    thresholds.forEach((thresh, idx) => {
      const triggeredCount = results.filter(r => r.confidence >= thresh).length;
      const percentage = (triggeredCount / allTools.length * 100).toFixed(1);
      const color = triggeredCount < allTools.length * 0.1 ? chalk.green :
                    triggeredCount < allTools.length * 0.3 ? chalk.yellow : chalk.red;

      console.log(`  Threshold ${thresh.toFixed(2)}: ${color(triggeredCount.toString())} tools triggered (${color(percentage + '%')})`);
    });
    console.log();

    // Show top 10 most dangerous tools (highest confidence)
    console.log(chalk.bold.white('🔝 Top 10 Most Likely Modifier Operations:\n'));
    const sorted = results.sort((a, b) => b.confidence - a.confidence).slice(0, 10);

    sorted.forEach((t, index) => {
      const confidencePercent = Math.round(t.confidence * 100);
      const confidenceColor = t.confidence >= 0.8 ? chalk.red : t.confidence >= 0.7 ? chalk.yellow : chalk.cyan;
      console.log(`  ${index + 1}. ${chalk.cyan(t.mcpName + ':' + t.toolName)} ${confidenceColor(confidencePercent + '%')}`);
      console.log(`     ${chalk.dim(t.description.substring(0, 80))}${t.description.length > 80 ? '...' : ''}`);
    });
    console.log();

    // Recommend optimal threshold
    console.log(chalk.bold.white('💡 Threshold Recommendation:\n'));

    // Find threshold with reasonable trigger rate (10-30%)
    let recommendedThreshold = thresholds[0];
    for (const thresh of thresholds) {
      const triggeredCount = results.filter(r => r.confidence >= thresh).length;
      const percentage = triggeredCount / allTools.length;
      if (percentage >= 0.10 && percentage <= 0.30) {
        recommendedThreshold = thresh;
        break;
      }
    }

    const recommendedCount = results.filter(r => r.confidence >= recommendedThreshold).length;
    const recommendedPercentage = (recommendedCount / allTools.length * 100).toFixed(1);

    console.log(`  Recommended: ${chalk.cyan(recommendedThreshold.toFixed(2))}`);
    console.log(`  Would trigger: ${chalk.yellow(recommendedCount.toString())} tools (${chalk.yellow(recommendedPercentage + '%')})`);
    console.log(`  Rationale: Balances safety (catches dangerous operations) with usability (avoids too many prompts)\n`);

    console.log(chalk.dim('💡 Review the CSV file to analyze all results in detail'));
    console.log(chalk.dim('💡 Adjust threshold in ~/.ncp/settings.json if needed\n'));
  });

// Repair command - REMOVED - functionality merged into 'doctor' command
// Users should now run: ncp doctor --fix

// Find command (CLI-optimized version for fast discovery)
program
  .command('find [query]')
  .description('Find tools matching a query or list all tools')
  .option('--limit <number>', 'Maximum number of results (default: 5)')
  .option('--page <number>', 'Page number (default: 1)')
  .option('--depth <number>', 'Display depth: 0=overview, 1=tools, 2=details (default: 2)')
  .option('--confidence_threshold <number>', 'Minimum confidence level (0.0-1.0, default: 0.3). Examples: 0.1=show all, 0.5=strict, 0.7=very precise')
  .action(async (query, options) => {
    // Set branded terminal title with search context
    setNCPTitle('Find', query || 'all tools');

    // Add newline after command before any output
    console.log();

    // ⚠️ CRITICAL: Default MUST be 'all' - DO NOT CHANGE!
    const profileName = program.getOptionValue('profile') || 'all';

    // Use MCPServer for rich formatted output
    const { MCPServer } = await import('../server/mcp-server.js');
    const server = new MCPServer(profileName, true, false); // Enable progress, no force retry

    // Setup graceful shutdown on Ctrl+C
    const gracefulShutdown = async () => {
      process.stdout.write('\n\n💾 Saving progress...');
      try {
        await server.cleanup();
        process.stdout.write('\r\u001B[K✅ Progress saved\n');
      } catch (error) {
        process.stdout.write('\r\u001B[K❌ Error saving progress\n');
      }
      process.exit(0);
    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);

    await server.initialize();

    // For CLI usage, wait for indexing to complete before searching
    await server.waitForInitialization();

    // Normalize query: trim whitespace and treat empty/whitespace-only as undefined for listing mode
    const normalizedQuery = query && typeof query === 'string' && query.trim() ? query.trim() : '';

    const limit = parseInt(options.limit || '5');
    const page = parseInt(options.page || '1');
    const depth = parseInt(options.depth || '2');
    const confidence_threshold = options.confidence_threshold ? parseFloat(options.confidence_threshold) : undefined;

    const result = await server.callTool('find', {
      description: normalizedQuery,
      limit,
      page,
      depth,
      confidence_threshold
    });

    let formattedOutput = formatFindOutput(result.content[0].text);

    // Extract MCP names from results and check for updates
    try {
      const mcpUpdateChecker = new MCPUpdateChecker();
      const mcpMatches = result.result.content[0].text.match(/\*\*(\w+):[\w_]+\*\*/g) || [];
      const uniqueMcps = new Set<string>();

      for (const match of mcpMatches) {
        const mcpName = match.replace(/\*\*|\*\*/g, '').split(':')[0];
        uniqueMcps.add(mcpName);
      }

      // Check for updates for discovered MCPs
      const mcpsWithUpdates: string[] = [];
      if (uniqueMcps.size > 0) {
        for (const mcpName of uniqueMcps) {
          // Check with unknown version - MCPUpdateChecker will still find latest
          const updateInfo = await mcpUpdateChecker.checkMCPUpdate(mcpName, 'unknown');
          if (updateInfo.hasUpdate && updateInfo.latestVersion) {
            mcpsWithUpdates.push(`  ${chalk.cyan(mcpName)}: latest available is ${chalk.green(updateInfo.latestVersion)}`);
          }
        }
      }

      // Add update footnotes if any MCPs have updates
      if (mcpsWithUpdates.length > 0) {
        formattedOutput += '\n' + chalk.dim('\n📦 Available MCP Updates:') + '\n';
        formattedOutput += mcpsWithUpdates.join('\n');
        formattedOutput += '\n' + chalk.dim('   Run: ncp update [mcp-name] to update\n');
      }
    } catch (error) {
      // Silently ignore update check errors - don't disrupt find results
      logger.debug(`Failed to check MCP updates in find: ${error}`);
    }

    console.log(formattedOutput);
    await server.cleanup();
  });

// Analytics command group
const analyticsCmd = program
  .command('analytics')
  .description('View NCP usage analytics and performance metrics');

analyticsCmd
  .action(() => analyticsCmd.help())
  .command('overview')
  .description('Show comprehensive analytics overview')
  .option('--period <days>', 'Show data for last N days (e.g., --period 7)')
  .option('--from <date>', 'Start date (YYYY-MM-DD format)')
  .option('--to <date>', 'End date (YYYY-MM-DD format)')
  .option('--today', 'Show only today\'s data')
  .option('--visual', 'Enhanced visual dashboard with charts and graphs')
  .action(async (options) => {
    // Set branded terminal title
    setNCPTitle('Analytics', 'overview');

    const { NCPLogParser } = await import('../analytics/log-parser.js');

    console.log(chalk.dim('📊 Analyzing NCP usage data...'));

    const parser = new NCPLogParser();

    // Parse time range options
    const parseOptions: any = {};

    if (options.today) {
      parseOptions.today = true;
    } else if (options.period) {
      parseOptions.period = parseInt(options.period);
    } else if (options.from || options.to) {
      if (options.from) parseOptions.from = new Date(options.from);
      if (options.to) parseOptions.to = new Date(options.to);
    }

    const report = await parser.parseAllLogs(parseOptions);

    if (report.totalSessions === 0) {
      console.log(chalk.yellow('📊 No analytics data available for the specified time range'));
      console.log(chalk.dim('💡 Try a different time range or check if MCPs have been used through NCP'));
      return;
    }

    if (options.visual) {
      const { VisualAnalyticsFormatter } = await import('../analytics/visual-formatter.js');
      const dashboard = await VisualAnalyticsFormatter.formatVisualDashboard(report);
      console.log(dashboard);
    } else {
      const { AnalyticsFormatter } = await import('../analytics/analytics-formatter.js');
      const dashboard = AnalyticsFormatter.formatDashboard(report);
      console.log(dashboard);
    }
  });

analyticsCmd
  .command('performance')
  .description('Show performance-focused analytics')
  .option('--period <days>', 'Show data for last N days (e.g., --period 7)')
  .option('--from <date>', 'Start date (YYYY-MM-DD format)')
  .option('--to <date>', 'End date (YYYY-MM-DD format)')
  .option('--today', 'Show only today\'s data')
  .option('--visual', 'Enhanced visual performance report with gauges and charts')
  .action(async (options) => {
    const { NCPLogParser } = await import('../analytics/log-parser.js');

    console.log(chalk.dim('⚡ Analyzing performance metrics...'));

    const parser = new NCPLogParser();

    // Parse time range options
    const parseOptions: any = {};
    if (options.today) {
      parseOptions.today = true;
    } else if (options.period) {
      parseOptions.period = parseInt(options.period);
    } else if (options.from || options.to) {
      if (options.from) parseOptions.from = new Date(options.from);
      if (options.to) parseOptions.to = new Date(options.to);
    }

    const report = await parser.parseAllLogs(parseOptions);

    if (report.totalSessions === 0) {
      console.log(chalk.yellow('📊 No performance data available for the specified time range'));
      return;
    }

    if (options.visual) {
      const { VisualAnalyticsFormatter } = await import('../analytics/visual-formatter.js');
      const performance = await VisualAnalyticsFormatter.formatVisualPerformance(report);
      console.log(performance);
    } else {
      const { AnalyticsFormatter } = await import('../analytics/analytics-formatter.js');
      const performance = AnalyticsFormatter.formatPerformanceReport(report);
      console.log(performance);
    }
  });

analyticsCmd
  .command('export')
  .description('Export analytics data to CSV')
  .option('--output <file>', 'Output file (default: ncp-analytics.csv)')
  .option('--period <days>', 'Export data for last N days (e.g., --period 7)')
  .option('--from <date>', 'Start date (YYYY-MM-DD format)')
  .option('--to <date>', 'End date (YYYY-MM-DD format)')
  .option('--today', 'Export only today\'s data')
  .action(async (options) => {
    const { NCPLogParser } = await import('../analytics/log-parser.js');
    const { AnalyticsFormatter } = await import('../analytics/analytics-formatter.js');
    const { writeFileSync } = await import('fs');

    console.log(chalk.dim('📊 Generating analytics export...'));

    const parser = new NCPLogParser();

    // Parse time range options
    const parseOptions: any = {};
    if (options.today) {
      parseOptions.today = true;
    } else if (options.period) {
      parseOptions.period = parseInt(options.period);
    } else if (options.from || options.to) {
      if (options.from) parseOptions.from = new Date(options.from);
      if (options.to) parseOptions.to = new Date(options.to);
    }

    const report = await parser.parseAllLogs(parseOptions);

    if (report.totalSessions === 0) {
      console.log(chalk.yellow('📊 No data to export for the specified time range'));
      return;
    }

    const csv = AnalyticsFormatter.formatCSV(report);
    const filename = options.output || 'ncp-analytics.csv';

    writeFileSync(filename, csv, 'utf-8');
    console.log(chalk.green(`✅ Analytics exported to ${filename}`));
    console.log(chalk.dim(`📊 Exported ${report.totalSessions} sessions across ${report.uniqueMCPs} MCPs`));
  });

// Run command (existing functionality)
program
  .command('run <tool> [args...]')

  .description('Run a specific tool')
  .option('--params <json>', 'Tool parameters as JSON string (legacy - will prompt interactively if not provided)')
  .option('--no-prompt', 'Skip interactive prompting for missing parameters')
  .option('--output-format <format>', 'Output format: auto (smart rendering), json (raw JSON)', 'auto')
  .option('-y, --yes', 'Automatically answer yes to prompts (e.g., open media files)')
  .configureHelp({
    formatHelp: (cmd, helper) => {
      const indent = '  ';
      let output = '\n';

      // Header first - context before syntax
      output += chalk.bold.white('NCP Run Command') + ' - ' + chalk.cyan('Direct MCP Tool Execution') + '\n\n';
      output += chalk.dim('Execute MCP tools with natural CLI syntax, intelligent parameter handling, and rich media support.') + '\n';
      output += chalk.dim('Supports positional arguments, named parameters, and JSON for complex types.') + '\n\n';

      // Then usage
      output += chalk.bold.white('Usage:') + ' ' + helper.commandUsage(cmd) + '\n\n';

      const visibleOptions = helper.visibleOptions(cmd);
      if (visibleOptions.length) {
        output += chalk.bold.white('Options:') + '\n';
        visibleOptions.forEach(option => {
          const flags = option.flags;
          const description = helper.optionDescription(option);
          const paddingNeeded = Math.max(0, 42 - flags.length);
          const padding = ' '.repeat(paddingNeeded);
          output += indent + chalk.cyan(flags) + padding + ' ' + chalk.white(description) + '\n';
        });
        output += '\n';
      }

      // Examples section
      output += chalk.bold.white('Examples:') + '\n';
      output += chalk.dim('  Standard syntax:') + '\n';
      output += indent + chalk.yellow('ncp run filesystem read_file --path /tmp/test.txt') + '\n';
      output += indent + chalk.yellow('ncp run github create_issue --repo owner/repo --title "Bug" --body "Description"') + '\n';
      output += indent + chalk.yellow('ncp run memory create_entities item1 item2') + chalk.gray('  # Positional args') + '\n\n';

      output += chalk.dim('  Legacy syntax (still works):') + '\n';
      output += indent + chalk.yellow('ncp run filesystem:read_file --params \'{"path": "/tmp/test.txt"}\'') + '\n';
      output += indent + chalk.yellow('ncp run memory:create_entities') + chalk.gray('  # Interactive mode') + '\n\n';

      output += chalk.dim('  Output control:') + '\n';
      output += indent + chalk.yellow('ncp run tool --output-format json') + chalk.gray('  # Raw JSON output') + '\n';
      output += indent + chalk.yellow('ncp run tool -y') + chalk.gray('  # Auto-open media files') + '\n\n';

      // Media support note
      output += chalk.bold.white('Media Support:') + '\n';
      output += chalk.dim('  • Images and audio are displayed with metadata') + '\n';
      output += chalk.dim('  • Use') + chalk.cyan(' -y ') + chalk.dim('to auto-open media in default applications') + '\n';
      output += chalk.dim('  • Without') + chalk.cyan(' -y') + chalk.dim(', prompts before opening media files') + '\n\n';

      return output;
    }
  })
  .action(async (tool, args, options) => {
    // Handle new syntax: "mcp tool" vs old syntax "mcp:tool"
    // If tool doesn't contain ':' and args has at least one element, check if first arg is the tool name
    let toolName = tool;
    let cliArgs: string[] = Array.isArray(args) ? [...args] : [];

    if (!tool.includes(':') && cliArgs.length > 0 && !cliArgs[0].startsWith('-')) {
      // Might be new syntax: "mcp tool args..."
      // Check if first arg looks like a tool name (not starting with --)
      const potentialTool = cliArgs[0];
      if (!potentialTool.startsWith('-')) {
        // Treat as: mcp is tool, first arg is actual tool name
        // Reconstruct full tool name as "mcp:tool"
        toolName = `${tool}:${potentialTool}`;
        cliArgs = cliArgs.slice(1); // Remove the tool name from args
        // console.log(chalk.dim(`Parsed: MCP "${tool}" tool "${potentialTool}"`));
      }
    }

    // Set branded terminal title with tool name
    setNCPTitle('Run', toolName);

    // ⚠️ CRITICAL: Default MUST be 'all' - DO NOT CHANGE!
    const profileName = program.getOptionValue('profile') || 'all';

    const { NCPOrchestrator } = await import('../orchestrator/ncp-orchestrator.js');
    const orchestrator = new NCPOrchestrator(profileName, false); // Silent indexing for run command

    await orchestrator.initialize();

    // If tool doesn't contain a colon, try to find matching tools first
    if (!toolName.includes(':')) {
      console.log(chalk.dim(`🔍 Searching for tools matching "${toolName}"...`));

      try {
        const matchingTools = await orchestrator.find(toolName, 5, false);

        if (matchingTools.length === 0) {
          console.log('\n' + OutputFormatter.error(`No tools found matching "${toolName}"`));
          console.log(chalk.yellow('💡 Try \'ncp find\' to explore all available tools'));
          await orchestrator.cleanup();
          process.exit(1);
        }

        if (matchingTools.length === 1) {
          // Only one match, use it automatically
          const matchedTool = matchingTools[0];
          toolName = matchedTool.toolName;
          console.log(chalk.green(`✅ Found exact match: ${toolName}`));
        } else {
          // Multiple matches, show them and ask user to be more specific
          console.log(chalk.yellow(`Found ${matchingTools.length} matching tools:`));
          matchingTools.forEach((match, index) => {
            const confidence = Math.round(match.confidence * 100);
            console.log(`  ${index + 1}. ${chalk.cyan(match.toolName)} (${confidence}% match)`);
            if (match.description) {
              console.log(`     ${chalk.dim(match.description)}`);
            }
          });
          console.log(chalk.yellow('\n💡 Please specify the exact tool name from the list above'));
          console.log(chalk.yellow(`💡 Example: ncp run ${matchingTools[0].toolName}`));
          await orchestrator.cleanup();
          process.exit(1);
        }
      } catch (error: any) {
        console.log('\n' + OutputFormatter.error(`Error searching for tools: ${error.message}`));
        await orchestrator.cleanup();
        process.exit(1);
      }
    }

    // Check if parameters are provided
    let parameters = {};

    if (options.params) {
      // Legacy JSON mode: --params '{"key": "value"}'
      try {
        parameters = JSON.parse(options.params);
      } catch (error: any) {
        console.log('\n' + OutputFormatter.error(`Failed to parse JSON parameters: ${error.message}`));
        console.log(chalk.yellow(`💡 Make sure your JSON is valid`));
        await orchestrator.cleanup();
        process.exit(1);
      }
    } else if (cliArgs.length > 0) {
      // NEW: Smart argument parsing from CLI args
      const { ParameterParser } = await import('../utils/parameter-parser.js');
      const schema = orchestrator.getToolSchemaByIdentifier(toolName);

      if (!schema) {
        console.log('\n' + OutputFormatter.error(`Could not retrieve schema for tool "${toolName}"`));
        await orchestrator.cleanup();
        process.exit(1);
      }

      try {
        const parser = new ParameterParser();
        parameters = parser.parse(cliArgs, schema);

        // Validate required parameters
        const missingParams = parser.validateRequired(parameters, schema);
        if (missingParams.length > 0) {
          console.log('\n' + OutputFormatter.error('Missing required parameters:'));
          missingParams.forEach(param => {
            console.log(`  • ${chalk.cyan(param)}`);
          });
          console.log(chalk.yellow('\n' + parser.getHelpText(schema)));
          await orchestrator.cleanup();
          process.exit(1);
        }
      } catch (error: any) {
        console.log('\n' + OutputFormatter.error(`Parameter parsing error: ${error.message}`));
        const parser = new (await import('../utils/parameter-parser.js')).ParameterParser();
        const schema = orchestrator.getToolSchemaByIdentifier(toolName);
        if (schema) {
          console.log(chalk.yellow('\n' + parser.getHelpText(schema)));
        }
        await orchestrator.cleanup();
        process.exit(1);
      }
    } else {
      // No args provided: use interactive mode if needed
      // Get tool schema and parameters
      const toolParams = orchestrator.getToolParameters(toolName);

      if (toolParams && toolParams.length > 0) {
        const requiredParams = toolParams.filter(p => p.required);

        if (requiredParams.length > 0 && options.prompt !== false) {
          // Interactive prompting for parameters (default behavior)
          const { ParameterPrompter } = await import('../utils/parameter-prompter.js');
          const { ParameterPredictor } = await import('../utils/parameter-predictor.js');

          const prompter = new ParameterPrompter();
          const predictor = new ParameterPredictor();
          const toolContext = orchestrator.getToolContext(toolName);

          try {
            parameters = await prompter.promptForParameters(toolName, toolParams, predictor, toolContext);
            prompter.close();
          } catch (error) {
            prompter.close();
            console.log('\n' + OutputFormatter.error('Error during parameter input'));
            await orchestrator.cleanup();
            process.exit(1);
          }
        } else if (requiredParams.length > 0 && options.prompt === false) {
          console.log('\n' + OutputFormatter.error('This tool requires parameters'));
          console.log(chalk.yellow(`💡 Use: ncp run ${toolName} --param1 value1 --param2 value2`));
          console.log(chalk.yellow(`💡 Or use: ncp find "${toolName}" --depth 2 to see required parameters`));
          console.log(chalk.yellow(`💡 Or remove --no-prompt to use interactive prompting`));
          await orchestrator.cleanup();
          process.exit(1);
        }
      }
    }

    console.log(OutputFormatter.running(toolName) + '\n');

    const result = await orchestrator.run(toolName, parameters);
    const { CLIResultFormatter } = await import('../services/cli-result-formatter.js');

    if (result.success) {
      console.log(OutputFormatter.success('Tool execution completed'));

      // Format result for CLI display
      const formattedOutput = CLIResultFormatter.format(result);

      if (options.outputFormat === 'json') {
        // Raw JSON output
        const { formatJson } = await import('../utils/highlighting.js');
        console.log(formatJson(result.content, 'cli-highlight'));
      } else {
        // Default: formatted output
        console.log(formattedOutput);
      }
    } else {
      // NCP-level error (tool not found, validation failed, etc.)
      const errorMessage = result.error || 'Unknown error occurred';
      let suggestions: string[] = [];

      if (errorMessage.includes('not found') || errorMessage.includes('not configured')) {
        // Extract the query from the tool name for vector search
        const [mcpName, toolPart] = toolName.split(':');

        // Try multiple search strategies to find the best matches
        let similarTools: any[] = [];

        try {
          // Strategy 1: Search with both MCP context and tool name for better domain matching
          if (toolPart && mcpName) {
            const contextualQuery = `${mcpName} ${toolPart}`;
            similarTools = await orchestrator.find(contextualQuery, 3, false);
          }

          // Strategy 2: If no results, try just the tool name
          if (similarTools.length === 0 && toolPart) {
            similarTools = await orchestrator.find(toolPart, 3, false);
          }

          // Strategy 3: If still no results, try just the MCP name (domain search)
          if (similarTools.length === 0) {
            similarTools = await orchestrator.find(mcpName, 3, false);
          }
          if (similarTools.length > 0) {
            suggestions.push('💡 Did you mean:');
            similarTools.forEach(similar => {
              const confidence = Math.round(similar.confidence * 100);
              suggestions.push(`  • ${similar.toolName} (${confidence}% match)`);
            });
          }
        } catch (error: any) {
          // Fallback to basic suggestions if vector search fails
          suggestions = ['Try \'ncp find <keyword>\' to discover similar tools'];
        }
      }

      const context = ErrorHandler.createContext('mcp', 'run', toolName, suggestions);
      const errorResult = ErrorHandler.handle(errorMessage, context);
      console.log('\n' + ErrorHandler.formatForConsole(errorResult));
      await orchestrator.cleanup();
      process.exit(1);
    }

    await orchestrator.cleanup();
  });

// Auth command (internal - hidden from help)
program
  .command('auth <mcp>', { hidden: true })
  .description('Authenticate an MCP server using OAuth Device Flow')
  .option('--profile <name>', 'Profile to use (default: all)')
  .configureHelp({
    formatHelp: () => {
      let output = '\n';
      output += chalk.bold.white('NCP Auth Command') + ' - ' + chalk.cyan('OAuth Authentication') + '\n\n';
      output += chalk.dim('Authenticate an MCP server that requires OAuth 2.0 Device Flow authentication.') + '\n';
      output += chalk.dim('Tokens are securely stored and automatically refreshed.') + '\n\n';
      output += chalk.bold.white('Usage:') + '\n';
      output += '  ' + chalk.yellow('ncp auth <mcp>') + '          # Authenticate an MCP server\n';
      output += '  ' + chalk.yellow('ncp auth <mcp> --profile <name>') + '   # Authenticate for specific profile\n\n';
      output += chalk.bold.white('Examples:') + '\n';
      output += '  ' + chalk.gray('$ ') + chalk.yellow('ncp auth github') + '\n';
      output += '  ' + chalk.gray('$ ') + chalk.yellow('ncp auth my-api --profile production') + '\n\n';
      return output;
    }
  })
  .action(async (mcpName, options) => {
    try {
      const profileName = options.profile || 'all';

      // Load profile
      const manager = new ProfileManager();
      await manager.initialize();

      const profile = await manager.getProfile(profileName);
      if (!profile) {
        console.error(chalk.red(`❌ Profile '${profileName}' not found`));
        process.exit(1);
      }

      // Check if MCP exists in profile
      const mcpConfig = profile.mcpServers[mcpName];
      if (!mcpConfig) {
        console.error(chalk.red(`❌ MCP '${mcpName}' not found in profile '${profileName}'`));

        // Suggest similar MCPs
        const availableMCPs = Object.keys(profile.mcpServers);
        if (availableMCPs.length > 0) {
          const suggestions = findSimilarNames(mcpName, availableMCPs);
          if (suggestions.length > 0) {
            console.log(chalk.yellow('\n💡 Did you mean:'));
            suggestions.forEach((suggestion, index) => {
              console.log(`  ${index + 1}. ${chalk.cyan(suggestion)}`);
            });
          }
        }
        process.exit(1);
      }

      // Check if MCP has OAuth configuration
      if (!mcpConfig.auth || mcpConfig.auth.type !== 'oauth' || !mcpConfig.auth.oauth) {
        console.error(chalk.red(`❌ MCP '${mcpName}' does not have OAuth configuration`));
        console.log(chalk.yellow('\n💡 To add OAuth configuration, edit your profile configuration file:'));
        console.log(chalk.dim('   Add "auth": { "type": "oauth", "oauth": { ... } } to the MCP configuration'));
        process.exit(1);
      }

      // Perform OAuth Device Flow
      const { DeviceFlowAuthenticator } = await import('../auth/oauth-device-flow.js');
      const { getTokenStore } = await import('../auth/token-store.js');

      const authenticator = new DeviceFlowAuthenticator(mcpConfig.auth.oauth);
      const tokenStore = getTokenStore();

      console.log(chalk.blue(`🔐 Starting OAuth Device Flow for '${mcpName}'...\n`));

      try {
        const tokenResponse = await authenticator.authenticate();

        // Store the token
        await tokenStore.storeToken(mcpName, tokenResponse);

        console.log(chalk.green(`✅ Successfully authenticated '${mcpName}'!`));
        console.log(chalk.dim(`   Token expires: ${new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()}`));
        console.log(chalk.dim(`   Token stored securely in: ~/.ncp/tokens/${mcpName}.token`));
      } catch (error: any) {
        console.error(chalk.red(`❌ Authentication failed: ${error.message}`));
        process.exit(1);
      }
    } catch (error: any) {
      console.error(chalk.red(`❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

// Update command - supports both NCP and MCP updates
program
  .command('update [mcp-name]')
  .description('Update NCP or a specific MCP to the latest version')
  .option('--check', 'Check for updates without installing')
  .option('--force', 'Force immediate update check (bypass 24h cache)')
  .configureHelp({
    formatHelp: () => {
      let output = '\n';
      output += chalk.bold.white('NCP Update Command') + ' - ' + chalk.cyan('Version Management') + '\n\n';
      output += chalk.dim('Update NCP or installed MCPs to the latest versions.') + '\n\n';
      output += chalk.bold.white('Usage:') + '\n';
      output += '  ' + chalk.yellow('ncp update') + '              # Update NCP to latest version\n';
      output += '  ' + chalk.yellow('ncp update github') + '        # Update github MCP\n';
      output += '  ' + chalk.yellow('ncp update --check') + '       # Check for all updates\n';
      output += '  ' + chalk.yellow('ncp update github --check') + ' # Check github MCP for updates\n\n';
      output += chalk.bold.white('Options:') + '\n';
      output += '  ' + chalk.cyan('--check') + '   Check for updates without installing\n';
      output += '  ' + chalk.cyan('--force') + '   Force immediate check (bypass 24h cache)\n\n';
      output += chalk.bold.white('Examples:') + '\n';
      output += '  ' + chalk.gray('$ ') + chalk.yellow('ncp update --check') + '\n';
      output += '  ' + chalk.gray('$ ') + chalk.yellow('ncp update') + '\n';
      output += '  ' + chalk.gray('$ ') + chalk.yellow('ncp update github --check') + '\n';
      output += '  ' + chalk.gray('$ ') + chalk.yellow('ncp update github') + '\n\n';
      return output;
    }
  })
  .action(async (mcpName, options) => {
    // Set branded terminal title
    setNCPTitle('Update', mcpName || 'NCP');

    try {
      // If no MCP name provided, update NCP itself
      if (!mcpName) {
        const updateChecker = new UpdateChecker();

        if (options.check) {
          // Check for updates only
          console.log(chalk.blue('🔍 Checking for NCP updates...'));
          const result = await updateChecker.checkForUpdates(true);

          if (result.hasUpdate) {
            console.log(chalk.yellow('📦 NCP Update Available!'));
            console.log(chalk.dim(`   Current: ${result.currentVersion}`));
            console.log(chalk.green(`   Latest:  ${result.latestVersion}`));
            console.log();
            console.log(chalk.cyan('   Run: ncp update'));
          } else {
            console.log(chalk.green('✅ You are using the latest NCP version!'));
            console.log(chalk.dim(`   Version: ${result.currentVersion}`));
          }
        } else {
          // Perform update
          const result = await updateChecker.checkForUpdates(true);

          if (result.hasUpdate) {
            console.log(chalk.yellow('📦 Update Available!'));
            console.log(chalk.dim(`   Current: ${result.currentVersion}`));
            console.log(chalk.green(`   Latest:  ${result.latestVersion}`));
            console.log();

            const success = await updateChecker.performUpdate();
            if (!success) {
              process.exit(1);
            }
          } else {
            console.log(chalk.green('✅ You are already using the latest NCP version!'));
            console.log(chalk.dim(`   Version: ${result.currentVersion}`));
          }
        }
        return;
      }

      // Update specific MCP
      const mcpUpdateChecker = new MCPUpdateChecker();

      if (options.check) {
        // Check for MCP updates
        console.log(chalk.blue(`🔍 Checking for updates to ${chalk.cyan(mcpName)} MCP...`));

        // For now, show a message that MCP updates will be shown via notifications
        console.log(chalk.yellow('ℹ️  MCP update checking via command-line is coming soon.'));
        console.log(chalk.dim('   Updates will be shown automatically when you use MCP tools.'));
        console.log(chalk.dim(`   Run: ncp find "${mcpName}" to verify the MCP is installed.`));
      } else {
        // Perform MCP update
        console.log(chalk.blue(`🔄 Updating ${chalk.cyan(mcpName)} MCP...`));
        console.log(chalk.yellow('ℹ️  MCP update feature coming soon'));
        console.log(chalk.dim('   For now, you can manually update the MCP package in your profile configuration.'));
        console.log(chalk.dim(`   Run: ncp find "${mcpName}" to verify the MCP is installed.`));
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to check for updates:'), error);
      process.exit(1);
    }
  });

// Scheduler commands
const scheduleCmd = program
  .command('schedule')
  .description('Schedule MCP tool executions with cron');

scheduleCmd.action(() => scheduleCmd.help());

// schedule create
scheduleCmd
  .command('create <tool> <schedule>')
  .description('Create a new scheduled job')
  .option('--name <name>', 'Job name (required)')
  .option('--params <json>', 'Tool parameters as JSON string')
  .option('--description <text>', 'Job description')
  .option('--fire-once', 'Execute only once then stop')
  .option('--max-executions <n>', 'Maximum number of executions', parseInt)
  .option('--end-date <date>', 'Stop executing after this date (ISO format)')
  .option('--catchup-missed', 'Run this job even if its scheduled time was missed (e.g., laptop was closed)')
  .option('--test-run', 'Test execution before scheduling')
  .option('--skip-validation', 'Skip parameter validation (not recommended)')
  .action(async (tool, schedule, options) => {
    try {
      if (!options.name) {
        console.error(chalk.red('❌ --name is required'));
        process.exit(1);
      }

      const { Scheduler } = await import('../services/scheduler/scheduler.js');
      const scheduler = new Scheduler();

      if (!scheduler.isAvailable()) {
        console.error(chalk.red('❌ Scheduler not available on this platform (Windows not supported)'));
        process.exit(1);
      }

      const parameters = options.params ? JSON.parse(options.params) : {};

      console.log(chalk.blue('📅 Creating scheduled job...'));

      const job = await scheduler.createJob({
        name: options.name,
        schedule,
        tool,
        parameters,
        description: options.description,
        fireOnce: options.fireOnce,
        maxExecutions: options.maxExecutions,
        endDate: options.endDate,
        catchupMissed: options.catchupMissed,
        testRun: options.testRun,
        skipValidation: options.skipValidation
      });

      console.log(chalk.green('\n✅ Scheduled job created successfully!\n'));
      console.log(chalk.bold('Job Details:'));
      console.log(`  ${chalk.cyan('Name:')} ${job.name}`);
      console.log(`  ${chalk.cyan('ID:')} ${job.id}`);
      console.log(`  ${chalk.cyan('Tool:')} ${job.tool}`);
      console.log(`  ${chalk.cyan('Schedule:')} ${job.cronExpression}`);
      console.log(`  ${chalk.cyan('Type:')} ${job.fireOnce ? 'One-time' : 'Recurring'}`);
      console.log(`  ${chalk.cyan('Status:')} ${job.status}`);
      if (job.description) {
        console.log(`  ${chalk.cyan('Description:')} ${job.description}`);
      }
      console.log(chalk.dim('\n💡 Use "ncp schedule list" to view all scheduled jobs'));
    } catch (error) {
      console.error(chalk.red('\n❌ Failed to create scheduled job'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// schedule list
scheduleCmd
  .command('list')
  .description('List all scheduled jobs')
  .option('--status <status>', 'Filter by status (active, paused, completed, error)')
  .action(async (options) => {
    try {
      const { Scheduler } = await import('../services/scheduler/scheduler.js');
      const scheduler = new Scheduler();

      const jobs = scheduler.listJobs(options.status);

      if (jobs.length === 0) {
        console.log(chalk.yellow('No scheduled jobs found'));
        console.log(chalk.dim('Create one with: ncp schedule create <tool> <schedule> --name "Job Name"'));
        return;
      }

      console.log(chalk.bold(`\n📋 Scheduled Jobs (${jobs.length})\n`));

      for (const job of jobs) {
        const statusColor = job.status === 'active' ? chalk.green :
                           job.status === 'paused' ? chalk.yellow :
                           job.status === 'error' ? chalk.red : chalk.gray;

        console.log(`${statusColor('●')} ${chalk.bold(job.name)} ${chalk.dim(`(${job.status})`)}`);
        console.log(`  ${chalk.dim('ID:')} ${job.id}`);
        console.log(`  ${chalk.dim('Tool:')} ${job.tool}`);
        console.log(`  ${chalk.dim('Schedule:')} ${job.cronExpression}`);
        console.log(`  ${chalk.dim('Executions:')} ${job.executionCount}`);
        if (job.lastExecutionAt) {
          console.log(`  ${chalk.dim('Last run:')} ${new Date(job.lastExecutionAt).toLocaleString()}`);
        }
        console.log();
      }

      const stats = scheduler.getJobStatistics();
      console.log(chalk.dim('Statistics:'));
      console.log(chalk.dim(`  Active: ${stats.active}, Paused: ${stats.paused}, Completed: ${stats.completed}, Error: ${stats.error}`));
    } catch (error) {
      console.error(chalk.red('❌ Failed to list jobs:'), error);
      process.exit(1);
    }
  });

// schedule get
scheduleCmd
  .command('get <job-id>')
  .description('Get details of a specific job')
  .action(async (jobId) => {
    try {
      const { Scheduler } = await import('../services/scheduler/scheduler.js');
      const scheduler = new Scheduler();

      let job = scheduler.getJob(jobId);
      if (!job) {
        job = scheduler.getJobByName(jobId);
      }

      if (!job) {
        console.error(chalk.red(`❌ Job not found: ${jobId}`));
        process.exit(1);
      }

      const stats = scheduler.getExecutionStatistics(job.id);

      console.log(chalk.bold(`\n📋 ${job.name}\n`));
      console.log(`${chalk.cyan('ID:')} ${job.id}`);
      console.log(`${chalk.cyan('Tool:')} ${job.tool}`);
      console.log(`${chalk.cyan('Schedule:')} ${job.cronExpression}`);
      console.log(`${chalk.cyan('Status:')} ${job.status}`);
      console.log(`${chalk.cyan('Type:')} ${job.fireOnce ? 'One-time' : 'Recurring'}`);
      if (job.description) {
        console.log(`${chalk.cyan('Description:')} ${job.description}`);
      }
      if (job.maxExecutions) {
        console.log(`${chalk.cyan('Max Executions:')} ${job.maxExecutions}`);
      }
      if (job.endDate) {
        console.log(`${chalk.cyan('End Date:')} ${job.endDate}`);
      }
      console.log(`${chalk.cyan('Created:')} ${new Date(job.createdAt).toLocaleString()}`);

      console.log(chalk.bold('\nExecution Statistics:'));
      console.log(`  Total: ${stats.total}`);
      console.log(`  Success: ${chalk.green(stats.success)}`);
      console.log(`  Failure: ${chalk.red(stats.failure)}`);
      console.log(`  Timeout: ${chalk.yellow(stats.timeout)}`);
      if (stats.avgDuration) {
        console.log(`  Avg Duration: ${Math.round(stats.avgDuration)}ms`);
      }

      console.log(chalk.bold('\nParameters:'));
      console.log(JSON.stringify(job.parameters, null, 2));
    } catch (error) {
      console.error(chalk.red('❌ Failed to get job:'), error);
      process.exit(1);
    }
  });

// schedule pause
scheduleCmd
  .command('pause <job-id>')
  .description('Pause a scheduled job')
  .action(async (jobId) => {
    try {
      const { Scheduler } = await import('../services/scheduler/scheduler.js');
      const scheduler = new Scheduler();

      let job = scheduler.getJob(jobId);
      if (!job) {
        job = scheduler.getJobByName(jobId);
        if (job) jobId = job.id;
      }

      if (!job) {
        console.error(chalk.red(`❌ Job not found: ${jobId}`));
        process.exit(1);
      }

      scheduler.pauseJob(jobId);
      console.log(chalk.green(`✅ Job paused: ${job.name}`));
      console.log(chalk.dim('The job will not execute until resumed'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to pause job:'), error);
      process.exit(1);
    }
  });

// schedule resume
scheduleCmd
  .command('resume <job-id>')
  .description('Resume a paused job')
  .action(async (jobId) => {
    try {
      const { Scheduler } = await import('../services/scheduler/scheduler.js');
      const scheduler = new Scheduler();

      let job = scheduler.getJob(jobId);
      if (!job) {
        job = scheduler.getJobByName(jobId);
        if (job) jobId = job.id;
      }

      if (!job) {
        console.error(chalk.red(`❌ Job not found: ${jobId}`));
        process.exit(1);
      }

      scheduler.resumeJob(jobId);
      console.log(chalk.green(`✅ Job resumed: ${job.name}`));
      console.log(chalk.dim('The job will now execute according to its schedule'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to resume job:'), error);
      process.exit(1);
    }
  });

// schedule delete
scheduleCmd
  .command('delete <job-id>')
  .description('Delete a scheduled job')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (jobId, options) => {
    try {
      const { Scheduler } = await import('../services/scheduler/scheduler.js');
      const scheduler = new Scheduler();

      let job = scheduler.getJob(jobId);
      if (!job) {
        job = scheduler.getJobByName(jobId);
        if (job) jobId = job.id;
      }

      if (!job) {
        console.error(chalk.red(`❌ Job not found: ${jobId}`));
        process.exit(1);
      }

      if (!options.yes) {
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question(chalk.yellow(`⚠️  Delete job "${job.name}"? (y/N) `), resolve);
        });
        rl.close();

        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
          console.log(chalk.dim('Cancelled'));
          return;
        }
      }

      scheduler.deleteJob(jobId);
      console.log(chalk.green(`✅ Job deleted: ${job.name}`));
    } catch (error) {
      console.error(chalk.red('❌ Failed to delete job:'), error);
      process.exit(1);
    }
  });

// schedule executions
scheduleCmd
  .command('executions')
  .description('View execution history')
  .option('--job-id <id>', 'Filter by job ID or name')
  .option('--status <status>', 'Filter by status (success, failure, timeout)')
  .option('--limit <n>', 'Maximum number of executions to show', parseInt, 50)
  .action(async (options) => {
    try {
      const { Scheduler } = await import('../services/scheduler/scheduler.js');
      const scheduler = new Scheduler();

      let jobId = options.jobId;
      if (jobId) {
        let job = scheduler.getJob(jobId);
        if (!job) {
          job = scheduler.getJobByName(jobId);
          if (job) jobId = job.id;
        }
        if (!job) {
          console.error(chalk.red(`❌ Job not found: ${jobId}`));
          process.exit(1);
        }
      }

      const executions = scheduler.queryExecutions({
        jobId,
        status: options.status
      });

      const limited = executions.slice(0, options.limit);

      if (limited.length === 0) {
        console.log(chalk.yellow('No executions found'));
        return;
      }

      console.log(chalk.bold(`\n📊 Executions (showing ${limited.length} of ${executions.length})\n`));

      for (const exec of limited) {
        const statusIcon = exec.status === 'success' ? chalk.green('✅') :
                          exec.status === 'failure' ? chalk.red('❌') :
                          exec.status === 'timeout' ? chalk.yellow('⏱️') : chalk.blue('🔄');

        console.log(`${statusIcon} ${exec.jobName}`);
        console.log(`  ${chalk.dim('ID:')} ${exec.executionId}`);
        console.log(`  ${chalk.dim('Time:')} ${new Date(exec.startedAt).toLocaleString()}`);
        if (exec.duration) {
          console.log(`  ${chalk.dim('Duration:')} ${exec.duration}ms`);
        }
        if (exec.errorMessage) {
          console.log(`  ${chalk.red('Error:')} ${exec.errorMessage}`);
        }
        console.log();
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to list executions:'), error);
      process.exit(1);
    }
  });

// schedule trigger
scheduleCmd
  .command('trigger <job-id>')
  .description('Trigger a scheduled job immediately (manual run)')
  .action(async (jobId) => {
    try {
      const { Scheduler } = await import('../services/scheduler/scheduler.js');
      const scheduler = new Scheduler();

      let job = scheduler.getTask(jobId);
      if (!job) {
        job = scheduler.getTaskByName(jobId);
        if (job) jobId = job.id;
      }

      if (!job) {
        console.error(chalk.red(`❌ Job not found: ${jobId}`));
        process.exit(1);
      }

      console.log(chalk.blue(`🚀 Triggering job: ${job.name}...`));
      
      const result = await scheduler.runTaskNow(jobId);
      
      const statusIcon = result.status === 'success' ? chalk.green('✅') : chalk.red('❌');
      const duration = result.duration ? `${result.duration}ms` : 'N/A';
      
      console.log(`${statusIcon} Manual execution completed`);
      console.log(`  ${chalk.dim('ID:')} ${result.executionId}`);
      console.log(`  ${chalk.dim('Status:')} ${result.status}`);
      console.log(`  ${chalk.dim('Duration:')} ${duration}`);
      
      if (result.result) {
        console.log(chalk.bold('\nResult:'));
        console.log(result.result);
      }
      
      if (result.error) {
        console.log(chalk.bold('\nError:'));
        console.log(chalk.red(result.error));
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Trigger failed:'), error);
      process.exit(1);
    }
  });

// schedule cleanup
scheduleCmd
  .command('cleanup')
  .description('Clean up old execution records')
  .option('--max-age <days>', 'Delete executions older than N days', parseInt, 30)
  .option('--max-per-job <n>', 'Keep only N recent executions per job', parseInt, 100)
  .action(async (options) => {
    try {
      const { Scheduler } = await import('../services/scheduler/scheduler.js');
      const scheduler = new Scheduler();

      console.log(chalk.blue('🗑️  Cleaning up old executions...'));

      await scheduler.cleanupOldExecutions(options.maxAge, options.maxPerJob);

      console.log(chalk.green('✅ Cleanup completed'));
      console.log(chalk.dim(`Deleted executions older than ${options.maxAge} days`));
      console.log(chalk.dim(`Kept ${options.maxPerJob} most recent executions per job`));
    } catch (error) {
      console.error(chalk.red('❌ Cleanup failed:'), error);
      process.exit(1);
    }
  });

// schedule sync
scheduleCmd
  .command('sync')
  .description('Sync scheduled jobs with system cron/Task Scheduler')
  .action(async () => {
    try {
      const { Scheduler } = await import('../services/scheduler/scheduler.js');
      const scheduler = new Scheduler();

      console.log(chalk.blue('🔄 Syncing scheduled jobs with system scheduler...'));

      const result = scheduler.syncWithScheduler();

      console.log(chalk.green('\n✅ Sync completed'));
      console.log(chalk.dim(`  Timings added to cron: ${result.added}`));
      console.log(chalk.dim(`  Timings removed from cron: ${result.removed}`));

      if (result.errors.length > 0) {
        console.log(chalk.yellow(`\n⚠️  Errors (${result.errors.length}):`));
        result.errors.forEach(err => console.log(chalk.yellow(`  • ${err}`)));
      }

      if (result.added > 0 || result.removed > 0) {
        console.log(chalk.dim('\n💡 Your scheduled jobs will now execute at their scheduled times'));
      } else {
        console.log(chalk.dim('\n✓ All timings are already synced with cron'));
      }
    } catch (error) {
      console.error(chalk.red('❌ Sync failed:'), error);
      process.exit(1);
    }
  });

// schedule catchup
scheduleCmd
  .command('catchup')
  .description('Execute missed scheduled tasks (tasks with catchupMissed=true that should have run while system was off)')
  .action(async () => {
    try {
      const { Scheduler } = await import('../services/scheduler/scheduler.js');
      const scheduler = new Scheduler();

      console.log(chalk.blue('🔄 Checking for missed task executions...\n'));

      const result = await scheduler.catchupMissedExecutions();

      console.log(chalk.green('✅ Catchup completed\n'));
      console.log(chalk.dim(`  Tasks executed: ${result.executed}`));
      console.log(chalk.dim(`  Tasks skipped: ${result.skipped}`));
      if (result.failed > 0) {
        console.log(chalk.yellow(`  Tasks failed: ${result.failed}`));
      }

      if (result.errors.length > 0) {
        console.log(chalk.yellow(`\n⚠️  Errors (${result.errors.length}):`));
        result.errors.forEach(err => console.log(chalk.yellow(`  • ${err}`)));
      }

      if (result.executed > 0) {
        console.log(chalk.dim('\n💡 View execution results with: ncp schedule executions'));
      } else if (result.skipped > 0) {
        console.log(chalk.dim('\n✓ No missed executions detected'));
      }
    } catch (error) {
      console.error(chalk.red('❌ Catchup failed:'), error);
      process.exit(1);
    }
  });

// Scheduler: Execute scheduled job (called by cron)
const executeScheduledCmd = program
  .command('_job-run <job-id>')
  .description('Execute a scheduled job (internal use - called by cron)')
  .option('--timeout <ms>', 'Execution timeout in milliseconds', '300000')
  .action(async (jobId, options) => {
    console.log('[DEBUG] _job-run action called with jobId:', jobId);
    try {
      console.log('[DEBUG] Importing JobExecutor...');
      const { JobExecutor } = await import('../services/scheduler/job-executor.js');
      console.log('[DEBUG] Creating JobExecutor instance...');
      const executor = new JobExecutor();
      console.log('[DEBUG] JobExecutor instance created');

      const timeout = parseInt(options.timeout);
      const result = await executor.executeJob(jobId, timeout);

      if (result.status === 'success') {
        console.log(`✅ Job ${jobId} executed successfully (${result.duration}ms)`);
        process.exit(0);
      } else {
        console.error(`❌ Job ${jobId} failed: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Execution failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });
(executeScheduledCmd as any).hidden = true;

// Scheduler V2: Execute timing group (called by OS scheduler)
const executeTimingCmd = program
  .command('_timing-run <timing-id>')
  .description('Execute all active tasks for a timing group (internal use - called by OS scheduler)')
  .option('--timeout <ms>', 'Execution timeout in milliseconds per task', '300000')
  .action(async (timingId, options) => {
    try {
      const { TimingExecutor } = await import('../services/scheduler/timing-executor.js');
      const executor = new TimingExecutor();

      const timeout = parseInt(options.timeout);
      const result = await executor.executeTimingGroup(timingId, timeout);

      console.log(`Timing ${timingId} execution summary:`);
      console.log(`  Total tasks: ${result.totalTasks}`);
      console.log(`  Active tasks: ${result.activeTasks}`);
      console.log(`  Executed: ${result.executedTasks}`);
      console.log(`  Successful: ${result.successfulTasks}`);
      console.log(`  Failed: ${result.failedTasks}`);
      console.log(`  Skipped: ${result.skippedTasks}`);
      console.log(`  Duration: ${result.totalDuration}ms`);

      // Exit with success if at least one task succeeded, or if there were no tasks to run
      if (result.successfulTasks > 0 || result.executedTasks === 0) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Timing execution failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });
(executeTimingCmd as any).hidden = true;

// Scheduler V2: Execute single task in isolated process (called by timing executor)
const executeTaskCmd = program
  .command('_task-execute <task-id>')
  .description('Execute a single task (internal use - called by timing executor in child process)')
  .option('--timeout <ms>', 'Execution timeout in milliseconds', '300000')
  .action(async (taskId, options) => {
    try {
      const { TaskManager } = await import('../services/scheduler/task-manager.js');
      const { ExecutionRecorder } = await import('../services/scheduler/execution-recorder.js');
      const { v4: uuidv4 } = await import('uuid');

      const taskManager = new TaskManager();
      const executionRecorder = new ExecutionRecorder();

      // Load task
      const task = taskManager.getTask(taskId);
      if (!task) {
        console.error(`Task ${taskId} not found`);
        process.exit(1);
      }

      // Check if task is active
      if (task.status !== 'active') {
        console.log(`Task ${task.name} is not active (status: ${task.status}), skipping`);
        process.exit(0); // Exit successfully but don't execute
      }

      const executionId = uuidv4();
      const timeout = parseInt(options.timeout);

      // Start execution recording
      executionRecorder.startExecution({
        executionId,
        jobId: task.id,
        jobName: task.name,
        tool: task.tool,
        parameters: task.parameters,
        startedAt: new Date().toISOString(),
        status: 'running'
      });

      console.log(`Executing task: ${task.name}`);
      console.log(`Tool: ${task.tool}`);
      console.log(`Parameters: ${JSON.stringify(task.parameters)}`);

      const startTime = Date.now();

      // Change to home directory for global MCP access
      const { homedir } = await import('os');
      process.chdir(homedir());

      // Execute tool using orchestrator
      const { NCPOrchestrator } = await import('../orchestrator/ncp-orchestrator.js');
      const mcpName = task.tool.includes(':') ? task.tool.split(':')[0] : null;
      const orchestrator = new NCPOrchestrator(mcpName || 'all', true);

      await orchestrator.initialize();
      await orchestrator.waitForInitialization();

      const execResult = await Promise.race([
        orchestrator.run(task.tool, task.parameters),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
        )
      ]);

      await orchestrator.cleanup();

      const duration = Date.now() - startTime;

      if (!(execResult as any).success) {
        throw new Error((execResult as any).error || 'Tool execution failed');
      }

      // Record successful execution
      executionRecorder.completeExecution(executionId, 'success', (execResult as any).content);
      taskManager.recordExecution(taskId, executionId, new Date().toISOString());

      console.log(`✅ Task completed successfully (${duration}ms)`);
      process.exit(0);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Task execution failed: ${errorMessage}`);
      process.exit(1);
    }
  });
(executeTaskCmd as any).hidden = true;

// Scheduler: Cleanup old execution records (internal - hidden from help)
const cleanupRunsCmd = program
  .command('cleanup-runs')
  .description('Clean up old execution records (internal use - called by automatic cleanup)')
  .option('--max-age <days>', 'Maximum age in days for execution records', '14')
  .option('--max-count <count>', 'Maximum number of executions to keep per job', '100')
  .action(async (options) => {
    try {
      const { ExecutionRecorder } = await import('../services/scheduler/execution-recorder.js');
      const recorder = new ExecutionRecorder();

      const maxAgeDays = parseInt(options.maxAge);
      const maxExecutionsPerJob = parseInt(options.maxCount);

      const result = recorder.cleanupOldExecutions(maxAgeDays, maxExecutionsPerJob);

      if (result.errors.length === 0) {
        console.log(`✅ Cleanup complete: deleted ${result.deletedCount} old execution records`);
        process.exit(0);
      } else {
        console.log(`⚠️  Cleanup completed with warnings: deleted ${result.deletedCount} records, ${result.errors.length} errors`);
        result.errors.forEach(err => console.error(`   - ${err}`));
        process.exit(0); // Still exit 0 since cleanup partially succeeded
      }
    } catch (error) {
      console.error(`❌ Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });
(cleanupRunsCmd as any).hidden = true;

const formatCredentialTimestamp = (value?: number | string): string => {
  if (value === undefined || value === null) {
    return 'unknown';
  }
  const epochValue = typeof value === 'number' ? value : Date.parse(value);
  if (Number.isNaN(epochValue)) {
    return 'unknown';
  }
  return new Date(epochValue).toLocaleString();
};

type CredentialTableRow = {
  source: string;
  mcpName: string;
  type: string;
  updated: string;
  backend: string;
  notes?: string;
};

const printCredentialTable = (rows: CredentialTableRow[]): void => {
  if (rows.length === 0) {
    console.log('ℹ️  No stored credentials found');
    return;
  }

  const headers = ['Source', 'MCP', 'Type', 'Updated', 'Backend', 'Notes'];
  const data = rows.map(row => [
    row.source,
    row.mcpName,
    row.type,
    row.updated,
    row.backend,
    row.notes || ''
  ]);

  const columnWidths = headers.map((header, index) =>
    Math.max(header.length, ...data.map(values => values[index].length))
  );

  const formatRow = (values: string[]) =>
    values.map((val, index) => val.padEnd(columnWidths[index])).join('  ');

  console.log(formatRow(headers));
  console.log(columnWidths.map(width => '-'.repeat(width)).join('  '));
  data.forEach(values => console.log(formatRow(values)));
};

async function listStoredCredentials(options: { mcpFilter?: string; json?: boolean; table?: boolean } = {}): Promise<void> {
  const { mcpFilter, json, table } = options;

  try {
    const { getSecureCredentialStore } = await import('../auth/secure-credential-store.js');
    const { CredentialVault } = await import('../code-mode/bindings-manager.js');

    const credentialStore = getSecureCredentialStore();
    const vault = CredentialVault.getInstance();

    const [storedCredentials, vaultCredentialsRaw] = await Promise.all([
      credentialStore.listCredentials(mcpFilter),
      vault.list()
    ]);

    const vaultCredentials = vaultCredentialsRaw
      .filter((cred) => !mcpFilter || cred.mcpName === mcpFilter)
      .sort((a, b) => a.mcpName.localeCompare(b.mcpName));

    const payload = {
      secureStore: storedCredentials,
      vault: vaultCredentials
    };

    const total = storedCredentials.length + vaultCredentials.length;

    if (json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    if (total === 0) {
      console.log('ℹ️  No stored credentials found');
      return;
    }

    if (table) {
      const storageMethod = credentialStore.getStorageMethod();
      const tableRows: CredentialTableRow[] = [
        ...storedCredentials.map(cred => ({
          source: 'Secure store',
          mcpName: cred.mcpName,
          type: cred.type,
          updated: formatCredentialTimestamp(cred.updatedAt),
          backend: storageMethod,
          notes: cred.description || ''
        })),
        ...vaultCredentials.map(cred => ({
          source: 'Code-mode vault',
          mcpName: cred.mcpName,
          type: cred.type,
          updated: formatCredentialTimestamp(cred.updatedAt),
          backend: 'vault (AES-256)'
        }))
      ];
      printCredentialTable(tableRows);
      console.log('\n💡 Tip: use --json for automation-friendly output.');
      return;
    }

    if (storedCredentials.length > 0) {
      console.log(`\n🔐 Secure Credential Store (${storedCredentials.length})\n`);
      console.log(chalk.dim('Storage method: ') + chalk.cyan(credentialStore.getStorageMethod()));
      console.log('');

      for (const cred of storedCredentials) {
        console.log(chalk.bold(`${cred.mcpName}`) + chalk.dim(` (${cred.type})`));
        if (cred.description) {
          console.log(chalk.dim(`   ${cred.description}`));
        }
        console.log(chalk.dim(`   Updated: ${formatCredentialTimestamp(cred.updatedAt)}`));
        console.log('');
      }

      const storageMethod = credentialStore.getStorageMethod();
      console.log(chalk.dim('💡 Secure store management:'));
      if (storageMethod === 'keychain') {
        if (process.platform === 'darwin') {
          console.log(chalk.dim('   • Open Keychain Access and search for "@portel/ncp"'));
        } else if (process.platform === 'win32') {
          console.log(chalk.dim('   • Open Windows Credential Manager'));
        } else {
          console.log(chalk.dim('   • Use your system\'s credential manager'));
        }
      } else {
        console.log(chalk.dim('   • Encrypted files stored under ~/.ncp/credentials'));
      }
      console.log('');
    }

    if (vaultCredentials.length > 0) {
      console.log(`\n🔐 Code-Mode Credential Vault (${vaultCredentials.length})\n`);
      console.log(chalk.dim('Storage: ') + chalk.cyan('~/.ncp/credentials/vault.json (AES-256 encrypted)'));
      console.log('');

      for (const cred of vaultCredentials) {
        console.log(chalk.bold(`${cred.mcpName}`) + chalk.dim(` (${cred.type})`));
        console.log(chalk.dim(`   Updated: ${formatCredentialTimestamp(cred.updatedAt)}`));
      }

      console.log('');
      console.log(chalk.dim('💡 Vault management:'));
      console.log(chalk.dim(`   • Run ${chalk.cyan('ncp credentials remove <mcp> --vault-only')} to revoke a single binding.`));
      console.log(chalk.dim('   • Delete ~/.ncp/credentials/vault.json to wipe the entire vault (NCP recreates it automatically).'));
      console.log('');
    }
  } catch (error) {
    console.error(`❌ Failed to list credentials: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

async function removeStoredCredentials(mcpName: string, options: { vaultOnly?: boolean; storeOnly?: boolean }): Promise<void> {
  if (options.vaultOnly && options.storeOnly) {
    console.error('❌ --vault-only and --store-only cannot be used together');
    process.exit(1);
  }

  const removeStore = options.storeOnly ? true : !options.vaultOnly;
  const removeVault = options.vaultOnly ? true : !options.storeOnly;

  try {
    const { getSecureCredentialStore } = await import('../auth/secure-credential-store.js');
    const { CredentialVault } = await import('../code-mode/bindings-manager.js');

    const credentialStore = getSecureCredentialStore();
    const vault = CredentialVault.getInstance();

    let storeRemoved = 0;
    let storeFailed = 0;

    if (removeStore) {
      const entries = await credentialStore.listCredentials(mcpName);
      for (const entry of entries) {
        const deleted = await credentialStore.deleteCredential(mcpName, entry.type as CredentialType);
        if (deleted) {
          storeRemoved++;
        } else {
          storeFailed++;
        }
      }
    }

    let vaultRemoved = 0;
    if (removeVault) {
      const removed = await vault.remove(mcpName);
      vaultRemoved = removed ? 1 : 0;
    }

    if (storeRemoved === 0 && storeFailed === 0 && vaultRemoved === 0) {
      console.log(chalk.yellow(`⚠️  No credentials found for ${mcpName}`));
      return;
    }

    if (storeRemoved > 0) {
      console.log(chalk.green(`✅ Removed ${storeRemoved} entr${storeRemoved === 1 ? 'y' : 'ies'} from secure credential store`));
    }
    if (storeFailed > 0) {
      console.log(chalk.red(`⚠️  Failed to delete ${storeFailed} entr${storeFailed === 1 ? 'y' : 'ies'} from secure credential store`));
    }
    if (vaultRemoved > 0) {
      console.log(chalk.green('✅ Removed Code-Mode vault credential'));
    } else if (removeVault) {
      console.log(chalk.dim('ℹ️  No Code-Mode vault credential found'));
    }

    console.log(chalk.dim('💡 Tip: run ') + chalk.cyan('ncp credentials list') + chalk.dim(' to verify remaining entries.'));
  } catch (error) {
    console.error(`❌ Failed to remove credentials: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

const credentialsCmd = program
  .command('credentials')
  .description('Manage stored credentials')
  .usage('[options] [command]')
  .option('--mcp <name>', 'Filter by MCP name')
  .option('--json', 'Output credentials as JSON')
  .option('--table', 'Display credentials in a formatted table')
  .action(async (options) => {
    await listStoredCredentials({ mcpFilter: options.mcp, json: options.json, table: options.table });
  });

credentialsCmd
  .command('list')
  .description('List stored credentials')
  .option('--mcp <name>', 'Filter by MCP name')
  .option('--json', 'Output credentials as JSON')
  .option('--table', 'Display credentials in a formatted table')
  .action(async (options) => {
    await listStoredCredentials({ mcpFilter: options.mcp, json: options.json, table: options.table });
  });

credentialsCmd
  .command('remove <mcpName>')
  .description('Remove stored credentials for an MCP')
  .option('--vault-only', 'Remove only Code-Mode vault credentials')
  .option('--store-only', 'Remove only secure credential store entries')
  .action(async (mcpName, options) => {
    await removeStoredCredentials(mcpName, options);
  });

// Doctor: Comprehensive diagnostics and repair
program
  .command('doctor [mcp]')
  .description('Diagnose issues and repair failed MCPs')
  .option('--fix', 'Automatically fix issues without prompting')
  .option('--profile <name>', 'Profile to check (default: all)')
  .action(async (mcpName, options) => {
    try {
      // Set branded terminal title
      const targetProfile = options.profile || 'all';
      setNCPTitle('Doctor', targetProfile);

      const { spinner } = await import('../utils/progress-spinner.js');
      console.log(chalk.bold.white('\n🩺 NCP Doctor - System Diagnostics & Repair\n'));

      let systemIssuesFound = 0;
      let systemIssuesFixed = 0;
      const systemIssues: string[] = [];

      // 1. Check Node.js version
      spinner.start('Checking system health...');
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
      if (majorVersion < 18) {
        systemIssues.push(`Node.js ${nodeVersion} is too old (minimum: v18)`);
        systemIssuesFound++;
      }

      // 2. Check config directory and profiles
      spinner.updateMessage('Checking configuration...');
      const manager = new ProfileManager();
      await manager.initialize(true);

      const configDir = manager.getConfigPath();
      if (!existsSync(configDir)) {
        if (options.fix) {
          await fs.mkdir(configDir, { recursive: true });
          systemIssuesFixed++;
        } else {
          systemIssues.push('No config directory found');
          systemIssuesFound++;
        }
      } else {
        const profiles = manager.listProfiles();
        if (profiles.length === 0) {
          systemIssues.push('No profiles found');
          systemIssuesFound++;
        } else {
          // Validate profile JSON structure
          const { readFileSync } = await import('fs');
          for (const profileName of profiles) {
            try {
              const profilePath = manager.getProfilePath(profileName);
              const content = readFileSync(profilePath, 'utf-8');
              JSON.parse(content); // Validate JSON
            } catch (error) {
              systemIssues.push(`Invalid JSON in profile "${profileName}"`);
              systemIssuesFound++;
            }
          }
        }
      }

      // 3. Check credentials storage (silently - no issues to report)
      spinner.updateMessage('Checking credentials...');
      const { getSecureCredentialStore } = await import('../auth/secure-credential-store.js');
      const credentialStore = getSecureCredentialStore();
      const storageMethod = credentialStore.getStorageMethod();
      if (storageMethod !== 'keychain') {
        // This is a warning, not a blocking issue - skip it
      }

      // 4. Check MCP health
      // Default to 'all' profile (universal profile containing all MCPs)
      // This is the source of truth - fix once here, copy to other profiles as needed
      spinner.updateMessage(`Checking MCP servers in "${targetProfile}" profile...`);

      const profileMCPs = await manager.getProfileMCPs(targetProfile);
      const { healthMonitor } = await import('../utils/health-monitor.js');

      // Collect MCPs to check from the target profile
      const mcpsToCheck: Array<{name: string; command: string; args?: string[]; env?: Record<string, string>}> = [];

      if (profileMCPs && Object.keys(profileMCPs).length > 0) {
        for (const [name, config] of Object.entries(profileMCPs)) {
          // If specific MCP requested, only check that one
          if (mcpName && name !== mcpName) continue;

          // Skip HTTP MCPs for now (they need different health check)
          if (config.url) continue;

          if (config.command) {
            mcpsToCheck.push({
              name,
              command: config.command,
              args: config.args,
              env: config.env
            });
          }
        }
      }

      const mcpFailures: Array<{name: string; error: string}> = [];
      const mcpDisabled: Array<{name: string; reason: string}> = [];
      let healthyCount = 0;

      if (mcpsToCheck.length > 0) {
        // Check MCPs with spinner progress
        let checked = 0;
        for (const mcp of mcpsToCheck) {
          checked++;
          spinner.updateMessage(`Checking MCP servers (${checked}/${mcpsToCheck.length})...`);

          const health = await healthMonitor.checkMCPHealth(
            mcp.name,
            mcp.command,
            mcp.args,
            mcp.env
          );

          if (health.status === 'healthy') {
            healthyCount++;
          } else if (health.status === 'unhealthy') {
            mcpFailures.push({name: mcp.name, error: health.lastError || 'Unknown error'});
            systemIssuesFound++;
          } else if (health.status === 'disabled') {
            mcpDisabled.push({name: mcp.name, reason: health.disabledReason || 'Unknown reason'});
            systemIssuesFound++;

            if (options.fix) {
              // Reset error count to re-enable
              health.errorCount = 0;
              health.status = 'unknown';
              delete health.disabledReason;
              systemIssuesFixed++;
            }
          }
        }
      }

      // Show summary (always, even if no MCPs configured)
      spinner.stop();
      console.log(chalk.green(`✅ System check complete\n`));

      // Show statistics
      console.log(chalk.cyan('📊 Summary:'));
      console.log(chalk.dim(`   • Profile: ${targetProfile}`));

      if (mcpsToCheck.length === 0) {
        console.log(chalk.dim(`   ℹ️  No MCPs configured in "${targetProfile}" profile`));
      } else {
        console.log(chalk.dim(`   • ${healthyCount} healthy MCPs`));
        if (mcpFailures.length > 0) {
          console.log(chalk.red(`   • ${mcpFailures.length} failed MCPs`));
        }
        if (mcpDisabled.length > 0) {
          console.log(chalk.yellow(`   • ${mcpDisabled.length} disabled MCPs`));
        }
      }

      if (systemIssues.length > 0) {
        console.log(chalk.yellow(`   • ${systemIssues.length} system issues`));
      }

      // Show failures
      if (mcpFailures.length > 0) {
        console.log(chalk.red('\n❌ Failed MCPs:'));
        for (const failure of mcpFailures) {
          console.log(chalk.cyan(`   📦 ${failure.name}`));
          console.log(chalk.dim(`      ${failure.error}`));
        }
      }

      // Show disabled
      if (mcpDisabled.length > 0) {
        console.log(chalk.yellow('\n⚠️  Disabled MCPs:'));
        for (const disabled of mcpDisabled) {
          console.log(chalk.cyan(`   📦 ${disabled.name}`));
          console.log(chalk.dim(`      ${disabled.reason}`));
          if (!options.fix) {
            console.log(chalk.dim(`      💡 Run with --fix to re-enable`));
          }
        }
      }

      // Show system issues
      if (systemIssues.length > 0) {
        console.log(chalk.yellow('\n⚠️  System Issues:'));
        for (const issue of systemIssues) {
          console.log(chalk.dim(`   • ${issue}`));
        }
      }

      // Show helpful tip about the "all" profile
      if (targetProfile === 'all' && (mcpFailures.length > 0 || mcpDisabled.length > 0)) {
        console.log(chalk.cyan('\n💡 Tip:'));
        console.log(chalk.dim('   The "all" profile is your source of truth - fix MCPs here once,'));
        console.log(chalk.dim('   then copy working configurations to other profiles as needed.'));
      }

      // Exit with error code if there are issues
      const totalIssues = systemIssuesFound;
      process.exit(totalIssues > 0 ? 1 : 0);
    } catch (error) {
      console.error(`❌ Diagnostics failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

// ====================================
// Photon Marketplace Commands
// ====================================

const photonCmd = program
  .command('photon')
  .description('Manage Photon marketplaces and installations')
  .action(() => {
    console.log(chalk.cyan('\n📦 Photon Marketplace Commands:\n'));
    console.log('  photon marketplace list              List all configured marketplaces');
    console.log('  photon marketplace add <source>      Add a new marketplace');
    console.log('  photon marketplace remove <name>     Remove a marketplace');
    console.log('  photon marketplace update [name]     Update marketplace cache');
    console.log('  photon search <query>                Search for Photons');
    console.log('  photon add <name>                    Add a Photon');
    console.log('  photon list                          List installed Photons');
    console.log(chalk.dim('\nExamples:'));
    console.log(chalk.dim('  ncp photon marketplace add username/repo'));
    console.log(chalk.dim('  ncp photon search calculator'));
    console.log(chalk.dim('  ncp photon add calculator\n'));
  });

photonCmd
  .command('marketplace [action] [source]')
  .description('Manage Photon marketplaces')
  .action(async (action?: string, source?: string) => {
    const { PhotonMarketplaceClient } = await import('../services/photon-marketplace-client.js');
    const client = new PhotonMarketplaceClient();
    await client.initialize();

    if (!action || action === 'list') {
      // List all marketplaces
      const marketplaces = client.getAll();

      if (marketplaces.length === 0) {
        console.log(chalk.yellow('No marketplaces configured'));
        return;
      }

      console.log(chalk.cyan('\n📦 Photon Marketplaces:\n'));
      for (const marketplace of marketplaces) {
        const status = marketplace.enabled ? chalk.green('✓') : chalk.red('✗');
        const official = marketplace.name === 'photons' ? chalk.blue(' (official)') : '';
        console.log(`${status} ${chalk.bold(marketplace.name)}${official}`);
        console.log(chalk.dim(`   Source: ${marketplace.source}`));
        console.log(chalk.dim(`   Type: ${marketplace.sourceType}`));
        if (marketplace.lastUpdated) {
          console.log(chalk.dim(`   Updated: ${new Date(marketplace.lastUpdated).toLocaleString()}`));
        }
        console.log();
      }

      // Show counts
      const counts = await client.getMarketplaceCounts();
      console.log(chalk.cyan('Photon counts per marketplace:'));
      for (const [name, count] of counts.entries()) {
        console.log(chalk.dim(`   ${name}: ${count} Photons`));
      }
    } else if (action === 'add') {
      if (!source) {
        console.error(chalk.red('Error: Please provide a marketplace source'));
        console.log(chalk.dim('\nExamples:'));
        console.log(chalk.dim('  ncp photon marketplace add username/repo'));
        console.log(chalk.dim('  ncp photon marketplace add https://github.com/username/repo'));
        console.log(chalk.dim('  ncp photon marketplace add ./local/path'));
        process.exit(1);
      }

      try {
        const result = await client.add(source);

        if (!result.added) {
          console.log(chalk.yellow(`Marketplace already exists: ${result.marketplace.name}`));
        } else {
          console.log(chalk.green(`✅ Added marketplace: ${result.marketplace.name}`));
          console.log(chalk.dim(`   Source: ${result.marketplace.source}`));

          // Update cache
          console.log(chalk.dim('\nUpdating marketplace cache...'));
          const success = await client.updateMarketplaceCache(result.marketplace.name);
          if (success) {
            console.log(chalk.green('✅ Cache updated'));
          } else {
            console.log(chalk.yellow('⚠️  Could not fetch marketplace manifest'));
          }
        }
      } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    } else if (action === 'remove') {
      if (!source) {
        console.error(chalk.red('Error: Please provide a marketplace name'));
        process.exit(1);
      }

      try {
        const success = await client.remove(source);
        if (success) {
          console.log(chalk.green(`✅ Removed marketplace: ${source}`));
        } else {
          console.error(chalk.red(`Marketplace not found: ${source}`));
          process.exit(1);
        }
      } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    } else if (action === 'update') {
      if (source) {
        // Update specific marketplace
        console.log(chalk.dim(`Updating marketplace: ${source}...`));
        const success = await client.updateMarketplaceCache(source);
        if (success) {
          console.log(chalk.green(`✅ Updated ${source}`));
        } else {
          console.error(chalk.red(`Failed to update ${source}`));
          process.exit(1);
        }
      } else {
        // Update all marketplaces
        console.log(chalk.dim('Updating all marketplaces...'));
        const results = await client.updateAllCaches();

        let successCount = 0;
        let failCount = 0;

        for (const [name, success] of results.entries()) {
          if (success) {
            console.log(chalk.green(`✅ ${name}`));
            successCount++;
          } else {
            console.log(chalk.red(`✗ ${name}`));
            failCount++;
          }
        }

        console.log(chalk.cyan(`\nUpdated ${successCount} marketplace(s)`));
        if (failCount > 0) {
          console.log(chalk.yellow(`Failed to update ${failCount} marketplace(s)`));
        }
      }
    } else {
      console.error(chalk.red(`Unknown action: ${action}`));
      console.log(chalk.dim('Valid actions: list, add, remove, update'));
      process.exit(1);
    }
  });

photonCmd
  .command('search <query>')
  .description('Search for Photons in all marketplaces')
  .action(async (query: string) => {
    const { PhotonMarketplaceClient } = await import('../services/photon-marketplace-client.js');
    const client = new PhotonMarketplaceClient();
    await client.initialize();
    await client.autoUpdateStaleCaches();

    const results = await client.search(query);

    if (results.size === 0) {
      console.log(chalk.yellow(`No Photons found matching "${query}"`));
      return;
    }

    console.log(chalk.cyan(`\n🔍 Found ${results.size} Photon(s):\n`));

    for (const [name, sources] of results.entries()) {
      const source = sources[0];
      const metadata = source.metadata;

      console.log(chalk.bold(name));
      if (metadata?.description) {
        console.log(chalk.dim(`   ${metadata.description}`));
      }
      if (metadata?.version) {
        console.log(chalk.dim(`   Version: ${metadata.version}`));
      }
      console.log(chalk.dim(`   Marketplace: ${source.marketplace.name}`));
      if (metadata?.tags && metadata.tags.length > 0) {
        console.log(chalk.dim(`   Tags: ${metadata.tags.join(', ')}`));
      }
      console.log();
    }

    console.log(chalk.dim(`💡 Add with: ncp photon add <name>`));
  });

photonCmd
  .command('add <name>')
  .description('Add a Photon from marketplace')
  .option('-m, --marketplace <name>', 'Specific marketplace to add from')
  .action(async (name: string, options: { marketplace?: string }) => {
    const { PhotonMarketplaceClient } = await import('../services/photon-marketplace-client.js');
    const path = await import('path');
    const os = await import('os');
    const fs = await import('fs/promises');

    const client = new PhotonMarketplaceClient();
    await client.initialize();

    try {
      // Fetch the Photon
      const result = await client.fetchMCP(name);

      if (!result) {
        console.error(chalk.red(`Photon not found: ${name}`));
        console.log(chalk.dim('\n💡 Try searching first: ncp photon search <query>'));
        process.exit(1);
      }

      // Check if specific marketplace requested
      if (options.marketplace && result.marketplace.name !== options.marketplace) {
        console.error(chalk.red(`Photon "${name}" not found in marketplace "${options.marketplace}"`));
        process.exit(1);
      }

      // Add to ~/.ncp/photons/
      const photonDir = path.join(getNcpBaseDirectory(), 'photons');
      await fs.mkdir(photonDir, { recursive: true });

      const fileName = `${name}.photon.ts`;
      const destPath = path.join(photonDir, fileName);

      // Write the Photon file
      await fs.writeFile(destPath, result.content, 'utf-8');

      console.log(chalk.green(`\n✅ Added Photon: ${name}`));
      console.log(chalk.dim(`   Marketplace: ${result.marketplace.name}`));
      if (result.metadata?.version) {
        console.log(chalk.dim(`   Version: ${result.metadata.version}`));
      }
      console.log(chalk.dim(`   Location: ${destPath}`));

      // Save installation metadata
      if (result.metadata) {
        const { calculateHash } = await import('../services/photon-marketplace-client.js');
        const contentHash = calculateHash(result.content);
        await client.savePhotonMetadata(fileName, result.marketplace, result.metadata, contentHash);
      }

      console.log(chalk.blue(`\n${UIMessages.photonUsage(name)}`));
    } catch (error: any) {
      console.error(chalk.red(`Failed to add Photon: ${error.message}`));
      process.exit(1);
    }
  });

photonCmd
  .command('list')
  .description('List installed Photons')
  .action(async () => {
    const path = await import('path');
    const os = await import('os');
    const fs = await import('fs/promises');
    const { existsSync } = await import('fs');

    const photonDir = path.join(getNcpBaseDirectory(), 'photons');

    if (!existsSync(photonDir)) {
      console.log(chalk.yellow('No Photons installed'));
      console.log(chalk.dim('\n💡 Add Photons with: ncp photon add <name>'));
      return;
    }

    try {
      const files = await fs.readdir(photonDir);
      const photonFiles = files.filter(f => f.endsWith('.photon.ts'));

      if (photonFiles.length === 0) {
        console.log(chalk.yellow('No Photons installed'));
        return;
      }

      console.log(chalk.cyan(`\n📦 Installed Photons (${photonFiles.length}):\n`));

      const { PhotonMarketplaceClient } = await import('../services/photon-marketplace-client.js');
      const client = new PhotonMarketplaceClient();
      await client.initialize();

      for (const file of photonFiles) {
        const name = file.replace('.photon.ts', '');
        console.log(chalk.bold(name));

        // Try to get installation metadata
        const metadata = await client.getPhotonInstallMetadata(file);
        if (metadata) {
          console.log(chalk.dim(`   Marketplace: ${metadata.marketplace}`));
          console.log(chalk.dim(`   Version: ${metadata.version}`));
          console.log(chalk.dim(`   Installed: ${new Date(metadata.installedAt).toLocaleString()}`));

          // Check if modified
          const filePath = path.join(photonDir, file);
          const isModified = await client.isPhotonModified(filePath, file);
          if (isModified) {
            console.log(chalk.yellow('   ⚠️  Modified since installation'));
          }
        }
        console.log();
      }
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== SKILLS COMMANDS ==========

const skillsCmd = program
  .command('skills')
  .description('Manage Anthropic Agent Skills')
  .action(() => {
    console.log(chalk.bold('\n📚 NCP Skills Commands\n'));
    console.log('Install and manage Anthropic Agent Skills\n');
    console.log(chalk.cyan('Installed Skills:'));
    console.log(chalk.cyan('  ncp skills list') + '                      List installed skills');
    console.log(chalk.cyan('  ncp skills remove <name>') + '             Remove an installed skill');
    console.log();
    console.log(chalk.cyan('Skills Marketplace:'));
    console.log(chalk.cyan('  ncp skills marketplace list') + '           List configured marketplaces');
    console.log(chalk.cyan('  ncp skills marketplace add <source>') + '    Add a new marketplace');
    console.log(chalk.cyan('  ncp skills marketplace remove <name>') + '  Remove a marketplace');
    console.log(chalk.cyan('  ncp skills search [query]') + '             Search skills in marketplaces');
    console.log(chalk.cyan('  ncp skills add <name>') + '                 Add a skill from marketplace');
    console.log();
  });

skillsCmd
  .command('list')
  .description('List installed Anthropic Agent Skills')
  .action(async () => {
    const { SkillsManager } = await import('../services/skills-manager.js');
    const manager = new SkillsManager();
    await manager.initialize();
    await manager.loadAllSkills();

    const skills = manager.listSkills();

    if (skills.length === 0) {
      console.log(chalk.yellow('\n⚠️  No skills installed'));
      console.log(chalk.dim('   Add skills using: ncp skills add <skill-name>'));
      console.log(chalk.dim('   Example: ncp skills add canvas-design'));
      return;
    }

    console.log(chalk.bold(`\n📚 Installed Skills (${skills.length})\n`));

    for (const skill of skills) {
      console.log(chalk.cyan(`${skill.name}`));
      console.log(chalk.white(`   ${skill.description || '(no description)'}`));
      if (skill.plugin) {
        console.log(chalk.dim(`   Plugin: ${skill.plugin}`));
      }
      console.log();
    }

    console.log(chalk.dim('💡 Skills are loaded as context for Code-Mode, not as executable tools'));
  });

skillsCmd
  .command('remove <name>')
  .description('Remove an installed skill')
  .action(async (skillName: string) => {
    try {
      const { SkillsManager } = await import('../services/skills-manager.js');
      const manager = new SkillsManager();
      await manager.initialize();
      await manager.loadAllSkills();

      await manager.removeSkill(skillName);

      console.log(chalk.green(`\n✅ Removed skill: ${skillName}`));
      console.log(chalk.yellow('⚠️  Restart NCP for changes to take effect'));
    } catch (error: any) {
      console.error(chalk.red(`Failed to remove skill: ${error.message}`));
      process.exit(1);
    }
  });

// ========== SKILLS MARKETPLACE COMMANDS ==========

skillsCmd
  .command('marketplace [action] [source]')
  .description('Manage skills marketplaces')
  .action(async (action?: string, source?: string) => {
    try {
      const { SkillsMarketplaceClient } = await import('../services/skills-marketplace-client.js');
      const client = new SkillsMarketplaceClient();
      await client.initialize();

      if (!action || action === 'list') {
        // List all marketplaces
        const marketplaces = client.getAll();

        if (marketplaces.length === 0) {
          console.log(chalk.yellow('\n⚠️  No marketplaces configured\n'));
          return;
        }

        console.log(chalk.bold(`\n📦 Configured Marketplaces (${marketplaces.length})\n`));

        for (const marketplace of marketplaces) {
          const status = marketplace.enabled ? chalk.green('✓') : chalk.red('✗');
          const official = marketplace.name === 'anthropic-skills' ? chalk.blue(' (official)') : '';
          console.log(`${status} ${chalk.bold(marketplace.name)}${official}`);
          console.log(chalk.dim(`   Source: ${marketplace.source}`));
          if (marketplace.lastUpdated) {
            console.log(chalk.dim(`   Updated: ${marketplace.lastUpdated}`));
          }
          console.log();
        }
      } else if (action === 'add') {
        if (!source) {
          console.error(chalk.red('Error: Please provide a marketplace source'));
          console.log(chalk.dim('\nExamples:'));
          console.log(chalk.dim('  ncp skills marketplace add anthropic-ai/anthropic-agent-skills'));
          console.log(chalk.dim('  ncp skills marketplace add https://github.com/anthropic-ai/skills'));
          console.log(chalk.dim('  ncp skills marketplace add ./local/skills-path'));
          process.exit(1);
        }

        console.log(chalk.cyan('\n➕ Adding marketplace...\n'));
        const marketplace = await client.addMarketplace(source);

        console.log(chalk.green(`✅ Marketplace added: ${marketplace.name}`));
        console.log(chalk.dim(`   Source: ${marketplace.source}`));
        console.log(chalk.dim(`   URL: ${marketplace.url}\n`));
      } else if (action === 'remove') {
        if (!source) {
          console.error(chalk.red('Error: Please provide a marketplace name'));
          process.exit(1);
        }

        const removed = await client.removeMarketplace(source);

        if (!removed) {
          console.log(chalk.yellow(`\n⚠️  Marketplace '${source}' not found\n`));
          return;
        }

        console.log(chalk.green(`\n✅ Marketplace removed: ${source}\n`));
      } else {
        console.error(chalk.red(`Unknown action: ${action}`));
        console.log(chalk.dim('Available actions: list, add, remove'));
        process.exit(1);
      }
    } catch (error: any) {
      console.error(chalk.red(`Failed to manage marketplace: ${error.message}`));
      process.exit(1);
    }
  });

skillsCmd
  .command('search [query]')
  .description('Search for skills in configured marketplaces')
  .action(async (query?: string) => {
    try {
      const { SkillsMarketplaceClient } = await import('../services/skills-marketplace-client.js');
      const client = new SkillsMarketplaceClient();
      await client.initialize();

      console.log(chalk.cyan('\n🔍 Searching for skills...\n'));
      const skills = await client.search(query);

      if (skills.length === 0) {
        console.log(chalk.yellow(`No skills found${query ? ` for "${query}"` : ''}\n`));
        return;
      }

      const searchInfo = query ? ` matching "${query}"` : '';
      console.log(chalk.bold(`📚 Found ${skills.length} skill${skills.length !== 1 ? 's' : ''}${searchInfo}\n`));

      for (const skill of skills) {
        console.log(chalk.cyan(`  ${skill.name}`));
        console.log(chalk.dim(`    ${skill.description || '(no description)'}`));
        if (skill.plugin) {
          console.log(chalk.dim(`    Plugin: ${skill.plugin}`));
        }
        if (skill.tags && skill.tags.length > 0) {
          console.log(chalk.dim(`    Tags: ${skill.tags.join(', ')}`));
        }
        console.log();
      }
    } catch (error: any) {
      console.error(chalk.red(`Failed to search skills: ${error.message}`));
      process.exit(1);
    }
  });

skillsCmd
  .command('add <name>')
  .description('Add a skill from a marketplace')
  .action(async (skillName: string) => {
    try {
      const { SkillsMarketplaceClient } = await import('../services/skills-marketplace-client.js');
      const client = new SkillsMarketplaceClient();
      await client.initialize();

      console.log(chalk.cyan(`\n➕ Adding skill: ${skillName}\n`));
      const result = await client.install(skillName);

      if (result.success) {
        console.log(chalk.green(`✅ ${result.message}`));
        console.log(chalk.yellow('⚠️  Restart NCP for the skill to be loaded'));
      } else {
        console.log(chalk.red(`❌ ${result.message}`));
        process.exit(1);
      }
      console.log();
    } catch (error: any) {
      console.error(chalk.red(`Failed to add skill: ${error.message}`));
      process.exit(1);
    }
  });

// Error handling for unknown commands with fuzzy suggestions
program.on('command:*', (operands: string[]) => {
  const unknownCommand = operands[0];
  const { FuzzyMatcher } = require('../utils/fuzzy-matcher.js');
  const matcher = new FuzzyMatcher();

  // Get all available command names (excluding hidden commands)
  const availableCommands = program.commands
    .filter((cmd: any) => !cmd.hidden)
    .map((cmd: any) => cmd.name());

  console.error(chalk.red(`\n❌ Unknown command: ${unknownCommand}`));

  // Try to find similar commands
  const suggestions = matcher.findSuggestions(unknownCommand, availableCommands, 3);
  if (suggestions.length > 0) {
    console.error(chalk.cyan(`\n💡 Did you mean?`));
    suggestions.slice(0, 3).forEach((cmd: string, index: number) => {
      console.error(chalk.yellow(`   ${index + 1}. ${cmd}`));
    });
  }

  console.error(chalk.cyan(`\nℹ️  Use 'ncp --help' to see all available commands\n`));
  process.exit(1);
});

program.parse();
}