/**
 * Configuration Prompter
 *
 * Interactively prompts users for configuration values based on configurationSchema
 * Used during `ncp add` and `ncp repair` to guide users through setup
 */

import prompts from 'prompts';
import chalk from 'chalk';
import { ConfigurationSchema, ConfigurationParameter } from './config-schema-reader.js';
import { redactIfSensitive } from '../utils/redact-sensitive.js';

export interface ConfigValues {
  environmentVariables: Record<string, string>;
  arguments: string[];
  other: Record<string, string>;
}

export class ConfigPrompter {
  /**
   * Interactively prompt for all required configuration
   */
  async promptForConfig(schema: ConfigurationSchema, mcpName: string): Promise<ConfigValues> {
    const config: ConfigValues = {
      environmentVariables: {},
      arguments: [],
      other: {}
    };

    console.log(chalk.blue(`\n📋 Configuration needed for ${mcpName}:\n`));

    // Prompt for environment variables
    if (schema.environmentVariables && schema.environmentVariables.length > 0) {
      console.log(chalk.bold('Environment Variables:'));
      for (const param of schema.environmentVariables) {
        if (param.required) {
          const value = await this.promptForParameter(param, 'env');
          if (value !== null) {
            config.environmentVariables[param.name] = value;
          }
        }
      }
      console.log('');
    }

    // Prompt for command arguments
    if (schema.arguments && schema.arguments.length > 0) {
      console.log(chalk.bold('Command Arguments:'));
      for (const param of schema.arguments) {
        if (param.required) {
          if (param.multiple) {
            const values = await this.promptForMultipleValues(param);
            config.arguments.push(...values);
          } else {
            const value = await this.promptForParameter(param, 'arg');
            if (value !== null) {
              config.arguments.push(value);
            }
          }
        }
      }
      console.log('');
    }

    // Prompt for other configuration
    if (schema.other && schema.other.length > 0) {
      console.log(chalk.bold('Other Configuration:'));
      for (const param of schema.other) {
        if (param.required) {
          const value = await this.promptForParameter(param, 'other');
          if (value !== null) {
            config.other[param.name] = value;
          }
        }
      }
    }

    return config;
  }

  /**
   * Prompt for a single parameter
   */
  private async promptForParameter(
    param: ConfigurationParameter,
    category: 'env' | 'arg' | 'other'
  ): Promise<string | null> {
    const message = this.buildPromptMessage(param);

    const response = await prompts({
      type: this.getPromptType(param),
      name: 'value',
      message,
      initial: param.default,
      validate: (value: any) => this.validateParameter(value, param)
    });

    if (response.value === undefined) {
      return null; // User cancelled
    }

    return String(response.value);
  }

  /**
   * Prompt for multiple values (for parameters with multiple: true)
   */
  private async promptForMultipleValues(param: ConfigurationParameter): Promise<string[]> {
    const values: string[] = [];
    let addMore = true;

    while (addMore) {
      const message = values.length === 0
        ? this.buildPromptMessage(param)
        : `Add another ${param.name}?`;

      const response = await prompts({
        type: this.getPromptType(param),
        name: 'value',
        message,
        validate: (value: any) => this.validateParameter(value, param)
      });

      if (response.value === undefined || response.value === '') {
        break; // User cancelled or entered empty
      }

      values.push(String(response.value));

      // Ask if they want to add more
      if (values.length > 0) {
        const continueResponse = await prompts({
          type: 'confirm',
          name: 'continue',
          message: `Add another ${param.name}?`,
          initial: false
        });

        addMore = continueResponse.continue === true;
      }
    }

    return values;
  }

  /**
   * Build prompt message with description and examples
   */
  private buildPromptMessage(param: ConfigurationParameter): string {
    let message = chalk.cyan(`${param.name}:`);

    if (param.description) {
      message += chalk.dim(`\n  ${param.description}`);
    }

    if (param.examples && param.examples.length > 0 && !param.sensitive) {
      message += chalk.dim(`\n  Examples: ${param.examples.join(', ')}`);
    }

    if (param.required) {
      message += chalk.red(' (required)');
    }

    return message;
  }

  /**
   * Get appropriate prompts type based on parameter type
   */
  private getPromptType(param: ConfigurationParameter): 'text' | 'password' | 'confirm' | 'number' {
    if (param.sensitive) {
      return 'password';
    }

    switch (param.type) {
      case 'boolean':
        return 'confirm';
      case 'number':
        return 'number';
      case 'path':
      case 'url':
      case 'string':
      default:
        return 'text';
    }
  }

  /**
   * Validate parameter value
   */
  private validateParameter(value: any, param: ConfigurationParameter): boolean | string {
    // Required check
    if (param.required && (value === undefined || value === null || value === '')) {
      return `${param.name} is required`;
    }

    // Type validation
    if (param.type === 'number' && isNaN(Number(value))) {
      return `${param.name} must be a number`;
    }

    // Pattern validation
    if (param.pattern && typeof value === 'string') {
      const regex = new RegExp(param.pattern);
      if (!regex.test(value)) {
        return `${param.name} must match pattern: ${param.pattern}`;
      }
    }

    return true;
  }

  /**
   * Display configuration summary before saving
   */
  displaySummary(config: ConfigValues, mcpName: string): void {
    console.log(chalk.green.bold(`\n✓ Configuration for ${mcpName}:\n`));

    if (Object.keys(config.environmentVariables).length > 0) {
      console.log(chalk.bold('Environment Variables:'));
      Object.entries(config.environmentVariables).forEach(([key, value]) => {
        // Mask sensitive values using centralized utility
        const displayValue = redactIfSensitive(key, value);
        console.log(chalk.dim(`  ${key}=${displayValue}`));
      });
      console.log('');
    }

    if (config.arguments.length > 0) {
      console.log(chalk.bold('Command Arguments:'));
      config.arguments.forEach(arg => {
        console.log(chalk.dim(`  ${arg}`));
      });
      console.log('');
    }

    if (Object.keys(config.other).length > 0) {
      console.log(chalk.bold('Other Configuration:'));
      Object.entries(config.other).forEach(([key, value]) => {
        console.log(chalk.dim(`  ${key}: ${value}`));
      });
    }
  }
}
