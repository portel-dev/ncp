/**
 * Interactive parameter prompting system
 * Guides users through tool parameters with intelligent prompts
 */
import * as readline from 'readline';
import chalk from 'chalk';

export interface ParameterInfo {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export class ParameterPrompter {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Prompt user for all tool parameters interactively
   */
  async promptForParameters(
    toolName: string,
    parameters: ParameterInfo[],
    predictor: any,
    toolContext: string
  ): Promise<any> {
    console.log(chalk.blue(`📝 Tool "${toolName}" requires parameters. Let me guide you through them:\n`));

    const result: any = {};

    // Sort parameters: required first, then optional
    const sortedParams = [...parameters].sort((a, b) => {
      if (a.required && !b.required) return -1;
      if (!a.required && b.required) return 1;
      return 0;
    });

    for (const param of sortedParams) {
      const value = await this.promptForParameter(param, predictor, toolContext);
      if (value !== null && value !== undefined && value !== '') {
        result[param.name] = this.convertValue(value, param.type);
      }
    }

    return result;
  }

  /**
   * Prompt for a single parameter
   */
  private async promptForParameter(
    param: ParameterInfo,
    predictor: any,
    toolContext: string
  ): Promise<string | null> {
    const icon = param.required ? '📄' : '📔';
    const status = param.required ? 'Required' : 'Optional';
    const typeInfo = chalk.cyan(`(${param.type})`);

    console.log(`${icon} ${chalk.bold(param.name)} ${typeInfo} - ${chalk.yellow(status)}`);

    if (param.description) {
      console.log(`   ${chalk.gray(param.description)}`);
    }

    // Generate intelligent suggestion
    const suggestion = predictor.predictValue(
      param.name,
      param.type,
      toolContext,
      param.description
    );

    let prompt = '   Enter value';
    if (!param.required) {
      prompt += ' (press Enter to skip)';
    }
    if (suggestion && typeof suggestion === 'string' && suggestion !== 'example') {
      prompt += ` [${chalk.green(suggestion)}]`;
    }
    prompt += ': ';

    const input = await this.question(prompt);

    // If user pressed Enter and we have a suggestion, use it
    if (input === '' && suggestion && param.required) {
      console.log(`   ${chalk.gray(`Using suggested value: ${suggestion}`)}`);
      return String(suggestion);
    }

    // If optional and empty, skip
    if (input === '' && !param.required) {
      console.log(`   ${chalk.gray('Skipped')}`);
      return null;
    }

    // If required but empty, use suggestion or ask again
    if (input === '' && param.required) {
      if (suggestion) {
        console.log(`   ${chalk.gray(`Using suggested value: ${suggestion}`)}`);
        return String(suggestion);
      } else {
        console.log(chalk.red('   This parameter is required. Please provide a value.'));
        return await this.promptForParameter(param, predictor, toolContext);
      }
    }

    console.log(); // Add spacing
    return input;
  }

  /**
   * Convert string input to appropriate type
   */
  private convertValue(value: string, type: string): any {
    if (value === '') return undefined;

    switch (type) {
      case 'number':
      case 'integer':
        const num = Number(value);
        return isNaN(num) ? value : num;

      case 'boolean':
        const lower = value.toLowerCase();
        if (lower === 'true' || lower === 'yes' || lower === '1') return true;
        if (lower === 'false' || lower === 'no' || lower === '0') return false;
        return Boolean(value);

      case 'array':
        try {
          // Try to parse as JSON array first
          if (value.startsWith('[')) {
            return JSON.parse(value);
          }
          // Otherwise split by comma
          return value.split(',').map(s => s.trim());
        } catch {
          return value.split(',').map(s => s.trim());
        }

      case 'object':
        try {
          return JSON.parse(value);
        } catch {
          return { value };
        }

      default:
        return value;
    }
  }

  /**
   * Prompt user with a question
   */
  private question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * Close the readline interface
   */
  close(): void {
    this.rl.close();
  }
}