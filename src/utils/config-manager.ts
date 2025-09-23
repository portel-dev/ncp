import { readFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import chalk from 'chalk';
import clipboardy from 'clipboardy';
import { ProfileManager } from '../profiles/profile-manager.js';
import { OutputFormatter } from '../services/output-formatter.js';
import { ErrorHandler } from '../services/error-handler.js';
import { formatCommandDisplay } from '../utils/security.js';
import { TextUtils } from '../utils/text-utils.js';

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
    console.log(chalk.dim('💡 You can edit these files directly with your preferred editor'))
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
    // Expand tilde to home directory
    const { homedir } = await import('os');
    const expandedPath = filePath.startsWith('~') ?
      filePath.replace('~', homedir()) :
      filePath;

    if (!existsSync(expandedPath)) {
      throw new Error(`Configuration file not found at: ${filePath}\n\nPlease check that the file exists and the path is correct.`);
    }

    try {
      const content = readFileSync(expandedPath, 'utf-8');
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
      console.log('\n' + chalk.blue(`📥 Would import ${mcpNames.length} MCP server(s):`));
      console.log('');

      mcpNames.forEach((name, index) => {
        const config = mcpData[name];
        const isLast = index === mcpNames.length - 1;
        const connector = isLast ? '└──' : '├──';
        const indent = isLast ? '   ' : '│  ';

        // MCP name (no indent - root level)
        console.log(chalk.gray(`${connector} `) + chalk.cyan(name));

        // Command line with reverse colors (like ncp list)
        const fullCommand = formatCommandDisplay(config.command, config.args);
        const maxWidth = process.stdout.columns ? process.stdout.columns - 4 : 80;
        const wrappedLines = TextUtils.wrapTextWithBackground(fullCommand, maxWidth, chalk.gray(`${indent} `), (text: string) => chalk.bgGray.black(text));
        console.log(wrappedLines);

        // Environment variables if present
        if (config.env && Object.keys(config.env).length > 0) {
          const envCount = Object.keys(config.env).length;
          console.log(chalk.gray(`${indent} `) + chalk.yellow(`${envCount} environment variable${envCount > 1 ? 's' : ''}`));
        }

        if (!isLast) console.log(chalk.gray('│'));
      });

      console.log('');
      console.log(chalk.dim('💡 Run without --dry-run to perform the import'));
      return;
    }

    // Actually import the MCPs
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

    // Import phase completed, now validate what actually works
    if (successful.length > 0) {
      console.log(''); // Add newline before spinner starts

      // Show loading animation during validation
      const spinner = this.createSpinner(`✅ Validating ${successful.length} imported MCP server(s)...`);
      spinner.start();

      const discoveryResult = await this.discoverImportedMCPs(successful.map(s => s.name));

      // Clear spinner and show final result
      spinner.stop();
      process.stdout.write('\r\x1b[K'); // Clear the line

      // Show successfully working MCPs
      if (discoveryResult.successful.length > 0) {
        console.log(chalk.green(`✅ Successfully imported ${discoveryResult.successful.length} MCP server(s):`));
        console.log('');

        // Show profile header like ncp list
        console.log(`📦 ${chalk.bold.white('all')} ${chalk.dim(`(${discoveryResult.successful.length} MCPs)`)}`);

        // Show in ncp list format with rich data from fresh cache
        await this.displayImportedMCPs(discoveryResult.successful);
      }

      // Show MCPs that failed with actual error messages
      if (discoveryResult.failed.length > 0) {
        console.log(chalk.red(`❌ ${discoveryResult.failed.length} MCP(s) failed to connect:`));
        discoveryResult.failed.forEach(({ name, error }) => {
          console.log(chalk.red(`   • ${name}: `) + chalk.dim(error));
        });
        console.log('');
      }
    }

    if (failed.length > 0) {
      console.log(chalk.red(`❌ Failed to import ${failed.length} server(s):`));
      failed.forEach(({ name, error }) => {
        console.log(`  ${chalk.red('•')} ${chalk.bold(name)} → ${chalk.dim(error)}`);
      });
      console.log('');
    }

    if (successful.length > 0) {
      console.log(chalk.dim('💡 Next steps:'));
      console.log(chalk.dim('  •') + ' Test discovery: ' + chalk.cyan('ncp find "file tools"'));
      console.log(chalk.dim('  •') + ' List all MCPs: ' + chalk.cyan('ncp list'));
      console.log(chalk.dim('  •') + ' Update your AI client config to use NCP');
    }
  }

  /**
   * Run discovery for imported MCPs to populate cache and check which ones work
   * @returns Object with successful and failed MCPs with error details
   */
  private async discoverImportedMCPs(importedMcpNames: string[]): Promise<{successful: string[], failed: Array<{name: string, error: string}>}> {
    const successful: string[] = [];
    const failed: Array<{name: string, error: string}> = [];

    try {
      // Import health monitor to get real error messages
      const { healthMonitor } = await import('./health-monitor.js');

      // Get the imported MCP configurations for direct health checks
      const profileManager = new ProfileManager();
      await profileManager.initialize();
      const profile = await profileManager.getProfile('all');

      if (!profile) {
        throw new Error('Profile not found');
      }

      // Perform direct health checks on imported MCPs
      for (const mcpName of importedMcpNames) {
        const mcpConfig = profile.mcpServers[mcpName];
        if (!mcpConfig) {
          failed.push({
            name: mcpName,
            error: 'MCP configuration not found in profile'
          });
          continue;
        }

        try {
          // Direct health check using the health monitor
          const health = await healthMonitor.checkMCPHealth(
            mcpName,
            mcpConfig.command,
            mcpConfig.args || [],
            mcpConfig.env
          );

          if (health.status === 'healthy') {
            successful.push(mcpName);
          } else {
            failed.push({
              name: mcpName,
              error: health.lastError || health.disabledReason || 'Health check failed'
            });
          }
        } catch (error) {
          failed.push({
            name: mcpName,
            error: `Health check error: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }

      // If we have successful MCPs, run discovery to populate cache for display
      if (successful.length > 0) {
        try {
          const { NCPOrchestrator } = await import('../orchestrator/ncp-orchestrator.js');
          const orchestrator = new NCPOrchestrator();
          await orchestrator.initialize();
          await orchestrator.find('', 1000, false);
          await orchestrator.cleanup();
        } catch (error) {
          // Discovery failure doesn't affect health check results, just cache population
          console.log('Cache population failed, but health checks completed');
        }
      }

    } catch (error) {
      // If the entire process fails, all are considered failed
      for (const mcpName of importedMcpNames) {
        failed.push({
          name: mcpName,
          error: `Discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }

    return { successful, failed };
  }

  /**
   * Display imported MCPs in ncp list style with rich data (descriptions, versions, tool counts)
   */
  private async displayImportedMCPs(importedMcpNames: string[]): Promise<void> {
    // Load cache data for rich display
    const mcpDescriptions: Record<string, string> = {};
    const mcpToolCounts: Record<string, number> = {};
    const mcpVersions: Record<string, string> = {};

    await this.loadMCPInfoFromCache(mcpDescriptions, mcpToolCounts, mcpVersions);

    // Get the imported MCPs' configurations
    const profiles = this.profileManager.listProfiles();
    const allMcps: Record<string, MCPConfig> = {};

    // Collect all MCPs from all profiles to get the config
    for (const profileName of profiles) {
      try {
        const profileConfig = await this.profileManager.getProfile(profileName);
        if (profileConfig?.mcpServers) {
          Object.assign(allMcps, profileConfig.mcpServers);
        }
      } catch (error) {
        // Skip invalid profiles
      }
    }

    // Filter to only show imported MCPs
    const filteredMcps: Record<string, MCPConfig> = {};
    for (const mcpName of importedMcpNames) {
      if (allMcps[mcpName]) {
        filteredMcps[mcpName] = allMcps[mcpName];
      }
    }

    if (Object.keys(filteredMcps).length === 0) {
      console.log(chalk.yellow('⚠ No imported MCPs found to display'));
      return;
    }

    // Display without the "all" header - just show imported MCPs directly

    const mcpEntries = Object.entries(filteredMcps);
    mcpEntries.forEach(([mcpName, config], index) => {
      const isLast = index === mcpEntries.length - 1;
      const connector = isLast ? '└──' : '├──';
      const indent = isLast ? '   ' : '│  ';

      // MCP name with tool count and version (like ncp list) - handle case variations
      const capitalizedName = mcpName.charAt(0).toUpperCase() + mcpName.slice(1);
      const toolCount = mcpToolCounts[mcpName] ?? mcpToolCounts[capitalizedName];
      const versionPart = (mcpVersions[mcpName] ?? mcpVersions[capitalizedName]) ?
                         chalk.magenta(`v${mcpVersions[mcpName] ?? mcpVersions[capitalizedName]}`) : '';
      const toolPart = toolCount !== undefined ? chalk.green(`${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}`) : '';

      let nameDisplay = chalk.bold.cyanBright(mcpName);

      // Format: (v1.0.0 | 4 tools) with version first, all inside parentheses - like ncp list
      const badge = versionPart && toolPart ? chalk.dim(` (${versionPart} | ${toolPart})`) :
                   versionPart ? chalk.dim(` (${versionPart})`) :
                   toolPart ? chalk.dim(` (${toolPart})`) : '';

      nameDisplay += badge;

      // Indent properly under the profile (like ncp list)
      console.log(`  ${connector} ${nameDisplay}`);

      // Description if available (depth >= 1)
      const description = mcpDescriptions[mcpName];
      if (description && description.toLowerCase() !== mcpName.toLowerCase()) {
        console.log(`  ${indent} ${chalk.white(description)}`);
      }

      // Command with reverse colors (depth >= 2)
      const commandText = formatCommandDisplay(config.command, config.args);
      const maxWidth = process.stdout.columns ? process.stdout.columns - 6 : 80;
      const wrappedLines = TextUtils.wrapTextWithBackground(commandText, maxWidth, `  ${indent} `, (text: string) => chalk.bgGray.black(text));
      console.log(wrappedLines);

      if (!isLast) console.log(`  │`);
    });

    console.log('');
  }

  /**
   * Load MCP info from cache (copied from CLI list command)
   */
  private async loadMCPInfoFromCache(
    mcpDescriptions: Record<string, string>,
    mcpToolCounts: Record<string, number>,
    mcpVersions: Record<string, string>
  ): Promise<boolean> {
    try {
      const { readFileSync, existsSync } = await import('fs');
      const { join } = await import('path');
      const { homedir } = await import('os');

      const cacheDir = join(homedir(), '.ncp', 'cache');
      const cachePath = join(cacheDir, 'all-tools.json');

      if (!existsSync(cachePath)) {
        return false; // No cache available
      }

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
      return true;
    } catch (error) {
      // No cache available - just show basic info
      return false;
    }
  }

  /**
   * Create a simple spinner for loading animation
   */
  private createSpinner(message: string) {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    let intervalId: NodeJS.Timeout;

    return {
      start: () => {
        intervalId = setInterval(() => {
          process.stdout.write(`\r${chalk.dim(frames[i % frames.length])} ${message}`);
          i++;
        }, 100);
      },
      stop: () => {
        if (intervalId) {
          clearInterval(intervalId);
        }
      }
    };
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