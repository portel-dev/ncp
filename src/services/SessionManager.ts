/**
 * Session Manager for Notification Routing
 *
 * Handles session identification and context tracking for intelligent
 * notification delivery across multiple chat sessions and MCP clients.
 */

import { SessionContext, DEFAULT_NOTIFICATION_CONFIG, NotificationConfig } from '../types/notifications.js';

export class SessionManager {
  private static instance: SessionManager;
  private currentContext: SessionContext;
  private config: NotificationConfig;

  private constructor(config: Partial<NotificationConfig> = {}) {
    this.config = { ...DEFAULT_NOTIFICATION_CONFIG, ...config };
    this.currentContext = this.initializeSessionContext();
  }

  static getInstance(config?: Partial<NotificationConfig>): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager(config);
    }
    return SessionManager.instance;
  }

  /**
   * Initialize session context with multiple identification strategies
   */
  private initializeSessionContext(): SessionContext {
    const now = Date.now();

    const context: SessionContext = {
      // Process-based identification
      processId: process.pid,
      workingDirectory: process.cwd(),
      startTime: now,

      // Usage tracking
      recentMCPs: new Map(),

      // Activity tracking
      lastActivity: now,
      totalOperations: 0
    };

    // Set the context first, then try to detect session ID
    this.currentContext = context;

    // Now detect session ID (which may reference this.currentContext)
    context.sessionId = this.detectMCPSessionId();

    return context;
  }

  /**
   * Detect session ID from various MCP client implementations
   */
  private detectMCPSessionId(): string | undefined {
    // Check environment variables that MCP clients might set
    const possibleSessionVars = [
      'MCP_SESSION_ID',
      'CLAUDE_SESSION_ID',
      'CHAT_SESSION_ID',
      'CONVERSATION_ID',
      'CLIENT_SESSION_ID'
    ];

    for (const varName of possibleSessionVars) {
      const value = process.env[varName];
      if (value && value.trim()) {
        if (this.config.enableDebugLogging) {
          console.debug(`[SessionManager] Found session ID from ${varName}: ${value}`);
        }
        return value.trim();
      }
    }

    // If no explicit session ID, generate one based on context
    const contextualId = this.generateContextualSessionId();
    if (this.config.enableDebugLogging) {
      console.debug(`[SessionManager] Generated contextual session ID: ${contextualId}`);
    }
    return contextualId;
  }

  /**
   * Generate session ID based on process and context
   */
  private generateContextualSessionId(): string {
    const workDir = process.cwd().split('/').pop() || 'unknown';
    return `${process.pid}-${workDir}-${this.currentContext.startTime}`;
  }

  /**
   * Record MCP usage for contextual relevance
   */
  recordMCPUsage(mcpName: string): void {
    const now = Date.now();
    this.currentContext.recentMCPs.set(mcpName, now);
    this.currentContext.lastActivity = now;
    this.currentContext.totalOperations++;

    // Clean up old entries
    this.cleanupOldMCPUsage();

    if (this.config.enableDebugLogging) {
      console.debug(`[SessionManager] Recorded usage of ${mcpName} in session ${this.getSessionId()}`);
    }
  }

  /**
   * Clean up MCP usage entries that are too old to be relevant
   */
  private cleanupOldMCPUsage(): void {
    const now = Date.now();
    const maxAge = this.config.mcpUsageRelevanceWindow;

    for (const [mcpName, timestamp] of this.currentContext.recentMCPs.entries()) {
      if (now - timestamp > maxAge) {
        this.currentContext.recentMCPs.delete(mcpName);
      }
    }
  }

  /**
   * Check if an MCP is contextually relevant to this session
   */
  isMCPRelevant(mcpName: string): boolean {
    if (!mcpName) return true; // General notifications are always relevant

    const lastUsed = this.currentContext.recentMCPs.get(mcpName);
    if (!lastUsed) return false;

    const now = Date.now();
    const age = now - lastUsed;
    const isRelevant = age < this.config.mcpUsageRelevanceWindow;

    if (this.config.enableDebugLogging) {
      console.debug(`[SessionManager] MCP ${mcpName} relevance: ${isRelevant} (last used ${age}ms ago)`);
    }

    return isRelevant;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.currentContext.sessionId || this.generateContextualSessionId();
  }

  /**
   * Get full session context
   */
  getSessionContext(): Readonly<SessionContext> {
    return { ...this.currentContext };
  }

  /**
   * Check if this session matches a given session ID
   */
  matchesSession(sessionId?: string): boolean {
    if (!sessionId) return true; // No session ID means match any session

    const currentId = this.getSessionId();
    const matches = currentId === sessionId;

    if (this.config.logDeliveryDecisions) {
      console.debug(`[SessionManager] Session match: ${currentId} === ${sessionId} = ${matches}`);
    }

    return matches;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<NotificationConfig> {
    return { ...this.config };
  }

  /**
   * Get session statistics for debugging
   */
  getSessionStats() {
    const now = Date.now();
    const sessionAge = now - this.currentContext.startTime;
    const timeSinceLastActivity = now - this.currentContext.lastActivity;

    return {
      sessionId: this.getSessionId(),
      sessionAge: sessionAge,
      timeSinceLastActivity: timeSinceLastActivity,
      totalOperations: this.currentContext.totalOperations,
      trackedMCPs: Array.from(this.currentContext.recentMCPs.keys()),
      processId: this.currentContext.processId,
      workingDirectory: this.currentContext.workingDirectory
    };
  }

  /**
   * Reset session (useful for testing)
   */
  resetSession(): void {
    this.currentContext = this.initializeSessionContext();
  }
}