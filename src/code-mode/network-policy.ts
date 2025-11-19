/**
 * Network Policy Manager - Network Isolation for Code-Mode
 * Phase 4: Prevent data exfiltration via network
 * Phase 4.1: Runtime permissions via elicitations
 *
 * Security Model:
 * - Worker threads have NO direct network access
 * - All network requests go through main thread
 * - Whitelist-based URL filtering
 * - Runtime permission prompts for restricted access (elicitations)
 * - User consent required for private IPs and localhost
 */

import { logger } from '../utils/logger.js';
import { getAuditLogger } from './audit-logger.js';

/**
 * Elicitation function signature
 * Returns user's decision (approve/deny)
 */
export type ElicitationFunction = (params: {
  message: string;
  title?: string;
  options?: string[];
}) => Promise<string | undefined>;

/**
 * Network policy definition
 */
export interface NetworkPolicy {
  allowedDomains: string[];      // e.g., ["api.github.com", "*.anthropic.com"]
  blockedDomains: string[];      // e.g., ["evil.com", "*.attacker.net"]
  allowAllLocalhost: boolean;    // Allow localhost/127.0.0.1
  allowPrivateIPs: boolean;      // Allow 10.x.x.x, 192.168.x.x, etc.
  maxRequestSize: number;        // Max request body size (bytes)
  maxResponseSize: number;       // Max response size (bytes)
  timeout: number;               // Request timeout (ms)
}

/**
 * Network request from worker
 */
export interface NetworkRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
}

/**
 * Network response to worker
 */
export interface NetworkResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
}

/**
 * Network permission cache entry
 */
interface NetworkPermission {
  url: string;
  hostname: string;
  approved: boolean;
  timestamp: number;
  expiresAt?: number;
}

/**
 * Manages network access policies and controlled requests
 */
export class NetworkPolicyManager {
  private policy: NetworkPolicy;
  private elicitationFunction?: ElicitationFunction;
  private permissionCache: Map<string, NetworkPermission> = new Map();
  private enableElicitations: boolean = false;

  constructor(
    policy?: Partial<NetworkPolicy>,
    elicitationFunction?: ElicitationFunction
  ) {
    this.policy = {
      allowedDomains: policy?.allowedDomains || [],
      blockedDomains: policy?.blockedDomains || [],
      allowAllLocalhost: policy?.allowAllLocalhost ?? false,
      allowPrivateIPs: policy?.allowPrivateIPs ?? false,
      maxRequestSize: policy?.maxRequestSize || 1024 * 1024,  // 1MB default
      maxResponseSize: policy?.maxResponseSize || 10 * 1024 * 1024,  // 10MB default
      timeout: policy?.timeout || 30000  // 30s default
    };

    this.elicitationFunction = elicitationFunction;
    this.enableElicitations = !!elicitationFunction;

    logger.info(
      `🌐 Network policy initialized: ${this.policy.allowedDomains.length} allowed domains` +
      (this.enableElicitations ? ' (with runtime permissions)' : '')
    );
  }

  /**
   * Check if a URL is allowed by policy (with runtime permissions)
   */
  async isUrlAllowedAsync(
    url: string,
    context?: { mcpName?: string; bindingName?: string }
  ): Promise<{ allowed: boolean; reason?: string }> {
    // First check static policy
    const staticCheck = this.isUrlAllowed(url);

    // If statically allowed, no need for elicitation
    if (staticCheck.allowed) {
      return staticCheck;
    }

    // If explicitly blocked, don't elicit
    const urlObj = new URL(url);
    if (this.isHostnameBlocked(urlObj.hostname)) {
      return staticCheck;
    }

    // Check if elicitations are enabled
    if (!this.enableElicitations || !this.elicitationFunction) {
      return staticCheck;
    }

    // Check permission cache
    const cached = this.permissionCache.get(url);
    if (cached) {
      // Check expiration
      if (!cached.expiresAt || cached.expiresAt > Date.now()) {
        return {
          allowed: cached.approved,
          reason: cached.approved ? undefined : 'User denied permission'
        };
      } else {
        // Permission expired, remove from cache
        this.permissionCache.delete(url);
      }
    }

    // Request permission from user
    return await this.requestNetworkPermission(url, context);
  }

