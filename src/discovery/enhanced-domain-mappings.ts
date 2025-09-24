/**
 * Enhanced Domain Mappings from 127 MCP Ecosystem Analysis
 * Generated from comprehensive ecosystem testing insights
 */

import { EnhancementSystem } from './enhancement-system.js';

/**
 * Expanded domain capabilities based on 127 MCP ecosystem analysis
 * These capture what each MCP type CAN factually do
 */
export const EXPANDED_DOMAIN_CAPABILITIES = {
  // Shell/Terminal expanded capabilities (from shell-mcp insights)
  'shell': {
    domains: [
      // Original capabilities
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
      'ansible automation',
      'database CLI tools (psql, mysql, mongo)',
      'cloud CLI tools (aws, gcloud, azure)',
      'build tools (make, cmake, gradle)',
      'testing frameworks (jest, pytest, cargo test)',
      'linters and formatters (eslint, prettier, black)',
      'performance monitoring (htop, iostat, netstat)',
      'log analysis (tail, journalctl, less)',
      'cron job management',
      'systemd service control'
    ],
    confidence: 0.75, // High confidence but not all shells have all tools
    context: 'unix-like systems with common developer tools'
  },

  // Database expanded capabilities (from 12+ database MCPs)
  'postgres': {
    domains: [
      'SQL query execution',
      'transaction management',
      'stored procedures and functions',
      'triggers and constraints',
      'JSON/JSONB operations',
      'full-text search',
      'materialized views',
      'partitioning and sharding',
      'replication and failover',
      'backup and restore',
      'performance tuning',
      'extension management (PostGIS, pgvector)',
      'user and role management',
      'connection pooling'
    ],
    confidence: 0.95,
    context: 'PostgreSQL database operations'
  },

  'mongodb': {
    domains: [
      'document operations',
      'aggregation pipelines',
      'indexing strategies',
      'replica sets',
      'sharding',
      'change streams',
      'transactions',
      'GridFS file storage',
      'geospatial queries',
      'text search',
      'schema validation',
      'backup and restore'
    ],
    confidence: 0.95,
    context: 'MongoDB NoSQL operations'
  },

  'redis': {
    domains: [
      'key-value caching',
      'pub/sub messaging',
      'sorted sets and lists',
      'geospatial indexes',
      'streams',
      'transactions',
      'Lua scripting',
      'persistence options',
      'cluster management',
      'sentinel high availability',
      'memory optimization'
    ],
    confidence: 0.95,
    context: 'Redis cache and data structures'
  },

  // Cloud infrastructure expanded (from AWS, Docker, Kubernetes MCPs)
  'aws': {
    domains: [
      'EC2 instance management',
      'S3 object storage',
      'Lambda serverless functions',
      'RDS database management',
      'DynamoDB NoSQL',
      'ECS/EKS container orchestration',
      'CloudFormation infrastructure',
      'IAM security management',
      'VPC networking',
      'CloudWatch monitoring',
      'SQS/SNS messaging',
      'API Gateway management',
      'Route53 DNS',
      'CloudFront CDN',
      'Elastic Load Balancing'
    ],
    confidence: 0.9,
    context: 'AWS cloud services'
  },

  'docker': {
    domains: [
      'container image building',
      'container lifecycle management',
      'multi-stage builds',
      'volume management',
      'network configuration',
      'docker compose orchestration',
      'registry operations',
      'layer caching',
      'health checks',
      'resource limits',
      'logging drivers',
      'security scanning'
    ],
    confidence: 0.95,
    context: 'Docker containerization'
  },

  // Developer tools expanded (from GitHub, Git, GitLab MCPs)
  'github': {
    domains: [
      'repository management',
      'pull request operations',
      'issue tracking',
      'GitHub Actions workflows',
      'releases and tags',
      'project boards',
      'wiki management',
      'gists',
      'GitHub Pages',
      'security advisories',
      'dependabot configuration',
      'branch protection rules',
      'webhooks',
      'GitHub API operations',
      'code review',
      'team collaboration'
    ],
    confidence: 0.95,
    context: 'GitHub platform operations'
  },

  // AI/ML expanded (from OpenAI, HuggingFace, LangChain MCPs)
  'openai': {
    domains: [
      'text generation and completion',
      'chat conversations',
      'embeddings generation',
      'fine-tuning',
      'function calling',
      'vision analysis',
      'audio transcription',
      'code generation',
      'content moderation',
      'token usage tracking',
      'model selection',
      'prompt engineering'
    ],
    confidence: 0.9,
    context: 'OpenAI API operations'
  },

  'huggingface': {
    domains: [
      'model inference',
      'model fine-tuning',
      'dataset management',
      'model hub operations',
      'tokenizer operations',
      'pipeline creation',
      'model evaluation',
      'model conversion',
      'quantization',
      'distributed training',
      'model serving'
    ],
    confidence: 0.9,
    context: 'HuggingFace ecosystem'
  },

  // Communication expanded (from Slack, Discord, Email MCPs)
  'slack': {
    domains: [
      'message sending',
      'channel management',
      'file sharing',
      'user mentions',
      'thread replies',
      'emoji reactions',
      'slash commands',
      'workflow automation',
      'app integrations',
      'scheduled messages',
      'reminders',
      'user status updates',
      'workspace management'
    ],
    confidence: 0.9,
    context: 'Slack team communication'
  }
};

