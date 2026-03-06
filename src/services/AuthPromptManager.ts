/**
 * Auth Prompt Manager
 *
 * Handles on-demand authentication prompts with dual timeline UX:
 * - AI continues after 35s with "auth needed" message
 * - User prompt stays open for 2 minutes
 * - Late responses queue notifications for next AI interaction
 */

import inquirer from 'inquirer';
import { NotificationQueue } from './NotificationQueue.js';
import { SessionManager } from './SessionManager.js';
import { NotificationType } from '../types/notifications.js';

interface AuthPromptConfig {
  field: string;
  message: string;
  type: 'input' | 'password';
  validate?: (input: string) => boolean | string;
}

interface AuthCredentials {
  [key: string]: string;
}

interface ActivePrompt {
  mcpName: string;
  promise: Promise<AuthCredentials | null>;
  startTime: number;
  resolved: boolean;
}

/**
 * Auth error patterns for different MCPs
 */
const AUTH_ERROR_PATTERNS = {
  supabase: {
    missing_url: /SUPABASE_URL.*required|missing.*url/i,
    missing_key: /SUPABASE_ANON_KEY.*required|invalid.*key/i,
    prompts: [
      {
        field: 'url',
        message: 'Supabase Project URL',
        type: 'input' as const,
        validate: (input: string) => {
          if (!input.trim()) return 'URL is required';
          if (!input.startsWith('http')) return 'Please enter a valid URL starting with http:// or https://';
          return true;
        }
      },
      {
        field: 'key',
        message: 'Supabase Anon Key',
        type: 'password' as const,
        validate: (input: string) => input.trim() ? true : 'API key is required'
      }
    ]
  },

  figma: {
    missing_token: /figma.*token|api.*key.*required/i,
    prompts: [
      {
        field: 'token',
        message: 'Figma Personal Access Token',
        type: 'password' as const,
        validate: (input: string) => input.trim() ? true : 'Personal access token is required'
      }
    ]
  },

  context7: {
    missing_credentials: /redis.*url|context7.*credentials/i,
    prompts: [
      {
        field: 'redis_url',
        message: 'Redis Connection URL',
        type: 'input' as const,
        validate: (input: string) => {
          if (!input.trim()) return 'Redis URL is required';
          if (!input.startsWith('redis://')) return 'Please enter a valid Redis URL';
          return true;
        }
      }
    ]
  }
};

export class AuthPromptManager {
  private static instance: AuthPromptManager;
  private activePrompts = new Map<string, ActivePrompt>();
  private credentialCache = new Map<string, AuthCredentials>();
  private lastFailedOperations = new Map<string, any>();
  private notificationQueue: NotificationQueue;
  private sessionManager: SessionManager;

  // Timing configuration
  private readonly AI_TIMEOUT = 35 * 1000; // 35 seconds
  private readonly USER_TIMEOUT = 2 * 60 * 1000; // 2 minutes

  private constructor() {
    this.notificationQueue = NotificationQueue.getInstance();
    this.sessionManager = SessionManager.getInstance();
  }

  static getInstance(): AuthPromptManager {
    if (!AuthPromptManager.instance) {
      AuthPromptManager.instance = new AuthPromptManager();
    }
    return AuthPromptManager.instance;
  }

  /**
   * Handle authentication error with on-demand prompting
   */
  async handleAuthError(mcpName: string, error: Error, operation?: any): Promise<string> {
    // Store failed operation for potential retry
    if (operation) {
      this.lastFailedOperations.set(mcpName, operation);
    }

    // Record MCP usage for session context
    this.sessionManager.recordMCPUsage(mcpName);

    // Close any existing prompt for this MCP
    this.closePrompt(mcpName);

    // Parse error to determine auth requirements
    const authConfig = this.parseAuthError(mcpName, error);
    if (!authConfig) {
      return `${mcpName} authentication error: ${error.message}`;
    }

    // Start the prompt process
    const promptPromise = this.showAuthPrompt(mcpName, authConfig);

    // Store active prompt
    this.activePrompts.set(mcpName, {
      mcpName,
      promise: promptPromise,
      startTime: Date.now(),
      resolved: false
    });

    // Set AI timeout - return early message after 35s
    const aiTimeoutPromise = new Promise<string>((resolve) => {
      setTimeout(() => {
        resolve(`${mcpName} requires authentication. Please provide your API credentials to continue.`);
      }, this.AI_TIMEOUT);
    });

    // Handle user response (whenever it arrives)
    this.handleUserResponse(mcpName, promptPromise);

    // Return AI timeout message (prompt continues in background)
    return await aiTimeoutPromise;
  }

  /**
   * Parse authentication error to determine requirements
   */
  private parseAuthError(mcpName: string, error: Error): AuthPromptConfig[] | null {
    const patterns = AUTH_ERROR_PATTERNS[mcpName as keyof typeof AUTH_ERROR_PATTERNS];
    if (!patterns) {
      console.debug(`[AuthPromptManager] No auth patterns defined for ${mcpName}`);
      return null;
    }

    // Check error message against patterns
    for (const [patternName, regex] of Object.entries(patterns)) {
      if (patternName === 'prompts') continue;

      if ((regex as RegExp).test(error.message)) {
        console.debug(`[AuthPromptManager] Matched pattern ${patternName} for ${mcpName}`);
        return patterns.prompts;
      }
    }

    // Default to all prompts if error message matches generally
    return patterns.prompts;
  }

