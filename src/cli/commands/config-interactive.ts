/**
 * Interactive Configuration Command
 * Allows users to view and edit NCP settings interactively or via command-line
 */

import chalk from 'chalk';
import { createInterface } from 'readline';
import { loadGlobalSettings, saveGlobalSettings } from '../../utils/global-settings.js';
import { SettingsManager } from '../../services/scheduler/settings-manager.js';

interface ConfigOptions {
  autoImport: boolean;
  debugLogging: boolean;
  confirmModifications: boolean;
  enableScheduler: boolean;
  enableMCPManagement: boolean;
  logRotation: boolean;
}

/**
 * Known configuration keys and their types
 */
const KNOWN_KEYS: Record<string, 'boolean' | 'number' | 'string'> = {
  'autoImport': 'boolean',
  'debugLogging': 'boolean',
  'confirmModifications': 'boolean',
  'enableScheduler': 'boolean',
  'enableMCPManagement': 'boolean',
  'logRotation': 'boolean'
};

/**
 * Parse string value to appropriate type
 */
function parseValue(value: string, type: 'boolean' | 'number' | 'string'): any {
  if (type === 'boolean') {
    const truthy = ['true', 'yes', 'on', '1', 'enabled'];
    const falsy = ['false', 'no', 'off', '0', 'disabled'];
    const lower = value.toLowerCase();

    if (truthy.includes(lower)) return true;
    if (falsy.includes(lower)) return false;
    throw new Error(`Invalid boolean value: "${value}". Use true/false, yes/no, on/off, or 1/0`);
  }

  if (type === 'number') {
    const num = Number(value);
    if (isNaN(num)) throw new Error(`Invalid number value: "${value}"`);
    return num;
  }

  return value;
}

export class ConfigurationManager {
  private readline: any;

