/**
 * Semantic Validator - Rules-based Intent Analysis
 *
 * Phase 2 of the validation pipeline. Analyzes code intent based on
 * detected MCP calls and patterns. Uses rules-based heuristics to:
 * - Classify operations (read/write/network/system)
 * - Check MCP scope (only allowed MCPs can be called)
 * - Assess risk level
 */

import type { AnalysisResult, MCPCallPattern } from './code-analyzer.js';

/**
 * Code intent categories
 */
export type IntentType =
  | 'data_read'
  | 'data_write'
  | 'data_delete'
  | 'network_request'
  | 'system_command'
  | 'file_operation'
  | 'mcp_call'
  | 'scheduling'
  | 'unknown';

/**
 * Risk levels for operations
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Detected intent from code analysis
 */
export interface CodeIntent {
  type: IntentType;
  target: string;
  description: string;
  riskAssessment: string;
  mcpCall?: MCPCallPattern;
}

/**
 * Result of semantic validation
 */
export interface SemanticValidationResult {
  approved: boolean;
  reason?: string;
  riskLevel: RiskLevel;
  detectedIntents: CodeIntent[];
  recommendations: string[];
}

/**
 * Configuration for semantic validation
 */
export interface SemanticValidatorConfig {
  /** Maximum allowed risk level (operations above this are blocked) */
  maxRiskLevel: RiskLevel;

  /** List of allowed MCP namespaces (if empty, all are allowed) */
  allowedMCPs?: string[];

  /** List of blocked MCP namespaces */
  blockedMCPs?: string[];

  /** List of blocked operation patterns */
  blockedOperations?: string[];

  /** Whether to allow scheduling operations */
  allowScheduling?: boolean;

  /** Whether to allow network requests */
  allowNetworkRequests?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: SemanticValidatorConfig = {
  maxRiskLevel: 'high', // Block critical only
  allowScheduling: true,
  allowNetworkRequests: true,
};

/**
 * Method patterns for intent classification
 */
const WRITE_PATTERNS = [
  'create',
  'add',
  'insert',
  'update',
  'set',
  'put',
  'post',
  'write',
  'send',
  'submit',
  'save',
  'store',
  'upload',
  'push',
  'publish',
  'commit',
  'merge',
  'deploy',
];

const DELETE_PATTERNS = [
  'delete',
  'remove',
  'drop',
  'clear',
  'purge',
  'destroy',
  'cancel',
  'revoke',
  'unsubscribe',
  'unlink',
];

const READ_PATTERNS = [
  'get',
  'read',
  'fetch',
  'list',
  'find',
  'search',
  'query',
  'retrieve',
  'load',
  'download',
  'view',
  'show',
  'describe',
  'info',
  'status',
  'check',
];

const SYSTEM_PATTERNS = [
  'exec',
  'execute',
  'run',
  'spawn',
  'shell',
  'command',
  'sudo',
  'admin',
];

const SCHEDULE_PATTERNS = ['schedule', 'cron', 'job', 'timer', 'interval', 'delay'];

/**
 * High-risk MCP namespaces that require extra caution
 */
const HIGH_RISK_NAMESPACES = new Set([
  'shell', // Shell command execution
  'terminal', // Terminal access
  'system', // System operations
  'admin', // Administrative operations
  'root', // Root access
]);

/**
 * Malicious intent patterns - detected via method/namespace combinations
 * These represent attack patterns, not just dangerous operations
 */
const MALICIOUS_INTENT_PATTERNS = {
  // Data exfiltration: reading sensitive data then sending it out
  exfiltration: {
    readPatterns: ['credential', 'secret', 'password', 'token', 'key', 'auth', 'private', 'ssh', 'env'],
    sendPatterns: ['send', 'post', 'upload', 'webhook', 'http', 'fetch', 'request'],
    description: 'Potential data exfiltration - reading sensitive data and sending externally',
  },
  // Credential harvesting: accessing multiple credential stores
  credentialHarvest: {
    patterns: ['password', 'credential', 'keychain', 'vault', 'secret', 'token', 'oauth', 'jwt', 'apikey', 'api_key'],
    threshold: 2, // If accessing 2+ credential-related resources
    description: 'Potential credential harvesting - accessing multiple credential stores',
  },
  // Reconnaissance: probing system/environment info
  reconnaissance: {
    patterns: ['env', 'config', 'setting', 'info', 'version', 'whoami', 'hostname', 'ip', 'network', 'interface'],
    threshold: 3,
    description: 'Potential reconnaissance - probing system configuration',
  },
  // Persistence: creating scheduled tasks or modifying startup
  persistence: {
    patterns: ['cron', 'schedule', 'startup', 'autorun', 'service', 'daemon', 'hook', 'trigger'],
    description: 'Potential persistence mechanism - creating recurring execution',
  },
  // Denial of service: resource exhaustion patterns
  dos: {
    patterns: ['loop', 'while', 'recursive', 'fork', 'spawn', 'infinite', 'flood', 'stress'],
    description: 'Potential denial of service - resource exhaustion pattern',
  },
  // Backdoor: creating remote access or reverse shells
  backdoor: {
    patterns: ['reverse', 'shell', 'bind', 'listen', 'socket', 'tunnel', 'proxy', 'remote', 'ssh'],
    description: 'Potential backdoor - creating unauthorized remote access',
  },
  // Privilege escalation: attempting to gain higher privileges
  privesc: {
    patterns: ['sudo', 'root', 'admin', 'elevate', 'privilege', 'permission', 'chmod', 'chown', 'setuid'],
    description: 'Potential privilege escalation attempt',
  },
  // Data destruction: mass deletion or corruption
  destruction: {
    patterns: ['delete_all', 'drop_all', 'truncate', 'wipe', 'destroy', 'purge_all', 'format', 'rm_rf'],
    description: 'Potential data destruction - mass deletion pattern',
  },
};

/**
 * Suspicious namespace + method combinations that are almost always malicious
 */
const SUSPICIOUS_COMBINATIONS: Array<{
  namespace: RegExp;
  method: RegExp;
  severity: 'critical' | 'high';
  description: string;
}> = [
  {
    namespace: /^(file|fs|storage)/i,
    method: /^(read|get).*(secret|password|credential|key|token)/i,
    severity: 'high',
    description: 'Reading credential files',
  },
  {
    namespace: /^(http|webhook|api)/i,
    method: /.*(secret|password|credential|key|token)/i,
    severity: 'critical',
    description: 'Sending credentials over network',
  },
  {
    namespace: /^(shell|exec|system|terminal)/i,
    method: /.*/,
    severity: 'critical',
    description: 'Shell command execution',
  },
  {
    namespace: /^(ssh|remote)/i,
    method: /^(connect|exec|tunnel)/i,
    severity: 'critical',
    description: 'Remote system access',
  },
];

/**
 * Semantic Validator using rules-based analysis
 */
export class SemanticValidator {
  private config: SemanticValidatorConfig;

