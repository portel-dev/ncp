import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createInterface } from 'readline';
import chalk from 'chalk';
import clipboardy from 'clipboardy';
import { ProfileManager } from '../profiles/profile-manager.js';
import { OutputFormatter } from '../services/output-formatter.js';
import { ErrorHandler } from '../services/error-handler.js';

const execAsync = promisify(exec);

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

    try {
      // Open the config directory in default file manager/editor
      await this.openFileInDefaultEditor(configDir, false);
      console.log(chalk.green('✓ Opened config directory in your default file manager'));
      console.log(chalk.blue(`  Found ${profiles.length} profile files: ${profiles.join(', ')}`));
    } catch (error: any) {
      const errorResult = ErrorHandler.handle(error, ErrorHandler.fileOperation('open', configDir));
      console.log(ErrorHandler.formatForConsole(errorResult));
      console.log(OutputFormatter.info(`Config directory location: ${configDir}`));
      console.log(OutputFormatter.info(`Profile files:`));
      profiles.forEach(profile => {
        console.log(OutputFormatter.bullet(`${profile}.json`));
      });
    }
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
      const mcpData = JSON.parse(content);

      await this.processImportData(mcpData, profileName, dryRun);
    } catch (error: any) {
      const errorResult = ErrorHandler.handle(error, ErrorHandler.fileOperation('import', filePath));
      console.log(ErrorHandler.formatForConsole(errorResult));
    }
  }

  /**
   * Interactive import - tries clipboard first, fallback to editor
   */
  private async importInteractive(profileName: string, dryRun: boolean): Promise<void> {
    console.log(chalk.blue('🔄 NCP Config Import - Smart Detection Active'));
    console.log(chalk.gray('   Workflow: Clipboard → Editor (automatic fallback)'));
    console.log('');

    try {
      // First, try to read from clipboard
      console.log(chalk.blue('📋 Step 1: Checking clipboard for MCP configuration...'));

      let clipboardContent = '';
      try {
        clipboardContent = await clipboardy.read();
      } catch (clipboardError) {
        console.log(chalk.yellow('  ❌ Could not access system clipboard'));
        console.log(chalk.blue('  ➡️  Skipping to editor mode'));
        console.log('');
      }

      // Try to parse clipboard content as JSON
      if (clipboardContent.trim()) {
        console.log(chalk.green('  ✓ Found clipboard content'));
        console.log(chalk.blue('  🔍 Validating JSON format...'));

        try {
          const parsedData = JSON.parse(clipboardContent);

          // Check if it's a direct MCP config (has "command" property at root level)
          const isDirectConfig = parsedData.command && typeof parsedData === 'object' && !Array.isArray(parsedData);

          let mcpData: any;
          let mcpNames: string[];

          if (isDirectConfig) {
            // Handle direct MCP configuration
            console.log(chalk.green('  ✅ Single MCP configuration detected!'));
            console.log('');

            // Prompt for name
            console.log(chalk.blue('❓ What should we name this MCP server?'));
            console.log(chalk.gray('   (e.g., \'filesystem\', \'web-search\', \'github\')'));

            const mcpName = await this.promptForMCPName(parsedData.command);

            mcpData = { [mcpName]: parsedData };
            mcpNames = [mcpName];

            console.log(chalk.green(`  ✅ Adding as '${mcpName}' to profile '${profileName}'`));
            console.log('');
          } else {
            // Handle key-value format
            mcpData = this.cleanImportData(parsedData);
            mcpNames = Object.keys(mcpData).filter(key => {
              if (key.startsWith('//')) return false;
              const config = mcpData[key];
              return config && typeof config === 'object' && config.command;
            });

            if (mcpNames.length > 0) {
              console.log(chalk.green(`  ✅ Multiple MCP configurations detected!`));
              console.log(chalk.green(`  📊 Found ${mcpNames.length} MCP server(s) to import`));
            }
          }

          if (mcpNames.length > 0) {
            console.log(chalk.blue(`  🚀 Importing to profile '${profileName}'...`));
            console.log('');

            await this.processImportData(mcpData, profileName, dryRun);

            if (!dryRun) {
              console.log('');
              console.log(chalk.green('🎉 SUCCESS: Imported from clipboard!'));
            }
            return;
          } else {
            console.log(chalk.yellow('  ❌ Valid JSON found, but no MCP configurations detected'));
          }
        } catch (jsonError) {
          console.log(chalk.yellow('  ❌ Clipboard content is not valid JSON'));
        }
      } else {
        console.log(chalk.yellow('  ❌ Clipboard is empty or contains only whitespace'));
      }

      // Fallback to editor mode
      console.log('');
      console.log(chalk.blue('📝 Step 2: Opening system default editor for manual configuration...'));
      console.log('');

      await this.importWithEditor(profileName, dryRun);

    } catch (error: any) {
      console.log('');
      const errorResult = ErrorHandler.handle(error, ErrorHandler.createContext('config', 'import', undefined, ['Check the JSON format', 'Ensure the file is readable']));
      console.log(ErrorHandler.formatForConsole(errorResult));
    }
  }

  /**
   * Import using system default editor (fallback method)
   */
  private async importWithEditor(profileName: string, dryRun: boolean): Promise<void> {
    const tempFile = join(tmpdir(), `ncp-import-${Date.now()}.json`);

    // Create template file
    const template = {
      "// Instructions": "Add your MCP server configurations below, then save and close",
      "// Example": {
        "filesystem": {
          "command": "mcp-filesystem",
          "args": ["--path", "/"]
        },
        "github": {
          "command": "mcp-github-server",
          "env": {
            "GITHUB_TOKEN": "your_token_here"
          }
        }
      },
      "// Your MCPs - Replace this section": {
        "your-mcp-name": {
          "command": "your-mcp-command",
          "args": ["optional", "arguments"]
        }
      }
    };

    writeFileSync(tempFile, JSON.stringify(template, null, 2));

    try {
      // Open in default editor
      await this.openFileInDefaultEditor(tempFile, true);
      console.log(chalk.green('  ✅ Template file opened in your default editor'));

      // Wait for user to finish editing
      console.log('');
      console.log(chalk.blue('  📝 Instructions:'));
      console.log(chalk.gray('     1. Replace the example configurations with your MCPs'));
      console.log(chalk.gray('     2. Save the file'));
      console.log(chalk.gray('     3. Close your editor'));
      console.log(chalk.gray('     4. Return here and press Enter'));
      console.log('');

      await this.waitForUserInput(chalk.blue('  ⏳ Press Enter when you\'re done editing...'));

      // Read and process the edited file
      console.log('');
      console.log(chalk.blue('  🔍 Reading your configuration...'));

      const editedContent = readFileSync(tempFile, 'utf-8');
      const mcpData = this.cleanImportData(JSON.parse(editedContent));

      const mcpCount = Object.keys(mcpData).filter(key => !key.startsWith('//')).length;
      console.log(chalk.green(`  ✅ Found ${mcpCount} MCP configuration(s)`));
      console.log(chalk.blue(`  🚀 Importing to profile '${profileName}'...`));
      console.log('');

      await this.processImportData(mcpData, profileName, dryRun);

      if (!dryRun) {
        console.log('');
        console.log(chalk.green('🎉 SUCCESS: Imported from editor!'));
      }

    } finally {
      // Cleanup temp file
      if (existsSync(tempFile)) {
        unlinkSync(tempFile);
      }
    }
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
    let successCount = 0;
    for (const mcpName of mcpNames) {
      try {
        const config = mcpData[mcpName];
        await this.profileManager.addMCPToProfile(profileName, mcpName, config);
        successCount++;
      } catch (error: any) {
        const errorResult = ErrorHandler.handle(error, ErrorHandler.createContext('profile', 'add', mcpName));
        console.log(ErrorHandler.formatForConsole(errorResult));
      }
    }

    if (successCount > 0) {
      console.log(OutputFormatter.success(`Successfully imported ${successCount} MCP server(s)`));
      console.log('');
      console.log(chalk.blue(`  🔍 Test with: ncp find "file tools"`));
      console.log(chalk.blue(`  📋 List all: ncp list`));
    }
  }

  /**
   * Clean template comments and example data from import
   */
  private cleanImportData(data: any): MCPImportData {
    const cleaned: MCPImportData = {};

    for (const [key, value] of Object.entries(data)) {
      // Skip template comments and example sections
      if (key.startsWith('//') || key.includes('Example') || key.includes('Your MCPs')) {
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
   * Open file in system default editor
   */
  private async openFileInDefaultEditor(filePath: string, showInstructions: boolean): Promise<void> {
    const platform = process.platform;
    let command: string;

    if (platform === 'darwin') {
      command = `open "${filePath}"`;
    } else if (platform === 'linux') {
      command = `xdg-open "${filePath}"`;
    } else if (platform === 'win32') {
      command = `start "" "${filePath}"`;
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    await execAsync(command);

    if (showInstructions) {
      console.log(chalk.green('✓ Opened template in your default editor'));
    }
  }

  /**
   * Wait for user input
   */
  private async waitForUserInput(message: string): Promise<void> {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(message, () => {
        rl.close();
        resolve();
      });
    });
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