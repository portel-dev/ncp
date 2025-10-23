/**
 * Context-Aware Credential Prompter
 *
 * Collects sensitive credentials using appropriate method based on context:
 * Priority:
 * 1. MCP Elicitation (if available) - Best for AI clients
 * 2. Native OS dialogs - Fallback for MCP server mode
 * 3. Terminal readline - For CLI usage
 */

import { createInterface } from 'readline';
import { showNativeDialog } from './native-dialog.js';
import { collectCredential as collectViaElicitation, ElicitationServer } from './elicitation-helper.js';
import { logger } from './logger.js';

export interface CredentialPromptOptions {
  name: string;           // Human-readable name (e.g., "Bearer Token", "API Key")
  description?: string;   // Additional context
  hidden?: boolean;       // Hide input (default: true for credentials)
  example?: string;       // Example value to show user
  elicitationServer?: ElicitationServer; // Optional elicitation server for MCP protocol
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
function hasElicitationSupport(server?: ElicitationServer): boolean {
  if (!server) {
    return false;
  }

  // Check if the server has the elicitInput method
  if (typeof server.elicitInput !== 'function') {
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
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    const prompt = options.description
      ? `🔐 ${options.name}\n   ${options.description}\n   Enter value${options.hidden !== false ? ' (hidden)' : ''}: `
      : `🔐 Enter ${options.name}${options.hidden !== false ? ' (hidden)' : ''}: `;

    if (options.hidden !== false) {
      // Hide input for credentials
      const stdin = process.stdin;
      const onData = (char: string) => {
        char = char.toString();
        switch (char) {
          case '\n':
          case '\r':
          case '\u0004': // Ctrl-D
            stdin.pause();
            break;
          default:
            process.stdout.write('\b \b'); // Clear the character
            break;
        }
      };

      stdin.on('data', onData);

      rl.question(prompt, (answer) => {
        stdin.removeListener('data', onData);
        rl.close();
        console.log(''); // New line after hidden input

        if (!answer || answer.trim().length === 0) {
          resolve(null);
        } else {
          resolve(answer.trim());
        }
      });
    } else {
      // Regular visible input
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

  const message = `Enter your ${options.name}${descriptionText}${exampleText}\n\nThe value will be stored securely in your NCP profile configuration.`;

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
 * 1. MCP Elicitation (if elicitationServer provided) - MCP protocol standard
 * 2. Native OS dialog (if not terminal mode) - Fallback for MCP server
 * 3. Terminal readline (if terminal mode) - CLI usage
 *
 * @param options Credential prompt configuration
 * @returns The credential value, or null if user cancelled
 */
export async function promptForCredential(options: CredentialPromptOptions): Promise<string | null> {
  try {
    // Priority 1: Use MCP elicitation if available (MCP protocol standard)
    if (hasElicitationSupport(options.elicitationServer)) {
      logger.debug(`Using MCP elicitation for ${options.name}`);
      try {
        const credential = await collectViaElicitation(
          options.elicitationServer!,
          options.name,
          options.name.toUpperCase().replace(/\s+/g, '_'),
          options.example
        );

        if (credential) {
          return credential;
        }

        // User cancelled or elicitation failed, try fallback
        logger.warn(`Elicitation failed or cancelled for ${options.name}, trying fallback`);
      } catch (error: any) {
        logger.warn(`Elicitation error for ${options.name}: ${error.message}, trying fallback`);
      }
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
