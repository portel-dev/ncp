/**
 * Session-Aware Notification Queue
 *
 * Intelligent notification delivery system that routes notifications
 * to the correct chat sessions using MCP session IDs and contextual relevance.
 */

import {
  Notification,
  NotificationType,
  DeliveryAssessment,
  NotificationConfig,
  DEFAULT_NOTIFICATION_CONFIG
} from '../types/notifications.js';
import { SessionManager } from './SessionManager.js';

export class NotificationQueue {
  private static instance: NotificationQueue;
  private notifications: Map<string, Notification[]> = new Map(); // sessionId -> notifications
  private globalNotifications: Notification[] = []; // For session-agnostic notifications
  private sessionManager: SessionManager;
  private config: NotificationConfig;

  private constructor(config: Partial<NotificationConfig> = {}) {
    this.config = { ...DEFAULT_NOTIFICATION_CONFIG, ...config };
    this.sessionManager = SessionManager.getInstance(config);
  }

  static getInstance(config?: Partial<NotificationConfig>): NotificationQueue {
    if (!NotificationQueue.instance) {
      NotificationQueue.instance = new NotificationQueue(config);
    }
    return NotificationQueue.instance;
  }

  /**
   * Add a notification to the queue
   */
  add(notification: Omit<Notification, 'id' | 'timestamp'>): void {
    const fullNotification: Notification = {
      ...notification,
      id: this.generateNotificationId(),
      timestamp: Date.now()
    };

    // Determine target session(s)
    if (fullNotification.sessionId) {
      // Explicit session targeting
      this.addToSession(fullNotification.sessionId, fullNotification);
    } else if (fullNotification.mcpName) {
      // MCP-specific notification - use contextual routing
      this.addWithContextualRouting(fullNotification);
    } else {
      // General notification - add to current session
      const currentSessionId = this.sessionManager.getSessionId();
      this.addToSession(currentSessionId, fullNotification);
    }

    if (this.config.enableDebugLogging) {
      console.debug(`[NotificationQueue] Added notification: ${fullNotification.id} (${fullNotification.type})`);
    }
  }

  /**
   * Add notification to a specific session
   */
  private addToSession(sessionId: string, notification: Notification): void {
    if (!this.notifications.has(sessionId)) {
      this.notifications.set(sessionId, []);
    }

    const sessionNotifications = this.notifications.get(sessionId)!;
    sessionNotifications.push(notification);

    // Maintain size limits
    this.trimSessionNotifications(sessionId);
  }

  /**
   * Add notification using contextual routing logic
   */
  private addWithContextualRouting(notification: Notification): void {
    if (!notification.mcpName) {
      // Fallback to current session
      const currentSessionId = this.sessionManager.getSessionId();
      this.addToSession(currentSessionId, notification);
      return;
    }

    // Check if current session has context for this MCP
    if (this.sessionManager.isMCPRelevant(notification.mcpName)) {
      const currentSessionId = this.sessionManager.getSessionId();
      this.addToSession(currentSessionId, notification);
    } else {
      // MCP not relevant to current session, store as global for now
      this.globalNotifications.push(notification);

      if (this.config.logDeliveryDecisions) {
        console.debug(`[NotificationQueue] MCP ${notification.mcpName} not relevant to current session, stored globally`);
      }
    }
  }

  /**
   * Get notifications for current session and clear them
   */
  getAndClear(): Notification[] {
    const currentSessionId = this.sessionManager.getSessionId();
    return this.getAndClearForSession(currentSessionId);
  }

  /**
   * Get notifications for a specific session and clear them
   */
  getAndClearForSession(sessionId: string): Notification[] {
    // Get session-specific notifications
    const sessionNotifications = this.notifications.get(sessionId) || [];
    this.notifications.delete(sessionId);

    // Check global notifications for contextual relevance
    const relevantGlobalNotifications = this.filterGlobalNotificationsByContext();

    // Combine and process
    const allNotifications = [...sessionNotifications, ...relevantGlobalNotifications];

    // Clean up old notifications
    const freshNotifications = this.filterStaleNotifications(allNotifications);

    // Assess delivery for each notification
    const assessedNotifications = freshNotifications
      .map(notification => ({
        notification,
        assessment: this.assessDelivery(notification)
      }))
      .filter(({ assessment }) => assessment.shouldDeliver)
      .sort((a, b) => {
        // Sort by priority, then confidence
        const priorityOrder = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
        const aPriority = priorityOrder[a.notification.priority];
        const bPriority = priorityOrder[b.notification.priority];

        if (aPriority !== bPriority) return bPriority - aPriority;
        return b.assessment.confidence - a.assessment.confidence;
      })
      .slice(0, this.config.maxNotificationsPerResponse)
      .map(({ notification }) => notification);

    // Mark as delivered
    assessedNotifications.forEach(n => {
      n.delivered = true;
      n.deliveredAt = Date.now();
    });

    if (this.config.logDeliveryDecisions) {
      console.debug(`[NotificationQueue] Delivering ${assessedNotifications.length} notifications to session ${sessionId}`);
    }

    return assessedNotifications;
  }

  /**
   * Filter global notifications by contextual relevance to current session
   */
  private filterGlobalNotificationsByContext(): Notification[] {
    const relevantNotifications = this.globalNotifications.filter(notification => {
      if (!notification.mcpName) return false;
      return this.sessionManager.isMCPRelevant(notification.mcpName);
    });

    // Remove consumed notifications from global pool
    this.globalNotifications = this.globalNotifications.filter(notification => {
      return !relevantNotifications.includes(notification);
    });

    return relevantNotifications;
  }

