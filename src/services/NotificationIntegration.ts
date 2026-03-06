/**
 * Notification Integration API
 *
 * Provides a clean interface for integrating the notification system
 * with NCP's tool execution and error handling.
 */

import { NotificationQueue } from './NotificationQueue.js';
import { SessionManager } from './SessionManager.js';
import { AuthPromptManager } from './AuthPromptManager.js';
import {
  NotificationType,
  NotificationPriority,
  NotificationConfig,
  Notification
} from '../types/notifications.js';

export class NotificationAPI {
  private notificationQueue: NotificationQueue;
  private sessionManager: SessionManager;
  private authPromptManager: AuthPromptManager;
  private debugEnabled = false;

  constructor(config?: Partial<NotificationConfig>) {
    this.notificationQueue = NotificationQueue.getInstance(config);
    this.sessionManager = SessionManager.getInstance(config);
    this.authPromptManager = AuthPromptManager.getInstance();
  }

  /**
   * Execute a tool with notification integration
   */
  async execute(tool: string, params: any = {}): Promise<string> {
    // Get pending notifications and clear them
    const notifications = this.notificationQueue.getAndClear();

    // Format notifications for response
    let notificationText = '';
    if (notifications.length > 0) {
      notificationText = this.notificationQueue.formatForResponse(notifications);
    }

    // Execute the actual tool (mock implementation for testing)
    const result = await this.executeTool(tool, params);

    // Combine notifications with tool result
    return notificationText + result;
  }

  /**
   * Mock tool execution for testing and demonstration
   */
  private async executeTool(tool: string, params: any = {}): Promise<string> {
    // Record MCP usage for session tracking
    const mcpName = tool.split(':')[0];
    this.sessionManager.recordMCPUsage(mcpName);

    // Simulate different scenarios based on tool
    switch (tool) {
      case 'supabase:create_table':
        // Simulate auth error for Supabase
        const supabaseError = new Error('SUPABASE_URL environment variable is required');
        return await this.authPromptManager.handleAuthError('supabase', supabaseError, params);

      case 'supabase:list_tables':
        // Check if we have credentials
        if (this.authPromptManager.hasCredentials('supabase')) {
          return '📋 Supabase Tables:\n- users\n- posts\n- comments';
        } else {
          const supabaseError = new Error('SUPABASE_ANON_KEY is required');
          return await this.authPromptManager.handleAuthError('supabase', supabaseError, params);
        }

      case 'figma:get_file':
        // Simulate Figma auth error
        const figmaError = new Error('Figma API token is required');
        return await this.authPromptManager.handleAuthError('figma', figmaError, params);

      case 'slack:send_message':
        // Simulate Slack auth error
        const slackError = new Error('Slack API token is required');
        return await this.authPromptManager.handleAuthError('slack', slackError, params);

      case 'filesystem:read_file':
        // Simulate successful filesystem operation
        if (params.path === './package.json') {
          return JSON.stringify({
            name: "@portel/ncp",
            version: "1.2.1",
            description: "Natural Context Provider - N-to-1 MCP Orchestration for AI Assistants"
          }, null, 2);
        } else if (params.path === './README.md') {
          return '# NCP - Natural Context Provider\n\nRevolutionary MCP orchestration system...';
        }
        return `📄 File content from ${params.path}`;

      case 'filesystem:list_directory':
        // Simulate directory listing
        if (params.path === './src') {
          return '📁 Source Directory:\n- cli/\n- services/\n- types/\n- utils/';
        }
        return `📁 Directory listing for ${params.path}`;

      default:
        return `🔧 Executed ${tool} with parameters: ${JSON.stringify(params)}`;
    }
  }

  /**
   * Add a notification to the queue
   */
  notify(message: string, priority: 'high' | 'medium' | 'low' = 'medium', mcpName?: string): void {
    const priorityMap = {
      'high': NotificationPriority.HIGH,
      'medium': NotificationPriority.MEDIUM,
      'low': NotificationPriority.LOW
    };

    this.notificationQueue.add({
      type: NotificationType.MCP_HEALTH_RESTORED, // Default type
      message,
      priority: priorityMap[priority],
      mcpName
    });

    if (this.debugEnabled) {
      console.debug(`[NotificationAPI] Added notification: ${message}`);
    }
  }

  /**
   * Handle authentication error
   */
  async handleAuthError(mcpName: string, error: Error, operation?: any): Promise<string> {
    return await this.authPromptManager.handleAuthError(mcpName, error, operation);
  }

  /**
   * Get system status including all components
   */
  status(): any {
    return {
      session: this.sessionManager.getSessionStats(),
      notifications: this.notificationQueue.getStats(),
      auth: this.authPromptManager.getAuthStatus(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Enable debug logging
   */
  debug(enabled = true): void {
    this.debugEnabled = enabled;
    this.notificationQueue.updateConfig({
      enableDebugLogging: enabled,
      logDeliveryDecisions: enabled
    });
    this.sessionManager.updateConfig({
      enableDebugLogging: enabled
    });
  }

  /**
   * Clear all notifications (for testing)
   */
  clear(): void {
    this.notificationQueue.clear();
  }

  /**
   * Reset session (for testing)
   */
  resetSession(): void {
    this.sessionManager.resetSession();
  }

  /**
   * Get cached credentials for an MCP
   */
  getCredentials(mcpName: string): any {
    return this.authPromptManager.getCachedCredentials(mcpName);
  }

  /**
   * Clear credentials for an MCP
   */
  clearCredentials(mcpName: string): void {
    this.authPromptManager.clearCredentials(mcpName);
  }

  /**
   * Check if MCP has credentials
   */
  hasCredentials(mcpName: string): boolean {
    return this.authPromptManager.hasCredentials(mcpName);
  }

  /**
   * Record MCP usage manually (for session tracking)
   */
  recordMCPUsage(mcpName: string): void {
    this.sessionManager.recordMCPUsage(mcpName);
  }

  /**
   * Add specific notification types
   */
  notifyAuthProvided(mcpName: string): void {
    this.notificationQueue.add({
      type: NotificationType.AUTH_PROVIDED,
      mcpName,
      message: `✅ ${mcpName} authentication successful`,
      priority: NotificationPriority.HIGH
    });
  }

  notifyAuthFailed(mcpName: string, reason?: string): void {
    const message = reason
      ? `❌ ${mcpName} authentication failed: ${reason}`
      : `❌ ${mcpName} authentication failed`;

    this.notificationQueue.add({
      type: NotificationType.AUTH_FAILED,
      mcpName,
      message,
      priority: NotificationPriority.HIGH
    });
  }

  notifyHealthRestored(mcpName: string): void {
    this.notificationQueue.add({
      type: NotificationType.MCP_HEALTH_RESTORED,
      mcpName,
      message: `✅ ${mcpName} connection restored`,
      priority: NotificationPriority.MEDIUM
    });
  }

  notifyHealthDegraded(mcpName: string, issue: string): void {
    this.notificationQueue.add({
      type: NotificationType.MCP_HEALTH_DEGRADED,
      mcpName,
      message: `⚠️ ${mcpName} having issues: ${issue}`,
      priority: NotificationPriority.HIGH
    });
  }

  notifyRateLimitApproaching(mcpName: string, remaining: number): void {
    this.notificationQueue.add({
      type: NotificationType.RATE_LIMIT_APPROACHING,
      mcpName,
      message: `⚠️ ${mcpName} rate limit approaching (${remaining} requests remaining)`,
      priority: NotificationPriority.MEDIUM
    });
  }
}

// Export singleton instance for easy usage
export const notificationAPI = new NotificationAPI();