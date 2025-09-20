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

// Check for no-color flag early
const noColor = process.argv.includes('--no-color') || process.env.NO_COLOR === 'true';
if (noColor) {
  chalk.level = 0; // Disable colors globally
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

// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

const program = new Command();

// Custom help configuration with colors
program
  .name('ncp')
  .description(`${chalk.bold('Natural Context Provider')} ${chalk.dim('v' + version)} - ${chalk.cyan('1 MCP to rule them all')}

${chalk.dim('Config Location:')}
  ${chalk.yellow('NCP Profiles:')} ~/.ncp/profiles/`)
  .option('--profile <name>', 'Profile to use (default: all)')
  .option('--no-color', 'Disable colored output');

// Check if we should run as MCP server
// MCP server mode: ncp --profile <name> (no other commands)
const profileIndex = process.argv.indexOf('--profile');
const hasCommands = process.argv.includes('find') ||
  process.argv.includes('add') ||
  process.argv.includes('list') ||
  process.argv.includes('remove') ||
  process.argv.includes('run') ||
  process.argv.includes('config') ||
  process.argv.includes('help');

const isOnlyProfileFlag = profileIndex !== -1 &&
  process.argv.length <= 4 &&
  !hasCommands;

if (isOnlyProfileFlag) {
  // Running as MCP server: ncp --profile <name>
  const profileName = process.argv[profileIndex + 1] || 'all';

  const server = new MCPServer(profileName);
  server.run().catch(console.error);
} else {
  // Running as CLI tool

// Add MCP command
program
  .command('add <name> <command> [args...]')
  .description('Add an MCP server to a profile')
  .option('--profiles <names...>', 'Profiles to add to (default: all)')
  .option('--env <vars...>', 'Environment variables (KEY=value)')
  .action(async (name, command, args, options) => {
    console.log(chalk.blue(`📦 Adding MCP server: ${chalk.bold(name)}`));

    const manager = new ProfileManager();
    await manager.initialize();

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
    console.log(chalk.dim('📋 Configuration:'));
    console.log(chalk.dim(`   Command: ${formatCommandDisplay(config.command, config.args)}`));
    if (Object.keys(env).length > 0) {
      console.log(chalk.dim(`   Environment: ${Object.keys(env).length} variables`));
    }

    // Determine which profiles to add to
    const profiles = options.profiles || ['all'];
    console.log(chalk.dim(`🎯 Target profiles: ${profiles.join(', ')}`));

    console.log(''); // spacing

    for (const profileName of profiles) {
      try {
        await manager.addMCPToProfile(profileName, name, config);
        console.log(chalk.green(`✅ Added ${chalk.bold(name)} to profile: ${chalk.cyan(profileName)}`));
      } catch (error: any) {
        console.log(chalk.red(`❌ Failed to add to ${profileName}: ${error.message}`));
      }
    }

    console.log(chalk.dim('\n💡 Use: ncp list to see your configured profiles'));
    console.log(chalk.dim('💡 Use: ncp find <query> to test tool discovery'));
  });

// List command
program
  .command('list')
  .description('List all MCPs across profiles')
  .option('--limit <number>', 'Maximum number of items to show (default: 20)')
  .option('--page <number>', 'Page number for pagination (default: 1)')
  .option('--depth <number>', 'Display depth: 0=MCP names only, 1=MCP names+description, 2=MCP names+description+command (default: 2)')
  .action(async (options) => {
    const manager = new ProfileManager();
    await manager.initialize();

    const profiles = manager.listProfiles();
    const depth = parseInt(options.depth || '2');

    if (profiles.length === 0) {
      console.log(chalk.yellow('📭 No profiles configured yet'));
      console.log(chalk.dim('💡 Use: ncp add <name> <command> to add your first MCP server'));
      console.log(chalk.dim('💡 Use: ncp config import to import from clipboard or file'));
      return;
    }

    // Collect all MCPs across profiles
    const allMCPs = new Map<string, { config: any, profiles: string[] }>();

    for (const profileName of profiles) {
      const mcps = manager.getProfileMCPs(profileName);
      if (mcps) {
        for (const [mcpName, config] of Object.entries(mcps)) {
          if (allMCPs.has(mcpName)) {
            allMCPs.get(mcpName)!.profiles.push(profileName);
          } else {
            allMCPs.set(mcpName, { config, profiles: [profileName] });
          }
        }
      }
    }

    if (allMCPs.size === 0) {
      console.log(chalk.yellow('📭 No MCPs configured yet'));
      console.log(chalk.dim('💡 Use: ncp add <name> <command> to add your first MCP server'));
      return;
    }

    console.log(chalk.blue(`🛠️  Found ${allMCPs.size} MCP server(s):\n`));

    const mcpEntries = Array.from(allMCPs.entries());
    mcpEntries.forEach(([mcpName, { config, profiles }], index) => {
      const isLast = index === mcpEntries.length - 1;
      const connector = isLast ? '└──' : '├──';

      if (depth === 0) {
        // MCP names only
        console.log(chalk.cyan(mcpName));
      } else if (depth === 1) {
        // MCP names + description (profiles they're in)
        console.log(chalk.cyan(mcpName) + chalk.gray(` (in: ${profiles.join(', ')})`));
      } else {
        // Full details: MCP name + profiles + command
        console.log(chalk.cyan(mcpName) + chalk.gray(` (in: ${profiles.join(', ')})`));
        console.log(chalk.gray('  └── ') + chalk.dim(formatCommandDisplay(config.command, config.args)));
        if (config.env && Object.keys(config.env).length > 0) {
          console.log(chalk.gray('      ') + chalk.dim(`env: ${Object.keys(config.env).join(', ')}`));
        }
        if (!isLast) console.log('');
      }
    });
  });

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

    for (const profileName of profiles) {
      try {
        await manager.removeMCPFromProfile(profileName, name);
        console.log(chalk.green(`✅ Removed ${chalk.bold(name)} from profile: ${chalk.cyan(profileName)}`));
      } catch (error: any) {
        console.log(chalk.red(`❌ Failed to remove from ${profileName}: ${error.message}`));
      }
    }
  });

