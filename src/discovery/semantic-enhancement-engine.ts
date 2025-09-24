/**
 * Semantic Enhancement Engine for Tool Discovery
 *
 * INDUSTRY PURPOSE: Addresses semantic gaps in vector-based tool discovery through
 * two complementary enhancement mechanisms:
 *
 * 1. CAPABILITY INFERENCE SYSTEM (Global Domain Knowledge)
 *    - Infers implicit capabilities from tool categories/types
 *    - Example: shell MCP → can perform git, docker, ffmpeg operations
 *    - Fills knowledge gaps that vector similarity cannot capture
 *
 * 2. SEMANTIC INTENT RESOLUTION (Context-Specific Language Mapping)
 *    - Maps natural language expressions to domain-specific operations
 *    - Example: "upload my code" → git:push, github:create_repository
 *    - Resolves contextual language that differs from tool naming
 *
 * This follows established NLP/IR patterns for query expansion and semantic matching.
 */

import { logger } from '../utils/logger.js';

/**
 * Domain Capability Inference - Maps tool types to their implicit capabilities
 * INDUSTRY TERM: Capability Inference / Domain Knowledge Graph
 */
interface CapabilityInferenceRule {
  implicitDomains: string[];    // Capabilities that can be inferred from this tool type
  confidenceScore: number;      // Inference confidence (0.0-1.0)
  applicableContext?: string;   // Context where this inference applies
}

/**
 * Semantic Intent Resolution - Maps user language to specific tool operations
 * INDUSTRY TERM: Intent Entity Resolution / Contextual Semantic Mapping
 */
interface SemanticResolutionRule {
  targetOperations: string[];   // Specific tool operations this resolves to
  resolutionRationale: string;  // Why this mapping exists
  confidenceScore: number;      // Resolution confidence (0.0-1.0)
  domainContext?: string;       // Domain where this resolution applies
}

/**
 * Enhancement Result - Output of semantic enhancement process
 * INDUSTRY TERM: Semantic Augmentation / Relevance Enhancement
 */
interface SemanticEnhancement {
  enhancementType: 'capability_inference' | 'intent_resolution';
  relevanceBoost: number;       // Similarity score boost to apply
  enhancementReason: string;    // Human-readable explanation
  confidenceLevel: number;      // Enhancement confidence
}

export class SemanticEnhancementEngine {