  /**
   * Show authentication prompt to user
   */
  private async showAuthPrompt(mcpName: string, authConfig: AuthPromptConfig[]): Promise<AuthCredentials | null> {
    try {
      console.log(`\n🔐 ${mcpName} Authentication Required`);
      console.log(`⏰ AI continues in ${this.AI_TIMEOUT/1000}s, prompt closes in ${this.USER_TIMEOUT/1000/60} minutes\n`);

      // Build inquirer questions
      const questions: any[] = authConfig.map(config => ({
        type: config.type,
        name: config.field,
        message: `🔑 ${config.message}:`,
        mask: config.type === 'password' ? '•' : undefined,
        validate: config.validate
      }));

      // Add session persistence option
      questions.push({
        type: 'confirm',
        name: 'remember',
        message: '💾 Remember for this session?',
        default: true
      });

      // Show prompt with timeout
      const answers = await this.promptWithTimeout(questions, this.USER_TIMEOUT);

      if (answers) {
        const { remember, ...credentials } = answers;

        if (remember) {
          this.credentialCache.set(mcpName, credentials);
        }

        return credentials;
      }

      return null;

    } catch (error) {
      console.debug(`[AuthPromptManager] Prompt error for ${mcpName}:`, error);
      return null;
    }
  }

  /**
   * Prompt with timeout support
   */
  private async promptWithTimeout(questions: any[], timeout: number): Promise<any> {
    return new Promise((resolve) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        console.log(`\n⏰ Authentication prompt timed out\n`);
        resolve(null);
      }, timeout);

      // Show prompt
      inquirer.prompt(questions)
        .then(answers => {
          clearTimeout(timeoutId);
          resolve(answers);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          console.debug(`[AuthPromptManager] Inquirer error:`, error);
          resolve(null);
        });
    });
  }

  /**
   * Handle user response (may arrive after AI timeout)
   */
  private async handleUserResponse(mcpName: string, promptPromise: Promise<AuthCredentials | null>): Promise<void> {
    try {
      const credentials = await promptPromise;
      const prompt = this.activePrompts.get(mcpName);

      if (!prompt) return;

      prompt.resolved = true;
      this.activePrompts.delete(mcpName);

      if (credentials) {
        console.log(`\n✅ ${mcpName} credentials saved!`);

        // Queue notification for next AI interaction
        this.notificationQueue.add({
          type: NotificationType.AUTH_PROVIDED,
          mcpName,
          message: `✅ ${mcpName} is now authenticated and ready to use`,
          priority: 'HIGH'
        });

        // Try to retry failed operation
        await this.retryFailedOperation(mcpName);

      } else {
        console.log(`\n❌ ${mcpName} authentication cancelled or timed out\n`);
      }

    } catch (error) {
      console.debug(`[AuthPromptManager] Error handling user response for ${mcpName}:`, error);
    }
  }

  /**
   * Retry failed operation with new credentials
   */
  private async retryFailedOperation(mcpName: string): Promise<void> {
    const failedOperation = this.lastFailedOperations.get(mcpName);
    if (!failedOperation) return;

    try {
      console.log(`🔄 Retrying previous ${mcpName} operation...`);

      // This would integrate with the actual MCP execution system
      // For now, just queue a notification
      this.notificationQueue.add({
        type: NotificationType.OPERATION_RETRY_SUCCESS,
        mcpName,
        message: `🔄 Previous ${mcpName} operation can be retried with new credentials`,
        priority: 'MEDIUM'
      });

      this.lastFailedOperations.delete(mcpName);

    } catch (error) {
      console.debug(`[AuthPromptManager] Failed to retry operation for ${mcpName}:`, error);

      this.notificationQueue.add({
        type: NotificationType.OPERATION_RETRY_FAILED,
        mcpName,
        message: `❌ Failed to retry ${mcpName} operation even with new credentials`,
        priority: 'MEDIUM'
      });
    }
  }

  /**
   * Close active prompt for an MCP
   */
  private closePrompt(mcpName: string): void {
    const activePrompt = this.activePrompts.get(mcpName);
    if (activePrompt && !activePrompt.resolved) {
      // Note: We can't actually cancel inquirer prompts cleanly
      // but we can mark them as closed
      console.debug(`[AuthPromptManager] Closing prompt for ${mcpName}`);
    }
    this.activePrompts.delete(mcpName);
  }

  /**
   * Get cached credentials for an MCP
   */
  getCachedCredentials(mcpName: string): AuthCredentials | null {
    return this.credentialCache.get(mcpName) || null;
  }

  /**
   * Check if MCP has cached credentials
   */
  hasCredentials(mcpName: string): boolean {
    return this.credentialCache.has(mcpName);
  }

  /**
   * Clear credentials for an MCP
   */
  clearCredentials(mcpName: string): void {
    this.credentialCache.delete(mcpName);
    console.log(`🗑️ Cleared ${mcpName} credentials`);
  }

  /**
   * Get status of authentication prompts
   */
  getAuthStatus() {
    const activePromptCount = this.activePrompts.size;
    const cachedCredentialCount = this.credentialCache.size;

    return {
      activePrompts: activePromptCount,
      cachedCredentials: cachedCredentialCount,
      credentialedMCPs: Array.from(this.credentialCache.keys())
    };
  }
}