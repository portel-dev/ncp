#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ProfileManager } from '../profiles/profile-manager.js';
import { MCPServer } from '../server/mcp-server.js';
import { ConfigManager } from '../utils/config-manager.js';
import { formatCommandDisplay } from '../utils/security.js';
import { TextUtils } from '../utils/text-utils.js';
import { OutputFormatter } from '../services/output-formatter.js';
import { ErrorHandler } from '../services/error-handler.js';
import { CachePatcher } from '../cache/cache-patcher.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mcpWrapper } from '../utils/mcp-wrapper.js';
import { withFilteredOutput } from '../transports/filtered-stdio-transport.js';
import { UpdateChecker } from '../utils/update-checker.js';
import { setOverrideWorkingDirectory } from '../utils/ncp-paths.js';
import { ConfigSchemaReader } from '../services/config-schema-reader.js';
import { ConfigPrompter } from '../services/config-prompter.js';
import { SchemaCache } from '../cache/schema-cache.js';
import { getCacheDirectory } from '../utils/ncp-paths.js';

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
      { name: 'ncp-oss', version: '1.0.0' },
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
    // TODO: Once MCP SDK is updated to support top-level configurationSchema,
    // also check for it directly. For now, check experimental capabilities.
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
${chalk.bold.white('Natural Context Provider')} ${chalk.dim('v' + version)} - ${chalk.cyan('1 MCP to rule them all')}
${chalk.dim('Orchestrates multiple MCP servers through a unified interface for AI assistants.')}
${chalk.dim('Reduces cognitive load and clutter, saving tokens and speeding up AI interactions.')}
${chalk.dim('Enables smart tool discovery across all configured servers with vector similarity search.')}`)
  .option('--profile <name>', 'Profile to use (default: all)')
  .option('--working-dir <path>', 'Working directory for profile resolution (overrides current directory)')
  .option('--force-retry', 'Force retry all failed MCPs immediately (ignores scheduled retry times)')
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
    output += `${chalk.yellow('NCP config files:')} ~/.ncp/profiles/\n\n`;

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
  ${chalk.cyan('1a')} Import existing MCPs: ${chalk.green('ncp config import')} ${chalk.dim('(copy JSON first)')}
  ${chalk.cyan('1b')} Or add manually: ${chalk.green('ncp add <name> <command>')}
  ${chalk.cyan('2')} Configure NCP in AI client settings

${chalk.bold.white('Examples:')}
  $ ${chalk.yellow('ncp config import config.json')} ${chalk.dim('              # Import from file')}
  $ ${chalk.yellow('ncp add filesystem npx @modelcontextprotocol/server-filesystem /tmp')}
  $ ${chalk.yellow('ncp find "file operations"')}
  $ ${chalk.yellow('ncp run filesystem:read_file --params \'{"path": "/tmp/example.txt"}\'')}
  $ ${chalk.yellow('ncp list --depth 1')}`);

// Check if we should run as MCP server
// MCP server mode: default when no CLI commands are provided, or when --profile is specified
const profileIndex = process.argv.indexOf('--profile');
const hasCommands = process.argv.includes('find') ||
  process.argv.includes('add') ||
  process.argv.includes('list') ||
  process.argv.includes('remove') ||
  process.argv.includes('run') ||
  process.argv.includes('config') ||
  process.argv.includes('help') ||
  process.argv.includes('--help') ||
  process.argv.includes('-h') ||
  process.argv.includes('--version') ||
  process.argv.includes('-v') ||
  process.argv.includes('import') ||
  process.argv.includes('analytics') ||
  process.argv.includes('visual') ||
  process.argv.includes('update') ||
  process.argv.includes('repair');

// Default to MCP server mode when no CLI commands are provided
// This ensures compatibility with Claude Desktop and other MCP clients that expect server mode by default
const shouldRunAsServer = !hasCommands;

