/**
 * Dual Enhancement System for NCP
 * Combines factual domain capabilities with semantic bridges
 * Prevents over-generalization while capturing implicit knowledge
 */

import { logger } from '../utils/logger.js';

interface DomainCapability {
  domains: string[];
  confidence: number; // 0.0-1.0, how universally true this is
  context?: string;   // Optional context where this applies
}

interface SemanticBridge {
  targetTools: string[];
  reason: string;
  confidence: number;
  context?: string;
}

interface EnhancementResult {
  type: 'capability' | 'bridge';
  boost: number;
  reason: string;
  confidence: number;
}

export class EnhancementSystem {
  /**
   * Factual domain capabilities - what tools CAN do
   * These are objective facts about tool capabilities
   */
  private domainCapabilities: Record<string, DomainCapability> = {
    // Shell/Terminal factual capabilities (EXPANDED from 127 MCP ecosystem)
    'shell': {
      domains: [
        'git version control operations',
        'file system management',
        'archive operations (tar, zip, gzip)',
        'package management (npm, yarn, pip, cargo)',
        'network operations (curl, wget, ssh)',
        'text processing (grep, sed, awk)',
        'process management (ps, kill, top)',
        'system administration',
        // NEW from ecosystem insights
        'ffmpeg video processing',
        'imagemagick image conversion',
        'docker container management',
        'kubernetes cluster operations',
        'terraform infrastructure provisioning',
        'database CLI tools (psql, mysql, mongo)',
        'cloud CLI tools (aws, gcloud, azure)',
        'build tools (make, cmake, gradle)',
        'testing frameworks (jest, pytest)',
        'linters and formatters (eslint, prettier)',
        'performance monitoring (htop, iostat)',
        'log analysis (tail, journalctl)',
        'cron job management',
        'systemd service control'
      ],
      confidence: 0.75, // Higher confidence with more comprehensive mapping
      context: 'unix-like systems with developer tools'
    },

    'shell-mcp': {
      domains: [
        'git version control operations',
        'file system management',
        'archive operations (tar, zip, gzip)',
        'package management (npm, yarn, pip, cargo)',
        'network operations (curl, wget, ssh)',
        'text processing (grep, sed, awk)',
        'process management (ps, kill, top)',
        'system administration',
        'ffmpeg video processing',
        'imagemagick image conversion',
        'docker container management',
        'kubernetes cluster operations',
        'terraform infrastructure provisioning',
        'database CLI tools (psql, mysql, mongo)',
        'cloud CLI tools (aws, gcloud, azure)',
        'build tools (make, cmake, gradle)',
        'testing frameworks (jest, pytest)',
        'linters and formatters (eslint, prettier)',
        'performance monitoring (htop, iostat)',
        'log analysis (tail, journalctl)',
        'cron job management',
        'systemd service control'
      ],
      confidence: 0.75,
      context: 'unix-like systems with developer tools'
    },

    'terminal': {
      domains: [
        'command line interface',
        'script execution',
        'environment configuration',
        'automation workflows'
      ],
      confidence: 0.9,
      context: 'general computing'
    },

    // Database factual capabilities
    'database': {
      domains: [
        'SQL query execution',
        'data persistence',
        'transaction management',
        'CRUD operations',
        'data relationships',
        'indexing and optimization'
      ],
      confidence: 0.95,
      context: 'relational databases'
    },

    // Payment processing capabilities
    'payment': {
      domains: [
        'credit card processing',
        'subscription management',
        'invoice generation',
        'refund processing',
        'payment method storage',
        'financial reporting'
      ],
      confidence: 0.9,
      context: 'e-commerce'
    },

    // File system capabilities
    'filesystem': {
      domains: [
        'file reading and writing',
        'directory management',
        'file permissions',
        'path operations',
        'file metadata access'
      ],
      confidence: 1.0,
      context: 'local file system'
    },

    // Git capabilities
    'git': {
      domains: [
        'version control',
        'branch management',
        'commit history',
        'merge operations',
        'remote repository sync',
        'conflict resolution'
      ],
      confidence: 1.0,
      context: 'software development'
    },

    // NEW: Expanded MCP types from 127 MCP ecosystem
    'postgres': {
      domains: [
        'SQL query execution',
        'transaction management',
        'stored procedures and functions',
        'JSON/JSONB operations',
        'full-text search',
        'materialized views',
        'replication and backup',
        'user and role management'
      ],
      confidence: 0.95,
      context: 'PostgreSQL database operations'
    },

    'postgres-mcp': {
      domains: [
        'SQL query execution',
        'transaction management',
        'stored procedures and functions',
        'JSON/JSONB operations',
        'full-text search',
        'materialized views',
        'replication and backup',
        'user and role management'
      ],
      confidence: 0.95,
      context: 'PostgreSQL database operations'
    },

    'docker': {
      domains: [
        'container image building',
        'container lifecycle management',
        'volume management',
        'network configuration',
        'docker compose orchestration',
        'registry operations',
        'health checks',
        'resource limits'
      ],
      confidence: 0.95,
      context: 'Docker containerization'
    },

    'docker-mcp': {
      domains: [
        'container image building',
        'container lifecycle management',
        'volume management',
        'network configuration',
        'docker compose orchestration',
        'registry operations',
        'health checks',
        'resource limits'
      ],
      confidence: 0.95,
      context: 'Docker containerization'
    },

    'github': {
      domains: [
        'repository management',
        'pull request operations',
        'issue tracking',
        'GitHub Actions workflows',
        'releases and tags',
        'code review',
        'team collaboration',
        'webhooks'
      ],
      confidence: 0.95,
      context: 'GitHub platform operations'
    },

    'github-mcp': {
      domains: [
        'repository management',
        'pull request operations',
        'issue tracking',
        'GitHub Actions workflows',
        'releases and tags',
        'code review',
        'team collaboration',
        'webhooks'
      ],
      confidence: 0.95,
      context: 'GitHub platform operations'
    }
  };