/**
 * Expanded semantic bridges based on 127 MCP ecosystem patterns
 * These handle natural language to tool capability mapping
 */
export const EXPANDED_SEMANTIC_BRIDGES = {
  // Version control semantic bridges
  'commit my changes': {
    targetTools: ['git:commit', 'github:commit', 'gitlab:commit', 'shell:run_command'],
    reason: 'Committing changes can be done through Git tools or shell commands',
    confidence: 0.85,
    context: 'version control'
  },

  'save to git': {
    targetTools: ['git:add', 'git:commit', 'shell:run_command'],
    reason: 'Saving to Git means staging and committing changes',
    confidence: 0.9,
    context: 'version control'
  },

  'upload my code': {
    targetTools: ['git:push', 'github:create_repository', 'gitlab:push'],
    reason: 'Uploading code typically means pushing to remote repository',
    confidence: 0.8,
    context: 'code sharing'
  },

  // Database semantic bridges
  'store customer data': {
    targetTools: ['postgres:insert', 'mongodb:insert', 'mysql:insert', 'dynamodb:put_item'],
    reason: 'Storing customer data requires database insert operations',
    confidence: 0.9,
    context: 'data persistence'
  },

  'analyze sales data': {
    targetTools: ['postgres:query', 'mongodb:aggregate', 'elasticsearch:search', 'influxdb:query'],
    reason: 'Data analysis requires querying or aggregation operations',
    confidence: 0.85,
    context: 'business analytics'
  },

  // Cloud deployment bridges
  'deploy my application': {
    targetTools: ['docker:build', 'aws:deploy', 'kubernetes:deploy', 'shell:run_command'],
    reason: 'Deployment can use various container and cloud platforms',
    confidence: 0.8,
    context: 'application deployment'
  },

  'scale my service': {
    targetTools: ['kubernetes:scale', 'aws:autoscaling', 'docker:scale'],
    reason: 'Scaling requires orchestration platform operations',
    confidence: 0.85,
    context: 'infrastructure scaling'
  },

  // AI/ML semantic bridges
  'generate text': {
    targetTools: ['openai:completion', 'anthropic:generate', 'huggingface:generate'],
    reason: 'Text generation requires LLM API calls',
    confidence: 0.9,
    context: 'AI content generation'
  },

  'train a model': {
    targetTools: ['huggingface:train', 'tensorflow:train', 'pytorch:train', 'mlflow:log_model'],
    reason: 'Model training requires ML framework operations',
    confidence: 0.85,
    context: 'machine learning'
  },

  // Communication bridges
  'notify the team': {
    targetTools: ['slack:send_message', 'discord:send', 'email:send', 'teams:post'],
    reason: 'Team notifications use communication platforms',
    confidence: 0.9,
    context: 'team collaboration'
  },

  'schedule a meeting': {
    targetTools: ['zoom:schedule', 'teams:schedule', 'slack:reminder'],
    reason: 'Meeting scheduling uses calendar or communication tools',
    confidence: 0.8,
    context: 'team coordination'
  },

  // File operation bridges
  'process images': {
    targetTools: ['shell:run_command', 'imagemagick:convert', 'filesystem:read_file'],
    reason: 'Image processing often uses command-line tools like ImageMagick',
    confidence: 0.85,
    context: 'media processing'
  },

  'compress files': {
    targetTools: ['shell:run_command', 'tar:create', 'zip:compress'],
    reason: 'File compression uses archive tools',
    confidence: 0.9,
    context: 'file management'
  },

  // System operation bridges
  'monitor performance': {
    targetTools: ['grafana:dashboard', 'prometheus:query', 'datadog:metrics', 'shell:run_command'],
    reason: 'Performance monitoring uses observability platforms',
    confidence: 0.85,
    context: 'system monitoring'
  },

  'check logs': {
    targetTools: ['shell:run_command', 'logs:tail', 'elasticsearch:search', 'splunk:search'],
    reason: 'Log checking can use various log management tools',
    confidence: 0.9,
    context: 'debugging'
  }
};