  /**
   * CAPABILITY INFERENCE SYSTEM
   * Maps tool types/categories to their implicit capability domains
   *
   * PURPOSE: Vector search doesn't know that 'shell' can do git operations,
   * but humans intuitively understand this domain knowledge.
   */
  private capabilityInferenceRules: Record<string, CapabilityInferenceRule> = {

    // Shell/Terminal capability inference
    'shell': {
      implicitDomains: [
        'git version control operations',
        'file system management and navigation',
        'archive operations (tar, zip, gzip, compression)',
        'package management (npm, yarn, pip, cargo, apt)',
        'network operations (curl, wget, ssh, scp)',
        'text processing (grep, sed, awk, find)',
        'process management (ps, kill, top, htop)',
        'system administration and monitoring',
        'ffmpeg video processing and conversion',
        'imagemagick image manipulation',
        'docker container management',
        'kubernetes cluster operations',
        'terraform infrastructure provisioning',
        'ansible automation and configuration',
        'database CLI tools (psql, mysql, mongo)',
        'cloud CLI tools (aws, gcloud, azure)',
        'build tools (make, cmake, gradle, webpack)',
        'testing frameworks (jest, pytest, cargo test)',
        'linters and formatters (eslint, prettier, black)',
        'performance monitoring (iostat, netstat, vmstat)',
        'log analysis and monitoring (tail, journalctl)',
        'cron job management and scheduling',
        'systemd service control and management'
      ],
      confidenceScore: 0.75, // High confidence, but not all shells have all tools
      applicableContext: 'unix-like systems with developer tooling'
    },

    // Database capability inference
    'postgres': {
      implicitDomains: [
        'SQL query execution and optimization',
        'ACID transaction management',
        'stored procedures and user-defined functions',
        'triggers and database constraints',
        'JSON and JSONB document operations',
        'full-text search capabilities',
        'materialized views and query caching',
        'table partitioning and sharding',
        'streaming replication and failover',
        'database backup and recovery',
        'performance monitoring and tuning',
        'extension management (PostGIS, pgvector, timescale)',
        'user authentication and role management',
        'connection pooling and resource management'
      ],
      confidenceScore: 0.95,
      applicableContext: 'PostgreSQL database operations'
    },

    'mongodb': {
      implicitDomains: [
        'document-oriented data operations',
        'aggregation pipeline processing',
        'flexible indexing strategies',
        'replica set configuration and management',
        'horizontal sharding and distribution',
        'change stream event processing',
        'multi-document ACID transactions',
        'GridFS large file storage',
        'geospatial query operations',
        'text search and indexing',
        'schema validation and enforcement',
        'database backup and restore operations'
      ],
      confidenceScore: 0.95,
      applicableContext: 'MongoDB NoSQL document database'
    },

    // Cloud infrastructure capability inference
    'aws': {
      implicitDomains: [
        'EC2 virtual machine management',
        'S3 object storage operations',
        'Lambda serverless function deployment',
        'RDS managed database services',
        'DynamoDB NoSQL database operations',
        'ECS and EKS container orchestration',
        'CloudFormation infrastructure as code',
        'IAM identity and access management',
        'VPC networking and security groups',
        'CloudWatch monitoring and logging',
        'SQS and SNS messaging services',
        'API Gateway management and deployment',
        'Route53 DNS management',
        'CloudFront CDN configuration',
        'Elastic Load Balancing configuration'
      ],
      confidenceScore: 0.9,
      applicableContext: 'Amazon Web Services cloud platform'
    },

    // AI/ML capability inference
    'openai': {
      implicitDomains: [
        'large language model text generation',
        'conversational AI and chat completion',
        'text embeddings and semantic similarity',
        'model fine-tuning and customization',
        'function calling and tool integration',
        'vision and image analysis capabilities',
        'audio transcription and speech processing',
        'code generation and programming assistance',
        'content moderation and safety filtering',
        'token usage tracking and cost optimization',
        'model selection and parameter tuning',
        'prompt engineering and optimization'
      ],
      confidenceScore: 0.9,
      applicableContext: 'OpenAI API and language model operations'
    },

    // Communication capability inference
    'slack': {
      implicitDomains: [
        'team messaging and communication',
        'channel management and organization',
        'file sharing and document collaboration',
        'workflow automation and bot integration',
        'user and workspace management',
        'notification and alert systems',
        'thread discussions and replies',
        'emoji reactions and status updates',
        'direct messaging and group chats',
        'integration with external tools and services'
      ],
      confidenceScore: 0.95,
      applicableContext: 'team collaboration and workplace communication'
    },

    'discord': {
      implicitDomains: [
        'community messaging and voice chat',
        'server and channel management',
        'user roles and permission management',
        'bot development and automation',
        'voice and video communication',
        'screen sharing and streaming',
        'community moderation tools',
        'gaming integration and rich presence',
        'webhook integrations and notifications'
      ],
      confidenceScore: 0.9,
      applicableContext: 'community management and gaming communication'
    },

    'gmail': {
      implicitDomains: [
        'email sending and receiving operations',
        'inbox management and organization',
        'email filtering and label management',
        'attachment handling and file sharing',
        'contact management and address books',
        'calendar integration and scheduling',
        'thread management and conversations',
        'search and archival operations',
        'spam detection and security filtering'
      ],
      confidenceScore: 0.95,
      applicableContext: 'professional email communication and management'
    },

    // Financial capability inference
    'stripe': {
      implicitDomains: [
        'payment processing and transactions',
        'subscription billing and recurring payments',
        'customer management and profiles',
        'invoice generation and management',
        'dispute handling and chargeback management',
        'financial reporting and analytics',
        'tax calculation and compliance',
        'multi-currency support and conversion',
        'fraud detection and security measures',
        'webhook events and payment notifications',
        'marketplace and platform payments',
        'PCI compliance and secure tokenization'
      ],
      confidenceScore: 0.95,
      applicableContext: 'e-commerce and online payment processing'
    },

    // Calendar capability inference
    'calendar': {
      implicitDomains: [
        'event creation and scheduling',
        'meeting management and invitations',
        'calendar sharing and permissions',
        'recurring event management',
        'reminder and notification systems',
        'availability checking and conflict resolution',
        'time zone management and conversion',
        'calendar synchronization across platforms',
        'resource booking and room management',
        'integration with email and communication tools'
      ],
      confidenceScore: 0.9,
      applicableContext: 'scheduling and time management'
    },

    // Productivity capability inference
    'google-sheets': {
      implicitDomains: [
        'spreadsheet data manipulation and analysis',
        'formula calculation and data processing',
        'chart creation and data visualization',
        'collaborative editing and sharing',
        'data import and export operations',
        'cell formatting and conditional styling',
        'pivot table creation and analysis',
        'data validation and input constraints',
        'automation with Google Apps Script',
        'integration with other Google Workspace tools'
      ],
      confidenceScore: 0.9,
      applicableContext: 'data analysis and collaborative spreadsheet work'
    },

    // Enhanced cloud capability inference
    'cloudflare': {
      implicitDomains: [
        'DNS management and domain configuration',
        'CDN and content delivery optimization',
        'DDoS protection and security filtering',
        'SSL certificate management',
        'website performance optimization',
        'worker scripts and edge computing',
        'load balancing and traffic distribution',
        'firewall rules and access control',
        'analytics and performance monitoring'
      ],
      confidenceScore: 0.9,
      applicableContext: 'web performance and security services'
    }
  };

