/**
 * Context-Aware Credential Prompter
 *
 * Collects sensitive credentials using appropriate method based on context:
 * Priority:
 * 1. MCP request-scoped input when handling an MCP request
 * 2. Native OS dialogs outside an MCP request
 * 3. Terminal readline for CLI usage
 */

import { createInterface } from 'readline';
import { showNativeDialog } from './native-dialog.js';
import {
  collectCredential as collectViaElicitation,
  collectCredentials,
  UserInputProvider,
} from './elicitation-helper.js';
import { logger } from './logger.js';

export interface CredentialPromptOptions {
  name: string;           // Human-readable name (e.g., "Bearer Token", "API Key")
  description?: string;   // Additional context
  hidden?: boolean;       // Hide input (default: true for credentials)
  example?: string;       // Example value to show user
  elicitationServer?: UserInputProvider; // Optional request-scoped MCP input provider
}

/**
 * Detect if we're running in terminal mode vs MCP server mode
 */
function isTerminalMode(): boolean {
  // Check if stdin is a TTY (interactive terminal)
  if (!process.stdin.isTTY) {
    return false;
  }

  // Check if explicitly running as MCP server
  if (process.env.MCP_SERVER_MODE === 'true') {
    return false;
  }

  return true;
}

/**
 * Check if elicitation is available and supported
 */
function hasElicitationSupport(server?: UserInputProvider): boolean {
  if (!server) {
    return false;
  }

  // Check if the server has the request-scoped input method
  if (typeof server.requestInput !== 'function') {
    return false;
  }

  // We're in MCP server mode if elicitation server is provided
  return true;
}

/**
 * Prompt for credential in terminal using readline
 * Uses hidden input for secure credential entry
 */
async function promptInTerminal(options: CredentialPromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const prompt = options.description
      ? `🔐 ${options.name}\n   ${options.description}\n   Enter value${options.hidden !== false ? ' (hidden)' : ''}: `
      : `🔐 Enter ${options.name}${options.hidden !== false ? ' (hidden)' : ''}: `;

    if (options.hidden !== false) {
      // Use raw mode for hidden input
      const stdin = process.stdin;
      let input = '';

      // Show prompt
      process.stdout.write(prompt);

      // Set raw mode to capture keystrokes without echo
      if (stdin.isTTY) {
        stdin.setRawMode(true);
      }
      stdin.resume();
      stdin.setEncoding('utf8');

      const onData = (char: string) => {
        switch (char) {
          case '\n':
          case '\r':
          case '\u0004': // Ctrl-D (EOF)
            // Cleanup
            stdin.pause();
            if (stdin.isTTY) {
              stdin.setRawMode(false);
            }
            stdin.removeListener('data', onData);

            // New line after hidden input
            process.stdout.write('\n');

            // Resolve with input or null if empty
            if (!input || input.trim().length === 0) {
              resolve(null);
            } else {
              resolve(input.trim());
            }
            break;

          case '\u0003': // Ctrl-C
            // Cleanup and cancel
            stdin.pause();
            if (stdin.isTTY) {
              stdin.setRawMode(false);
            }
            stdin.removeListener('data', onData);
            process.stdout.write('\n');
            resolve(null);
            break;

          case '\u007f': // Backspace
          case '\b': // Backspace
            if (input.length > 0) {
              input = input.slice(0, -1);
              // No visual feedback for hidden input
            }
            break;

          default:
            // Add character to input (only printable characters)
            if (char.charCodeAt(0) >= 32) {
              input += char;
            }
            break;
        }
      };

      stdin.on('data', onData);
    } else {
      // Regular visible input using readline
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question(prompt, (answer) => {
        rl.close();

        if (!answer || answer.trim().length === 0) {
          resolve(null);
        } else {
          resolve(answer.trim());
        }
      });
    }
  });
}

/**
 * Prompt for credential using native OS dialog
 * More appropriate when used as MCP server by AI clients
 */
async function promptWithDialog(options: CredentialPromptOptions): Promise<string | null> {
  const exampleText = options.example ? `\n\nExample: ${options.example}` : '';
  const descriptionText = options.description ? `\n${options.description}` : '';

  const message = `Enter your ${options.name}${descriptionText}${exampleText}\n\nThe value will be stored in the OS keychain or NCP encrypted credential store.`;

  try {
    const result = await showNativeDialog({
      title: `${options.name} Required`,
      message,
      buttons: ['OK', 'Cancel'],
      icon: 'question',
      timeoutSeconds: 120 // 2 minutes for user to fetch credential
    });

    if (result.cancelled || result.timedOut) {
      logger.info(`User ${result.timedOut ? 'timed out' : 'cancelled'} credential prompt for ${options.name}`);
      return null;
    }

    // For dialogs, we need a secondary input method
    // Fall back to terminal input if dialog doesn't support text input
    logger.info('Dialog confirmed, falling back to terminal input for actual credential');
    return await promptInTerminal(options);
  } catch (error: any) {
    logger.error(`Dialog failed for ${options.name}: ${error.message}`);
    // Fallback to terminal
    return await promptInTerminal(options);
  }
}

/**
 * Prompt user for a credential using context-appropriate method
 *
 * Priority chain:
 * 1. MCP request-scoped input (if elicitationServer provided)
 * 2. Native OS dialog when no MCP provider is present
 * 3. Terminal readline (if terminal mode) - CLI usage
 *
 * @param options Credential prompt configuration
 * @returns The credential value, or null if user cancelled
 */
export async function promptForCredential(options: CredentialPromptOptions): Promise<string | null> {
  try {
    // MCP workflows must fail closed: cancellation or an unavailable client
    // never falls through to a second, out-of-band prompt.
    if (hasElicitationSupport(options.elicitationServer)) {
      logger.debug(`Using MCP request-scoped input for ${options.name}`);
      return collectViaElicitation(
        options.elicitationServer!,
        options.name,
        options.name.toUpperCase().replace(/\s+/g, '_'),
        options.example
      );
    }

    // Priority 2/3: Fall back to dialog or terminal based on context
    if (isTerminalMode()) {
      logger.debug(`Using terminal mode for ${options.name}`);
      return await promptInTerminal(options);
    } else {
      logger.debug(`Using dialog mode for ${options.name}`);
      return await promptWithDialog(options);
    }
  } catch (error: any) {
    logger.error(`Failed to prompt for ${options.name}: ${error.message}`);
    return null;
  }
}

/**
 * Prompt for multiple credentials sequentially
 * Stops if user cancels any prompt
 *
 * @param credentials Array of credential prompts
 * @returns Map of credential names to values, or null if any cancelled
 */
export async function promptForCredentials(
  credentials: CredentialPromptOptions[]
): Promise<Record<string, string> | null> {
  const provider = credentials[0]?.elicitationServer;
  if (provider && credentials.every((credential) => credential.elicitationServer === provider)) {
    return collectCredentials(
      provider,
      credentials.map((credential) => ({
        envVarName: credential.name,
        displayName: credential.name,
        example: credential.example,
      })),
    );
  }

  const results: Record<string, string> = {};

  for (const cred of credentials) {
    const value = await promptForCredential(cred);

    if (value === null) {
      logger.info(`Credential collection cancelled at ${cred.name}`);
      return null;
    }

    results[cred.name] = value;
  }

  return results;
}
