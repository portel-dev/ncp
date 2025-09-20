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
  .description('List all profiles and their MCPs')
  .option('--limit <number>', 'Maximum number of items to show (default: 20)')
  .option('--page <number>', 'Page number for pagination (default: 1)')
  .option('--depth <number>', 'Display depth: 0=profiles only, 1=profiles+MCPs+description, 2=profiles+MCPs+description+tools (default: 2)')
  .action(async (options) => {
    const limit = parseInt(options.limit || '20');
    const page = parseInt(options.page || '1');
    const depth = parseInt(options.depth || '2');

    const manager = new ProfileManager();
    await manager.initialize();

    const profiles = manager.listProfiles();

    if (profiles.length === 0) {
      console.log(chalk.yellow('📋 No profiles configured'));
      console.log(chalk.dim('💡 Use: ncp add <name> <command> to add an MCP server'));
      return;
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
          mcpDescriptions[mcpName] = getMCPDescription(mcpName);
          mcpToolCounts[mcpName] = mcpStats[mcpName].toolCount;
        }
      } catch (error) {
        // If orchestrator fails, continue without descriptions
        console.log(chalk.dim('Note: Could not load MCP descriptions and tool counts'));
      }
    }

    console.log(chalk.bold.white('\n📋 Configured Profiles:\n'));

    let totalMCPs = 0;
    for (const profileName of profiles) {
      const mcps = manager.getProfileMCPs(profileName);
      const mcpCount = mcps ? Object.keys(mcps).length : 0;
      totalMCPs += mcpCount;

      // Profile header with count
      const countBadge = mcpCount > 0 ? chalk.green(`${mcpCount} MCPs`) : chalk.dim('empty');
      console.log(`📦 ${chalk.bold.white(profileName)}`, chalk.dim(`(${countBadge})`));

      // Depth 0: profiles only - skip MCP details
      if (depth === 0) {
        // Already showing profile, nothing more needed
      } else if (mcps && Object.keys(mcps).length > 0) {
        const mcpEntries = Object.entries(mcps);
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
            const wrappedLines = wrapTextWithBackgroundIndent(commandText, maxWidth, `  ${indent} `);
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

// Helper function to wrap text with proper indentation
function wrapText(text: string, maxWidth: number, indent: string = ''): string {
  if (text.length <= maxWidth) {
    return text;
  }

  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Single word is longer than maxWidth, just use it
        lines.push(word);
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  // Join lines with proper indentation for continuation lines
  return lines.map((line, index) =>
    index === 0 ? line : `\n${indent}${line}`
  ).join('');
}

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

// Helper function to wrap text with background color applied to each line including indentation
function wrapTextWithBackgroundIndent(text: string, maxWidth: number, indent: string): string {
  if (text.length <= maxWidth) {
    return `${indent}${chalk.bgGray.black(text)}`;
  }

  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Single word is longer than maxWidth, just use it
        lines.push(word);
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  // Apply background color to each line with proper indentation
  return lines.map((line, index) =>
    `${indent}${chalk.bgGray.black(line)}`
  ).join('\n');
}

// Helper function to get MCP descriptions
function getMCPDescription(mcpName: string): string {
  const descriptions: Record<string, string> = {
    'filesystem': 'File and directory operations',
    'memory': 'Persistent memory and note-taking',
    'sequential-thinking': 'Step-by-step reasoning and analysis',
    'shell': 'System shell command execution',
    'portel': 'Portel integration and tools',
    'tavily': 'Web search and research',
    'desktop-commander': 'Desktop automation and control',
    'stripe': 'Payment processing and Stripe API',
    'context7-mcp': 'Context7 documentation and library access',
    'github': 'GitHub repository operations',
    'git': 'Git version control operations',
    'database': 'Database operations and queries',
    'web-search': 'Web search and information retrieval',
    'demo-fs': 'Demo filesystem operations',
    'demo-web': 'Demo web search functionality',
    'test-mcp2': 'Test MCP server'
  };

  return descriptions[mcpName] || 'MCP server';
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
            console.log(chalk.red('❌ Error during parameter input'));
            await orchestrator.cleanup();
            return;
          }
        } else if (requiredParams.length > 0 && options.prompt === false) {
          console.log(chalk.red('❌ Error: This tool requires parameters'));
          console.log(chalk.yellow(`💡 Use: ncp run ${tool} --params '{"param": "value"}'`));
          console.log(chalk.yellow(`💡 Or use: ncp find "${tool}" --depth 2 to see required parameters`));
          console.log(chalk.yellow(`💡 Or remove --no-prompt to use interactive prompting`));
          await orchestrator.cleanup();
          return;
        }
      }
    }

    console.log(chalk.blue(`🚀 Running ${tool}...\n`));

    const result = await orchestrator.run(tool, parameters);

    if (result.success) {
      console.log(chalk.green('✅ Success!'));

      // Use JSON syntax highlighting for better readability
      if (options.jsonStyle === 'none') {
        console.log(JSON.stringify(result.content, null, 2));
      } else {
        const { formatJson } = await import('../utils/highlighting.js');
        console.log(formatJson(result.content, options.jsonStyle));
      }
    } else {
      console.log(chalk.red('❌ Failed!'));
      console.log(chalk.red(result.error));
    }

    await orchestrator.cleanup();
  });

program.parse();
}