  /**
   * SEMANTIC INTENT RESOLUTION SYSTEM
   * Maps natural language user expressions to specific tool operations
   *
   * PURPOSE: Users say "upload my code" but tools are named "git push".
   * This bridges the language gap with contextual semantic mapping.
   */
  private semanticResolutionRules: Record<string, SemanticResolutionRule> = {

    // Version control semantic resolutions
    'commit my changes': {
      targetOperations: ['git:commit', 'github:commit', 'gitlab:commit', 'shell:run_command'],
      resolutionRationale: 'In development context, committing changes refers to version control operations',
      confidenceScore: 0.85,
      domainContext: 'software development and version control'
    },

    'save to git': {
      targetOperations: ['git:add', 'git:commit', 'shell:run_command'],
      resolutionRationale: 'Saving to Git involves staging and committing changes to repository',
      confidenceScore: 0.9,
      domainContext: 'version control workflow'
    },

    'upload my code': {
      targetOperations: ['git:push', 'github:create_repository', 'gitlab:push'],
      resolutionRationale: 'In repository context, uploading code means pushing to remote repository',
      confidenceScore: 0.8,
      domainContext: 'code sharing and collaboration'
    },

    // Data persistence semantic resolutions
    'store customer data': {
      targetOperations: ['postgres:insert', 'mongodb:insert', 'mysql:insert', 'dynamodb:put_item'],
      resolutionRationale: 'Storing customer data requires database persistence operations',
      confidenceScore: 0.9,
      domainContext: 'data persistence and customer management'
    },

    'analyze sales data': {
      targetOperations: ['postgres:query', 'mongodb:aggregate', 'elasticsearch:search', 'influxdb:query'],
      resolutionRationale: 'Data analysis requires querying and aggregation capabilities',
      confidenceScore: 0.85,
      domainContext: 'business intelligence and analytics'
    },

    // Cloud deployment semantic resolutions
    'deploy my application': {
      targetOperations: ['docker:build', 'aws:deploy', 'kubernetes:deploy', 'shell:run_command'],
      resolutionRationale: 'Application deployment uses containerization and cloud platform services',
      confidenceScore: 0.8,
      domainContext: 'application deployment and DevOps'
    },

    'scale my service': {
      targetOperations: ['kubernetes:scale', 'aws:autoscaling', 'docker:scale'],
      resolutionRationale: 'Service scaling requires orchestration platform operations',
      confidenceScore: 0.85,
      domainContext: 'infrastructure scaling and performance'
    },

    // AI/ML semantic resolutions
    'generate text': {
      targetOperations: ['openai:completion', 'anthropic:generate', 'huggingface:generate'],
      resolutionRationale: 'Text generation requires large language model API operations',
      confidenceScore: 0.9,
      domainContext: 'artificial intelligence and content generation'
    },

    'train a model': {
      targetOperations: ['huggingface:train', 'tensorflow:train', 'pytorch:train', 'mlflow:log_model'],
      resolutionRationale: 'Model training requires machine learning framework operations',
      confidenceScore: 0.85,
      domainContext: 'machine learning and model development'
    },

    // Communication semantic resolutions
    'send a message to my team': {
      targetOperations: ['slack:send_message', 'discord:send_message', 'teams:send_message', 'gmail:send_email'],
      resolutionRationale: 'Team messaging requires communication platform operations',
      confidenceScore: 0.9,
      domainContext: 'team communication and collaboration'
    },

    'message my team': {
      targetOperations: ['slack:send_message', 'discord:send_message', 'teams:send_message'],
      resolutionRationale: 'Messaging teams uses workplace communication tools',
      confidenceScore: 0.85,
      domainContext: 'workplace communication'
    },

    'notify the team': {
      targetOperations: ['slack:send_message', 'discord:send_message', 'teams:send_message', 'gmail:send_email'],
      resolutionRationale: 'Team notifications require communication channels',
      confidenceScore: 0.8,
      domainContext: 'team coordination and alerts'
    },

    // Cloud operations semantic resolutions
    'list my EC2 instances': {
      targetOperations: ['aws:list_ec2_instances', 'aws:describe_instances', 'shell:run_command'],
      resolutionRationale: 'EC2 instance listing requires AWS cloud operations',
      confidenceScore: 0.95,
      domainContext: 'AWS cloud infrastructure management'
    },

    'list my S3 buckets': {
      targetOperations: ['aws:list_s3_buckets', 'aws:list_buckets', 'shell:run_command'],
      resolutionRationale: 'S3 bucket listing requires AWS storage operations',
      confidenceScore: 0.95,
      domainContext: 'AWS cloud storage management'
    },

    'show my cloud resources': {
      targetOperations: ['aws:list_ec2_instances', 'aws:list_s3_buckets', 'azure:list_resources', 'gcp:list_instances'],
      resolutionRationale: 'Cloud resource viewing requires cloud platform API operations',
      confidenceScore: 0.85,
      domainContext: 'multi-cloud infrastructure management'
    },

    // Financial operations semantic resolutions
    'process a customer payment': {
      targetOperations: ['stripe:create_charge', 'stripe:create_payment_intent', 'stripe:process_payment'],
      resolutionRationale: 'Customer payment processing requires payment gateway operations',
      confidenceScore: 0.9,
      domainContext: 'e-commerce payment processing'
    },

    'charge a customer': {
      targetOperations: ['stripe:create_charge', 'stripe:create_payment_intent'],
      resolutionRationale: 'Customer charging requires payment processing operations',
      confidenceScore: 0.9,
      domainContext: 'payment and billing'
    },

    'collect payment': {
      targetOperations: ['stripe:create_charge', 'stripe:create_payment_intent', 'stripe:create_invoice'],
      resolutionRationale: 'Payment collection requires financial transaction operations',
      confidenceScore: 0.85,
      domainContext: 'revenue collection and billing'
    },

    // Calendar operations semantic resolutions
    'schedule a team meeting': {
      targetOperations: ['calendar:create_event', 'calendar:schedule_meeting', 'gmail:create_event'],
      resolutionRationale: 'Meeting scheduling requires calendar management operations',
      confidenceScore: 0.9,
      domainContext: 'team coordination and scheduling'
    },

    'book a meeting': {
      targetOperations: ['calendar:create_event', 'calendar:schedule_meeting'],
      resolutionRationale: 'Meeting booking requires calendar scheduling operations',
      confidenceScore: 0.85,
      domainContext: 'appointment and meeting management'
    },

    'create a calendar event': {
      targetOperations: ['calendar:create_event', 'gmail:create_event'],
      resolutionRationale: 'Event creation requires calendar management operations',
      confidenceScore: 0.95,
      domainContext: 'schedule and event management'
    },

    // Productivity tools semantic resolutions
    'update the quarterly report spreadsheet': {
      targetOperations: ['google-sheets:update_sheet', 'google-sheets:write_sheet', 'google-sheets:update_cells'],
      resolutionRationale: 'Spreadsheet updating requires sheet manipulation operations',
      confidenceScore: 0.9,
      domainContext: 'business reporting and data management'
    },

    'update spreadsheet': {
      targetOperations: ['google-sheets:update_sheet', 'google-sheets:write_sheet'],
      resolutionRationale: 'Spreadsheet updates require sheet data operations',
      confidenceScore: 0.85,
      domainContext: 'data management and analysis'
    },

    'edit the report': {
      targetOperations: ['google-sheets:update_sheet', 'notion:update_page', 'gdrive:update_file'],
      resolutionRationale: 'Report editing requires document manipulation operations',
      confidenceScore: 0.8,
      domainContext: 'document and report management'
    }
  };