  constructor() {
    this.readline = createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Display current configuration
   */
  async showConfiguration(): Promise<void> {
    const globalSettings = await loadGlobalSettings();
    const schedulerSettings = new SettingsManager();
    const schedulerConfig = schedulerSettings.getConfig();

    console.log(chalk.bold.cyan('\n📋 Current Configuration\n'));

    // Auto-import Client MCPs
    const autoImportEnabled = !process.env.NCP_SKIP_AUTO_IMPORT;
    const autoImportStatus = autoImportEnabled ? chalk.green('[✓]') : chalk.gray('[✗]');
    console.log(`${autoImportStatus} ${chalk.bold('Auto-import Client MCPs')}`);
    console.log(`  ${chalk.dim('Automatically import all MCPs from your MCP client on startup')}`);

    // Enable Debug Logging
    const debugEnabled = process.env.DEBUG === 'true' || process.env.NCP_DEBUG === 'true';
    const debugStatus = debugEnabled ? chalk.green('[✓]') : chalk.gray('[✗]');
    console.log(`\n${debugStatus} ${chalk.bold('Enable Debug Logging')}`);
    console.log(`  ${chalk.dim('Show detailed logs for troubleshooting')}`);

    // Confirm Modifications Before Run
    const confirmEnabled = globalSettings.confirmBeforeRun.enabled;
    const confirmStatus = confirmEnabled ? chalk.green('[✓]') : chalk.gray('[✗]');
    console.log(`\n${confirmStatus} ${chalk.bold('Confirm Modifications Before Run')}`);
    console.log(`  ${chalk.dim('Show confirmation dialog before executing modification operations')}`);

    // Enable Scheduler
    const schedulerEnabled = schedulerConfig !== null;
    const schedulerStatus = schedulerEnabled ? chalk.green('[✓]') : chalk.gray('[✗]');
    console.log(`\n${schedulerStatus} ${chalk.bold('Enable Scheduler (Built-in)')}`);
    console.log(`  ${chalk.dim('Schedule tool executions with cron')}`);

    // Enable MCP Management
    const managementEnabled = true; // Always available
    const managementStatus = chalk.green('[✓]');
    console.log(`\n${managementStatus} ${chalk.bold('Enable MCP Management (Built-in)')}`);
    console.log(`  ${chalk.dim('Add, remove, and manage MCPs in your configuration')}`);

    // Log Rotation
    const logRotationEnabled = globalSettings.logRotation.enabled;
    const logRotationStatus = logRotationEnabled ? chalk.green('[✓]') : chalk.gray('[✗]');
    console.log(`\n${logRotationStatus} ${chalk.bold('Enable Log Rotation')}`);
    console.log(`  ${chalk.dim('Auto-rotate debug and protocol logs to prevent disk space issues')}`);
    console.log(`  ${chalk.dim(`Advanced: Edit maxDebugFiles (${globalSettings.logRotation.maxDebugFiles}) and maxProtocolLines (${globalSettings.logRotation.maxProtocolLines}) in settings.json`)}`);

    // Code Mode
    const codeModeEnabled = globalSettings.enableCodeMode;
    const codeModeStatus = codeModeEnabled ? chalk.green('[✓]') : chalk.gray('[✗]');
    const modeLabel = codeModeEnabled ? 'find-and-code' : 'find-and-run';
    console.log(`\n${codeModeStatus} ${chalk.bold('Code Mode')}`);
    console.log(`  ${chalk.dim(`Current mode: ${chalk.white(modeLabel)} (code tool always available internally)`)}\n`);
  }

  /**
   * Ask user if they want to edit
   */
  private async askToEdit(): Promise<boolean> {
    return new Promise((resolve) => {
      this.readline.question(
        chalk.bold('Do you want to edit? [y/N]: '),
        (answer: string) => {
          resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        }
      );
    });
  }

  /**
   * Ask a yes/no question
   */
  private async askYesNo(question: string, defaultValue: boolean): Promise<boolean> {
    return new Promise((resolve) => {
      const defaultAnswer = defaultValue ? 'Y/n' : 'y/N';
      this.readline.question(
        chalk.cyan(`${question}? [${defaultAnswer}]: `),
        (answer: string) => {
          if (answer.toLowerCase() === 'y') resolve(true);
          else if (answer.toLowerCase() === 'n') resolve(false);
          else resolve(defaultValue);
        }
      );
    });
  }

  /**
   * Interactive edit mode
   */
  async editConfiguration(): Promise<void> {
    console.log(chalk.bold.cyan('\n⚙️  Configuration Settings\n'));

    const globalSettings = await loadGlobalSettings();

    // Auto-import Client MCPs
    const autoImport = await this.askYesNo('Auto-import Client MCPs', true);

    // Enable Debug Logging
    const debugLogging = await this.askYesNo('Enable Debug Logging', false);

    // Confirm Modifications Before Run
    const confirmModifications = await this.askYesNo('Confirm Modifications Before Run', true);

    // Enable Scheduler
    const enableScheduler = await this.askYesNo('Enable Scheduler (Built-in)', true);

    // Enable MCP Management
    const enableMCPManagement = await this.askYesNo('Enable MCP Management (Built-in)', true);

    // Enable Log Rotation
    const logRotation = await this.askYesNo('Enable Log Rotation', globalSettings.logRotation.enabled);

    // Enable Code Mode
    const codeMode = await this.askYesNo('Enable Code Mode (find-and-code vs find-and-run)', globalSettings.enableCodeMode);

    // Save configuration
    if (autoImport) {
      delete process.env.NCP_SKIP_AUTO_IMPORT;
    } else {
      process.env.NCP_SKIP_AUTO_IMPORT = 'true';
    }

    if (debugLogging) {
      process.env.NCP_DEBUG = 'true';
    } else {
      delete process.env.NCP_DEBUG;
    }

    globalSettings.confirmBeforeRun.enabled = confirmModifications;
    globalSettings.logRotation.enabled = logRotation;
    globalSettings.enableCodeMode = codeMode;

    // Save global settings
    await saveGlobalSettings(globalSettings);

    console.log(`\n${chalk.green('✅ Configuration saved')}\n`);
  }

  /**
   * Set a configuration value directly from command line
   * Usage: ncp config <key> <value>
   */
  async setConfigValue(key: string, value: string): Promise<void> {
    try {
      // Check if key is known
      if (!KNOWN_KEYS[key]) {
        const availableKeys = Object.keys(KNOWN_KEYS).join(', ');
        console.error(chalk.red(`\n❌ Unknown configuration key: "${key}"\n`));
        console.error(chalk.dim(`Available keys:\n  ${availableKeys}\n`));
        process.exit(1);
      }

      const expectedType = KNOWN_KEYS[key];

      // Validate and parse value
      let parsedValue: any;
      try {
        parsedValue = parseValue(value, expectedType);
      } catch (parseError: any) {
        console.error(chalk.red(`\n❌ ${parseError.message}\n`));
        process.exit(1);
      }

      // Apply the setting
      const globalSettings = await loadGlobalSettings();

      switch (key) {
        case 'autoImport':
          if (parsedValue) {
            delete process.env.NCP_SKIP_AUTO_IMPORT;
          } else {
            process.env.NCP_SKIP_AUTO_IMPORT = 'true';
          }
          break;

        case 'debugLogging':
          if (parsedValue) {
            process.env.NCP_DEBUG = 'true';
          } else {
            delete process.env.NCP_DEBUG;
          }
          break;

        case 'confirmModifications':
          globalSettings.confirmBeforeRun.enabled = parsedValue;
          await saveGlobalSettings(globalSettings);
          break;

        case 'enableScheduler':
          // Scheduler is always available, but we could add a flag if needed
          if (!parsedValue) {
            console.warn(chalk.yellow('⚠️  Scheduler is always available. Setting ignored.\n'));
          }
          break;

        case 'enableMCPManagement':
          // MCP Management is always available
          if (!parsedValue) {
            console.warn(chalk.yellow('⚠️  MCP Management is always available. Setting ignored.\n'));
          }
          break;

        case 'logRotation':
          globalSettings.logRotation.enabled = parsedValue;
          await saveGlobalSettings(globalSettings);
          break;
      }

      console.log(chalk.green(`\n✅ Configuration updated: ${chalk.bold(key)} = ${chalk.cyan(value)}\n`));
    } catch (error: any) {
      console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      process.exit(1);
    }
  }

  /**
   * Main entry point - show and optionally edit
   */
  async run(): Promise<void> {
    try {
      await this.showConfiguration();

      const shouldEdit = await this.askToEdit();

      if (shouldEdit) {
        await this.editConfiguration();
      }

      this.readline.close();
    } catch (error: any) {
      console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      this.readline.close();
      process.exit(1);
    }
  }
}