  constructor(config?: Partial<SemanticValidatorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate code intent before execution
   *
   * @param code - Original code (for context)
   * @param analysis - Result from CodeAnalyzer
   * @param context - Execution context
   * @returns Validation result
   */
  validate(
    code: string,
    analysis: AnalysisResult,
    context: {
      availableMCPs: string[];
      userPermissions?: string[];
    }
  ): SemanticValidationResult {
    const intents = this.detectIntents(analysis);
    const riskLevel = this.assessOverallRisk(intents);
    const recommendations: string[] = [];

    // Check for blocked MCPs
    const blockedMCPResult = this.checkBlockedMCPs(intents);
    if (blockedMCPResult) {
      return {
        approved: false,
        reason: blockedMCPResult,
        riskLevel: 'critical',
        detectedIntents: intents,
        recommendations: ['Use allowed MCPs only'],
      };
    }

    // Check allowed MCPs (if configured)
    const allowedMCPResult = this.checkAllowedMCPs(intents, context.availableMCPs);
    if (allowedMCPResult) {
      return {
        approved: false,
        reason: allowedMCPResult,
        riskLevel: 'high',
        detectedIntents: intents,
        recommendations: ['Check available MCPs with ncp.find()'],
      };
    }

    // Check scheduling permissions
    if (!this.config.allowScheduling) {
      const hasScheduling = intents.some((i) => i.type === 'scheduling');
      if (hasScheduling) {
        return {
          approved: false,
          reason: 'Scheduling operations are not allowed',
          riskLevel: 'high',
          detectedIntents: intents,
          recommendations: ['Remove scheduling calls'],
        };
      }
    }

    // Check network permissions
    if (!this.config.allowNetworkRequests) {
      const hasNetwork =
        intents.some((i) => i.type === 'network_request') ||
        analysis.detectedPatterns.networkRequests.length > 0;
      if (hasNetwork) {
        return {
          approved: false,
          reason: 'Network requests are not allowed',
          riskLevel: 'high',
          detectedIntents: intents,
          recommendations: ['Remove network calls'],
        };
      }
    }

    // Check risk level
    if (!this.isRiskAcceptable(riskLevel)) {
      return {
        approved: false,
        reason: `Risk level '${riskLevel}' exceeds maximum allowed '${this.config.maxRiskLevel}'`,
        riskLevel,
        detectedIntents: intents,
        recommendations: this.getRecommendationsForRisk(intents),
      };
    }

    // Check for malicious intent patterns
    const maliciousResult = this.detectMaliciousIntent(intents, code);
    if (maliciousResult) {
      return {
        approved: false,
        reason: maliciousResult.reason,
        riskLevel: 'critical',
        detectedIntents: intents,
        recommendations: [maliciousResult.recommendation],
      };
    }

    // Add recommendations for non-blocking issues
    this.addRecommendations(intents, recommendations);

    return {
      approved: true,
      riskLevel,
      detectedIntents: intents,
      recommendations,
    };
  }

  /**
   * Detect intents from analysis result
   */
  private detectIntents(analysis: AnalysisResult): CodeIntent[] {
    const intents: CodeIntent[] = [];

    // Map MCP calls to intents
    for (const call of analysis.detectedPatterns.mcpCalls) {
      const intent = this.classifyMCPCall(call);
      intents.push(intent);
    }

    // Add network request intents
    for (const url of analysis.detectedPatterns.networkRequests) {
      intents.push({
        type: 'network_request',
        target: url,
        description: `Network request to ${url}`,
        riskAssessment: 'Controlled by network policy',
      });
    }

    return intents;
  }

  /**
   * Classify an MCP call into an intent
   */
  private classifyMCPCall(call: MCPCallPattern): CodeIntent {
    const methodLower = call.method.toLowerCase();
    const namespaceLower = call.namespace.toLowerCase();

    // Check for system commands (highest risk)
    if (SYSTEM_PATTERNS.some((p) => methodLower.includes(p))) {
      return {
        type: 'system_command',
        target: `${call.namespace}:${call.method}`,
        description: `System command execution via ${call.namespace}`,
        riskAssessment: 'Critical - executes system commands',
        mcpCall: call,
      };
    }

    // Check for scheduling operations
    if (
      SCHEDULE_PATTERNS.some((p) => methodLower.includes(p)) ||
      namespaceLower === 'schedule'
    ) {
      return {
        type: 'scheduling',
        target: `${call.namespace}:${call.method}`,
        description: `Schedule operation via ${call.namespace}`,
        riskAssessment: 'Medium - creates scheduled jobs',
        mcpCall: call,
      };
    }

    // Check for delete operations (high risk)
    if (DELETE_PATTERNS.some((p) => methodLower.includes(p))) {
      return {
        type: 'data_delete',
        target: `${call.namespace}:${call.method}`,
        description: `Delete operation on ${call.namespace}`,
        riskAssessment: 'High - removes data permanently',
        mcpCall: call,
      };
    }

    // Check for write operations (medium risk)
    if (WRITE_PATTERNS.some((p) => methodLower.includes(p))) {
      return {
        type: 'data_write',
        target: `${call.namespace}:${call.method}`,
        description: `Write operation on ${call.namespace}`,
        riskAssessment: 'Medium - modifies external state',
        mcpCall: call,
      };
    }

    // Check for read operations (low risk)
    if (READ_PATTERNS.some((p) => methodLower.includes(p))) {
      return {
        type: 'data_read',
        target: `${call.namespace}:${call.method}`,
        description: `Read operation on ${call.namespace}`,
        riskAssessment: 'Low - read-only access',
        mcpCall: call,
      };
    }

    // Unknown operation
    return {
      type: 'mcp_call',
      target: `${call.namespace}:${call.method}`,
      description: `MCP call to ${call.namespace}`,
      riskAssessment: 'Unknown operation category - review manually',
      mcpCall: call,
    };
  }

  /**
   * Assess overall risk level from intents
   */
  private assessOverallRisk(intents: CodeIntent[]): RiskLevel {
    // System commands are always critical
    if (intents.some((i) => i.type === 'system_command')) {
      return 'critical';
    }

    // Deletes are high risk
    if (intents.some((i) => i.type === 'data_delete')) {
      return 'high';
    }

    // Writes are medium risk
    if (intents.some((i) => i.type === 'data_write')) {
      return 'medium';
    }

    // Scheduling is medium risk
    if (intents.some((i) => i.type === 'scheduling')) {
      return 'medium';
    }

    // Network requests are medium risk (controlled by policy)
    if (intents.some((i) => i.type === 'network_request')) {
      return 'medium';
    }

    // Check high-risk namespaces
    for (const intent of intents) {
      if (intent.mcpCall) {
        const namespace = intent.mcpCall.namespace.toLowerCase();
        if (HIGH_RISK_NAMESPACES.has(namespace)) {
          return 'high';
        }
      }
    }

    // Default to low
    return 'low';
  }

  /**
   * Check if risk level is acceptable
   */
  private isRiskAcceptable(riskLevel: RiskLevel): boolean {
    const levels: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
    const riskIndex = levels.indexOf(riskLevel);
    const maxIndex = levels.indexOf(this.config.maxRiskLevel);
    return riskIndex <= maxIndex;
  }

  /**
   * Check for blocked MCPs
   */
  private checkBlockedMCPs(intents: CodeIntent[]): string | null {
    if (!this.config.blockedMCPs || this.config.blockedMCPs.length === 0) {
      return null;
    }

    for (const intent of intents) {
      if (intent.mcpCall) {
        const namespace = intent.mcpCall.namespace;
        if (this.config.blockedMCPs.includes(namespace)) {
          return `MCP '${namespace}' is blocked`;
        }
      }
    }

    return null;
  }

  /**
   * Check for allowed MCPs
   */
  private checkAllowedMCPs(
    intents: CodeIntent[],
    availableMCPs: string[]
  ): string | null {
    if (!this.config.allowedMCPs || this.config.allowedMCPs.length === 0) {
      // No restriction, but check if MCP is actually available
      for (const intent of intents) {
        if (intent.mcpCall) {
          const namespace = intent.mcpCall.namespace;
          // Skip built-in namespaces (internal MCPs, sandbox globals, and whitelisted packages)
          const builtInNamespaces = new Set([
            // Internal MCPs
            'ncp', 'schedule', 'analytics', 'skills', 'code',
            // Sandbox globals (fs is sandboxed, path is safe)
            'fs', 'path', 'console', 'JSON', 'Math', 'Date',
            'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean',
            // Whitelisted packages and common variable names (loaded via require())
            'XLSX', 'xlsx', 'PDFDocument', 'pdfLib', 'pdfDoc', 'docx', 'pptxgenjs', 'pptx',
            'papaparse', 'Papa', 'cheerio', '$', 'axios', 'lodash', '_', 'dateFns',
            'uuid', 'cryptoJs', 'CryptoJS', 'canvas', 'sharp', 'jimp',
            // Common user variable names for documents
            'page', 'doc', 'wb', 'ws', 'workbook', 'worksheet', 'pdf', 'document',
            'font', 'fonts', 'row', 'cell', 'table', 'data', 'result', 'response',
            'buffer', 'bytes', 'content', 'text', 'image', 'img', 'file', 'output',
            'stats', 'error', 'err', 'e', 'options', 'config', 'settings',
            // Buffer is a global
            'Buffer'
          ]);
          if (builtInNamespaces.has(namespace)) {
            continue;
          }
          if (!availableMCPs.includes(namespace)) {
            return `MCP '${namespace}' is not available. Available: ${availableMCPs.slice(0, 5).join(', ')}${availableMCPs.length > 5 ? '...' : ''}`;
          }
        }
      }
      return null;
    }

    for (const intent of intents) {
      if (intent.mcpCall) {
        const namespace = intent.mcpCall.namespace;
        if (!this.config.allowedMCPs.includes(namespace)) {
          return `MCP '${namespace}' is not in allowed list`;
        }
      }
    }

    return null;
  }

  /**
   * Get recommendations for high-risk operations
   */
  private getRecommendationsForRisk(intents: CodeIntent[]): string[] {
    const recommendations: string[] = [];

    for (const intent of intents) {
      switch (intent.type) {
        case 'system_command':
          recommendations.push('Avoid direct system command execution');
          break;
        case 'data_delete':
          recommendations.push('Consider using soft-delete or confirmation');
          break;
        case 'data_write':
          recommendations.push('Validate data before writing');
          break;
      }
    }

    return [...new Set(recommendations)]; // Deduplicate
  }

  /**
   * Add recommendations for non-blocking issues
   */
  private addRecommendations(intents: CodeIntent[], recommendations: string[]): void {
    // Add recommendations based on patterns
    const hasMultipleWrites = intents.filter((i) => i.type === 'data_write').length > 3;
    if (hasMultipleWrites) {
      recommendations.push(
        'Multiple write operations detected - consider batching'
      );
    }

    const hasUnknown = intents.some((i) => i.type === 'unknown');
    if (hasUnknown) {
      recommendations.push(
        'Some operations could not be classified - review manually'
      );
    }
  }

  /**
   * Detect malicious intent patterns in code
   * Returns null if no malicious intent detected, otherwise returns reason and recommendation
   */
  private detectMaliciousIntent(
    intents: CodeIntent[],
    code: string
  ): { reason: string; recommendation: string } | null {
    const codeLower = code.toLowerCase();
    const allTargets = intents.map((i) => i.target.toLowerCase()).join(' ');
    const allMethods = intents
      .filter((i) => i.mcpCall)
      .map((i) => i.mcpCall!.method.toLowerCase());
    const allNamespaces = intents
      .filter((i) => i.mcpCall)
      .map((i) => i.mcpCall!.namespace.toLowerCase());

    // Check suspicious namespace+method combinations
    for (const intent of intents) {
      if (!intent.mcpCall) continue;

      for (const combo of SUSPICIOUS_COMBINATIONS) {
        if (
          combo.namespace.test(intent.mcpCall.namespace) &&
          combo.method.test(intent.mcpCall.method)
        ) {
          return {
            reason: `Blocked: ${combo.description} (${intent.mcpCall.namespace}.${intent.mcpCall.method})`,
            recommendation: 'This operation pattern is blocked for security reasons',
          };
        }
      }
    }

    // Check for data exfiltration pattern
    // (reading sensitive data + sending over network in same code)
    const exfil = MALICIOUS_INTENT_PATTERNS.exfiltration;
    const hasReadSensitive = exfil.readPatterns.some(
      (p) => codeLower.includes(p) || allTargets.includes(p)
    );
    const hasSendExternal = exfil.sendPatterns.some(
      (p) => allMethods.some((m) => m.includes(p))
    );
    if (hasReadSensitive && hasSendExternal) {
      return {
        reason: exfil.description,
        recommendation: 'Avoid combining credential reads with network operations in single execution',
      };
    }

    // Check for credential harvesting
    const credHarvest = MALICIOUS_INTENT_PATTERNS.credentialHarvest;
    const credentialAccesses = credHarvest.patterns.filter(
      (p) => allTargets.includes(p) || codeLower.includes(p)
    ).length;
    if (credentialAccesses >= credHarvest.threshold) {
      return {
        reason: credHarvest.description,
        recommendation: 'Access credentials individually with clear justification',
      };
    }

    // Check for reconnaissance pattern
    const recon = MALICIOUS_INTENT_PATTERNS.reconnaissance;
    const reconAccesses = recon.patterns.filter(
      (p) => allTargets.includes(p) || allMethods.some((m) => m.includes(p))
    ).length;
    if (reconAccesses >= recon.threshold) {
      return {
        reason: recon.description,
        recommendation: 'Limit system information queries to what is strictly necessary',
      };
    }

    // Check for backdoor patterns
    const backdoor = MALICIOUS_INTENT_PATTERNS.backdoor;
    const hasBackdoorPattern = backdoor.patterns.some(
      (p) => allNamespaces.some((ns) => ns.includes(p)) || allMethods.some((m) => m.includes(p))
    );
    if (hasBackdoorPattern) {
      return {
        reason: backdoor.description,
        recommendation: 'Remote access and shell operations require explicit authorization',
      };
    }

    // Check for privilege escalation
    const privesc = MALICIOUS_INTENT_PATTERNS.privesc;
    const hasPrivescPattern = privesc.patterns.some(
      (p) => allMethods.some((m) => m.includes(p)) || codeLower.includes(p)
    );
    if (hasPrivescPattern) {
      return {
        reason: privesc.description,
        recommendation: 'Privilege escalation operations are not permitted',
      };
    }

    // Check for data destruction patterns
    const destruction = MALICIOUS_INTENT_PATTERNS.destruction;
    const hasDestructionPattern = destruction.patterns.some(
      (p) => allMethods.some((m) => m.includes(p)) || codeLower.includes(p)
    );
    if (hasDestructionPattern) {
      return {
        reason: destruction.description,
        recommendation: 'Mass deletion operations require explicit confirmation',
      };
    }

    return null;
  }
}

/**
 * Create a semantic validator instance
 */
export function createSemanticValidator(
  config?: Partial<SemanticValidatorConfig>
): SemanticValidator {
  return new SemanticValidator(config);
}
