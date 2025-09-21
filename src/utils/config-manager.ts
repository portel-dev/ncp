import { readFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import chalk from 'chalk';
import clipboardy from 'clipboardy';
import { ProfileManager } from '../profiles/profile-manager.js';
import { OutputFormatter } from '../services/output-formatter.js';
import { ErrorHandler } from '../services/error-handler.js';

interface MCPConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface MCPImportData {
  [mcpName: string]: MCPConfig;
}

export class ConfigManager {
  private profileManager: ProfileManager;

  constructor() {
    this.profileManager = new ProfileManager();
  }

  /**
   * Show the location of NCP config files
   */
  async showConfigLocations(): Promise<void> {
    await this.profileManager.initialize();
    const configDir = this.profileManager.getConfigPath();

    console.log(chalk.blue('📁 NCP Configuration:'));
    console.log(`  Profiles Directory: ${configDir}`);

    if (existsSync(configDir)) {
      console.log(chalk.green('  ✓ Config directory exists'));

      // List existing profiles
      const profiles = this.profileManager.listProfiles();
      if (profiles.length > 0) {
        console.log(`  📋 Found ${profiles.length} profiles:`);
        profiles.forEach(profile => {
          const profilePath = this.profileManager.getProfilePath(profile);
          console.log(`    • ${profile}: ${profilePath}`);
        });
      } else {
        console.log(chalk.yellow('    No profiles created yet'));
      }
    } else {
      console.log(chalk.yellow('  ⚠ Config directory will be created on first use'));
    }
  }

  /**
   * Open existing config directory in default editor/explorer
   */
  async editConfig(): Promise<void> {
    await this.profileManager.initialize();
    const configDir = this.profileManager.getConfigPath();

    if (!existsSync(configDir)) {
      console.log(chalk.yellow('⚠ Config directory does not exist yet. Use "ncp config --import" to create it.'));
      return;
    }

    const profiles = this.profileManager.listProfiles();
    if (profiles.length === 0) {
      console.log(chalk.yellow('⚠ No profile files exist yet. Use "ncp config --import" to create them.'));
      return;
    }

    // Just show the config location and files
    console.log(chalk.green('✓ Configuration location:'));
    console.log(OutputFormatter.info(`Config directory: ${configDir}`));
    console.log(OutputFormatter.info(`Profile files:`));
    profiles.forEach(profile => {
      console.log(OutputFormatter.bullet(`${profile}.json`));
    });
    console.log('');
    console.log(chalk.blue('💡 You can edit these files directly with your preferred editor'))
  }

  /**
   * Import MCP configurations using interactive editor
   */
  async importConfig(filePath?: string, profileName: string = 'default', dryRun: boolean = false): Promise<void> {
    if (filePath) {
      // Import from file
      await this.importFromFile(filePath, profileName, dryRun);
    } else {
      // Interactive import with editor
      await this.importInteractive(profileName, dryRun);
    }
  }

  /**
   * Validate current configuration
   */
  async validateConfig(): Promise<void> {
    await this.profileManager.initialize();
    const configDir = this.profileManager.getConfigPath();

    if (!existsSync(configDir)) {
      console.log(chalk.yellow('⚠ No config directory found. Nothing to validate.'));
      return;
    }

    const profiles = this.profileManager.listProfiles();
    if (profiles.length === 0) {
      console.log(chalk.yellow('⚠ No profile files found. Nothing to validate.'));
      return;
    }

    let totalMCPs = 0;
    let issues: string[] = [];
    let validProfiles = 0;

    for (const profileName of profiles) {
      try {
        const profilePath = this.profileManager.getProfilePath(profileName);
        const profileContent = readFileSync(profilePath, 'utf-8');
        const profile = JSON.parse(profileContent);

        // Validate profile structure
        if (!profile.name) {
          issues.push(`Profile "${profileName}" missing name field`);
        }

        if (!profile.mcpServers || typeof profile.mcpServers !== 'object') {
          issues.push(`Profile "${profileName}" missing or invalid mcpServers field`);
          continue;
        }

        // Validate each MCP in this profile
        for (const [mcpName, mcpConfig] of Object.entries(profile.mcpServers)) {
          totalMCPs++;
          const config = mcpConfig as MCPConfig;

          if (!config.command) {
            issues.push(`MCP "${mcpName}" in profile "${profileName}" missing command`);
          }

          if (config.args && !Array.isArray(config.args)) {
            issues.push(`MCP "${mcpName}" in profile "${profileName}" has invalid args (must be array)`);
          }

          if (config.env && typeof config.env !== 'object') {
            issues.push(`MCP "${mcpName}" in profile "${profileName}" has invalid env (must be object)`);
          }
        }

        validProfiles++;
      } catch (error: any) {
        issues.push(`Profile "${profileName}" has invalid JSON: ${error.message}`);
      }
    }

    if (issues.length === 0) {
      console.log(chalk.green(`✓ Configuration is valid`));
      console.log(chalk.blue(`  Found ${totalMCPs} MCP servers across ${validProfiles} profiles`));
    } else {
      console.log(chalk.red(`✗ Configuration has ${issues.length} issues:`));
      issues.forEach(issue => {
        console.log(chalk.red(`  • ${issue}`));
      });
    }
  }

  /**
   * Import from a JSON file
   */
  private async importFromFile(filePath: string, profileName: string, dryRun: boolean): Promise<void> {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const parsedData = JSON.parse(content);

      // Clean the data to handle Claude Desktop format and remove unwanted entries
      const mcpData = this.cleanImportData(parsedData);

      await this.processImportData(mcpData, profileName, dryRun);
    } catch (error: any) {
      const errorResult = ErrorHandler.handle(error, ErrorHandler.fileOperation('import', filePath));
      console.log(ErrorHandler.formatForConsole(errorResult));
    }
  }

  /**
   * Interactive import - clipboard-first approach
   */
  private async importInteractive(profileName: string, dryRun: boolean): Promise<void> {
    console.log(chalk.blue('📋 NCP Config Import'));
    console.log('');

    try {
      // Try to read from clipboard
      let clipboardContent = '';
      try {
        clipboardContent = await clipboardy.read();
      } catch (clipboardError) {
        console.log(chalk.red('❌ Could not access system clipboard'));
        console.log(chalk.yellow('💡 Copy your MCP configuration JSON first, then run this command again'));
        console.log(chalk.yellow('💡 Or use: ncp config import <file> to import from a file'));
        return;
      }

      // Check if clipboard has content
      if (!clipboardContent.trim()) {
        console.log(chalk.red('❌ Clipboard is empty'));
        console.log(chalk.yellow('💡 Copy your MCP configuration JSON first, then run this command again'));
        console.log(chalk.yellow('💡 Or use: ncp config import <file> to import from a file'));
        console.log('');
        console.log(chalk.dim('Common config file locations:'));
        console.log(chalk.dim('  Claude Desktop (macOS): ~/Library/Application Support/Claude/claude_desktop_config.json'));
        console.log(chalk.dim('  Claude Desktop (Windows): %APPDATA%\\Claude\\claude_desktop_config.json'));
        return;
      }

      // Display clipboard content in a highlighted box
      console.log(chalk.blue('📋 Clipboard content detected:'));
      this.displayJsonInBox(clipboardContent);
      console.log('');

      // Try to parse clipboard content as JSON
      let parsedData: any;
      try {
        parsedData = JSON.parse(clipboardContent);
      } catch (jsonError) {
        console.log(chalk.red('❌ Invalid JSON format in clipboard'));
        console.log(chalk.yellow('💡 Please ensure your clipboard contains valid JSON'));
        return;
      }

      // Check if it's a direct MCP config (has "command" property at root level)
      const isDirectConfig = parsedData.command && typeof parsedData === 'object' && !Array.isArray(parsedData);

      let mcpData: any;
      let mcpNames: string[];

      if (isDirectConfig) {
        // Handle direct MCP configuration
        console.log(chalk.green('✅ Single MCP configuration detected'));

        // Prompt for name
        console.log('');
        console.log(chalk.blue('❓ What should we name this MCP server?'));
        console.log(chalk.gray('   (e.g., \'filesystem\', \'web-search\', \'github\')'));

        const mcpName = await this.promptForMCPName(parsedData.command);

        mcpData = { [mcpName]: parsedData };
        mcpNames = [mcpName];
      } else {
        // Handle key-value format (multiple MCPs or client config)
        mcpData = this.cleanImportData(parsedData);
        mcpNames = Object.keys(mcpData).filter(key => {
          if (key.startsWith('//')) return false;
          const config = mcpData[key];
          return config && typeof config === 'object' && config.command;
        });

        if (mcpNames.length > 0) {
          console.log(chalk.green(`✅ ${mcpNames.length} MCP configuration(s) detected`));
        } else {
          console.log(chalk.red('❌ No valid MCP configurations found'));
          console.log(chalk.yellow('💡 Expected JSON with MCP server configurations'));
          console.log(chalk.dim('   Example: {"server": {"command": "npx", "args": ["..."]}}'));
          return;
        }
      }

      console.log('');
      await this.processImportData(mcpData, profileName, dryRun);

    } catch (error: any) {
      console.log('');
      const errorResult = ErrorHandler.handle(error, ErrorHandler.createContext('config', 'import', undefined, ['Check the JSON format', 'Ensure the clipboard contains valid MCP configuration']));
      console.log(ErrorHandler.formatForConsole(errorResult));
    }
  }

  /**
   * Display JSON content in a highlighted box
   */
  private displayJsonInBox(jsonContent: string): void {
    // Pretty format the JSON for display
    let formattedJson: string;
    try {
      const parsed = JSON.parse(jsonContent);
      formattedJson = JSON.stringify(parsed, null, 2);
    } catch {
      // If parsing fails, use original content
      formattedJson = jsonContent;
    }

    // Split into lines and add box borders
    const lines = formattedJson.split('\n');
    const maxLength = Math.max(...lines.map(line => line.length), 20);
    const boxWidth = Math.min(maxLength + 4, 80); // Limit box width to 80 chars

    // Top border
    console.log(chalk.gray('┌' + '─'.repeat(boxWidth - 2) + '┐'));

    // Content lines (truncate if too long)
    lines.slice(0, 20).forEach(line => { // Limit to 20 lines
      let displayLine = line;
      if (line.length > boxWidth - 4) {
        displayLine = line.substring(0, boxWidth - 7) + '...';
      }
      const padding = ' '.repeat(Math.max(0, boxWidth - displayLine.length - 4));
      console.log(chalk.gray('│ ') + chalk.cyan(displayLine) + padding + chalk.gray(' │'));
    });

    // Show truncation indicator if there are more lines
    if (lines.length > 20) {
      const truncatedMsg = `... (${lines.length - 20} more lines)`;
      const padding = ' '.repeat(Math.max(0, boxWidth - truncatedMsg.length - 4));
      console.log(chalk.gray('│ ') + chalk.dim(truncatedMsg) + padding + chalk.gray(' │'));
    }

    // Bottom border
    console.log(chalk.gray('└' + '─'.repeat(boxWidth - 2) + '┘'));
  }

  /**
   * Process and import MCP data
   */
  private async processImportData(mcpData: MCPImportData, profileName: string, dryRun: boolean): Promise<void> {
    await this.profileManager.initialize();

    const mcpNames = Object.keys(mcpData).filter(key => !key.startsWith('//'));

    if (mcpNames.length === 0) {
      console.log(chalk.yellow('⚠ No MCP configurations found to import'));
      return;
    }

    if (dryRun) {
      console.log(chalk.blue(`🔍 Dry run - would import ${mcpNames.length} MCPs to profile '${profileName}':`));
      mcpNames.forEach(name => {
        const config = mcpData[name];
        console.log(`  • ${name}: ${config.command} ${config.args?.join(' ') || ''}`);
      });
      return;
    }

    // Actually import the MCPs
    console.log(chalk.blue(`🚀 Importing ${mcpNames.length} MCP server(s) to profile '${profileName}'...`));
    console.log('');

    const successful: Array<{name: string, config: MCPConfig}> = [];
    const failed: Array<{name: string, error: string}> = [];

    for (const mcpName of mcpNames) {
      try {
        const config = mcpData[mcpName];
        await this.profileManager.addMCPToProfile(profileName, mcpName, config);
        successful.push({ name: mcpName, config });
      } catch (error: any) {
        failed.push({ name: mcpName, error: error.message });
      }
    }

    // Show results
    if (successful.length > 0) {
      console.log(chalk.green(`✅ Successfully imported ${successful.length} MCP server(s):`));
      successful.forEach(({ name, config }) => {
        const commandDisplay = config.args && config.args.length > 0
          ? `${config.command} ${config.args.join(' ')}`
          : config.command;
        console.log(`  ${chalk.cyan('•')} ${chalk.bold(name)} → ${chalk.dim(commandDisplay)}`);
      });
      console.log('');
    }

    if (failed.length > 0) {
      console.log(chalk.red(`❌ Failed to import ${failed.length} server(s):`));
      failed.forEach(({ name, error }) => {
        console.log(`  ${chalk.red('•')} ${chalk.bold(name)} → ${chalk.dim(error)}`);
      });
      console.log('');
    }

    if (successful.length > 0) {
      console.log(chalk.blue('💡 Next steps:'));
      console.log(chalk.blue(`  🔍 Test discovery: ncp find "file tools"`));
      console.log(chalk.blue(`  📋 List all MCPs: ncp list`));
      console.log(chalk.blue(`  🎯 Update your AI client config to use NCP`));
    }
  }

  /**
   * Clean template comments and example data from import
   */
  private cleanImportData(data: any): MCPImportData {
    const cleaned: MCPImportData = {};

    // Check if this is a Claude Desktop config format with mcpServers wrapper
    if (data.mcpServers && typeof data.mcpServers === 'object') {
      data = data.mcpServers;
    }

    for (const [key, value] of Object.entries(data)) {
      // Skip template comments and example sections
      if (key.startsWith('//') || key.includes('Example') || key.includes('Your MCPs')) {
        continue;
      }

      // Skip NCP entries themselves to avoid circular references
      if (key.toLowerCase().startsWith('ncp')) {
        continue;
      }

      // Validate that value is a valid MCP config object
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const mcpConfig = value as any;
        // Must have a command property to be valid
        if (mcpConfig.command && typeof mcpConfig.command === 'string') {
          cleaned[key] = mcpConfig as MCPConfig;
        }
      }
    }

    return cleaned;
  }


  /**
   * Prompt user for MCP name with smart suggestions
   */
  private async promptForMCPName(command: string): Promise<string> {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Generate smart suggestion based on command
    const suggestion = this.generateMCPNameSuggestion(command);

    return new Promise((resolve) => {
      const prompt = suggestion
        ? `➤ MCP name [${chalk.cyan(suggestion)}]: `
        : `➤ MCP name: `;

      rl.question(prompt, (answer) => {
        rl.close();
        const finalName = answer.trim() || suggestion || 'unnamed-mcp';
        console.log(chalk.green(`  ✅ Using name: '${finalName}'`));
        resolve(finalName);
      });
    });
  }

  /**
   * Generate smart MCP name suggestions based on command
   */
  private generateMCPNameSuggestion(command: string): string {
    // Remove common prefixes and suffixes
    let suggestion = command
      .replace(/^mcp-/, '')           // Remove "mcp-" prefix
      .replace(/-server$/, '')        // Remove "-server" suffix
      .replace(/-mcp$/, '')           // Remove "-mcp" suffix
      .replace(/^@[\w-]+\//, '')      // Remove npm scope like "@org/"
      .toLowerCase();

    // Handle common patterns
    const patterns: Record<string, string> = {
      'filesystem': 'filesystem',
      'file': 'filesystem',
      'web-search': 'web',
      'search': 'web-search',
      'github': 'github',
      'git': 'git',
      'database': 'database',
      'db': 'database',
      'shell': 'shell',
      'terminal': 'shell'
    };

    return patterns[suggestion] || suggestion || 'mcp-server';
  }
}