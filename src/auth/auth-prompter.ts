/**
 * Interactive authentication field prompter
 *
 * Prompts users for required authentication fields based on detected requirements
 */

import * as readline from 'readline';
import type { AuthField } from './auth-detector.js';

export interface AuthValues {
  token?: string;
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  deviceAuthUrl?: string;
  tokenUrl?: string;
  scopes?: string[];
}

export class AuthPrompter {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Prompt user for all required fields
   */
  async promptFields(fields: AuthField[]): Promise<AuthValues> {
    const values: AuthValues = {};

    console.log(''); // blank line for spacing

    for (const field of fields) {
      const value = await this.promptField(field);

      if (value) {
        // Handle special fields
        if (field.name === 'scopes') {
          // Split comma-separated scopes
          values.scopes = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
        } else {
          (values as any)[field.name] = value;
        }
      } else if (field.required) {
        throw new Error(`Required field '${field.label}' cannot be empty`);
      }
    }

    this.close();
    return values;
  }

  /**
   * Prompt for a single field
   */
  private async promptField(field: AuthField): Promise<string> {
    const label = field.required ? `${field.label} *` : field.label;
    const placeholder = field.placeholder ? ` (${field.placeholder})` : '';
    const prompt = `${label}${placeholder}: `;

    // Show description if available
    if (field.description) {
      console.log(`\x1b[2m${field.description}\x1b[0m`);
    }

    const value = await this.prompt(prompt, field.type === 'password');

    // Use placeholder as default if value is empty and field is not required
    if (!value && !field.required && field.placeholder) {
      return field.placeholder;
    }

    return value;
  }

  /**
   * Prompt for input (with optional masking for passwords)
   */
  private async prompt(question: string, maskInput: boolean = false): Promise<string> {
    return new Promise((resolve) => {
      if (maskInput) {
        // For password fields, disable echo
        const stdin = process.stdin;
        const originalRawMode = stdin.isRaw;

        stdin.setRawMode(true);
        process.stdout.write(question);

        let input = '';

        stdin.on('data', function onData(char: Buffer) {
          const c = char.toString('utf8');

          switch (c) {
            case '\n':
            case '\r':
            case '\u0004': // Ctrl+D
              stdin.setRawMode(originalRawMode);
              stdin.removeListener('data', onData);
              process.stdout.write('\n');
              resolve(input);
              break;

            case '\u0003': // Ctrl+C
              process.exit(0);
              break;

            case '\u007f': // Backspace
              if (input.length > 0) {
                input = input.slice(0, -1);
                process.stdout.write('\b \b'); // Erase character
              }
              break;

            default:
              input += c;
              process.stdout.write('*'); // Show asterisk for each character
              break;
          }
        });
      } else {
        // Normal text input
        this.rl.question(question, (answer) => {
          resolve(answer.trim());
        });
      }
    });
  }

  /**
   * Close the readline interface
   */
  close(): void {
    this.rl.close();
  }

  /**
   * Display detected auth information
   */
  static displayDetected(authType: string, detected: any): void {
    console.log('\x1b[36m🔍 Authentication detected:\x1b[0m');
    console.log(`   Type: \x1b[1m${authType}\x1b[0m`);

    if (detected.statusCode) {
      console.log(`   HTTP Status: ${detected.statusCode}`);
    }

    if (detected.wwwAuthenticate) {
      console.log(`   WWW-Authenticate: ${detected.wwwAuthenticate}`);
    }

    if (detected.oauthEndpoints) {
      console.log(`   OAuth endpoints discovered automatically`);
    }

    if (detected.errorMessage) {
      console.log(`   Message: ${detected.errorMessage}`);
    }

    console.log('');
  }

  /**
   * Confirm with user before proceeding
   */
  static async confirm(message: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(`${message} (y/n): `, (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }
}