  /**
   * Apply semantic enhancement to a query-tool pair
   *
   * PROCESS:
   * 1. Capability Inference: Check if tool type has implicit capabilities matching query
   * 2. Intent Resolution: Check if query maps to specific operations this tool provides
   * 3. Combine enhancements with confidence weighting
   * 4. Apply anti-pattern prevention (confidence capping)
   *
   * @param userQuery Natural language user query
   * @param toolIdentifier Tool identifier (format: "mcp:tool" or just tool name)
   * @param toolDescription Tool description for context
   * @returns Array of semantic enhancements to apply
   */
  applySemanticalEnhancement(
    userQuery: string,
    toolIdentifier: string,
    toolDescription: string
  ): SemanticEnhancement[] {

    const enhancements: SemanticEnhancement[] = [];
    const queryLower = userQuery.toLowerCase();
    const [mcpName, toolName] = toolIdentifier.split(':');

    // 1. CAPABILITY INFERENCE: Check domain knowledge for this tool type
    const inferenceRule = this.capabilityInferenceRules[mcpName] ||
                         (toolName ? this.capabilityInferenceRules[toolName.toLowerCase()] : undefined);

    if (inferenceRule) {
      // Check if query relates to any implicit domain capabilities
      for (const implicitDomain of inferenceRule.implicitDomains) {
        const domainKeywords = implicitDomain.toLowerCase().split(/[\s,()]+/);
        const matchingKeywords = domainKeywords.filter(keyword =>
          keyword.length > 3 && queryLower.includes(keyword)
        );

        if (matchingKeywords.length > 0) {
          const domainRelevance = matchingKeywords.length / domainKeywords.length;
          const enhancementBoost = 0.1 * domainRelevance * inferenceRule.confidenceScore;

          enhancements.push({
            enhancementType: 'capability_inference',
            relevanceBoost: enhancementBoost,
            enhancementReason: `${mcpName} has implicit capability: ${implicitDomain}`,
            confidenceLevel: inferenceRule.confidenceScore
          });

          logger.debug(`Capability inference match: ${implicitDomain} for ${toolIdentifier} (relevance: ${domainRelevance})`);
        }
      }
    }

    // 2. INTENT RESOLUTION: Check semantic mappings for user expressions
    for (const [semanticPattern, resolutionRule] of Object.entries(this.semanticResolutionRules)) {

      if (this.matchesSemanticPattern(queryLower, semanticPattern)) {
        // Check if this tool is a target for this semantic resolution
        const isTargetOperation = resolutionRule.targetOperations.some(targetOp =>
          toolIdentifier === targetOp ||
          toolIdentifier.includes(targetOp.split(':')[1]) ||
          targetOp.includes(mcpName)
        );

        if (isTargetOperation) {
          const enhancementBoost = 0.15 * resolutionRule.confidenceScore;

          enhancements.push({
            enhancementType: 'intent_resolution',
            relevanceBoost: enhancementBoost,
            enhancementReason: resolutionRule.resolutionRationale,
            confidenceLevel: resolutionRule.confidenceScore
          });

          logger.debug(`Intent resolution match: "${semanticPattern}" → ${toolIdentifier}`);
        }
      }
    }

    // 3. ANTI-PATTERN PREVENTION: Cap total enhancement to prevent over-boosting
    const totalBoost = enhancements.reduce((sum, e) => sum + e.relevanceBoost, 0);
    const MAX_ENHANCEMENT_BOOST = 0.25;

    if (totalBoost > MAX_ENHANCEMENT_BOOST) {
      const scalingFactor = MAX_ENHANCEMENT_BOOST / totalBoost;
      enhancements.forEach(enhancement => {
        enhancement.relevanceBoost *= scalingFactor;
      });

      logger.debug(`Applied enhancement capping for ${toolIdentifier} (scaling factor: ${scalingFactor})`);
    }

    return enhancements;
  }

