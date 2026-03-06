/**
 * Notification System Types
 *
 * Defines comprehensive types for session-aware notification delivery
 * with intelligent routing and contextual relevance scoring.
 */

export interface Notification {
  id: string;
  type: NotificationType;
  mcpName?: string;
  message: string;
  timestamp: number;
  priority: NotificationPriority;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export enum NotificationType {
  AUTH_PROVIDED = 'auth_provided',
  AUTH_FAILED = 'auth_failed',
  MCP_HEALTH_RESTORED = 'mcp_health_restored',
  MCP_HEALTH_DEGRADED = 'mcp_health_degraded',
  RATE_LIMIT_APPROACHING = 'rate_limit_approaching',
  RATE_LIMIT_RESET = 'rate_limit_reset',
  OPERATION_RETRY_SUCCESS = 'operation_retry_success',
  OPERATION_RETRY_FAILED = 'operation_retry_failed',
  CREDENTIAL_EXPIRED = 'credential_expired',
  CREDENTIAL_UPDATED = 'credential_updated',
  CONNECTION_RESTORED = 'connection_restored',
  CONNECTION_LOST = 'connection_lost'
}

export enum NotificationPriority {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW'
}

export interface SessionContext {
  sessionId?: string;
  processId: number;
  workingDirectory: string;
  startTime: number;
  recentMCPs: Map<string, number>;
  lastActivity: number;
  totalOperations: number;
}

export interface NotificationConfig {
  enableDebugLogging: boolean;
  maxNotificationAge: number;
  maxSessionAge: number;
  mcpUsageRelevanceWindow: number;
  logDeliveryDecisions: boolean;
  notificationTtl: number;
  batchDeliverySize: number;
}

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  enableDebugLogging: false,
  maxNotificationAge: 1 * 60 * 60 * 1000, // 1 hour
  maxSessionAge: 24 * 60 * 60 * 1000, // 24 hours
  mcpUsageRelevanceWindow: 30 * 60 * 1000, // 30 minutes
  logDeliveryDecisions: false,
  notificationTtl: 5 * 60 * 1000, // 5 minutes
  batchDeliverySize: 10
};

export interface DeliveryAssessment {
  shouldDeliver: boolean;
  confidence: number;
  reasoning: string[];
}

export interface NotificationDeliveryContext {
  currentOperation?: string;
  recentMcpUsage: string[];
  sessionRelevance: number;
  timeContext: {
    sessionAge: number;
    timeSinceLastActivity: number;
  };
}