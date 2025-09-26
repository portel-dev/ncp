/**
 * Persistent RAG Engine for NCP
 * Uses transformer.js for embeddings with persistent caching
 */

import * as path from 'path';
import { getNcpBaseDirectory } from '../utils/ncp-paths.js';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { existsSync, mkdirSync, statSync } from 'fs';
import { logger } from '../utils/logger.js';
import { SemanticEnhancementEngine } from './semantic-enhancement-engine.js';

// Import transformer.js (will be added to dependencies)
declare const pipeline: any;

export interface ToolEmbedding {
  embedding: Float32Array;
  hash: string;
  lastUpdated: string;
  toolName: string;
  description: string;
  enhancedDescription?: string;
  mcpName?: string;
  mcpDomain?: string;
}

export interface CacheMetadata {
  version: string;
  createdAt: string;
  lastValidated: string;
  configHash: string;
  mcpHashes: Record<string, string>;
  totalTools: number;
}

export interface DiscoveryResult {
  toolId: string;
  confidence: number;
  reason: string;
  similarity: number;
  originalSimilarity?: number;
  domain?: string;
}

export class PersistentRAGEngine {
  
  /**
   * Get domain classification for an MCP to improve cross-domain disambiguation
   */
  private getMCPDomain(mcpName: string): string {
    const domainMappings: Record<string, string> = {
      // Web development and frontend
      'context7-mcp': 'web development documentation',
      'vscode-mcp': 'code editor',
      
      // Financial/payment services
      'stripe': 'payment processing financial',
      'paypal': 'payment processing financial',
      
      // File and system operations
      'desktop-commander': 'file system operations',
      'Shell': 'command line system',
      'filesystem': 'file system operations',
      
      // Development tools
      'portel': 'code analysis development',
      'git': 'version control development',
      'sequential-thinking': 'development workflow',
      
      // AI and search
      'tavily': 'web search information',
      'perplexity': 'web search information',
      'anthropic': 'AI language model',
      
      // Database and data
      'postgres': 'database operations',
      'sqlite': 'database operations',
      'mongodb': 'database operations',
      
      // Communication and social
      'slack': 'team communication',
      'email': 'email communication',
      
      // Cloud and infrastructure
      'aws': 'cloud infrastructure',
      'gcp': 'cloud infrastructure',
      'docker': 'containerization infrastructure',
    };
    
    return domainMappings[mcpName] || 'general utility';
  }
  
  /**
   * Infer likely domains from query text to improve cross-domain disambiguation
   */
  private inferQueryDomains(query: string): string[] {
    const domainKeywords: Record<string, string[]> = {
      'web development': ['react', 'vue', 'angular', 'javascript', 'typescript', 'frontend', 'web', 'html', 'css', 'component', 'jsx', 'tsx'],
      'payment processing': ['payment', 'stripe', 'paypal', 'billing', 'invoice', 'subscription', 'checkout', 'transaction'],
      'file system': ['file', 'directory', 'folder', 'path', 'move', 'copy', 'delete', 'create', 'read', 'write'],
      'command line': ['command', 'shell', 'bash', 'terminal', 'execute', 'run', 'script'],
      'database': ['database', 'sql', 'query', 'table', 'record', 'postgres', 'mysql', 'mongodb'],
      'cloud infrastructure': ['aws', 'gcp', 'azure', 'cloud', 'deploy', 'infrastructure', 'docker', 'kubernetes'],
      'development': ['code', 'development', 'debug', 'build', 'compile', 'test', 'git', 'version', 'repository'],
      'search': ['search', 'find', 'lookup', 'query', 'information', 'web search'],
      'communication': ['email', 'slack', 'message', 'send', 'notification', 'team']
    };
    
    const inferredDomains: string[] = [];
    
    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      const matchCount = keywords.filter(keyword => query.includes(keyword)).length;
      if (matchCount > 0) {
        inferredDomains.push(domain);
      }
    }
    