if (shouldRunAsServer) {
  // Handle --working-dir parameter for MCP server mode
  const workingDirIndex = process.argv.indexOf('--working-dir');
  if (workingDirIndex !== -1 && workingDirIndex + 1 < process.argv.length) {
    const workingDirValue = process.argv[workingDirIndex + 1];
    setOverrideWorkingDirectory(workingDirValue);
  }

  // Running as MCP server: ncp (defaults to 'all' profile) or ncp --profile <name>
  const profileName = profileIndex !== -1 ? (process.argv[profileIndex + 1] || 'all') : 'all';

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

// Add MCP command
program
  .command('add <name> <command> [args...]')
  .description('Add an MCP server to a profile')
  .option('--profiles <names...>', 'Profiles to add to (default: all)')
  .option('--env <vars...>', 'Environment variables (KEY=value)')
  .action(async (name, command, args, options) => {
    console.log(`\n${chalk.blue(`📦 Adding MCP server: ${chalk.bold(name)}`)}`);

    const manager = new ProfileManager();
    await manager.initialize();

    // Show helpful guidance without hard validation
    const guidance = await validateAddCommand(name, command, args);
    console.log(guidance.message);
    if (guidance.suggestions.length > 0) {
      console.log('\n📋 Command validation:');
      guidance.suggestions.forEach((suggestion, index) => {
        if (index === 0) {
          // Main command
          console.log(`   ${chalk.cyan(suggestion.command)}`);
          console.log(`   ${chalk.dim(suggestion.description)}`);
        } else {
          // Alternative suggestions
          console.log(chalk.dim(`\n💡 Alternative: ${suggestion.command}`));
          console.log(chalk.dim(`   ${suggestion.description}`));
        }
      });
      console.log('');
    }

    // Parse environment variables
    const env: Record<string, string> = {};
    if (options.env) {
      console.log(chalk.dim('🔧 Processing environment variables...'));
      for (const envVar of options.env) {
        const [key, value] = envVar.split('=');
        if (key && value) {
          env[key] = value;
          console.log(chalk.dim(`   ${key}=${formatCommandDisplay(value)}`));
        } else {
          console.log(chalk.yellow(`⚠️  Invalid environment variable format: ${envVar}`));
        }
      }
    }

    const config = {
      command,
      args: args || [],
      ...(Object.keys(env).length > 0 && { env })
    };

    // Show what will be added
    // Determine which profiles to add to
    const profiles = options.profiles || ['all'];

    console.log('\n📋 Profile configuration:');
    console.log(`   ${chalk.cyan('Target profiles:')} ${profiles.join(', ')}`);
    if (Object.keys(env).length > 0) {
      console.log(`   ${chalk.cyan('Environment variables:')} ${Object.keys(env).length} configured`);
      Object.entries(env).forEach(([key, value]) => {
        console.log(chalk.dim(`     ${key}=${formatCommandDisplay(value)}`));
      });
    }

    console.log(''); // spacing

    // Initialize schema services
    const schemaReader = new ConfigSchemaReader();
    const configPrompter = new ConfigPrompter();
    const schemaCache = new SchemaCache(getCacheDirectory());

    // Try to discover and detect configuration requirements BEFORE adding to profile
    console.log(chalk.dim('🔍 Discovering tools and configuration requirements...'));
    const discoveryStart = Date.now();

    let discoveryResult: Awaited<ReturnType<typeof discoverSingleMCP>> | null = null;
    let finalConfig = { ...config };
    let detectedSchema: any = null;

    try {
      discoveryResult = await discoverSingleMCP(name, command, args, env);
      const discoveryTime = Date.now() - discoveryStart;

      console.log(`${chalk.green('✅')} Found ${discoveryResult.tools.length} tools in ${discoveryTime}ms`);

      // Two-tier configuration detection strategy:
      // Tier 1: MCP Protocol configurationSchema (from server capabilities)
      // Tier 2: Error parsing (fallback - happens on failure below)

      // Tier 1: Check for MCP protocol schema
      if (discoveryResult.configurationSchema) {
        detectedSchema = schemaReader.readSchema({
          protocolVersion: '1.0',
          capabilities: {},
          serverInfo: { name, version: '1.0' },
          configurationSchema: discoveryResult.configurationSchema
        });
        if (detectedSchema) {
          console.log(chalk.dim('   Configuration schema detected (MCP protocol)'));
        }
      }

      // Apply detected schema if we have one with required config
      if (detectedSchema && schemaReader.hasRequiredConfig(detectedSchema)) {
        console.log(chalk.cyan('\n📋 Configuration required'));

        // Prompt for configuration
        const promptedConfig = await configPrompter.promptForConfig(detectedSchema, name);

        // Merge prompted config with existing config
        finalConfig = {
          command: config.command,
          args: [...(config.args || []), ...(promptedConfig.arguments || [])],
          env: { ...(config.env || {}), ...(promptedConfig.environmentVariables || {}) }
        };

        // Display summary
        configPrompter.displaySummary(promptedConfig, name);

        // Cache schema for future use
        schemaCache.save(name, detectedSchema);
        console.log(chalk.dim('✓ Configuration schema cached'));
      }
    } catch (discoveryError: any) {
      console.log(`${chalk.yellow('⚠️')} Discovery failed: ${discoveryError.message}`);
      console.log(chalk.dim('   Proceeding with manual configuration...'));
      // Tier 3: Error parsing would happen here in future enhancement
      // Continue with manual config - error will be saved to profile
    }

    // Initialize cache patcher
    const cachePatcher = new CachePatcher();

    for (const profileName of profiles) {
      try {
        // 1. Update profile with final configuration
        await manager.addMCPToProfile(profileName, name, finalConfig);
        console.log(`\n${OutputFormatter.success(`Added ${name} to profile: ${profileName}`)}`);

        // 2. Update cache if we have discovery results
        if (discoveryResult) {
          if (discoveryResult.tools.length > 0) {
            console.log(chalk.dim('   Tools discovered:'));
            // Show first few tools
            const toolsToShow = discoveryResult.tools.slice(0, 3);
            toolsToShow.forEach(tool => {
              const shortDesc = tool.description?.length > 50
                ? tool.description.substring(0, 50) + '...'
                : tool.description;
              console.log(chalk.dim(`   • ${tool.name}: ${shortDesc}`));
            });
            if (discoveryResult.tools.length > 3) {
              console.log(chalk.dim(`   • ... and ${discoveryResult.tools.length - 3} more`));
            }
          }

          // 3. Patch tool metadata cache with final config
          await cachePatcher.patchAddMCP(name, finalConfig, discoveryResult.tools, discoveryResult.serverInfo);

          // 4. Update profile hash
          const profile = await manager.getProfile(profileName);
          const profileHash = cachePatcher.generateProfileHash(profile);
          await cachePatcher.updateProfileHash(profileHash);

          console.log(`${chalk.green('✅')} Cache updated for ${name}`);
        } else {
          console.log(chalk.dim('   Profile updated, but cache not built. Run "ncp find <query>" to build cache later.'));
        }

      } catch (error: any) {
        const errorResult = ErrorHandler.handle(error, ErrorHandler.createContext('profile', 'add', `${name} to ${profileName}`));
        console.log('\n' + ErrorHandler.formatForConsole(errorResult));
      }
    }

    console.log(chalk.dim('\n💡 Next steps:'));
    console.log(chalk.dim('  •') + ' View profiles: ' + chalk.cyan('ncp list'));
    console.log(chalk.dim('  •') + ' Test discovery: ' + chalk.cyan('ncp find <query>'));
  });


// Lightweight function to read MCP info from cache without full orchestrator initialization
async function loadMCPInfoFromCache(mcpDescriptions: Record<string, string>, mcpToolCounts: Record<string, number>, mcpVersions: Record<string, string>): Promise<boolean> {
  const { readFileSync, existsSync } = await import('fs');
  const { getCacheDirectory } = await import('../utils/ncp-paths.js');
  const { join } = await import('path');

  const cacheDir = getCacheDirectory();
  const cachePath = join(cacheDir, 'all-tools.json');

  if (!existsSync(cachePath)) {
    return false; // No cache available
  }

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

      // Count tools
      if (data.tools && Array.isArray(data.tools)) {
        mcpToolCounts[mcpName] = data.tools.length;
      }
    }
    return true; // Cache was successfully loaded
  } catch (error) {
    // Ignore cache reading errors - will just show without descriptions
    return false;
  }
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