/**
 * Category-specific enhancements based on ecosystem testing
 * Maps categories to their implicit capabilities
 */
export const CATEGORY_ENHANCEMENTS = {
  'database': [
    'data persistence',
    'ACID transactions',
    'query optimization',
    'backup and recovery',
    'replication',
    'indexing'
  ],
  'cloud-infrastructure': [
    'scalability',
    'high availability',
    'load balancing',
    'auto-scaling',
    'disaster recovery',
    'multi-region deployment'
  ],
  'developer-tools': [
    'version control',
    'CI/CD pipelines',
    'code review',
    'issue tracking',
    'documentation',
    'testing'
  ],
  'communication': [
    'real-time messaging',
    'file sharing',
    'notifications',
    'team collaboration',
    'threading',
    'integrations'
  ],
  'ai-ml': [
    'model inference',
    'training',
    'fine-tuning',
    'embeddings',
    'tokenization',
    'prompt engineering'
  ],
  'system-operations': [
    'process management',
    'file operations',
    'network operations',
    'service control',
    'monitoring',
    'automation'
  ]
};

/**
 * Apply all enhancements to the existing EnhancementSystem
 */
export function applyEcosystemEnhancements(enhancementSystem: EnhancementSystem): void {
  // Add expanded domain capabilities
  for (const [key, capability] of Object.entries(EXPANDED_DOMAIN_CAPABILITIES)) {
    enhancementSystem.addDomainCapability(key, capability);
  }

  // Add expanded semantic bridges
  for (const [key, bridge] of Object.entries(EXPANDED_SEMANTIC_BRIDGES)) {
    enhancementSystem.addSemanticBridge(key, bridge);
  }

  console.log('✅ Applied ecosystem enhancements:');
  console.log(`   - Added ${Object.keys(EXPANDED_DOMAIN_CAPABILITIES).length} domain capabilities`);
  console.log(`   - Added ${Object.keys(EXPANDED_SEMANTIC_BRIDGES).length} semantic bridges`);
}

/**
 * Get enhancement statistics
 */
export function getEnhancementStats() {
  const totalDomains = Object.values(EXPANDED_DOMAIN_CAPABILITIES)
    .reduce((sum, cap) => sum + cap.domains.length, 0);

  const totalTargets = Object.values(EXPANDED_SEMANTIC_BRIDGES)
    .reduce((sum, bridge) => sum + bridge.targetTools.length, 0);

  return {
    domainCapabilities: Object.keys(EXPANDED_DOMAIN_CAPABILITIES).length,
    semanticBridges: Object.keys(EXPANDED_SEMANTIC_BRIDGES).length,
    totalDomains,
    totalTargets,
    categoriesEnhanced: Object.keys(CATEGORY_ENHANCEMENTS).length
  };
}