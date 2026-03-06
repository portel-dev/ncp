/**
 * Session-Aware Notification Queue
 *
 * Manages notification delivery with intelligent session isolation,
 * contextual relevance scoring, and automatic cleanup.
 */

import {
  Notification,
  NotificationPriority,
  NotificationType,
  NotificationConfig,
  DEFAULT_NOTIFICATION_CONFIG,
  DeliveryAssessment,
  NotificationDeliveryContext
} from '../types/notifications.js';
import { SessionManager } from './SessionManager.js';

export class NotificationQueue {
  private static instance: NotificationQueue;
  private notifications: Notification[] = [];
  private sessionManager: SessionManager;
  private config: NotificationConfig;

  private constructor(config: Partial<NotificationConfig> = {}) {
    this.config = { ...DEFAULT_NOTIFICATION_CONFIG, ...config };
    this.sessionManager = SessionManager.getInstance(config);

    // Start cleanup timer
    this.startCleanupTimer();
  }

  static getInstance(config?: Partial<NotificationConfig>): NotificationQueue {
    if (!NotificationQueue.instance) {
      NotificationQueue.instance = new NotificationQueue(config);
    }
    return NotificationQueue.instance;
  }

  /**
   * Add notification to the queue
   */
  add(notification: Omit<Notification, 'id' | 'timestamp'>): void {
    const completeNotification: Notification = {
      ...notification,
      id: this.generateNotificationId(),
      timestamp: Date.now()
    };

    this.notifications.push(completeNotification);

    if (this.config.enableDebugLogging) {
      console.debug(`[NotificationQueue] Added notification: ${completeNotification.type} for ${completeNotification.mcpName || 'general'}`);
    }

    // Cleanup old notifications
    this.cleanup();
  }

  /**
   * Get relevant notifications for current session
   */
  getRelevant(): Notification[] {
    const relevant: Notification[] = [];
    const sessionContext = this.sessionManager.getSessionContext();

    for (const notification of this.notifications) {
      const assessment = this.assessDelivery(notification);

      if (assessment.shouldDeliver) {
        relevant.push(notification);

        if (this.config.logDeliveryDecisions) {
          console.debug(`[NotificationQueue] Delivering notification ${notification.id}: ${assessment.reasoning.join(', ')}`);
        }
      } else if (this.config.logDeliveryDecisions) {
        console.debug(`[NotificationQueue] Skipping notification ${notification.id}: ${assessment.reasoning.join(', ')}`);
      }
    }

    // Sort by priority and timestamp
    return relevant.sort((a, b) => {
      const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.timestamp - a.timestamp;
    });
  }

  /**
   * Get and clear relevant notifications (atomic operation)
   */
  getAndClear(): Notification[] {
    const relevant = this.getRelevant();

    // Remove delivered notifications
    const deliveredIds = new Set(relevant.map(n => n.id));
    this.notifications = this.notifications.filter(n => !deliveredIds.has(n.id));

    if (this.config.enableDebugLogging && relevant.length > 0) {
      console.debug(`[NotificationQueue] Delivered ${relevant.length} notifications, ${this.notifications.length} remaining`);
    }

    return relevant;
  }

