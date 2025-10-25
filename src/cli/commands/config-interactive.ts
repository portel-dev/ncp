/**
 * Interactive Configuration Command
 * Allows users to view and edit NCP settings interactively
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
    const autoImportStatus = autoImportEnabled ? chalk.green('✓') : chalk.yellow('○');
    console.log(`${autoImportStatus} ${chalk.bold('Auto-import Client MCPs')}`);
    console.log(`  ${chalk.dim('Automatically import all MCPs from your MCP client on startup')}`);

    // Enable Debug Logging
    const debugEnabled = process.env.DEBUG === 'true' || process.env.NCP_DEBUG === 'true';
    const debugStatus = debugEnabled ? chalk.green('✓') : chalk.yellow('○');
    console.log(`\n${debugStatus} ${chalk.bold('Enable Debug Logging')}`);
    console.log(`  ${chalk.dim('Show detailed logs for troubleshooting')}`);

    // Confirm Modifications Before Run
    const confirmEnabled = globalSettings.confirmBeforeRun.enabled;
    const confirmStatus = confirmEnabled ? chalk.green('✓') : chalk.yellow('○');
    console.log(`\n${confirmStatus} ${chalk.bold('Confirm Modifications Before Run')}`);
    console.log(`  ${chalk.dim('Show confirmation dialog before executing modification operations')}`);

    // Enable Scheduler
    const schedulerEnabled = schedulerConfig !== null;
    const schedulerStatus = schedulerEnabled ? chalk.green('✓') : chalk.yellow('○');
    console.log(`\n${schedulerStatus} ${chalk.bold('Enable Scheduler (Built-in)')}`);
    console.log(`  ${chalk.dim('Schedule tool executions with cron')}`);

    // Enable MCP Management
    const managementEnabled = true; // Always available
    const managementStatus = chalk.green('✓');
    console.log(`\n${managementStatus} ${chalk.bold('Enable MCP Management (Built-in)')}`);
    console.log(`  ${chalk.dim('Add, remove, and manage MCPs in your configuration')}\n`);
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

    // Save global settings
    await saveGlobalSettings(globalSettings);

    console.log(`\n${chalk.green('✅ Configuration saved')}\n`);
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
