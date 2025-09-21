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
import { MCPDescriptions } from '../services/mcp-descriptions.js';
import { OutputFormatter } from '../services/output-formatter.js';
import { ErrorHandler } from '../services/error-handler.js';

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

  // Basic command format validation and helpful tips
  if (command === 'npx' || command === 'npm') {
    suggestions.push({
      command: `${command} ${args.join(' ')}`,
      description: 'NPM package execution - health monitor will validate if package exists and starts correctly'
    });
  } else if (command.startsWith('/') || command.startsWith('./') || command.includes('\\')) {
    suggestions.push({
      command: `${command} ${args.join(' ')}`,
      description: 'Local executable - health monitor will validate if command works'
    });
  } else if (command.includes('@')) {
    suggestions.push({
      command: `npx -y ${command} ${args.join(' ')}`,
      description: 'Consider using npx for npm packages'
    });
  } else {
    // Generic command - might be system executable
    suggestions.push({
      command: `${command} ${args.join(' ')}`,
      description: 'Custom command - health monitor will validate functionality'
    });

    // Offer helpful alternatives
    suggestions.push({
      command: `npx -y @modelcontextprotocol/server-${name}`,
      description: 'If this is an official MCP server package'
    });
  }

  return {
    message: chalk.blue('💡 MCP will be validated by health monitor after adding'),
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

// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

const program = new Command();

// Custom help configuration with colors and enhanced content
program
  .name('ncp')
  .description(`${chalk.bold.white('Natural Context Provider')} ${chalk.dim('v' + version)} - ${chalk.cyan('1 MCP to rule them all')}
${chalk.dim('Orchestrates multiple MCP servers through a unified interface for AI assistants.')}
${chalk.dim('Reduces cognitive load and clutter, saving tokens and speeding up AI interactions.')}
${chalk.dim('Enables smart tool discovery across all configured servers with vector similarity search.')}`)
  .option('--profile <name>', 'Profile to use (default: all)')
  .option('--no-color', 'Disable colored output');

// Configure help with enhanced formatting, Quick Start, and examples
program.configureHelp({
  sortSubcommands: true,
  formatHelp: (cmd, helper) => {
    // Calculate proper padding based on actual command names (without colors)
    const allCommands = cmd.commands.filter((cmd: any) => !cmd.hidden);
    const maxCmdLength = Math.max(
      ...allCommands.map(cmd => cmd.name().length),
      ...cmd.options.map(option => option.flags.length)
    );
    const pad = maxCmdLength + 4; // Add extra space for alignment
    const helpWidth = helper.helpWidth || 80;

    function formatItem(term: string, description?: string): string {
      if (description) {
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
        output += formatItem(
          '  ' + chalk.cyan(option.flags),
          chalk.white(option.description)
        ) + '\n';
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
        const managementCommands = ['add', 'remove', 'list', 'config'];
        const discoveryCommands = ['find'];
        const executionCommands = ['run'];

        let cmdName = cmd.name();
        if (managementCommands.includes(cmd.name())) {
          cmdName = chalk.cyan(cmd.name());
        } else if (discoveryCommands.includes(cmd.name())) {
          cmdName = chalk.green.bold(cmd.name());
        } else if (executionCommands.includes(cmd.name())) {
          cmdName = chalk.yellow.bold(cmd.name());
        }

        output += formatItem(
          '  ' + cmdName,
          chalk.white(cmd.description())
        ) + '\n';
      });
    }

    return output;
  }
});