  /**
   * Semantic bridges - connecting user language to tool language
   * These handle cases where users describe needs differently than tools
   */
  private semanticBridges: Record<string, SemanticBridge> = {
    // Version control bridges (EXPANDED)
    'save my changes': {
      targetTools: ['git:commit', 'github:commit', 'shell:run_command'],
      reason: 'In coding context, saving changes typically means committing to version control',
      confidence: 0.85,
      context: 'code development'
    },

    'commit my code': {
      targetTools: ['git:commit', 'github:commit', 'shell:run_command'],
      reason: 'Committing code uses git operations directly or through shell',
      confidence: 0.9,
      context: 'version control'
    },

    'push to github': {
      targetTools: ['git:push', 'github:push', 'shell:run_command'],
      reason: 'Pushing to GitHub can use git commands or GitHub API',
      confidence: 0.9,
      context: 'code sharing'
    },

    'create pull request': {
      targetTools: ['github:create_pull_request', 'shell:run_command'],
      reason: 'Creating PRs uses GitHub API or gh CLI tool',
      confidence: 0.9,
      context: 'code collaboration'
    },

    'share my code': {
      targetTools: ['git:push', 'github:create_pull_request', 'shell:run_command'],
      reason: 'Sharing code usually means pushing to remote or creating PR',
      confidence: 0.8,
      context: 'collaborative development'
    },

    // File operation bridges
    'backup files': {
      targetTools: ['filesystem:copy_file', 'shell:run_command'],
      reason: 'Backing up can mean copying files or using backup commands',
      confidence: 0.7,
      context: 'data protection'
    },

    // Media processing bridges (EXPANDED)
    'compress video': {
      targetTools: ['shell:run_command', 'shell-mcp:run_command'],
      reason: 'Video compression typically requires ffmpeg via command line',
      confidence: 0.85,
      context: 'media processing'
    },

    'convert video format': {
      targetTools: ['shell:run_command', 'shell-mcp:run_command'],
      reason: 'Video format conversion uses ffmpeg through shell commands',
      confidence: 0.85,
      context: 'media processing'
    },

    'process videos': {
      targetTools: ['shell:run_command', 'shell-mcp:run_command'],
      reason: 'Video processing typically uses ffmpeg through shell',
      confidence: 0.8,
      context: 'media processing'
    },

    'convert image format': {
      targetTools: ['shell:run_command', 'shell-mcp:run_command'],
      reason: 'Image conversion can use ImageMagick via shell',
      confidence: 0.8,
      context: 'image processing'
    },

    'resize images': {
      targetTools: ['shell:run_command', 'shell-mcp:run_command'],
      reason: 'Image resizing uses ImageMagick through shell commands',
      confidence: 0.85,
      context: 'image processing'
    },

    // Database bridges
    'find customer orders': {
      targetTools: ['database:query'],
      reason: 'Finding orders requires database queries',
      confidence: 0.9,
      context: 'business data'
    },

    'update user information': {
      targetTools: ['database:update'],
      reason: 'User information updates require database modifications',
      confidence: 0.85,
      context: 'user management'
    },

    // Payment bridges
    'charge customer': {
      targetTools: ['payment:create', 'stripe:charge'],
      reason: 'Charging customers requires payment processing',
      confidence: 0.9,
      context: 'e-commerce'
    },

    'process refund': {
      targetTools: ['payment:refund', 'stripe:refund'],
      reason: 'Refunds require payment reversal operations',
      confidence: 0.9,
      context: 'customer service'
    }
  };