  /**
   * Remove stale notifications
   */
  private filterStaleNotifications(notifications: Notification[]): Notification[] {
    const now = Date.now();
    const maxAge = this.config.notificationMaxAge;

    return notifications.filter(notification => {
      const age = now - notification.timestamp;
      return age < maxAge;
    });
  }

  /**
   * Assess whether a notification should be delivered
   */
  private assessDelivery(notification: Notification): DeliveryAssessment {
    let confidence = 0;
    const reasoning: string[] = [];

    // Base confidence for explicit session targeting
    if (notification.sessionId === this.sessionManager.getSessionId()) {
      confidence += 0.9;
      reasoning.push('explicit session match');
    }

    // MCP contextual relevance
    if (notification.mcpName && this.sessionManager.isMCPRelevant(notification.mcpName)) {
      confidence += 0.7;
      reasoning.push('recent MCP usage');
    }

    // Priority boost
    const priorityBoost = {
      'CRITICAL': 0.2,
      'HIGH': 0.1,
      'MEDIUM': 0.05,
      'LOW': 0
    };
    confidence += priorityBoost[notification.priority];
    reasoning.push(`${notification.priority.toLowerCase()} priority`);

    // Age penalty
    const age = Date.now() - notification.timestamp;
    const ageMinutes = age / (60 * 1000);
    if (ageMinutes > 5) {
      confidence -= 0.1;
      reasoning.push('age penalty');
    }

    // Determine delivery method
    let deliveryMethod: DeliveryAssessment['deliveryMethod'];
    if (confidence >= this.config.immediateDeliveryThreshold) {
      deliveryMethod = 'immediate';
    } else if (confidence >= this.config.contextualDeliveryThreshold) {
      deliveryMethod = 'contextual';
    } else {
      deliveryMethod = 'skip';
    }

    const shouldDeliver = confidence >= this.config.contextualDeliveryThreshold;

    if (this.config.logDeliveryDecisions) {
      console.debug(`[NotificationQueue] Delivery assessment for ${notification.id}: ${confidence.toFixed(2)} confidence, ${deliveryMethod}, reasoning: ${reasoning.join(', ')}`);
    }

    return {
      shouldDeliver,
      confidence,
      reasoning,
      deliveryMethod
    };
  }

  /**
   * Format notifications for display
   */
  formatForResponse(notifications?: Notification[]): string {
    const notificationsToFormat = notifications || this.getAndClear();

    if (notificationsToFormat.length === 0) {
      return '';
    }

    let output = '📬 System Notifications:\n';

    notificationsToFormat.forEach(notification => {
      const icon = this.getNotificationIcon(notification.type);
      output += `${icon} ${notification.message}\n`;
    });

    return output + '\n';
  }

  /**
   * Get icon for notification type
   */
  private getNotificationIcon(type: NotificationType): string {
    const icons = {
      [NotificationType.AUTH_PROVIDED]: '✅',
      [NotificationType.AUTH_EXPIRED]: '⏰',
      [NotificationType.AUTH_FAILED]: '❌',
      [NotificationType.MCP_HEALTH_CHANGED]: '💚',
      [NotificationType.MCP_CONNECTED]: '🔗',
      [NotificationType.MCP_DISCONNECTED]: '⛓️‍💥',
      [NotificationType.RATE_LIMIT_HIT]: '🚦',
      [NotificationType.RATE_LIMIT_CLEARED]: '🟢',
      [NotificationType.OPERATION_RETRY_SUCCESS]: '🔄',
      [NotificationType.OPERATION_RETRY_FAILED]: '❌',
      [NotificationType.SYSTEM_UPDATE]: '🔔',
      [NotificationType.CREDENTIAL_EXPIRES_SOON]: '⏰',
      [NotificationType.INFO]: 'ℹ️',
      [NotificationType.WARNING]: '⚠️',
      [NotificationType.ERROR]: '❌'
    };

    return icons[type] || '📢';
  }

  /**
   * Generate unique notification ID
   */
  private generateNotificationId(): string {
    return `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Trim session notifications to prevent memory leaks
   */
  private trimSessionNotifications(sessionId: string): void {
    const notifications = this.notifications.get(sessionId);
    if (!notifications) return;

    const maxNotifications = 50; // Keep last 50 notifications per session
    if (notifications.length > maxNotifications) {
      notifications.splice(0, notifications.length - maxNotifications);
    }
  }

  /**
   * Clean up old sessions and notifications
   */
  cleanupOldSessions(): void {
    const now = Date.now();
    const maxSessionAge = 60 * 60 * 1000; // 1 hour

    for (const [sessionId, notifications] of this.notifications.entries()) {
      if (notifications.length === 0) {
        this.notifications.delete(sessionId);
        continue;
      }

      // Remove sessions with only old notifications
      const hasRecentNotifications = notifications.some(n =>
        (now - n.timestamp) < maxSessionAge
      );

      if (!hasRecentNotifications) {
        this.notifications.delete(sessionId);
      }
    }

    // Clean up global notifications
    this.globalNotifications = this.filterStaleNotifications(this.globalNotifications);
  }

  /**
   * Get queue statistics for monitoring
   */
  getStats() {
    const sessionCount = this.notifications.size;
    const totalNotifications = Array.from(this.notifications.values())
      .reduce((sum, notifications) => sum + notifications.length, 0);
    const globalNotifications = this.globalNotifications.length;

    return {
      sessionCount,
      totalNotifications,
      globalNotifications,
      averageNotificationsPerSession: sessionCount > 0 ? totalNotifications / sessionCount : 0
    };
  }
}