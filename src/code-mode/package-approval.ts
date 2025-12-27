/**
 * Package Approval Manager
 *
 * Manages runtime package approvals with scoped expiration.
 * Approvals are stored in-memory only - no persistent security holes.
 *
 * Approval Scopes:
 * - "operation": Approve for single code execution only
 * - "session": Approve until server restarts
 * - "hour": Approve for 1 hour
 * - "day": Approve for 24 hours
 */

// Built-in whitelist - packages that are always allowed
// Must match the list in code-worker.ts
export const BUILTIN_PACKAGES = new Set([
  'pdf-lib',
  'docx',
  'pptxgenjs',
  'xlsx',
  'papaparse',
  'cheerio',
  'axios',
  'lodash',
  'date-fns',
  'uuid',
  'crypto-js',
  'canvas',
  'sharp',
  'jimp',
  'path',
]);

// Packages that are never allowed (dangerous Node.js built-ins)
export const BLOCKED_PACKAGES = new Set([
  'fs',
  'child_process',
  'cluster',
  'net',
  'dgram',
  'dns',
  'tls',
  'vm',
  'worker_threads',
  'v8',
  'os',
  'crypto',
  'http',
  'https',
  'readline',
  'repl',
  'stream',
  'zlib',
  'process',
]);

export type ApprovalScope = 'operation' | 'session' | 'hour' | 'day';

interface Approval {
  packageName: string;
  scope: ApprovalScope;
  expiresAt: number | null; // null = session (never expires until restart)
  grantedAt: number;
}

/**
 * Extract require() calls from code string
 */
export function extractRequiredPackages(code: string): string[] {
  const packages: Set<string> = new Set();

  // Match require('package') or require("package")
  const requireMatches = code.matchAll(/require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g);

  for (const match of requireMatches) {
    const packagePath = match[1];

    // Skip relative imports
    if (packagePath.startsWith('./') || packagePath.startsWith('../')) {
      continue;
    }

    // Extract base package name (e.g., 'pdf-lib/subfolder' -> 'pdf-lib')
    const basePkg = packagePath.split('/')[0];

    // Handle node: prefix
    if (basePkg.startsWith('node:')) {
      packages.add(basePkg.replace('node:', ''));
    } else {
      packages.add(basePkg);
    }
  }

  return Array.from(packages);
}

export interface PackageAnalysis {
  // Packages already in built-in whitelist - no action needed
  whitelisted: string[];
  // Packages that need user approval
  needsApproval: string[];
  // Packages that are blocked and cannot be approved (dangerous)
  blocked: string[];
}

/**
 * Package Approval Manager - singleton for session-scoped approvals
 */
export class PackageApprovalManager {
  private approvals: Map<string, Approval> = new Map();

  /**
   * Analyze code for package requirements
   */
  analyzeCode(code: string): PackageAnalysis {
    const packages = extractRequiredPackages(code);

    const whitelisted: string[] = [];
    const needsApproval: string[] = [];
    const blocked: string[] = [];

    for (const pkg of packages) {
      if (BLOCKED_PACKAGES.has(pkg)) {
        blocked.push(pkg);
      } else if (BUILTIN_PACKAGES.has(pkg)) {
        whitelisted.push(pkg);
      } else if (this.isApproved(pkg)) {
        whitelisted.push(pkg); // Previously approved
      } else {
        needsApproval.push(pkg);
      }
    }

    return { whitelisted, needsApproval, blocked };
  }

  /**
   * Check if a package is currently approved
   */
  isApproved(packageName: string): boolean {
    // Built-in packages are always approved
    if (BUILTIN_PACKAGES.has(packageName)) {
      return true;
    }

    const approval = this.approvals.get(packageName);
    if (!approval) {
      return false;
    }

    // Check if expired
    if (approval.expiresAt !== null && Date.now() > approval.expiresAt) {
      this.approvals.delete(packageName);
      return false;
    }

    return true;
  }

  /**
   * Grant approval for a package with specified scope
   */
  approve(packageName: string, scope: ApprovalScope): void {
    const now = Date.now();
    let expiresAt: number | null = null;

    switch (scope) {
      case 'operation':
        // Will be cleared after single use via clearOperationApprovals()
        expiresAt = now + 60000; // 1 minute safety expiry
        break;
      case 'hour':
        expiresAt = now + 60 * 60 * 1000;
        break;
      case 'day':
        expiresAt = now + 24 * 60 * 60 * 1000;
        break;
      case 'session':
        expiresAt = null; // Never expires until restart
        break;
    }

    this.approvals.set(packageName, {
      packageName,
      scope,
      expiresAt,
      grantedAt: now,
    });
  }

  /**
   * Grant approvals for multiple packages
   */
  approveAll(packages: string[], scope: ApprovalScope): void {
    for (const pkg of packages) {
      this.approve(pkg, scope);
    }
  }

  /**
   * Clear operation-scoped approvals (call after each code execution)
   */
  clearOperationApprovals(): void {
    for (const [name, approval] of this.approvals.entries()) {
      if (approval.scope === 'operation') {
        this.approvals.delete(name);
      }
    }
  }

  /**
   * Get all currently approved packages (for debugging)
   */
  getApprovedPackages(): string[] {
    const approved: string[] = [];
    const now = Date.now();

    for (const [name, approval] of this.approvals.entries()) {
      if (approval.expiresAt === null || now < approval.expiresAt) {
        approved.push(name);
      }
    }

    return approved;
  }

  /**
   * Revoke approval for a package
   */
  revoke(packageName: string): void {
    this.approvals.delete(packageName);
  }

  /**
   * Clear all approvals
   */
  clearAll(): void {
    this.approvals.clear();
  }

  /**
   * Get combined whitelist (built-in + approved)
   */
  getEffectiveWhitelist(): string[] {
    return [...BUILTIN_PACKAGES, ...this.getApprovedPackages()];
  }
}

// Singleton instance
let _instance: PackageApprovalManager | null = null;

export function getPackageApprovalManager(): PackageApprovalManager {
  if (!_instance) {
    _instance = new PackageApprovalManager();
  }
  return _instance;
}

/**
 * Format user-friendly message for package approval request
 */
export function formatApprovalRequest(packages: string[]): string {
  if (packages.length === 1) {
    return `Code wants to use npm package: ${packages[0]}`;
  }
  return `Code wants to use npm packages: ${packages.join(', ')}`;
}

/**
 * Get approval scope options for elicitation
 */
export function getApprovalOptions(): { label: string; value: ApprovalScope }[] {
  return [
    { label: 'Allow for this operation only', value: 'operation' },
    { label: 'Allow for this session', value: 'session' },
    { label: 'Allow for 1 hour', value: 'hour' },
    { label: 'Allow for 24 hours', value: 'day' },
  ];
}