// Add Quick Start and Examples after all commands are defined
program.addHelpText('after', `
${chalk.bold.white('Quick Start:')}
  ${chalk.cyan('1')} Add your MCPs with ${chalk.green('ncp add')}
  ${chalk.cyan('2')} Configure NCP in AI client settings

${chalk.bold.white('Examples:')}
  $ ${chalk.yellow('ncp find "file operations"')}
  $ ${chalk.yellow('ncp add filesystem npx @modelcontextprotocol/server-filesystem /tmp')}
  $ ${chalk.yellow('ncp run filesystem:read_file --params \'{"path": "/tmp/example.txt"}\'')}
  $ ${chalk.yellow('ncp list --depth 1')}`);

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

    // Show helpful guidance without hard validation
    const guidance = await validateAddCommand(name, command, args);
    console.log(guidance.message);
    if (guidance.suggestions.length > 0) {
      console.log(chalk.dim('\n📋 Command format:'));
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
        console.log(OutputFormatter.success(`Added ${name} to profile: ${profileName}`));
      } catch (error: any) {
        const errorResult = ErrorHandler.handle(error, ErrorHandler.createContext('profile', 'add', `${name} to ${profileName}`));
        console.log(ErrorHandler.formatForConsole(errorResult));
      }
    }

    console.log(chalk.dim('\n💡 Use: ncp list to see your configured profiles'));
    console.log(chalk.dim('💡 Use: ncp find <query> to test tool discovery'));
  });

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

    if (depth >= 1) {
      try {
        const { NCPOrchestrator } = await import('../orchestrator/ncp-orchestrator.js');
        orchestrator = new NCPOrchestrator('all'); // Use 'all' profile to get all MCPs
        await orchestrator.initialize();

        // Get descriptions and tool counts
        const allTools = await orchestrator.find('', 1000, false); // Get all tools without details
        const mcpStats: Record<string, { description: string, toolCount: number }> = {};

        for (const tool of allTools) {
          if (!mcpStats[tool.mcpName]) {
            mcpStats[tool.mcpName] = { description: '', toolCount: 0 };
          }
          mcpStats[tool.mcpName].toolCount++;
        }

        // Generate descriptions based on MCP names
        for (const mcpName of Object.keys(mcpStats)) {
          mcpDescriptions[mcpName] = MCPDescriptions.getDescription(mcpName);
          mcpToolCounts[mcpName] = mcpStats[mcpName].toolCount;
        }
      } catch (error) {
        // If orchestrator fails, continue without descriptions
        console.log(chalk.dim('Note: Could not load MCP descriptions and tool counts'));
      }
    }

    console.log(chalk.bold.white('\n📋 Configured Profiles:\n'));
    // Collect and filter data first
    const profileData: Array<{
      name: string;
      mcps: Record<string, any>;
      filteredMcps: Record<string, any>;
      originalCount: number;
      filteredCount: number;
    }> = [];

    for (const profileName of profiles) {
      const mcps = manager.getProfileMCPs(profileName) || {};
      let filteredMcps = mcps;

      // Apply MCP filtering
      if (filter || options.search) {
        const query = filter || options.search;
        const queryLower = query.toLowerCase();

        filteredMcps = Object.fromEntries(
          Object.entries(mcps).filter(([mcpName, config]) => {
            const description = mcpDescriptions[mcpName] || 'MCP server';
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
          const mcps = manager.getProfileMCPs(profile);
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
    console.log(chalk.bold.white('📋 Configured Profiles:'));
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
          const toolBadge = toolCount !== undefined ? chalk.dim(` (${chalk.green(`${toolCount} tools`)})`) : '';
          console.log(`  ${connector} ${chalk.bold.cyanBright(mcpName)}${toolBadge}`);

          // Depth 1+: Show description
          if (depth >= 1) {
            const description = mcpDescriptions[mcpName] || 'MCP server';
            console.log(`  ${indent} ${chalk.white(description)}`);
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

    // Cleanup orchestrator
    if (orchestrator) {
      await orchestrator.cleanup();
    }

    // Summary footer
    console.log(chalk.dim('─'.repeat(50)));
    console.log(chalk.bold.white(`📊 Summary: ${profiles.length} profiles, ${totalMCPs} MCPs configured`));
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

    for (const profileName of profiles) {
      try {
        await manager.removeMCPFromProfile(profileName, name);
        console.log(OutputFormatter.success(`Removed ${name} from profile: ${profileName}`));
      } catch (error: any) {
        const errorResult = ErrorHandler.handle(error, ErrorHandler.createContext('profile', 'remove', `${name} from ${profileName}`));
        console.log(ErrorHandler.formatForConsole(errorResult));
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
  .command('find [query]')
  .description('Find tools matching a query or list all tools')
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
      { description: query || '', limit, page, depth }
    );

    const formattedOutput = formatFindOutput(result.result.content[0].text);
    console.log(formattedOutput);
    await server.cleanup();
  });

// Run command (existing functionality)
program
  .command('run <tool>')
  .description('Run a specific tool')
  .option('--params <json>', 'Tool parameters as JSON string (optional - will prompt interactively if not provided)')
  .option('--no-prompt', 'Skip interactive prompting for missing parameters')
  .option('--json-style <style>', 'JSON highlighting style: auto, cli-highlight, colorizer, prettyjson, none', 'auto')
  .action(async (tool, options) => {
    const profileName = program.getOptionValue('profile') || 'all';

    const { NCPOrchestrator } = await import('../orchestrator/ncp-orchestrator.js');
    const orchestrator = new NCPOrchestrator(profileName);

    await orchestrator.initialize();

    // If tool doesn't contain a colon, try to find matching tools first
    if (!tool.includes(':')) {
      console.log(chalk.dim(`🔍 Searching for tools matching "${tool}"...`));

      try {
        const matchingTools = await orchestrator.find(tool, 5, false);

        if (matchingTools.length === 0) {
          console.log(OutputFormatter.error(`No tools found matching "${tool}"`));
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
        console.log(OutputFormatter.error(`Error searching for tools: ${error.message}`));
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
            console.log(OutputFormatter.error('Error during parameter input'));
            await orchestrator.cleanup();
            return;
          }
        } else if (requiredParams.length > 0 && options.prompt === false) {
          console.log(OutputFormatter.error('This tool requires parameters'));
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
        console.log(ErrorHandler.formatForConsole(errorResult));
      } else {
        console.log(OutputFormatter.success('Tool execution completed'));

        // Use JSON syntax highlighting for better readability
        if (options.jsonStyle === 'none') {
          console.log(JSON.stringify(result.content, null, 2));
        } else {
          const { formatJson } = await import('../utils/highlighting.js');
          console.log(formatJson(result.content, options.jsonStyle));
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
      console.log(ErrorHandler.formatForConsole(errorResult));
    }

    await orchestrator.cleanup();
  });

program.parse();
}