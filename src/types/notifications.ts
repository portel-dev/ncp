/**
 * Session-Aware Notification System Types
 *
 * Handles notifications with intelligent session routing:
 * 1. Primary: MCP client-provided session IDs
 * 2. Fallback: Contextual relevance (process + recent usage + timing)
 */

export enum NotificationType {
  // Authentication events
  AUTH_PROVIDED = 'AUTH_PROVIDED',
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  AUTH_FAILED = 'AUTH_FAILED',

  // MCP health and status
  MCP_HEALTH_CHANGED = 'MCP_HEALTH_CHANGED',
  MCP_CONNECTED = 'MCP_CONNECTED',
  MCP_DISCONNECTED = 'MCP_DISCONNECTED',

  // Rate limiting and throttling
  RATE_LIMIT_HIT = 'RATE_LIMIT_HIT',
  RATE_LIMIT_CLEARED = 'RATE_LIMIT_CLEARED',

  // Operation retries and recovery
  OPERATION_RETRY_SUCCESS = 'OPERATION_RETRY_SUCCESS',
  OPERATION_RETRY_FAILED = 'OPERATION_RETRY_FAILED',

  // System events
  SYSTEM_UPDATE = 'SYSTEM_UPDATE',
  CREDENTIAL_EXPIRES_SOON = 'CREDENTIAL_EXPIRES_SOON',

  // General information
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR'
}

export type NotificationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Notification {
  id: string;
  type: NotificationType;
  mcpName?: string;
  message: string;
  timestamp: number;
  priority: NotificationPriority;
  sessionId?: string; // If provided by MCP client
  metadata?: Record<string, any>;

  // Delivery tracking
  attempts?: number;
  delivered?: boolean;
  deliveredAt?: number;
}

/**
 * Session context for routing decisions
 */
export interface SessionContext {
  // Primary identification
  sessionId?: string; // From MCP client if available

  // Process identification
  processId: number;
  workingDirectory: string;
  startTime: number;

  // Usage tracking for contextual relevance
  recentMCPs: Map<string, number>; // mcpName -> lastUsedTimestamp

  // Activity tracking
  lastActivity: number;
  totalOperations: number;
}

/**
 * Notification delivery assessment
 */
export interface DeliveryAssessment {
  shouldDeliver: boolean;
  confidence: number; // 0-1 confidence score
  reasoning: string[];
  deliveryMethod: 'immediate' | 'contextual' | 'skip';
}

/**
 * Configuration for notification behavior
 */
export interface NotificationConfig {
  // Relevance windows
  mcpUsageRelevanceWindow: number; // milliseconds (default: 15 minutes)
  notificationMaxAge: number; // milliseconds (default: 10 minutes)

  // Confidence thresholds
  immediateDeliveryThreshold: number; // default: 0.8
  contextualDeliveryThreshold: number; // default: 0.4

  // Delivery limits
  maxNotificationsPerResponse: number; // default: 3
  maxRetryAttempts: number; // default: 2

  // Debug options
  enableDebugLogging: boolean;
  logDeliveryDecisions: boolean;
}

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  mcpUsageRelevanceWindow: 15 * 60 * 1000, // 15 minutes
  notificationMaxAge: 10 * 60 * 1000, // 10 minutes
  immediateDeliveryThreshold: 0.8,
  contextualDeliveryThreshold: 0.4,
  maxNotificationsPerResponse: 3,
  maxRetryAttempts: 2,
  enableDebugLogging: false,
  logDeliveryDecisions: false
};