/**
 * Notification Integration
 *
 * Integration point for the notification system with NCP's main tool execution.
 * Shows how notifications are delivered seamlessly with AI interactions.
 */

import { NotificationQueue } from './NotificationQueue.js';
import { SessionManager } from './SessionManager.js';
import { AuthPromptManager } from './AuthPromptManager.js';

/**
 * Enhanced tool execution with notification integration
 */
export class NotificationIntegration {
  private static instance: NotificationIntegration;
  private notificationQueue: NotificationQueue;
  private sessionManager: SessionManager;
  private authPromptManager: AuthPromptManager;

  private constructor() {
    this.notificationQueue = NotificationQueue.getInstance();
    this.sessionManager = SessionManager.getInstance();
    this.authPromptManager = AuthPromptManager.getInstance();

    // Periodic cleanup
    setInterval(() => {
      this.notificationQueue.cleanupOldSessions();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  static getInstance(): NotificationIntegration {
    if (!NotificationIntegration.instance) {
      NotificationIntegration.instance = new NotificationIntegration();
    }
    return NotificationIntegration.instance;
  }

  /**
   * Enhanced tool execution that includes notifications
   */
  async executeToolWithNotifications(tool: string, params: any = {}): Promise<string> {
    try {
      // Record MCP usage for session context
      const mcpName = this.extractMCPName(tool);
      if (mcpName) {
        this.sessionManager.recordMCPUsage(mcpName);
      }

      // Get any pending notifications first
      const notifications = this.notificationQueue.getAndClear();
      let notificationText = '';
      if (notifications.length > 0) {
        notificationText = this.notificationQueue.formatForResponse(notifications);
      }

      // Execute the actual tool
      const result = await this.executeTool(tool, params);

      // Combine notifications with result
      return notificationText + result;

    } catch (error) {
      // Check if this is an authentication error
      const mcpName = this.extractMCPName(tool);
      if (mcpName && this.isAuthError(error)) {
        const authMessage = await this.authPromptManager.handleAuthError(
          mcpName,
          error as Error,
          { tool, params }
        );

        // Include any notifications that arrived
        const notifications = this.notificationQueue.getAndClear();
        let notificationText = '';
        if (notifications.length > 0) {
          notificationText = this.notificationQueue.formatForResponse(notifications);
        }

        return notificationText + authMessage;
      }

      // Re-throw non-auth errors
      throw error;
    }
  }

  /**
   * Extract MCP name from tool identifier
   */
  private extractMCPName(tool: string): string | null {
    // Assuming tool format is "mcpName:toolName"
    const parts = tool.split(':');
    return parts.length > 1 ? parts[0] : null;
  }

  /**
   * Check if error is authentication-related
   */
  private isAuthError(error: any): boolean {
    const authIndicators = [
      /api.*key/i,
      /token/i,
      /auth/i,
      /credential/i,
      /unauthorized/i,
      /forbidden/i,
      /access.*denied/i,
      /invalid.*key/i,
      /missing.*url/i,
      /connection.*string/i
    ];

    const errorMessage = error?.message || error?.toString() || '';
    return authIndicators.some(pattern => pattern.test(errorMessage));
  }

  /**
   * Mock tool execution (to be replaced with actual NCP tool execution)
   */
  private async executeTool(tool: string, params: any): Promise<string> {
    // This is a mock - in real integration, this would call NCP's tool execution
    const mcpName = this.extractMCPName(tool);

    // Simulate some MCPs requiring auth
    if (mcpName === 'supabase' && !this.authPromptManager.hasCredentials('supabase')) {
      throw new Error('SUPABASE_URL environment variable is required');
    }

    if (mcpName === 'figma' && !this.authPromptManager.hasCredentials('figma')) {
      throw new Error('Figma API key required');
    }

    // Mock successful execution
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate work
    return `✅ ${tool} executed successfully with params: ${JSON.stringify(params)}`;
  }

  /**
   * Add a notification (for external use)
   */
  addNotification(notification: Parameters<typeof NotificationQueue.prototype.add>[0]): void {
    this.notificationQueue.add(notification);
  }

  /**
   * Get system statistics
   */
  getSystemStats() {
    return {
      session: this.sessionManager.getSessionStats(),
      notifications: this.notificationQueue.getStats(),
      auth: this.authPromptManager.getAuthStatus()
    };
  }

  /**
   * Enable debug logging
   */
  enableDebugLogging(): void {
    this.sessionManager.updateConfig({ enableDebugLogging: true });
    this.notificationQueue = NotificationQueue.getInstance({ enableDebugLogging: true });
  }
}

/**
 * Simple API for external integration
 */
export class NotificationAPI {
  private integration = NotificationIntegration.getInstance();

  /**
   * Execute tool with full notification support
   */
  async execute(tool: string, params?: any): Promise<string> {
    return this.integration.executeToolWithNotifications(tool, params);
  }

  /**
   * Add system notification
   */
  notify(message: string, type: 'info' | 'warning' | 'error' = 'info', mcpName?: string): void {
    this.integration.addNotification({
      type: type.toUpperCase() as any,
      message,
      mcpName,
      priority: type === 'error' ? 'HIGH' : 'MEDIUM'
    });
  }

  /**
   * Get system status
   */
  status() {
    return this.integration.getSystemStats();
  }

  /**
   * Enable debug output
   */
  debug(): void {
    this.integration.enableDebugLogging();
  }
}

// Export singleton instance for easy access
export const notificationAPI = new NotificationAPI();