// Config command group
const configCmd = program
  .command('config')
  .description('Manage NCP configuration');

configCmd
  .command('import [file]')
  .description('Import MCP configurations from file or clipboard')
  .option('--profile <name>', 'Target profile (default: all)')
  .option('--dry-run', 'Show what would be imported without actually importing')
  .action(async (file, options) => {
    const manager = new ConfigManager();
    await manager.importConfig(file, options.profile, options.dryRun);
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

// Find command (existing functionality)
program
  .command('find <query>')
  .description('Find tools matching a query')
  .option('--limit <number>', 'Maximum number of results (default: 5)')
  .option('--page <number>', 'Page number (default: 1)')
  .option('--depth <number>', 'Display depth: 0=overview, 1=tools, 2=details (default: 2)')
  .action(async (query, options) => {
    const profileName = program.getOptionValue('profile') || 'all';
    const server = new MCPServer(profileName);

    await server.initialize();

    const limit = parseInt(options.limit || '5');
    const page = parseInt(options.page || '1');
    const depth = parseInt(options.depth || '2');

    const result = await server.handleFind(
      { jsonrpc: '2.0', id: 'cli', method: 'tools/call' },
      { description: query, limit, page, depth }
    );

    console.log(result.result.content[0].text);
    await server.cleanup();
  });

// Run command (existing functionality)
program
  .command('run <tool>')
  .description('Run a specific tool')
  .option('--params <json>', 'Tool parameters as JSON string (default: {})')
  .action(async (tool, options) => {
    const profileName = program.getOptionValue('profile') || 'all';
    const parameters = options.params ? JSON.parse(options.params) : {};

    const { NCPOrchestrator } = await import('../orchestrator/ncp-orchestrator.js');
    const orchestrator = new NCPOrchestrator(profileName);

    await orchestrator.initialize();

    console.log(chalk.blue(`🚀 Running ${tool}...\n`));

    const result = await orchestrator.run(tool, parameters);

    if (result.success) {
      console.log(chalk.green('✅ Success!'));
      console.log(JSON.stringify(result.content, null, 2));
    } else {
      console.log(chalk.red('❌ Failed!'));
      console.log(chalk.red(result.error));
    }

    await orchestrator.cleanup();
  });

program.parse();
}