  /**
   * Check if user query matches a semantic pattern
   * Uses improved fuzzy keyword matching with flexible thresholds
   */
  private matchesSemanticPattern(userQuery: string, semanticPattern: string): boolean {
    const patternKeywords = semanticPattern.toLowerCase().split(/\s+/);
    const queryWords = userQuery.toLowerCase().split(/\s+/);

    // Enhanced matching: exact matches, partial matches, and synonyms
    const matchingKeywords = patternKeywords.filter(keyword => {
      // Direct inclusion check
      if (userQuery.includes(keyword)) return true;

      // Check if any query word contains or is contained in the pattern keyword
      return queryWords.some(queryWord =>
        queryWord.includes(keyword) || keyword.includes(queryWord)
      );
    });

    // Dynamic threshold based on pattern length
    let matchThreshold;
    if (patternKeywords.length <= 2) {
      // For short patterns, require all keywords to match
      matchThreshold = patternKeywords.length;
    } else if (patternKeywords.length <= 4) {
      // For medium patterns, require 60% match
      matchThreshold = Math.ceil(patternKeywords.length * 0.6);
    } else {
      // For long patterns, require 50% match
      matchThreshold = Math.ceil(patternKeywords.length * 0.5);
    }

    return matchingKeywords.length >= matchThreshold;
  }

