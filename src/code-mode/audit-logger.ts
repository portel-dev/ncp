/**
 * Code-Mode Audit Logger - Phase 5
 *
 * Provides comprehensive audit trail for Code-Mode security events:
 * - Code execution (start, success, failure)
 * - Network access (requests, permissions, denials)
 * - Binding usage
 * - Security violations
 *
 * For enterprise compliance and security monitoring.
 */

import { writeFile, appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { getNcpBaseDirectory } from '../utils/ncp-paths.js';
import { logger } from '../utils/logger.js';

/**
 * Audit event types
 */
export enum AuditEventType {
  // Code execution events
  CODE_EXECUTION_START = 'code_execution_start',
  CODE_EXECUTION_SUCCESS = 'code_execution_success',
  CODE_EXECUTION_ERROR = 'code_execution_error',
  CODE_EXECUTION_TIMEOUT = 'code_execution_timeout',

  // Network access events
  NETWORK_REQUEST_ALLOWED = 'network_request_allowed',
  NETWORK_REQUEST_DENIED = 'network_request_denied',
  NETWORK_PERMISSION_GRANTED = 'network_permission_granted',
  NETWORK_PERMISSION_DENIED = 'network_permission_denied',
  NETWORK_PERMISSION_REVOKED = 'network_permission_revoked',

  // Binding events
  BINDING_ACCESSED = 'binding_accessed',
  BINDING_CREATED = 'binding_created',

  // Security events
  SECURITY_VIOLATION = 'security_violation',
  PROTOTYPE_POLLUTION_BLOCKED = 'prototype_pollution_blocked',
  WORKER_THREAD_FAILED = 'worker_thread_failed'
}

/**
 * Audit event severity
 */
export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * Base audit event structure
 */
export interface AuditEvent {
  timestamp: string;
  type: AuditEventType;
  severity: AuditSeverity;
  context: {
    mcpName?: string;
    bindingName?: string;
    userId?: string;
    sessionId?: string;
  };
  details: Record<string, any>;
  outcome: 'success' | 'failure' | 'blocked' | 'pending';
}

/**
 * Audit logger configuration
 */
export interface AuditLoggerConfig {
  enabled: boolean;
  auditDir?: string;
  maxFileSizeMB?: number;
  maxFiles?: number;
  includeCodeSnippets?: boolean;
  redactSensitiveData?: boolean;
}

/**
 * Default audit configuration
 */
const DEFAULT_CONFIG: AuditLoggerConfig = {
  enabled: true,
  maxFileSizeMB: 10,
  maxFiles: 5,
  includeCodeSnippets: true,
  redactSensitiveData: true
};

/**
 * Audit Logger for Code-Mode security events
 */
export class AuditLogger {
  private config: AuditLoggerConfig;
  private auditDir: string;
  private currentFile: string;
  private sessionId: string;

  constructor(config: Partial<AuditLoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.auditDir = this.config.auditDir || join(getNcpBaseDirectory(), 'audit');
    this.currentFile = join(this.auditDir, `audit-${this.getDateString()}.jsonl`);
    this.sessionId = this.generateSessionId();
  }

  /**
   * Initialize audit logger (create directory if needed)
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) return;

    try {
      if (!existsSync(this.auditDir)) {
        await mkdir(this.auditDir, { recursive: true });
      }
      logger.info(`📋 Audit logging enabled: ${this.auditDir}`);
    } catch (error: any) {
      logger.error(`Failed to initialize audit logger: ${error.message}`);
    }
  }

  /**
   * Log an audit event
   */
  async logEvent(
    type: AuditEventType,
    details: Record<string, any>,
    severity: AuditSeverity = AuditSeverity.INFO,
    outcome: 'success' | 'failure' | 'blocked' | 'pending' = 'success',
    context: AuditEvent['context'] = {}
  ): Promise<void> {
    if (!this.config.enabled) return;

    const event: AuditEvent = {
      timestamp: new Date().toISOString(),
      type,
      severity,
      context: {
        ...context,
        sessionId: this.sessionId
      },
      details: this.sanitizeDetails(details),
      outcome
    };

    try {
      const line = JSON.stringify(event) + '\n';
      await appendFile(this.currentFile, line, 'utf-8');

      // Check file rotation
      await this.checkRotation();
    } catch (error: any) {
      logger.error(`Failed to write audit log: ${error.message}`);
    }
  }

  /**
   * Log code execution start
   */
  async logCodeExecutionStart(code: string, context: AuditEvent['context'] = {}): Promise<void> {
    await this.logEvent(
      AuditEventType.CODE_EXECUTION_START,
      {
        codeSnippet: this.config.includeCodeSnippets ? this.truncateCode(code) : '<redacted>',
        codeLength: code.length
      },
      AuditSeverity.INFO,
      'pending',
      context
    );
  }

  /**
   * Log code execution success
   */
  async logCodeExecutionSuccess(
    code: string,
    result: any,
    duration: number,
    context: AuditEvent['context'] = {}
  ): Promise<void> {
    await this.logEvent(
      AuditEventType.CODE_EXECUTION_SUCCESS,
      {
        codeSnippet: this.config.includeCodeSnippets ? this.truncateCode(code) : '<redacted>',
        resultPreview: this.truncate(JSON.stringify(result), 200),
        durationMs: duration
      },
      AuditSeverity.INFO,
      'success',
      context
    );
  }

  /**
   * Log code execution error
   */
  async logCodeExecutionError(
    code: string,
    error: string,
    context: AuditEvent['context'] = {}
  ): Promise<void> {
    await this.logEvent(
      AuditEventType.CODE_EXECUTION_ERROR,
      {
        codeSnippet: this.config.includeCodeSnippets ? this.truncateCode(code) : '<redacted>',
        error: this.truncate(error, 500)
      },
      AuditSeverity.ERROR,
      'failure',
      context
    );
  }

  /**
   * Log network request allowed
   */
  async logNetworkRequestAllowed(
    url: string,
    method: string,
    context: AuditEvent['context'] = {}
  ): Promise<void> {
    await this.logEvent(
      AuditEventType.NETWORK_REQUEST_ALLOWED,
      {
        url: this.redactUrl(url),
        method,
        timestamp: Date.now()
      },
      AuditSeverity.INFO,
      'success',
      context
    );
  }

  /**
   * Log network request denied
   */
  async logNetworkRequestDenied(
    url: string,
    reason: string,
    context: AuditEvent['context'] = {}
  ): Promise<void> {
    await this.logEvent(
      AuditEventType.NETWORK_REQUEST_DENIED,
      {
        url: this.redactUrl(url),
        reason
      },
      AuditSeverity.WARNING,
      'blocked',
      context
    );
  }

  /**
   * Log network permission granted
   */
  async logNetworkPermissionGranted(
    url: string,
    permanent: boolean,
    context: AuditEvent['context'] = {}
  ): Promise<void> {
    await this.logEvent(
      AuditEventType.NETWORK_PERMISSION_GRANTED,
      {
        url: this.redactUrl(url),
        permanent,
        expiresIn: permanent ? 'never' : '1 hour'
      },
      AuditSeverity.INFO,
      'success',
      context
    );
  }

  /**
   * Log network permission denied
   */
  async logNetworkPermissionDenied(
    url: string,
    context: AuditEvent['context'] = {}
  ): Promise<void> {
    await this.logEvent(
      AuditEventType.NETWORK_PERMISSION_DENIED,
      {
        url: this.redactUrl(url)
      },
      AuditSeverity.WARNING,
      'blocked',
      context
    );
  }

  /**
   * Log binding accessed
   */
  async logBindingAccessed(
    bindingName: string,
    method: string,
    context: AuditEvent['context'] = {}
  ): Promise<void> {
    await this.logEvent(
      AuditEventType.BINDING_ACCESSED,
      {
        binding: bindingName,
        method
      },
      AuditSeverity.INFO,
      'success',
      context
    );
  }

  /**
   * Log security violation
   */
  async logSecurityViolation(
    violation: string,
    details: Record<string, any>,
    context: AuditEvent['context'] = {}
  ): Promise<void> {
    await this.logEvent(
      AuditEventType.SECURITY_VIOLATION,
      {
        violation,
        ...details
      },
      AuditSeverity.CRITICAL,
      'blocked',
      context
    );
  }

  /**
   * Sanitize details (remove sensitive data)
   */
  private sanitizeDetails(details: Record<string, any>): Record<string, any> {
    if (!this.config.redactSensitiveData) return details;

    const sanitized = { ...details };

    // Redact common sensitive fields
    const sensitiveKeys = ['password', 'token', 'apiKey', 'secret', 'credential', 'authorization'];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        sanitized[key] = '<redacted>';
      }
    }

    return sanitized;
  }

  /**
   * Redact URL query parameters (may contain secrets)
   */
  private redactUrl(url: string): string {
    if (!this.config.redactSensitiveData) return url;

    try {
      const parsed = new URL(url);
      if (parsed.search) {
        return `${parsed.origin}${parsed.pathname}?<redacted>`;
      }
      return url;
    } catch {
      return url;
    }
  }

  /**
   * Truncate code for logging
   */
  private truncateCode(code: string, maxLength: number = 500): string {
    if (code.length <= maxLength) return code;
    return code.substring(0, maxLength) + '... (truncated)';
  }

  /**
   * Truncate string
   */
  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Get date string for file naming
   */
  private getDateString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  /**
   * Check if audit file needs rotation
   */
  private async checkRotation(): Promise<void> {
    // TODO: Implement file size check and rotation
    // For now, rotate daily (file name includes date)
  }
}

/**
 * Global audit logger instance
 */
let globalAuditLogger: AuditLogger | null = null;

/**
 * Get global audit logger instance
 */
export function getAuditLogger(config?: Partial<AuditLoggerConfig>): AuditLogger {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger(config);
    globalAuditLogger.initialize().catch(error => {
      logger.error(`Failed to initialize audit logger: ${error.message}`);
    });
  }
  return globalAuditLogger;
}
