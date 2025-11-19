/**
 * Network Policy Manager - Network Isolation for Code-Mode
 * Phase 4: Prevent data exfiltration via network
 *
 * Security Model:
 * - Worker threads have NO direct network access
 * - All network requests go through main thread
 * - Whitelist-based URL filtering
 * - Blocks common exfiltration vectors
 */

import { logger } from '../utils/logger.js';

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
 * Manages network access policies and controlled requests
 */
export class NetworkPolicyManager {
  private policy: NetworkPolicy;

  constructor(policy?: Partial<NetworkPolicy>) {
    this.policy = {
      allowedDomains: policy?.allowedDomains || [],
      blockedDomains: policy?.blockedDomains || [],
      allowAllLocalhost: policy?.allowAllLocalhost ?? false,
      allowPrivateIPs: policy?.allowPrivateIPs ?? false,
      maxRequestSize: policy?.maxRequestSize || 1024 * 1024,  // 1MB default
      maxResponseSize: policy?.maxResponseSize || 10 * 1024 * 1024,  // 10MB default
      timeout: policy?.timeout || 30000  // 30s default
    };

    logger.info(`🌐 Network policy initialized: ${this.policy.allowedDomains.length} allowed domains`);
  }

  /**
   * Check if a URL is allowed by policy
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
   * Execute a controlled network request
   */
  async executeRequest(request: NetworkRequest): Promise<NetworkResponse> {
    // Validate URL
    const urlCheck = this.isUrlAllowed(request.url);
    if (!urlCheck.allowed) {
      throw new Error(`Network request blocked: ${urlCheck.reason}`);
    }

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