// Remove command
program
  .command('remove <name>')
  .description('Remove an MCP server from profiles')
  .option('--profiles <names...>', 'Profiles to remove from (default: all)')
  .action(async (name, options) => {
    console.log(chalk.blue(`🗑️  Removing MCP server: ${chalk.bold(name)}`));

    const manager = new ProfileManager();
    await manager.initialize();

    const profiles = options.profiles || ['all'];

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
  .command('config')
  .description('Manage NCP configuration (import, validate, edit)');

configCmd
  .command('import [file]')
  .description('Import MCP configurations from file or clipboard')
  .option('--profile <name>', 'Target profile (default: all)')
  .option('--dry-run', 'Show what would be imported without actually importing')
  .action(async (file, options) => {
    try {
      const manager = new ConfigManager();
      await manager.importConfig(file, options.profile, options.dryRun);
    } catch (error: any) {
      const errorResult = ErrorHandler.handle(error, ErrorHandler.createContext('config', 'import', file || 'clipboard'));
      console.log('\n' + ErrorHandler.formatForConsole(errorResult));
      process.exit(1);
    }
  });

configCmd
  .command('edit')
  .description('Open config directory in default editor')
  .action(async () => {
    const manager = new ConfigManager();
    await manager.editConfig();
  });

configCmd
  .command('validate')
  .description('Validate current configuration')
  .action(async () => {
    const manager = new ConfigManager();
    await manager.validateConfig();
  });

configCmd
  .command('location')
  .description('Show configuration file locations')
  .action(async () => {
    const manager = new ConfigManager();
    await manager.showConfigLocations();
  });


// Repair command - fix failed MCPs interactively
program
  .command('repair')
  .description('Interactively configure failed MCPs')
  .option('--profile <name>', 'Profile to repair (default: all)')
  .action(async (options) => {
    try {
      const profileName = options.profile || program.getOptionValue('profile') || 'all';

      console.log(chalk.bold('\n🔧 MCP Repair Tool\n'));

    // Load failed MCPs from both sources
    const { getCacheDirectory } = await import('../utils/ncp-paths.js');
    const { CSVCache } = await import('../cache/csv-cache.js');
    const { MCPErrorParser } = await import('../utils/mcp-error-parser.js');
    const { ProfileManager } = await import('../profiles/profile-manager.js');
    const { MCPWrapper } = await import('../utils/mcp-wrapper.js');
    const { healthMonitor } = await import('../utils/health-monitor.js');
    const { readFileSync, existsSync } = await import('fs');
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

    const cache = new CSVCache(getCacheDirectory(), profileName);
    await cache.initialize();

    // Load profile first to know which MCPs to check
    const profileManager = new ProfileManager();
    await profileManager.initialize();
    const profile = await profileManager.getProfile(profileName);

    if (!profile) {
      console.log(chalk.red(`❌ Profile '${profileName}' not found`));
      return;
    }

    // Merge failed MCPs from both sources
    const failedMCPs = new Map<string, {
      errorMessage: string;
      attemptCount: number;
      source: 'cache' | 'health' | 'both';
      lastAttempt: string;
    }>();

    // Add from CSV cache
    const cacheMetadata = (cache as any).metadata;
    if (cacheMetadata?.failedMCPs) {
      for (const [mcpName, failedInfo] of cacheMetadata.failedMCPs) {
        failedMCPs.set(mcpName, {
          errorMessage: failedInfo.errorMessage,
          attemptCount: failedInfo.attemptCount,
          source: 'cache',
          lastAttempt: failedInfo.lastAttempt
        });
      }
    }

    // Add from health monitor (unhealthy or disabled)
    const healthReport = healthMonitor.generateHealthReport();
    for (const health of healthReport.details) {
      if (health.status === 'unhealthy' || health.status === 'disabled') {
        // Only include if it's in the current profile
        if (profile.mcpServers[health.name]) {
          const existing = failedMCPs.get(health.name);
          if (existing) {
            // Already in cache, mark as both
            existing.source = 'both';
          } else {
            // Only in health monitor
            failedMCPs.set(health.name, {
              errorMessage: health.lastError || 'Unknown error',
              attemptCount: health.errorCount,
              source: 'health',
              lastAttempt: health.lastCheck
            });
          }
        }
      }
    }

    if (failedMCPs.size === 0) {
      console.log(chalk.green('✅ No failed MCPs! Everything is working.'));
      return;
    }

    console.log(chalk.yellow(`Found ${failedMCPs.size} failed MCPs\n`));
    console.log(chalk.dim('This tool will help you configure them interactively.\n'));

    const errorParser = new MCPErrorParser();
    const mcpWrapper = new MCPWrapper();
    const prompts = (await import('prompts')).default;

    let fixedCount = 0;
    let skippedCount = 0;
    let stillFailingCount = 0;

    // Iterate through failed MCPs
    for (const [mcpName, failedInfo] of failedMCPs) {
      console.log(chalk.cyan(`\n📦 ${mcpName}`));
      console.log(chalk.dim(`   Last error: ${failedInfo.errorMessage}`));
      console.log(chalk.dim(`   Failed ${failedInfo.attemptCount} time(s)`));

      // Show source of failure detection
      const sourceLabel = failedInfo.source === 'both'
        ? 'indexing & runtime'
        : failedInfo.source === 'cache'
          ? 'indexing'
          : 'runtime';
      console.log(chalk.dim(`   Detected during: ${sourceLabel}`));

      // Ask if user wants to fix this MCP
      const { shouldFix } = await prompts({
        type: 'confirm',
        name: 'shouldFix',
        message: `Try to fix ${mcpName}?`,
        initial: true
      });

      if (!shouldFix) {
        skippedCount++;
        continue;
      }

      // Get current MCP config first (needed for all tiers)
      const currentConfig = profile.mcpServers[mcpName];
      if (!currentConfig) {
        console.log(chalk.red(`   ❌ MCP not found in profile`));
        skippedCount++;
        continue;
      }

      // Two-tier configuration detection (same as ncp add):
      // Tier 1: Cached schema (from previous successful add or MCP protocol)
      // Tier 2: Error parsing (fallback)

      let detectedSchema: any = null;

      // Check for cached schema
      const schemaCache = new SchemaCache(getCacheDirectory());
      detectedSchema = schemaCache.get(mcpName);

      if (detectedSchema) {
        console.log(chalk.dim(`   ✓ Using cached configuration schema`));
      }

      // If we have a schema, use schema-based prompting
      if (detectedSchema) {
        const schemaReader = new ConfigSchemaReader();
        const configPrompter = new ConfigPrompter();

        if (schemaReader.hasRequiredConfig(detectedSchema)) {
          console.log(chalk.cyan(`\n   📋 Configuration required`));

          const promptedConfig = await configPrompter.promptForConfig(detectedSchema, mcpName);

          // Update config with prompted values
          const updatedConfig = {
            command: currentConfig.command,
            args: [...(currentConfig.args || []), ...(promptedConfig.arguments || [])],
            env: { ...(currentConfig.env || {}), ...(promptedConfig.environmentVariables || {}) }
          };

          // Save updated config
          await profileManager.addMCPToProfile(profileName, mcpName, updatedConfig);

          console.log(chalk.green(`\n   ✅ Configuration updated for ${mcpName}`));
          fixedCount++;
          continue;
        }
      }

      // Tier 3: Fallback to error parsing if no schema available
      const logPath = mcpWrapper.getLogFile(mcpName);
      let stderr = '';

      if (existsSync(logPath)) {
        const logContent = readFileSync(logPath, 'utf-8');
        // Extract stderr lines
        const stderrLines = logContent.split('\n').filter(line => line.includes('[STDERR]'));
        stderr = stderrLines.map(line => line.replace(/\[STDERR\]\s*/, '')).join('\n');
      } else {
        stderr = failedInfo.errorMessage;
      }

      // Parse errors to detect configuration needs
      const configNeeds = errorParser.parseError(mcpName, stderr, 1);

      if (configNeeds.length === 0) {
        console.log(chalk.yellow(`   ⚠️  Could not detect specific configuration needs`));
        console.log(chalk.dim(`   Check logs manually: ${logPath}`));
        skippedCount++;
        continue;
      }

      // Check if it's a missing package
      const packageMissing = configNeeds.find(n => n.type === 'package_missing');
      if (packageMissing) {
        console.log(chalk.red(`   ❌ Package not found on npm - cannot fix`));
        console.log(chalk.dim(`      ${packageMissing.extractedFrom}`));
        skippedCount++;
        continue;
      }

      console.log(chalk.yellow(`\n   Found ${configNeeds.length} configuration need(s):`));
      for (const need of configNeeds) {
        console.log(chalk.dim(`   • ${need.description}`));
      }

      // Collect new configuration from user
      const newEnv = { ...(currentConfig.env || {}) };
      const newArgs = [...(currentConfig.args || [])];

      for (const need of configNeeds) {
        if (need.type === 'api_key' || need.type === 'env_var') {
          const { value } = await prompts({
            type: need.sensitive ? 'password' : 'text',
            name: 'value',
            message: need.prompt,
            validate: (val: string) => val.length > 0 ? true : 'Value required'
          });

          if (!value) {
            console.log(chalk.yellow(`   Skipped ${mcpName}`));
            skippedCount++;
            continue;
          }

          newEnv[need.variable] = value;
        } else if (need.type === 'command_arg') {
          const { value } = await prompts({
            type: 'text',
            name: 'value',
            message: need.prompt,
            validate: (val: string) => val.length > 0 ? true : 'Value required'
          });

          if (!value) {
            console.log(chalk.yellow(`   Skipped ${mcpName}`));
            skippedCount++;
            continue;
          }

          newArgs.push(value);
        }
      }

      // Test MCP with new configuration
      console.log(chalk.dim(`\n   Testing ${mcpName} with new configuration...`));

      const testConfig = {
        name: mcpName,
        command: currentConfig.command,
        args: newArgs,
        env: newEnv
      };

      try {
        // Create wrapper command
        const wrappedCommand = mcpWrapper.createWrapper(
          testConfig.name,
          testConfig.command,
          testConfig.args || []
        );

        // Test connection with 30 second timeout
        const transport = new StdioClientTransport({
          command: wrappedCommand.command,
          args: wrappedCommand.args,
          env: {
            ...process.env,
            ...(testConfig.env || {}),
            MCP_SILENT: 'true',
            QUIET: 'true'
          }
        });

        const client = new Client({
          name: 'ncp-repair-test',
          version: '1.0.0'
        }, {
          capabilities: {}
        });

        await client.connect(transport);

        // Try to list tools
        const result = await Promise.race([
          client.listTools(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Test timeout')), 30000)
          )
        ]);

        await client.close();

        console.log(chalk.green(`   ✅ Success! Found ${result.tools.length} tools`));

        // Update profile with new configuration
        profile.mcpServers[mcpName] = {
          command: testConfig.command,
          args: newArgs,
          env: newEnv
        };
        profile.metadata.modified = new Date().toISOString();

        await profileManager.saveProfile(profile);

        // Remove from both failure tracking systems
        if (cacheMetadata?.failedMCPs) {
          cacheMetadata.failedMCPs.delete(mcpName);
          (cache as any).saveMetadata();
        }

        // Clear from health monitor and mark as healthy
        await healthMonitor.enableMCP(mcpName);
        healthMonitor.markHealthy(mcpName);
        await healthMonitor.saveHealth();

        fixedCount++;
      } catch (error: any) {
        console.log(chalk.red(`   ❌ Still failing: ${error.message}`));
        stillFailingCount++;
      }
    }

    // Final report
    console.log(chalk.bold('\n📊 Repair Summary\n'));
    console.log(chalk.green(`✅ Fixed: ${fixedCount}`));
    console.log(chalk.yellow(`⏭️  Skipped: ${skippedCount}`));
    console.log(chalk.red(`❌ Still failing: ${stillFailingCount}`));

    if (fixedCount > 0) {
      console.log(chalk.dim('\n💡 Run "ncp find --force-retry" to re-index fixed MCPs'));
    }
    } catch (error: any) {
      console.error(chalk.red('\n❌ Repair command failed:'), error.message);
      console.error(chalk.dim(error.stack));
      process.exit(1);
    }
  });

// Find command (CLI-optimized version for fast discovery)
program
  .command('find [query]')
  .description('Find tools matching a query or list all tools')
  .option('--limit <number>', 'Maximum number of results (default: 5)')
  .option('--page <number>', 'Page number (default: 1)')
  .option('--depth <number>', 'Display depth: 0=overview, 1=tools, 2=details (default: 2)')
  .option('--confidence_threshold <number>', 'Minimum confidence level (0.0-1.0, default: 0.3). Examples: 0.1=show all, 0.5=strict, 0.7=very precise')
  .action(async (query, options) => {
    // Add newline after command before any output
    console.log();

    const profileName = program.getOptionValue('profile') || 'all';
    const forceRetry = program.getOptionValue('forceRetry') || false;

    // Use MCPServer for rich formatted output
    const { MCPServer } = await import('../server/mcp-server.js');
    const server = new MCPServer(profileName, true, forceRetry); // Enable progress + force retry flag

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

    const limit = parseInt(options.limit || '5');
    const page = parseInt(options.page || '1');
    const depth = parseInt(options.depth || '2');
    const confidence_threshold = options.confidence_threshold ? parseFloat(options.confidence_threshold) : undefined;

    const result = await server.handleFind(
      { jsonrpc: '2.0', id: 'cli', method: 'tools/call' },
      { description: query || '', limit, page, depth, confidence_threshold }
    );

    const formattedOutput = formatFindOutput(result.result.content[0].text);
    console.log(formattedOutput);
    await server.cleanup();
  });

// Analytics command group
const analyticsCmd = program
  .command('analytics')
  .description('View NCP usage analytics and performance metrics');

analyticsCmd
  .command('dashboard')
  .description('Show comprehensive analytics dashboard')
  .option('--period <days>', 'Show data for last N days (e.g., --period 7)')
  .option('--from <date>', 'Start date (YYYY-MM-DD format)')
  .option('--to <date>', 'End date (YYYY-MM-DD format)')
  .option('--today', 'Show only today\'s data')
  .option('--visual', 'Enhanced visual dashboard with charts and graphs')
  .action(async (options) => {
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
  .command('visual')
  .description('Show enhanced visual analytics with charts and graphs')
  .option('--period <days>', 'Show data for last N days (e.g., --period 7)')
  .option('--from <date>', 'Start date (YYYY-MM-DD format)')
  .option('--to <date>', 'End date (YYYY-MM-DD format)')
  .option('--today', 'Show only today\'s data')
  .action(async (options) => {
    const { NCPLogParser } = await import('../analytics/log-parser.js');
    const { VisualAnalyticsFormatter } = await import('../analytics/visual-formatter.js');

    console.log(chalk.dim('🎨 Generating visual analytics...'));

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

    const dashboard = await VisualAnalyticsFormatter.formatVisualDashboard(report);
    console.log(dashboard);
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
  .command('run <tool>')

  .description('Run a specific tool')
  .option('--params <json>', 'Tool parameters as JSON string (optional - will prompt interactively if not provided)')
  .option('--no-prompt', 'Skip interactive prompting for missing parameters')
  .option('--output-format <format>', 'Output format: auto (smart rendering), json (raw JSON)', 'auto')
  .option('-y, --yes', 'Automatically answer yes to prompts (e.g., open media files)')
  .configureHelp({
    formatHelp: (cmd, helper) => {
      const indent = '  ';
      let output = '\n';

      // Header first - context before syntax
      output += chalk.bold.white('NCP Run Command') + ' - ' + chalk.cyan('Direct MCP Tool Execution') + '\n\n';
      output += chalk.dim('Execute MCP tools with intelligent parameter prompting and rich media support.') + '\n';
      output += chalk.dim('Automatically handles parameter collection, validation, and response formatting.') + '\n\n';

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
      output += chalk.dim('  Basic execution:') + '\n';
      output += indent + chalk.yellow('ncp run memory:create_entities') + chalk.gray('  # Interactive parameter prompting') + '\n';
      output += indent + chalk.yellow('ncp run memory:create_entities --params \'{"entities":["item1"]}\'') + '\n\n';

      output += chalk.dim('  Output control:') + '\n';
      output += indent + chalk.yellow('ncp run tool --output-format json') + chalk.gray('  # Raw JSON output') + '\n';
      output += indent + chalk.yellow('ncp run tool -y') + chalk.gray('  # Auto-open media files') + '\n\n';

      output += chalk.dim('  Non-interactive:') + '\n';
      output += indent + chalk.yellow('ncp run tool --no-prompt --params \'{}\'') + chalk.gray('  # Scripting/automation') + '\n\n';

      // Media support note
      output += chalk.bold.white('Media Support:') + '\n';
      output += chalk.dim('  • Images and audio are displayed with metadata') + '\n';
      output += chalk.dim('  • Use') + chalk.cyan(' -y ') + chalk.dim('to auto-open media in default applications') + '\n';
      output += chalk.dim('  • Without') + chalk.cyan(' -y') + chalk.dim(', prompts before opening media files') + '\n\n';

      return output;
    }
  })
  .action(async (tool, options) => {
    const profileName = program.getOptionValue('profile') || 'all';

    const { NCPOrchestrator } = await import('../orchestrator/ncp-orchestrator.js');
    const orchestrator = new NCPOrchestrator(profileName, false); // Silent indexing for run command

    await orchestrator.initialize();

    // If tool doesn't contain a colon, try to find matching tools first
    if (!tool.includes(':')) {
      console.log(chalk.dim(`🔍 Searching for tools matching "${tool}"...`));

      try {
        const matchingTools = await orchestrator.find(tool, 5, false);

        if (matchingTools.length === 0) {
          console.log('\n' + OutputFormatter.error(`No tools found matching "${tool}"`));
          console.log(chalk.yellow('💡 Try \'ncp find\' to explore all available tools'));
          await orchestrator.cleanup();
          return;
        }

        if (matchingTools.length === 1) {
          // Only one match, use it automatically
          const matchedTool = matchingTools[0];
          tool = matchedTool.toolName;
          console.log(chalk.green(`✅ Found exact match: ${tool}`));
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
          return;
        }
      } catch (error: any) {
        console.log('\n' + OutputFormatter.error(`Error searching for tools: ${error.message}`));
        await orchestrator.cleanup();
        return;
      }
    }

    // Check if parameters are provided
    let parameters = {};
    if (options.params) {
      parameters = JSON.parse(options.params);
    } else {
      // Get tool schema and parameters
      const toolParams = orchestrator.getToolParameters(tool);

      if (toolParams && toolParams.length > 0) {
        const requiredParams = toolParams.filter(p => p.required);

        if (requiredParams.length > 0 && options.prompt !== false) {
          // Interactive prompting for parameters (default behavior)
          const { ParameterPrompter } = await import('../utils/parameter-prompter.js');
          const { ParameterPredictor } = await import('../server/mcp-server.js');

          const prompter = new ParameterPrompter();
          const predictor = new ParameterPredictor();
          const toolContext = orchestrator.getToolContext(tool);

          try {
            parameters = await prompter.promptForParameters(tool, toolParams, predictor, toolContext);
            prompter.close();
          } catch (error) {
            prompter.close();
            console.log('\n' + OutputFormatter.error('Error during parameter input'));
            await orchestrator.cleanup();
            return;
          }
        } else if (requiredParams.length > 0 && options.prompt === false) {
          console.log('\n' + OutputFormatter.error('This tool requires parameters'));
          console.log(chalk.yellow(`💡 Use: ncp run ${tool} --params '{"param": "value"}'`));
          console.log(chalk.yellow(`💡 Or use: ncp find "${tool}" --depth 2 to see required parameters`));
          console.log(chalk.yellow(`💡 Or remove --no-prompt to use interactive prompting`));
          await orchestrator.cleanup();
          return;
        }
      }
    }

    console.log(OutputFormatter.running(tool) + '\n');

    const result = await orchestrator.run(tool, parameters);

    if (result.success) {
      // Check if the content indicates an actual error despite "success" status
      const contentStr = JSON.stringify(result.content);
      const isActualError = contentStr.includes('"type":"text"') &&
                           (contentStr.includes('Error:') || contentStr.includes('not found') || contentStr.includes('Unknown tool'));

      if (isActualError) {
        const errorText = result.content?.[0]?.text || 'Unknown error occurred';
        let suggestions: string[] = [];

        if (errorText.includes('not configured') || errorText.includes('Unknown tool')) {
          // Extract the query from the tool name for vector search
          const [mcpName, toolName] = tool.split(':');

          // Try multiple search strategies to find the best matches
          let similarTools: any[] = [];

          try {
            // Strategy 1: Search with both MCP context and tool name for better domain matching
            if (toolName && mcpName) {
              const contextualQuery = `${mcpName} ${toolName}`;
              similarTools = await orchestrator.find(contextualQuery, 3, false);
            }

            // Strategy 2: If no results, try just the tool name
            if (similarTools.length === 0 && toolName) {
              similarTools = await orchestrator.find(toolName, 3, false);
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

        const context = ErrorHandler.createContext('mcp', 'run', tool, suggestions);
        const errorResult = ErrorHandler.handle(errorText, context);
        console.log('\n' + ErrorHandler.formatForConsole(errorResult));
      } else {
        console.log(OutputFormatter.success('Tool execution completed'));

        // Respect user's output format choice
        if (options.outputFormat === 'json') {
          // Raw JSON output - test different formatters to pick the best
          const { formatJson } = await import('../utils/highlighting.js');
          console.log(formatJson(result.content, 'cli-highlight')); // Let's test this one
        } else {
          // Smart response formatting (default)
          const { ResponseFormatter } = await import('../utils/response-formatter.js');

          // Check if this is text content that should be formatted naturally
          const isTextResponse = Array.isArray(result.content) &&
                                result.content.every((item: any) => item?.type === 'text');

          if (isTextResponse || (result.content?.[0]?.type === 'text' && result.content.length === 1)) {
            // Format as natural text with proper newlines
            console.log(ResponseFormatter.format(result.content, true, options.yes));
          } else if (ResponseFormatter.isPureData(result.content)) {
            // Pure data - use JSON formatting
            const { formatJson } = await import('../utils/highlighting.js');
            console.log(formatJson(result.content, 'cli-highlight'));
          } else {
            // Mixed content or unknown - use smart formatter
            console.log(ResponseFormatter.format(result.content, true, options.yes));
          }
        }
      }
    } else {
      // Check if this is a tool not found error and provide "did you mean" suggestions
      const errorMessage = result.error || 'Unknown error occurred';
      let suggestions: string[] = [];

      if (errorMessage.includes('not configured') || errorMessage.includes('Unknown tool')) {
        // Extract the query from the tool name for vector search
        const [mcpName, toolName] = tool.split(':');

        // Try multiple search strategies to find the best matches
        let similarTools: any[] = [];

        try {
          // Strategy 1: Search with both MCP context and tool name for better domain matching
          if (toolName && mcpName) {
            const contextualQuery = `${mcpName} ${toolName}`;
            similarTools = await orchestrator.find(contextualQuery, 3, false);
          }

          // Strategy 2: If no results, try just the tool name
          if (similarTools.length === 0 && toolName) {
            similarTools = await orchestrator.find(toolName, 3, false);
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

      const context = ErrorHandler.createContext('mcp', 'run', tool, suggestions);
      const errorResult = ErrorHandler.handle(errorMessage, context);
      console.log('\n' + ErrorHandler.formatForConsole(errorResult));
    }

    await orchestrator.cleanup();
  });

// Update command
program
  .command('update')
  .description('Update NCP to the latest version')
  .option('--check', 'Check for updates without installing')
  .configureHelp({
    formatHelp: () => {
      let output = '\n';
      output += chalk.bold.white('NCP Update Command') + ' - ' + chalk.cyan('Version Management') + '\n\n';
      output += chalk.dim('Keep NCP up to date with the latest features and bug fixes.') + '\n\n';
      output += chalk.bold.white('Usage:') + '\n';
      output += '  ' + chalk.yellow('ncp update') + '          # Update to latest version\n';
      output += '  ' + chalk.yellow('ncp update --check') + '   # Check for updates without installing\n\n';
      output += chalk.bold.white('Examples:') + '\n';
      output += '  ' + chalk.gray('$ ') + chalk.yellow('ncp update --check') + '\n';
      output += '  ' + chalk.gray('$ ') + chalk.yellow('ncp update') + '\n\n';
      return output;
    }
  })
  .action(async (options) => {
    try {
      const updateChecker = new UpdateChecker();

      if (options.check) {
        // Check for updates only
        console.log(chalk.blue('🔍 Checking for updates...'));
        const result = await updateChecker.checkForUpdates(true);

        if (result.hasUpdate) {
          console.log(chalk.yellow('📦 Update Available!'));
          console.log(chalk.dim(`   Current: ${result.currentVersion}`));
          console.log(chalk.green(`   Latest:  ${result.latestVersion}`));
          console.log();
          console.log(chalk.cyan('   Run: ncp update'));
        } else {
          console.log(chalk.green('✅ You are using the latest version!'));
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
          console.log(chalk.green('✅ You are already using the latest version!'));
          console.log(chalk.dim(`   Version: ${result.currentVersion}`));
        }
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to check for updates:'), error);
      process.exit(1);
    }
  });

// Check for updates on CLI startup (non-intrusive)
// Temporarily disabled - causing hangs in some environments
// TODO: Re-enable with proper timeout handling
// (async () => {
//   try {
//     const updateChecker = new UpdateChecker();
//     await updateChecker.showUpdateNotification();
//   } catch {
//     // Silently fail - don't interrupt normal CLI usage
//   }
// })();

program.parse();
}