  /**
   * Assess whether a notification should be delivered to current session
   */
  private assessDelivery(notification: Notification): DeliveryAssessment {
    let confidence = 0;
    const reasoning: string[] = [];

    // Explicit session match
    if (notification.sessionId === this.sessionManager.getSessionId()) {
      confidence += 0.9;
      reasoning.push('explicit session match');
    } else if (notification.sessionId && notification.sessionId !== this.sessionManager.getSessionId()) {
      return {
        shouldDeliver: false,
        confidence: 0,
        reasoning: ['session mismatch']
      };
    }

    // MCP contextual relevance
    if (notification.mcpName) {
      if (this.sessionManager.isMCPRelevant(notification.mcpName)) {
        confidence += 0.7;
        reasoning.push('MCP recently used in session');
      } else {
        confidence -= 0.5;
        reasoning.push('MCP not recently used');
      }
    } else {
      confidence += 0.3;
      reasoning.push('general notification');
    }

    // Priority boost
    const priorityBoost = {
      [NotificationPriority.HIGH]: 0.3,
      [NotificationPriority.MEDIUM]: 0.1,
      [NotificationPriority.LOW]: 0
    };
    confidence += priorityBoost[notification.priority];
    reasoning.push(`${notification.priority.toLowerCase()} priority`);

    // Age penalty
    const age = Date.now() - notification.timestamp;
    const ageMinutes = age / (1000 * 60);
    if (ageMinutes > 10) {
      confidence -= 0.2;
      reasoning.push('notification is aging');
    }

    // Auth-related notifications get slight boost if no explicit session
    if (!notification.sessionId && this.isAuthRelated(notification.type)) {
      confidence += 0.2;
      reasoning.push('auth-related boost');
    }

    const shouldDeliver = confidence > 0.4;

    return {
      shouldDeliver,
      confidence: Math.max(0, Math.min(1, confidence)),
      reasoning
    };
  }

  /**
   * Check if notification type is auth-related
   */
  private isAuthRelated(type: NotificationType): boolean {
    return [
      NotificationType.AUTH_PROVIDED,
      NotificationType.AUTH_FAILED,
      NotificationType.CREDENTIAL_EXPIRED,
      NotificationType.CREDENTIAL_UPDATED
    ].includes(type);
  }

  /**
   * Generate unique notification ID
   */
  private generateNotificationId(): string {
    return `ncp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up old notifications
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = this.config.notificationTtl;

    const before = this.notifications.length;
    this.notifications = this.notifications.filter(n => (now - n.timestamp) < maxAge);

    if (this.config.enableDebugLogging && this.notifications.length < before) {
      console.debug(`[NotificationQueue] Cleaned up ${before - this.notifications.length} old notifications`);
    }
  }

  /**
   * Start periodic cleanup timer
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      this.cleanup();
    }, this.config.notificationTtl / 4); // Cleanup 4x more frequently than TTL
  }

  /**
   * Format notifications for human-readable response
   */
  formatForResponse(notifications: Notification[]): string {
    if (notifications.length === 0) return '';

    const sections: string[] = [];

    // Group by priority
    const byPriority = {
      HIGH: notifications.filter(n => n.priority === NotificationPriority.HIGH),
      MEDIUM: notifications.filter(n => n.priority === NotificationPriority.MEDIUM),
      LOW: notifications.filter(n => n.priority === NotificationPriority.LOW)
    };

    for (const [priority, notifs] of Object.entries(byPriority)) {
      if (notifs.length === 0) continue;

      sections.push(`\n🔔 ${priority} Priority Updates:`);
      for (const notif of notifs) {
        sections.push(`${notif.message}`);
      }
    }

    return sections.join('\n') + '\n';
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const now = Date.now();
    const byPriority = {
      HIGH: this.notifications.filter(n => n.priority === NotificationPriority.HIGH).length,
      MEDIUM: this.notifications.filter(n => n.priority === NotificationPriority.MEDIUM).length,
      LOW: this.notifications.filter(n => n.priority === NotificationPriority.LOW).length
    };

    const byAge = {
      fresh: this.notifications.filter(n => (now - n.timestamp) < 60000).length, // < 1 min
      recent: this.notifications.filter(n => (now - n.timestamp) < 300000).length, // < 5 min
      old: this.notifications.filter(n => (now - n.timestamp) >= 300000).length // >= 5 min
    };

    return {
      total: this.notifications.length,
      byPriority,
      byAge,
      sessionId: this.sessionManager.getSessionId()
    };
  }

  /**
   * Clear all notifications (for testing)
   */
  clear(): void {
    this.notifications = [];
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}