  /**
   * Add new capability inference rule (for dynamic expansion)
   */
  addCapabilityInferenceRule(toolType: string, rule: CapabilityInferenceRule): void {
    if (this.capabilityInferenceRules[toolType]) {
      logger.warn(`Overwriting existing capability inference rule: ${toolType}`);
    }
    this.capabilityInferenceRules[toolType] = rule;
    logger.info(`Added capability inference rule: ${toolType} with ${rule.implicitDomains.length} domains`);
  }

  /**
   * Add new semantic resolution rule (for dynamic expansion)
   */
  addSemanticResolutionRule(semanticPattern: string, rule: SemanticResolutionRule): void {
    if (this.semanticResolutionRules[semanticPattern]) {
      logger.warn(`Overwriting existing semantic resolution rule: ${semanticPattern}`);
    }
    this.semanticResolutionRules[semanticPattern] = rule;
    logger.info(`Added semantic resolution rule: "${semanticPattern}" → ${rule.targetOperations.join(', ')}`);
  }

  /**
   * Get enhancement engine statistics
   */
  getEnhancementStatistics() {
    const totalImplicitDomains = Object.values(this.capabilityInferenceRules)
      .reduce((sum, rule) => sum + rule.implicitDomains.length, 0);

    const totalTargetOperations = Object.values(this.semanticResolutionRules)
      .reduce((sum, rule) => sum + rule.targetOperations.length, 0);

    return {
      capabilityInferenceRules: Object.keys(this.capabilityInferenceRules).length,
      semanticResolutionRules: Object.keys(this.semanticResolutionRules).length,
      totalImplicitDomains,
      totalTargetOperations,
      averageConfidence: {
        capabilityInference: Object.values(this.capabilityInferenceRules)
          .reduce((sum, rule) => sum + rule.confidenceScore, 0) / Object.keys(this.capabilityInferenceRules).length,
        intentResolution: Object.values(this.semanticResolutionRules)
          .reduce((sum, rule) => sum + rule.confidenceScore, 0) / Object.keys(this.semanticResolutionRules).length
      }
    };
  }
}