    return inferredDomains;
  }

  /**
   * Add capability enhancements for reverse domain mapping
   * Terminal/shell tools should advertise their git, build, and development capabilities
   */
  private getCapabilityEnhancements(toolName: string, description: string): string {
    const enhancements: string[] = [];

    // Terminal/shell tools get comprehensive capability advertisements
    if (toolName.includes('start_process') ||
        toolName.includes('run_command') ||
        description.toLowerCase().includes('terminal') ||
        description.toLowerCase().includes('shell') ||
        description.toLowerCase().includes('command line') ||
        description.toLowerCase().includes('execute')) {

      enhancements.push(
        // Git capabilities
        ' Can execute git commands: git commit, git push, git pull, git status, git add, git log, git diff, git branch, git checkout, git merge, git clone.',
        // Development tool capabilities
        ' Can run development tools: npm, yarn, bun, pip, cargo, make, build scripts.',
        // System command capabilities
        ' Can execute system commands: ls, cd, mkdir, rm, cp, mv, chmod, chown.',
        // Package manager capabilities
        ' Can run package managers: apt, brew, yum, pacman.',
        // Script execution capabilities
        ' Can execute scripts: bash scripts, python scripts, shell scripts.',
        // Build and deployment capabilities
        ' Can run build tools: webpack, vite, rollup, parcel, docker, kubernetes.'
      );
    }

    // File management tools get development-related file capabilities
    if (toolName.includes('read_file') ||
        toolName.includes('write_file') ||
        toolName.includes('edit_file')) {

      enhancements.push(
        ' Can handle development files: package.json, tsconfig.json, .gitignore, README.md, configuration files.'
      );
    }

    return enhancements.join('');
  }

  private model: any;
  private vectorDB: Map<string, ToolEmbedding> = new Map();
  private dbPath: string;
  private metadataPath: string;
  private cacheMetadata: CacheMetadata | null = null;
  private isInitialized = false;
  private indexingQueue: Array<{ mcpName: string; tools: any[] }> = [];
  private isIndexing = false;
  private semanticEnhancementEngine: SemanticEnhancementEngine;

  constructor() {
    const ncpDir = getNcpBaseDirectory();
    this.dbPath = path.join(ncpDir, 'embeddings.json');
    this.metadataPath = path.join(ncpDir, 'embeddings-metadata.json');

    // Initialize semantic enhancement engine with industry-standard architecture
    this.semanticEnhancementEngine = new SemanticEnhancementEngine();

    this.ensureDirectoryExists(ncpDir);

    logger.info('RAG Engine initialized with Semantic Enhancement Engine');
    logger.debug(`Enhancement statistics: ${JSON.stringify(this.semanticEnhancementEngine.getEnhancementStatistics())}`);
  }

  /**
   * Validate cache against current configuration
   */
  async validateCache(currentConfig?: any): Promise<boolean> {
    try {
      if (!existsSync(this.dbPath) || !existsSync(this.metadataPath)) {
        logger.debug('🔍 Cache files missing, needs rebuild');
        return false;
      }

      // Load cache metadata
      const metadataContent = await fs.readFile(this.metadataPath, 'utf-8');
      this.cacheMetadata = JSON.parse(metadataContent);

      if (!this.cacheMetadata) {
        logger.debug('🔍 Cache metadata invalid, needs rebuild');
        return false;
      }

      // Check if cache is too old (older than 7 days)
      const cacheAge = Date.now() - new Date(this.cacheMetadata.createdAt).getTime();
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      if (cacheAge > maxAge) {
        logger.info('🕐 Cache is older than 7 days, rebuilding for freshness');
        return false;
      }

      // If current config provided, validate against it
      if (currentConfig) {
        const currentConfigHash = this.hashObject(currentConfig);
        if (this.cacheMetadata.configHash !== currentConfigHash) {
          logger.info('🔄 Configuration changed, invalidating cache');
          return false;
        }
      }

      logger.debug('✅ Cache validation passed');
      return true;

    } catch (error) {
      logger.warn(`⚠️ Cache validation failed: ${error}`);
      return false;
    }
  }

  /**
   * Generate hash of configuration for change detection
   */
  private hashObject(obj: any): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  /**
   * Update cache metadata
   */
  private async updateCacheMetadata(mcpHashes: Record<string, string>): Promise<void> {
    this.cacheMetadata = {
      version: '2.2.0',
      createdAt: new Date().toISOString(),
      lastValidated: new Date().toISOString(),
      configHash: '', // Will be set when config is available
      mcpHashes,
      totalTools: this.vectorDB.size
    };

    try {
      await fs.writeFile(this.metadataPath, JSON.stringify(this.cacheMetadata, null, 2));
      logger.debug('💾 Cache metadata updated');
    } catch (error) {
      logger.error(`❌ Failed to save cache metadata: ${error}`);
    }
  }

  /**
   * Initialize the RAG engine with embedding model
   * Falls back gracefully if transformer.js fails to load
   */
  async initialize(currentConfig?: any): Promise<void> {
    if (this.isInitialized) return;

    logger.info('🧠 Initializing RAG engine...');
    const startTime = Date.now();

    // Validate cache before proceeding
    const cacheValid = await this.validateCache(currentConfig);
    
    if (!cacheValid) {
      logger.info('🔄 Cache invalid, clearing and will rebuild on demand');
      await this.clearCache();
    }

    // Store original console.warn before try block
    const originalConsoleWarn = console.warn;

    try {
      // Configure transformers environment to suppress content-length warnings
      process.env.TRANSFORMERS_VERBOSITY = 'error';  // Suppress info/warning logs

      // Temporarily suppress the specific content-length warning
      console.warn = (...args: any[]) => {
        const message = args.join(' ');
        if (message.includes('Unable to determine content-length') ||
            message.includes('Will expand buffer when needed')) {
          return; // Suppress this specific warning
        }
        originalConsoleWarn.apply(console, args);
      };

      // Dynamically import transformer.js
      const { pipeline, env } = await import('@xenova/transformers');

      // Configure transformers to suppress download warnings
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      
      // Load sentence transformer model
      logger.info('📥 Loading embedding model (all-MiniLM-L6-v2)...');
      this.model = await pipeline(
        'feature-extraction', 
        'Xenova/all-MiniLM-L6-v2',
        { 
          quantized: true,  // Use quantized version for smaller size
          progress_callback: (progress: any) => {
            if (progress.status === 'downloading') {
              logger.info(`📥 Downloading model: ${Math.round(progress.progress)}%`);
            }
          }
        }
      );

      // Restore original console.warn after model loading
      console.warn = originalConsoleWarn;

      // Load cached embeddings (if cache was valid)
      if (cacheValid) {
        await this.loadPersistedEmbeddings();
      }

      const initTime = Date.now() - startTime;
      logger.info(`✅ RAG engine initialized in ${initTime}ms`);
      logger.info(`📊 Loaded ${this.vectorDB.size} cached embeddings`);

      this.isInitialized = true;

      // Process any queued indexing tasks
      this.processIndexingQueue();

    } catch (error) {
      // Restore original console.warn in case of error
      console.warn = originalConsoleWarn;

      logger.warn(`⚠️ RAG engine failed to initialize: ${error}`);
      logger.info('🔄 Falling back to keyword-based discovery');

      // Mark as initialized but without model (fallback mode)
      this.isInitialized = true;
      this.model = null;
      
      // Still load cached embeddings for basic functionality (if cache was valid)
      if (cacheValid) {
        try {
          await this.loadPersistedEmbeddings();
          logger.info(`📊 Loaded ${this.vectorDB.size} cached embeddings (fallback mode)`);
        } catch {
          // Ignore cache loading errors in fallback mode
        }
      }
      
      // Process any queued indexing tasks (will use fallback)
      this.processIndexingQueue();
    }
  }

  /**
   * Index tools from an MCP (progressive loading)
   */
  async indexMCP(mcpName: string, tools: any[]): Promise<void> {
    if (!this.isInitialized) {
      // Queue for later processing
      this.indexingQueue.push({ mcpName, tools });
      logger.info(`📋 Queued ${mcpName} for indexing (${tools.length} tools)`);
      return;
    }

    if (this.isIndexing) {
      // Add to queue if already indexing
      this.indexingQueue.push({ mcpName, tools });
      return;
    }

    await this.performIndexing(mcpName, tools);
  }

  /**
   * Fast indexing for startup - loads from embeddings cache if available
   * This is called during optimized cache loading to avoid regenerating embeddings
   */
  async indexMCPFromCache(mcpName: string, tools: any[]): Promise<void> {
    if (!this.isInitialized) {
      // Queue for later processing
      this.indexingQueue.push({ mcpName, tools });
      return;
    }

    // Fast path: check if all tools are already in vectorDB
    let allCached = true;
    for (const tool of tools) {
      const toolId = tool.id || `${mcpName}:${tool.name}`;
      if (!this.vectorDB.has(toolId)) {
        allCached = false;
        break;
      }
    }

    if (allCached) {
      logger.debug(`⚡ All ${tools.length} tools for ${mcpName} already cached`);
      return;
    }

    // Fallback to normal indexing if not all cached
    await this.performIndexing(mcpName, tools);
  }

  /**
   * Perform actual indexing of tools
   */
  private async performIndexing(mcpName: string, tools: any[]): Promise<void> {
    this.isIndexing = true;
    logger.info(`🔍 Indexing ${mcpName} (${tools.length} tools)...`);

    let newEmbeddings = 0;
    let cachedEmbeddings = 0;

    try {
      for (const tool of tools) {
        const toolId = tool.id || `${mcpName}:${tool.name}`;
        const description = tool.description || tool.name;
        const hash = this.hashDescription(description);
        
        const cached = this.vectorDB.get(toolId);
        
        // Skip if we already have this exact description
        if (cached && cached.hash === hash) {
          logger.debug(`💾 Using cached embedding for ${toolId}`);
          cachedEmbeddings++;
          continue;
        }

        // Generate new embedding (or skip in fallback mode)
        if (this.model) {
          logger.debug(`🧮 Computing embedding for ${toolId}...`);
          try {
            const mcpDomain = this.getMCPDomain(mcpName);
            const capabilityEnhancements = this.getCapabilityEnhancements(tool.name, description);
            // Include the tool identifier for exact searches: git:commit, filesystem:read_file, etc.
            const toolIdentifier = `${mcpName}:${tool.name}`;
            const enhancedDescription = `${toolIdentifier} ${mcpDomain} context: ${description}${capabilityEnhancements}`;
            
            const embedding = await this.model(enhancedDescription, { 
              pooling: 'mean', 
              normalize: true 
            });
            
            this.vectorDB.set(toolId, {
              embedding: new Float32Array(embedding.data),
              hash: hash,
              lastUpdated: new Date().toISOString(),
              toolName: tool.name,
              description: description,
              enhancedDescription: enhancedDescription,
              mcpName: mcpName,
              mcpDomain: mcpDomain
            });
            
            newEmbeddings++;
          } catch (error) {
            logger.error(`❌ Failed to compute embedding for ${toolId}: ${error}`);
          }
        } else {
          // In fallback mode, just store tool metadata without embeddings
          const mcpDomain = this.getMCPDomain(mcpName);
          this.vectorDB.set(toolId, {
            embedding: new Float32Array([]), // Empty embedding
            hash: hash,
            lastUpdated: new Date().toISOString(),
            toolName: tool.name,
            description: description,
            enhancedDescription: `${mcpDomain} context: ${description}${this.getCapabilityEnhancements(tool.name, description)}`,
            mcpName: mcpName,
            mcpDomain: mcpDomain
          });
          newEmbeddings++;
        }
      }

      // Update MCP hash for change detection
      const mcpHash = this.hashObject(tools);
      const mcpHashes = this.cacheMetadata?.mcpHashes || {};
      mcpHashes[mcpName] = mcpHash;

      // Persist to disk after each MCP
      await this.persistEmbeddings();
      await this.updateCacheMetadata(mcpHashes);

      logger.info(`✅ ${mcpName} indexed: ${newEmbeddings} new, ${cachedEmbeddings} cached`);

    } catch (error) {
      logger.error(`❌ Failed to index ${mcpName}: ${error}`);
    } finally {
      this.isIndexing = false;
      
      // Process next item in queue
      if (this.indexingQueue.length > 0) {
        const next = this.indexingQueue.shift()!;
        setImmediate(() => this.performIndexing(next.mcpName, next.tools));
      }
    }
  }

  /**
   * Process queued indexing tasks
   */
  private async processIndexingQueue(): Promise<void> {
    while (this.indexingQueue.length > 0) {
      const task = this.indexingQueue.shift()!;
      await this.performIndexing(task.mcpName, task.tools);
    }
  }

  /**
   * Discover tools using semantic similarity (or fallback to keyword matching)
   */
  async discover(query: string, maxResults = 5): Promise<DiscoveryResult[]> {
    if (!this.isInitialized) {
      logger.warn('⚠️ RAG engine not initialized, falling back to keyword matching');
      return this.fallbackKeywordSearch(query, maxResults);
    }

    if (this.vectorDB.size === 0) {
      logger.warn('⚠️ No embeddings available yet');
      return [];
    }

    // If no model available (fallback mode), use keyword search
    if (!this.model) {
      logger.debug(`🔍 Keyword discovery (fallback mode): "${query}"`);
      return this.fallbackKeywordSearch(query, maxResults);
    }

    try {
      logger.debug(`🔍 RAG discovery: "${query}"`);
      
      // Check if any tools have actual embeddings
      let toolsWithEmbeddings = 0;
      for (const [toolId, toolData] of this.vectorDB) {
        if (toolData.embedding.length > 0) {
          toolsWithEmbeddings++;
        }
      }
      
      logger.debug(`Tools with embeddings: ${toolsWithEmbeddings}/${this.vectorDB.size}`);
      
      // If no tools have embeddings, fall back to keyword search
      if (toolsWithEmbeddings === 0) {
        logger.debug('No tools have embeddings, falling back to keyword search');
        return this.fallbackKeywordSearch(query, maxResults);
      }
      
      // Generate query embedding
      const queryEmbedding = await this.model(query, { 
        pooling: 'mean', 
        normalize: true 
      });
      
      // Calculate similarities
      const similarities: Array<{ toolId: string; similarity: number }> = [];
      
      for (const [toolId, toolData] of this.vectorDB) {
        // Skip tools with empty embeddings (fallback mode entries)
        if (toolData.embedding.length === 0) {
          continue;
        }
        
        const similarity = this.cosineSimilarity(
          queryEmbedding.data,
          toolData.embedding
        );
        
        similarities.push({ toolId, similarity });
      }
      
      // Git-specific boosting: if query contains git terms, moderately boost Shell tools
      const queryLower = query.toLowerCase();
      const gitTerms = ['git', 'commit', 'push', 'pull', 'checkout', 'branch', 'merge', 'clone', 'status', 'log', 'diff', 'add', 'remote', 'fetch', 'rebase', 'stash', 'tag'];
      const hasGitTerms = gitTerms.some(term => queryLower.includes(term));

      if (hasGitTerms) {
        for (const result of similarities) {
          if (result.toolId.startsWith('Shell:')) {
            result.similarity = Math.min(0.85, result.similarity + 0.15); // Moderate boost for Shell tools only when git terms are explicit
            logger.debug(`🔧 Git query detected, boosting ${result.toolId} similarity to ${result.similarity}`);
          }
        }
      }
      
      // Enhanced filtering with domain awareness
      const inferredDomains = this.inferQueryDomains(queryLower);

      // Sort by similarity and apply enhancement system
      const results = similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, maxResults * 2) // Get more candidates for domain filtering
        .filter(result => result.similarity > 0.25) // Lower initial threshold for domain filtering
        .map(result => {
          const toolData = this.vectorDB.get(result.toolId);
          let boostedSimilarity = result.similarity;
          let enhancementReasons: string[] = [];

          // Apply semantic enhancement engine (capability inference + intent resolution)
          if (toolData) {
            const semanticEnhancements = this.semanticEnhancementEngine.applySemanticalEnhancement(
              query,
              result.toolId,
              toolData.description
            );

            for (const enhancement of semanticEnhancements) {
              boostedSimilarity += enhancement.relevanceBoost;
              enhancementReasons.push(`${enhancement.enhancementType}: ${enhancement.enhancementReason}`);

              logger.debug(`🚀 Semantic enhancement ${result.toolId}: +${enhancement.relevanceBoost.toFixed(3)} (${enhancement.enhancementType})`);
            }
          }

          // Legacy domain boosting (will be replaced by enhancement system over time)
          if (toolData?.mcpDomain && inferredDomains.length > 0) {
            const domainMatch = inferredDomains.some(domain =>
              toolData.mcpDomain!.toLowerCase().includes(domain.toLowerCase()) ||
              domain.toLowerCase().includes(toolData.mcpDomain!.toLowerCase())
            );
            if (domainMatch) {
              boostedSimilarity = Math.min(0.98, boostedSimilarity + 0.15);
              enhancementReasons.push(`legacy: domain match (${toolData.mcpDomain})`);
            }
          }
          
          const baseReason = toolData?.mcpDomain ?
            `${toolData.mcpDomain} tool (RAG)` :
            'Semantic similarity (RAG)';

          const enhancedReason = enhancementReasons.length > 0 ?
            `${baseReason} + ${enhancementReasons.join(', ')}` :
            baseReason;

          return {
            toolId: result.toolId,
            confidence: Math.min(0.95, boostedSimilarity),
            reason: enhancedReason,
            similarity: boostedSimilarity,
            originalSimilarity: result.similarity,
            domain: toolData?.mcpDomain || 'unknown'
          };
        })
        .sort((a, b) => b.similarity - a.similarity) // Re-sort after boosting
        .slice(0, maxResults) // Take final top results
        .filter(result => result.similarity > 0.3); // Final threshold

      logger.debug(`🎯 Found ${results.length} matches for "${query}"`);
      
      return results;

    } catch (error) {
      logger.error(`❌ RAG discovery failed: ${error}`);
      return this.fallbackKeywordSearch(query, maxResults);
    }
  }

  /**
   * Enhanced fallback keyword search when RAG fails
   */
  private fallbackKeywordSearch(query: string, maxResults: number): DiscoveryResult[] {
    logger.debug('🔄 Using enhanced keyword search');
    
    const queryWords = query.toLowerCase().split(/\s+/);
    const scores = new Map<string, { score: number; matches: string[] }>();
    
    // Domain-specific patterns for better disambiguation
    const domainPatterns: Record<string, { tools: string[]; keywords: string[]; boost: number }> = {
      'web_search': {
        tools: ['tavily:search', 'tavily:searchContext', 'tavily:searchQNA'],
        keywords: ['web', 'internet', 'google', 'online', 'website', 'url', 'tavily', 'search web', 'web search', 'search the web', 'google search', 'search online', 'online search', 'internet search', 'web information', 'search information', 'find online', 'look up online'],
        boost: 3.0
      },
      'code_search': {
        tools: ['desktop-commander:search_code'],
        keywords: ['code', 'text', 'pattern', 'grep', 'ripgrep', 'file content', 'search code', 'search text'],
        boost: 2.0
      },
      'file_search': {
        tools: ['desktop-commander:search_files'],
        keywords: ['file name', 'filename', 'find file', 'locate file', 'search files'],
        boost: 2.0
      },
      'create_file': {
        tools: ['desktop-commander:write_file'],
        keywords: ['create file', 'new file', 'make file', 'generate file'],
        boost: 3.0
      },
      'read_single_file': {
        tools: ['desktop-commander:read_file'],
        keywords: ['read file', 'get file', 'show file', 'view file', 'display file', 'file content', 'get content', 'show content', 'view file content', 'display file content', 'read single file', 'show single file'],
        boost: 5.0
      },
      'read_multiple_files': {
        tools: ['desktop-commander:read_multiple_files'],
        keywords: ['read multiple files', 'read many files', 'get multiple files', 'show multiple files', 'multiple file content'],
        boost: 3.0
      },
      'git_operations': {
        tools: ['Shell:run_command', 'desktop-commander:start_process'],
        keywords: [
          // Basic git terms
          'git', 'commit', 'push', 'pull', 'clone', 'branch', 'merge', 'repository',
          // Full git commands
          'git commit', 'git push', 'git pull', 'git status', 'git add', 'git log', 'git diff', 'git branch', 'git checkout', 'git merge',
          // Hyphenated variants (common in user queries)
          'git-commit', 'git-push', 'git-pull', 'git-status', 'git-add', 'git-log', 'git-diff', 'git-branch', 'git-checkout', 'git-merge',
          // Action-oriented phrases
          'commit changes', 'push to git', 'pull from git', 'check git status', 'add files to git', 'create git branch',
          // Individual commands (for brevity)
          'checkout', 'add', 'status', 'log', 'diff', 'remote', 'fetch', 'rebase', 'stash', 'tag'
        ],
        boost: 8.0
      },
      'script_execution': {
        tools: ['Shell:run_command'],
        keywords: ['python script', 'bash script', 'shell script', 'run python script', 'execute python script', 'run bash script', 'execute bash script', 'script execution', 'run a python script', 'run a bash script', 'execute a script'],
        boost: 2.0  // Reduced boost and more specific keywords
      },
      'shell_commands': {
        tools: ['Shell:run_command', 'desktop-commander:start_process'],
        keywords: ['npm install', 'yarn install', 'pip install', 'terminal command', 'shell command', 'command line interface'],
        boost: 1.5  // Much lower boost and more specific keywords
      },
      'ncp_meta_operations': {
        tools: [
          'ncp:list_available_tools',
          'ncp:check_mcp_health', 
          'ncp:manage_ncp_profiles',
          'ncp:show_token_savings',
          'ncp:get_ncp_status'
        ],
        keywords: [
          // NCP-specific terms (highest priority)
          'ncp', 'mcp orchestrator', 'ncp orchestrator', 'connected mcps', 'ncp system',
          
          // Tool listing (specific to NCP context)
          'what tools does ncp have', 'ncp available tools', 'mcp tools available', 
          'tools through ncp', 'ncp functionality', 'what can ncp do', 'available through ncp',
          'list ncp tools', 'show ncp tools', 'ncp tool list',
          
          // Health checking (NCP-specific)
          'mcp health', 'mcp server health', 'ncp health', 'mcp connection status',
          'which mcps are working', 'mcp errors', 'server status ncp', 'ncp server status',
          'check mcp health', 'mcp health check', 'health status ncp',
          
          // Profile management (NCP-specific)  
          'ncp profiles', 'ncp configuration', 'mcp profiles', 'which mcps to load',
          'ncp setup', 'ncp server configuration', 'execution profiles', 'ncp profile management',
          'manage ncp profiles', 'ncp profile config', 'profile settings ncp',
          
          // Token statistics (NCP-specific)
          'ncp token savings', 'ncp efficiency', 'how much does ncp save',
          'ncp performance', 'token usage ncp', 'ncp statistics', 'token savings ncp',
          'ncp token stats', 'ncp savings report',
          
          // System status (NCP-specific)
          'ncp status', 'ncp info', 'ncp system info', 'what is ncp running',
          'ncp runtime', 'ncp configuration info', 'ncp system status'
        ],
        boost: 8.0  // Very high boost for NCP-specific context
      }
    };
    
    // Check for domain-specific patterns first
    const queryLower = query.toLowerCase();
    
    // Context detection for disambiguation
    const hasNcpContext = queryLower.includes('ncp') || 
                         queryLower.includes('mcp') || 
                         queryLower.includes('orchestrator') ||
                         queryLower.includes('connected');
    
    // Boost script execution tools but don't force them (let RAG compete)
    const explicitScriptKeywords = ['python script', 'bash script', 'shell script', 'run python script', 'execute python script', 'run bash script', 'execute bash script'];
    const hasExplicitScript = explicitScriptKeywords.some(keyword => queryLower.includes(keyword));

    // Only boost for very explicit script execution queries, not general "run" or "execute"
    
    for (const [domain, pattern] of Object.entries(domainPatterns)) {
      for (const keyword of pattern.keywords) {
        if (queryLower.includes(keyword)) {
          for (const toolId of pattern.tools) {
            if (this.vectorDB.has(toolId)) {
              const toolData = this.vectorDB.get(toolId)!;
              const existing = scores.get(toolId) || { score: 0, matches: [] };
              existing.score += pattern.boost;
              existing.matches.push(`domain:${domain}:${keyword}`);
              scores.set(toolId, existing);
            }
          }
        }
      }
    }

    // Apply domain-aware penalties for incidental matches
    // Tools that mention git but can't actually execute git commands should be deprioritized
    const incidentalGitPatterns = ['git-style', 'git style', 'git format', 'git diff format'];
    const actualGitCapabilityTools = ['Shell:run_command', 'desktop-commander:start_process'];

    if (queryLower.includes('git')) {
      for (const [toolId, data] of scores) {
        const toolData = this.vectorDB.get(toolId);
        if (toolData) {
          const description = toolData.description.toLowerCase();
          const hasIncidentalMention = incidentalGitPatterns.some(pattern => description.includes(pattern));
          const hasActualCapability = actualGitCapabilityTools.includes(toolId) ||
                                     toolData.enhancedDescription?.includes('Can execute git commands');

          if (hasIncidentalMention && !hasActualCapability) {
            // Significantly reduce score for incidental mentions
            data.score *= 0.3;
            data.matches.push('penalty:incidental-git-mention');
          } else if (hasActualCapability) {
            // Boost tools with actual git capabilities
            data.score *= 1.5;
            data.matches.push('boost:actual-git-capability');
          }
        }
      }
    }

    // Semantic keyword mappings for general matching
    const synonyms: Record<string, string[]> = {
      'create': ['make', 'add', 'new', 'generate', 'build'], // Removed 'write' to avoid confusion
      'read': ['get', 'fetch', 'load', 'show', 'display', 'view'],
      'update': ['edit', 'modify', 'change', 'set', 'alter'],
      'delete': ['remove', 'kill', 'terminate', 'clear', 'destroy'],
      'file': ['document', 'content', 'text', 'script', 'data'],
      'list': ['display', 'enumerate'], // Removed 'show' and 'get' to avoid confusion with read operations
      'search': ['find', 'look', 'query', 'seek'],
      'run': ['execute', 'start', 'launch', 'invoke'],
      'process': ['command', 'task', 'service', 'program', 'app']
    };
    
    // Expand query words with synonyms
    const expandedWords = [...queryWords];
    for (const word of queryWords) {
      if (synonyms[word]) {
        expandedWords.push(...synonyms[word]);
      }
    }
    
    for (const [toolId, toolData] of this.vectorDB) {
      const toolName = toolData.toolName.toLowerCase();
      const description = toolData.description.toLowerCase();
      const allText = `${toolName} ${description}`;
      const textWords = allText.split(/\s+/);
      
      let score = 0;
      const matches: string[] = [];
      
      // Exact matches get highest score
      for (const queryWord of queryWords) {
        if (toolName.includes(queryWord)) {
          score += 10;
          matches.push(`name:${queryWord}`);
        }
        if (description.includes(queryWord)) {
          score += 5;
          matches.push(`desc:${queryWord}`);
        }
      }
      
      // Synonym matches get medium score
      for (const expandedWord of expandedWords) {
        if (expandedWord !== queryWords.find(w => w === expandedWord)) { // Only synonyms
          if (allText.includes(expandedWord)) {
            score += 3;
            matches.push(`syn:${expandedWord}`);
          }
        }
      }
      
      // Word containment gets lower score
      for (const queryWord of queryWords) {
        for (const textWord of textWords) {
          if (textWord.includes(queryWord) || queryWord.includes(textWord)) {
            if (textWord.length > 3 && queryWord.length > 3) {
              score += 1;
              matches.push(`partial:${textWord}`);
            }
          }
        }
      }
      
      if (score > 0) {
        const existing = scores.get(toolId) || { score: 0, matches: [] };
        existing.score += score; // Add to domain pattern score
        existing.matches.push(...matches);
        scores.set(toolId, existing);
      }
    }
    
    // Apply context-aware scoring adjustments for disambiguation
    for (const [toolId, data] of scores) {
      // Reduce NCP tool scores if query lacks NCP/MCP context
      if (toolId.startsWith('ncp:') && !hasNcpContext) {
        data.score *= 0.3; // Significant penalty for NCP tools without NCP context
      }
      
      // Boost NCP tool scores if query has NCP/MCP context  
      if (toolId.startsWith('ncp:') && hasNcpContext) {
        data.score *= 1.5; // Boost NCP tools when NCP context is present
      }
    }
    
    return Array.from(scores.entries())
      .sort((a, b) => {
        // Prioritize domain pattern matches
        const aDomainMatches = a[1].matches.filter(m => m.startsWith('domain:')).length;
        const bDomainMatches = b[1].matches.filter(m => m.startsWith('domain:')).length;
        
        if (aDomainMatches !== bDomainMatches) {
          return bDomainMatches - aDomainMatches; // More domain matches first
        }
        
        // If domain matches are equal, sort by score
        return b[1].score - a[1].score;
      })
      .slice(0, maxResults)
      .map(([toolId, data]) => {
        const maxScore = Math.max(...Array.from(scores.values()).map(v => v.score));
        return {
          toolId,
          confidence: Math.min(0.75, data.score / maxScore),
          reason: `Enhanced keyword matching: ${data.matches.slice(0, 3).join(', ')}`,
          similarity: data.score / maxScore
        };
      });
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Generate hash of tool description for change detection
   */
  private hashDescription(description: string): string {
    return crypto.createHash('md5').update(description).digest('hex');
  }

  /**
   * Load cached embeddings from disk
   */
  private async loadPersistedEmbeddings(): Promise<void> {
    try {
      if (!existsSync(this.dbPath)) {
        logger.info('📄 No cached embeddings found, starting fresh');
        return;
      }

      const data = await fs.readFile(this.dbPath, 'utf-8');
      const cached = JSON.parse(data);
      
      for (const [toolId, embedding] of Object.entries(cached)) {
        const embeddingData = embedding as any;
        this.vectorDB.set(toolId, {
          embedding: new Float32Array(embeddingData.embedding),
          hash: embeddingData.hash,
          lastUpdated: embeddingData.lastUpdated,
          toolName: embeddingData.toolName,
          description: embeddingData.description,
          enhancedDescription: embeddingData.enhancedDescription,
          mcpName: embeddingData.mcpName,
          mcpDomain: embeddingData.mcpDomain
        });
      }

      logger.info(`📥 Loaded ${this.vectorDB.size} cached embeddings`);
    } catch (error) {
      logger.warn(`⚠️ Failed to load cached embeddings: ${error}`);
    }
  }

  /**
   * Persist embeddings to disk
   */
  private async persistEmbeddings(): Promise<void> {
    try {
      const toSerialize: Record<string, any> = {};
      
      for (const [toolId, embedding] of this.vectorDB) {
        toSerialize[toolId] = {
          embedding: Array.from(embedding.embedding), // Convert Float32Array to regular array
          hash: embedding.hash,
          lastUpdated: embedding.lastUpdated,
          toolName: embedding.toolName,
          description: embedding.description
        };
      }

      await fs.writeFile(this.dbPath, JSON.stringify(toSerialize, null, 2));
      logger.debug(`💾 Persisted ${this.vectorDB.size} embeddings to cache`);
    } catch (error) {
      logger.error(`❌ Failed to persist embeddings: ${error}`);
    }
  }

  /**
   * Ensure directory exists
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Get statistics about the RAG engine
   */
  getStats(): {
    isInitialized: boolean;
    totalEmbeddings: number;
    queuedTasks: number;
    isIndexing: boolean;
    cacheSize: string;
  } {
    const stats = {
      isInitialized: this.isInitialized,
      totalEmbeddings: this.vectorDB.size,
      queuedTasks: this.indexingQueue.length,
      isIndexing: this.isIndexing,
      cacheSize: '0 KB'
    };

    // Calculate cache size
    try {
      if (existsSync(this.dbPath)) {
        const size = statSync(this.dbPath).size;
        stats.cacheSize = `${Math.round(size / 1024)} KB`;
      }
    } catch {
      // Ignore errors
    }

    return stats;
  }

  /**
   * Force cache refresh by clearing and rebuilding
   */
  async refreshCache(): Promise<void> {
    logger.info('🔄 Forcing cache refresh...');
    await this.clearCache();
    logger.info('💡 Cache cleared - embeddings will be rebuilt on next indexing');
  }

  /**
   * Clear all cached embeddings and metadata
   */
  async clearCache(): Promise<void> {
    this.vectorDB.clear();
    this.cacheMetadata = null;
    
    try {
      if (existsSync(this.dbPath)) {
        await fs.unlink(this.dbPath);
      }
      if (existsSync(this.metadataPath)) {
        await fs.unlink(this.metadataPath);
      }
      logger.info('🗑️ Cleared embedding cache and metadata');
    } catch (error) {
      logger.error(`❌ Failed to clear cache: ${error}`);
    }
  }
}