  /**
   * Check if a URL is allowed by policy (sync, no elicitations)
   */
  isUrlAllowed(url: string): { allowed: boolean; reason?: string } {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;

      // Check blocked domains first
      if (this.isHostnameBlocked(hostname)) {
        return {
          allowed: false,
          reason: `Domain ${hostname} is explicitly blocked`
        };
      }

      // Check localhost
      if (this.isLocalhost(hostname)) {
        if (this.policy.allowAllLocalhost) {
          return { allowed: true };
        } else {
          return {
            allowed: false,
            reason: 'Localhost access is not allowed by policy'
          };
        }
      }

      // Check private IPs
      if (this.isPrivateIP(hostname)) {
        if (this.policy.allowPrivateIPs) {
          return { allowed: true };
        } else {
          return {
            allowed: false,
            reason: 'Private IP access is not allowed by policy'
          };
        }
      }

      // Check allowed domains
      if (this.policy.allowedDomains.length === 0) {
        // No allowlist = block all external requests
        return {
          allowed: false,
          reason: 'No allowed domains configured - all external requests blocked'
        };
      }

      if (this.isHostnameAllowed(hostname)) {
        return { allowed: true };
      }

      return {
        allowed: false,
        reason: `Domain ${hostname} is not in the allowlist`
      };

    } catch (error: any) {
      return {
        allowed: false,
        reason: `Invalid URL: ${error.message}`
      };
    }
  }

  /**
   * Request network permission from user via elicitation
   */
  private async requestNetworkPermission(
    url: string,
    context?: { mcpName?: string; bindingName?: string }
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.elicitationFunction) {
      return { allowed: false, reason: 'Elicitations not available' };
    }

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;

      // Determine access type
      let accessType = 'external domain';
      if (this.isLocalhost(hostname)) {
        accessType = 'localhost';
      } else if (this.isPrivateIP(hostname)) {
        accessType = 'local network (private IP)';
      }

      // Determine who is requesting
      const requester = context?.bindingName || context?.mcpName || 'Code execution';

      // Build elicitation message
      const message = `${requester} wants to access ${accessType}:\n\n${url}\n\nAllow this network access?`;

      logger.info(`🔐 Requesting network permission: ${url}`);

      // Show elicitation
      const response = await this.elicitationFunction({
        title: 'Network Access Permission',
        message,
        options: ['Allow Once', 'Allow Always', 'Deny']
      });

      // Parse response
      const approved = response === 'Allow Once' || response === 'Allow Always';
      const permanent = response === 'Allow Always';

      // Phase 5: Audit log permission decision
      const auditLogger = getAuditLogger();
      if (approved) {
        await auditLogger.logNetworkPermissionGranted(url, permanent, context);
      } else {
        await auditLogger.logNetworkPermissionDenied(url, context);
      }

      // Cache the decision
      this.permissionCache.set(url, {
        url,
        hostname,
        approved,
        timestamp: Date.now(),
        expiresAt: permanent ? undefined : Date.now() + 3600000  // 1 hour for "once"
      });

      logger.info(
        `🔐 User ${approved ? 'approved' : 'denied'} network access to ${url}` +
        (permanent ? ' (permanent)' : ' (this session)')
      );

      return {
        allowed: approved,
        reason: approved ? undefined : 'User denied network permission'
      };

    } catch (error: any) {
      logger.error(`Failed to elicit network permission: ${error.message}`);
      return { allowed: false, reason: 'Permission request failed' };
    }
  }

  /**
   * Execute a controlled network request
   */
  async executeRequest(
    request: NetworkRequest,
    context?: { mcpName?: string; bindingName?: string }
  ): Promise<NetworkResponse> {
    const auditLogger = getAuditLogger();

    // Validate URL with elicitations
    const urlCheck = await this.isUrlAllowedAsync(request.url, context);
    if (!urlCheck.allowed) {
      // Phase 5: Log denied request
      await auditLogger.logNetworkRequestDenied(request.url, urlCheck.reason || 'Policy violation', context);
      throw new Error(`Network request blocked: ${urlCheck.reason}`);
    }

    // Phase 5: Log allowed request
    await auditLogger.logNetworkRequestAllowed(request.url, request.method, context);

    // Validate request size
    if (request.body) {
      const bodySize = JSON.stringify(request.body).length;
      if (bodySize > this.policy.maxRequestSize) {
        throw new Error(
          `Request body too large: ${bodySize} bytes (max: ${this.policy.maxRequestSize})`
        );
      }
    }

    logger.info(`🌐 Executing controlled network request: ${request.method} ${request.url}`);

    try {
      // Use native fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.policy.timeout);

      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Check response size
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > this.policy.maxResponseSize) {
        throw new Error(
          `Response too large: ${contentLength} bytes (max: ${this.policy.maxResponseSize})`
        );
      }

      // Parse response
      const responseBody = await response.text();

      // Double-check actual response size
      if (responseBody.length > this.policy.maxResponseSize) {
        throw new Error(
          `Response too large: ${responseBody.length} bytes (max: ${this.policy.maxResponseSize})`
        );
      }

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return {
        status: response.status,
        statusText: response.statusText,
        headers,
        body: responseBody
      };

    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Network request timeout after ${this.policy.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Update policy at runtime
   */
  updatePolicy(updates: Partial<NetworkPolicy>): void {
    this.policy = { ...this.policy, ...updates };
    logger.info('🌐 Network policy updated');
  }

  /**
   * Get current policy
   */
  getPolicy(): NetworkPolicy {
    return { ...this.policy };
  }

  /**
   * Add allowed domain
   */
  allowDomain(domain: string): void {
    if (!this.policy.allowedDomains.includes(domain)) {
      this.policy.allowedDomains.push(domain);
      logger.info(`🌐 Added allowed domain: ${domain}`);
    }
  }

  /**
   * Block domain
   */
  blockDomain(domain: string): void {
    if (!this.policy.blockedDomains.includes(domain)) {
      this.policy.blockedDomains.push(domain);
      logger.info(`🌐 Added blocked domain: ${domain}`);
    }
  }

  /**
   * Clear all cached permissions
   */
  clearPermissions(): void {
    this.permissionCache.clear();
    logger.info('🔐 Cleared all cached network permissions');
  }

  /**
   * Revoke permission for a specific URL
   */
  revokePermission(url: string): boolean {
    const deleted = this.permissionCache.delete(url);
    if (deleted) {
      logger.info(`🔐 Revoked permission for ${url}`);
    }
    return deleted;
  }

  /**
   * Get all cached permissions (for debugging/management)
   */
  getPermissions(): Array<{ url: string; approved: boolean; permanent: boolean }> {
    return Array.from(this.permissionCache.values()).map(p => ({
      url: p.url,
      approved: p.approved,
      permanent: !p.expiresAt
    }));
  }

  /**
   * Check if hostname matches allowed domains (supports wildcards)
   */
  private isHostnameAllowed(hostname: string): boolean {
    return this.policy.allowedDomains.some(pattern => {
      return this.matchDomainPattern(hostname, pattern);
    });
  }

  /**
   * Check if hostname matches blocked domains
   */
  private isHostnameBlocked(hostname: string): boolean {
    return this.policy.blockedDomains.some(pattern => {
      return this.matchDomainPattern(hostname, pattern);
    });
  }

  /**
   * Match hostname against domain pattern (supports wildcards)
   */
  private matchDomainPattern(hostname: string, pattern: string): boolean {
    // Exact match
    if (hostname === pattern) {
      return true;
    }

    // Wildcard match (*.example.com)
    if (pattern.startsWith('*.')) {
      const domain = pattern.slice(2);
      return hostname.endsWith('.' + domain) || hostname === domain;
    }

    return false;
  }

  /**
   * Check if hostname is localhost
   */
  private isLocalhost(hostname: string): boolean {
    return hostname === 'localhost' ||
           hostname === '127.0.0.1' ||
           hostname === '::1' ||
           hostname === '0.0.0.0';
  }

  /**
   * Check if hostname is a private IP
   */
  private isPrivateIP(hostname: string): boolean {
    // IPv4 private ranges
    const privateRanges = [
      /^10\./,                    // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
      /^192\.168\./               // 192.168.0.0/16
    ];

    return privateRanges.some(range => range.test(hostname));
  }
}

/**
 * Default secure network policy
 */
export const SECURE_NETWORK_POLICY: NetworkPolicy = {
  allowedDomains: [],  // Block all by default
  blockedDomains: [],
  allowAllLocalhost: false,
  allowPrivateIPs: false,
  maxRequestSize: 1024 * 1024,  // 1MB
  maxResponseSize: 10 * 1024 * 1024,  // 10MB
  timeout: 30000  // 30s
};

/**
 * Permissive policy for development
 */
export const PERMISSIVE_NETWORK_POLICY: NetworkPolicy = {
  allowedDomains: ['*'],  // Allow all
  blockedDomains: [],
  allowAllLocalhost: true,
  allowPrivateIPs: true,
  maxRequestSize: 10 * 1024 * 1024,  // 10MB
  maxResponseSize: 100 * 1024 * 1024,  // 100MB
  timeout: 60000  // 60s
};