  /**
   * Enhance a query-tool pair with domain knowledge
   * Returns enhancement details without over-generalizing
   */
  enhance(query: string, toolId: string, toolDescription: string): EnhancementResult[] {
    const enhancements: EnhancementResult[] = [];
    const queryLower = query.toLowerCase();
    const [mcpName, toolName] = toolId.split(':');

    // 1. Check domain capabilities (factual enhancements)
    const capability = this.domainCapabilities[mcpName] ||
                      this.domainCapabilities[toolName?.toLowerCase()];

    if (capability) {
      for (const domain of capability.domains) {
        const domainLower = domain.toLowerCase();
        // Check if query relates to this capability
        const domainKeywords = domainLower.split(/[\s,()]+/);
        const matchCount = domainKeywords.filter(keyword =>
          keyword.length > 3 && queryLower.includes(keyword)
        ).length;

        if (matchCount > 0) {
          const relevance = matchCount / domainKeywords.length;
          enhancements.push({
            type: 'capability',
            boost: 0.1 * relevance * capability.confidence, // Moderate boost
            reason: `${mcpName} has ${domain} capabilities`,
            confidence: capability.confidence
          });

          logger.debug(`Domain capability match: ${domain} for ${toolId} (relevance: ${relevance})`);
        }
      }
    }

    // 2. Check semantic bridges (interpretive enhancements)
    for (const [bridgeKey, bridge] of Object.entries(this.semanticBridges)) {
      // Check if query matches bridge pattern
      if (this.queryMatchesBridge(queryLower, bridgeKey)) {
        // Check if this tool is a target for this bridge
        if (bridge.targetTools.some(target =>
          toolId === target ||
          toolId.includes(target.split(':')[1]) ||
          target.includes(mcpName)
        )) {
          enhancements.push({
            type: 'bridge',
            boost: 0.15 * bridge.confidence, // Higher boost for specific bridges
            reason: bridge.reason,
            confidence: bridge.confidence
          });

          logger.debug(`Semantic bridge match: "${bridgeKey}" → ${toolId}`);
        }
      }
    }

    // 3. Prevent over-generalization
    // Cap total boost to prevent any single tool from dominating
    const totalBoost = enhancements.reduce((sum, e) => sum + e.boost, 0);
    if (totalBoost > 0.25) {
      // Scale down all enhancements proportionally
      const scale = 0.25 / totalBoost;
      enhancements.forEach(e => e.boost *= scale);

      logger.debug(`Scaled down enhancements for ${toolId} to prevent over-generalization`);
    }

    return enhancements;
  }

  /**
   * Check if a query matches a semantic bridge pattern
   */
  private queryMatchesBridge(query: string, bridgeKey: string): boolean {
    // Simple substring match for now, can be enhanced with fuzzy matching
    const bridgeKeywords = bridgeKey.toLowerCase().split(/\s+/);
    const matchedKeywords = bridgeKeywords.filter(keyword =>
      query.includes(keyword)
    );

    // Require majority of keywords to match
    return matchedKeywords.length >= Math.ceil(bridgeKeywords.length * 0.6);
  }

  /**
   * Get statistics about the enhancement system
   */
  getStats() {
    return {
      domainCapabilities: Object.keys(this.domainCapabilities).length,
      semanticBridges: Object.keys(this.semanticBridges).length,
      totalDomains: Object.values(this.domainCapabilities)
        .reduce((sum, cap) => sum + cap.domains.length, 0),
      averageConfidence: {
        capabilities: Object.values(this.domainCapabilities)
          .reduce((sum, cap) => sum + cap.confidence, 0) / Object.keys(this.domainCapabilities).length,
        bridges: Object.values(this.semanticBridges)
          .reduce((sum, bridge) => sum + bridge.confidence, 0) / Object.keys(this.semanticBridges).length
      }
    };
  }

  /**
   * Add new domain capability (for AI-curated expansion)
   */
  addDomainCapability(key: string, capability: DomainCapability): void {
    if (this.domainCapabilities[key]) {
      logger.warn(`Overwriting existing domain capability: ${key}`);
    }
    this.domainCapabilities[key] = capability;
    logger.info(`Added domain capability: ${key} with ${capability.domains.length} domains`);
  }

  /**
   * Add new semantic bridge (for AI-curated expansion)
   */
  addSemanticBridge(key: string, bridge: SemanticBridge): void {
    if (this.semanticBridges[key]) {
      logger.warn(`Overwriting existing semantic bridge: ${key}`);
    }
    this.semanticBridges[key] = bridge;
    logger.info(`Added semantic bridge: "${key}" → ${bridge.targetTools.join(', ')}`);
  }
}