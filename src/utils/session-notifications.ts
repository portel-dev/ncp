/**
 * Session-Scoped Notification System
 *
 * Brief status updates shown to AI in tool responses.
 * AI decides whether to act on them, tell the user, or ignore.
 *
 * Examples:
 * - "Scheduled job job_123 completed successfully" (AI can fetch details)
 * - "Config replaced - restart Windsurf to apply" (FYI only)
 * - "37 MCPs auto-imported from Windsurf" (status update)
 */

export interface SessionNotification {
  id: string;          // Auto-generated for dismissal
  type: 'info' | 'warning' | 'tip' | 'action';
  message: string;     // Brief status update ONLY
  relatedId?: string;  // Optional: job ID, MCP name, etc. for fetching details
  timestamp: number;
}

export class SessionNotificationManager {
  private notifications: SessionNotification[] = [];
  private nextId = 1;

  /**
   * Add a notification to the session queue
   */
  add(notification: Omit<SessionNotification, 'id' | 'timestamp'>): void {
    this.notifications.push({
      ...notification,
      id: `notif_${this.nextId++}`,
      timestamp: Date.now()
    });
  }

  /**
   * Get all active notifications
   */
  getAll(): SessionNotification[] {
    return [...this.notifications];
  }

  /**
   * Dismiss a notification by ID
   */
  dismiss(id: string): void {
    this.notifications = this.notifications.filter(n => n.id !== id);
  }

  /**
   * Clear all notifications
   */
  clear(): void {
    this.notifications = [];
  }

  /**
   * Check if there are any active notifications
   */
  hasNotifications(): boolean {
    return this.notifications.length > 0;
  }

  /**
   * Format notifications for appending to tool responses
   * Returns empty string if no notifications
   *
   * AI sees these and decides what to do (act on them, tell user, or ignore)
   */
  formatForResponse(): string {
    if (this.notifications.length === 0) {
      return '';
    }

    const icon = {
      info: 'ℹ️',
      warning: '⚠️',
      tip: '💡',
      action: '🎯'
    };

    const formatted = this.notifications.map(n => {
      const prefix = icon[n.type] || '📌';
      const related = n.relatedId ? ` [${n.relatedId}]` : '';
      return `${prefix} ${n.message}${related}`;
    }).join('\n');

    return `\n\n---\n**Notifications:**\n${formatted}\n---\n`;
  }
}
