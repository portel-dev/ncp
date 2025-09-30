/**
 * NCP Orchestrator - Real MCP Connections
 * Based on commercial NCP implementation
 */

import { readFileSync, existsSync } from 'fs';
import { getCacheDirectory } from '../utils/ncp-paths.js';
import { join } from 'path';
import { createHash } from 'crypto';
import ProfileManager from '../profiles/profile-manager.js';
import { logger } from '../utils/logger.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { DiscoveryEngine } from '../discovery/engine.js';
import { MCPHealthMonitor } from '../utils/health-monitor.js';
import { SearchEnhancer } from '../discovery/search-enhancer.js';
import { mcpWrapper } from '../utils/mcp-wrapper.js';
import { withFilteredOutput } from '../transports/filtered-stdio-transport.js';
import { ToolSchemaParser, ParameterInfo } from '../services/tool-schema-parser.js';
import { ToolContextResolver } from '../services/tool-context-resolver.js';
// Simple string similarity for tool name matching
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  // Exact match
  if (s1 === s2) return 1.0;

  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.8;
  }

  // Simple Levenshtein-based similarity
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(s1, s2);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}
import { CachePatcher } from '../cache/cache-patcher.js';
import { CSVCache, CachedTool } from '../cache/csv-cache.js';
import { spinner } from '../utils/progress-spinner.js';

interface DiscoveryResult {
  toolName: string;
  mcpName: string;
  confidence: number;
  description?: string;
  schema?: any;
}

interface ExecutionResult {
  success: boolean;
  content?: any;
  error?: string;
}

interface MCPConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface Profile {
  name: string;
  description: string;
  mcpServers: Record<string, {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
  metadata?: any;
}

interface MCPConnection {
  client: Client;
  transport: StdioClientTransport;
  tools: Array<{name: string; description: string}>;
  serverInfo?: {
    name: string;
    title?: string;
    version: string;
    description?: string;
    websiteUrl?: string;
  };
  lastUsed: number;
  connectTime: number;
  executionCount: number;
}

interface MCPDefinition {
  name: string;
  config: MCPConfig;
  tools: Array<{name: string; description: string}>;
  serverInfo?: {
    name: string;
    title?: string;
    version: string;
    description?: string;
    websiteUrl?: string;
  };
}

export class NCPOrchestrator {
  private definitions: Map<string, MCPDefinition> = new Map();
  private connections: Map<string, MCPConnection> = new Map();
  private toolToMCP: Map<string, string> = new Map();
  private allTools: Array<{ name: string; description: string; mcpName: string }> = [];
  private profileName: string;
  private readonly QUICK_PROBE_TIMEOUT = 8000; // 8 seconds - allow for npm package downloads
  private readonly CONNECTION_TIMEOUT = 10000; // 10 seconds
  private readonly IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private readonly CLEANUP_INTERVAL = 60 * 1000; // Check every minute
  private cleanupTimer?: NodeJS.Timeout;
  private discovery: DiscoveryEngine;
  private healthMonitor: MCPHealthMonitor;
  private cachePatcher: CachePatcher;
  private csvCache: CSVCache;
  private showProgress: boolean;
  private indexingProgress: { current: number; total: number; currentMCP: string; estimatedTimeRemaining?: number } | null = null;
  private indexingStartTime: number = 0;

  constructor(profileName: string = 'default', showProgress: boolean = false) {
    this.profileName = profileName;
    this.discovery = new DiscoveryEngine();
    this.healthMonitor = new MCPHealthMonitor();
    this.cachePatcher = new CachePatcher();
    this.csvCache = new CSVCache(getCacheDirectory(), profileName);
    this.showProgress = showProgress;
  }

  private async loadProfile(): Promise<Profile | null> {
    try {
      const profileManager = new ProfileManager();
      await profileManager.initialize();
      const profile = await profileManager.getProfile(this.profileName);

      if (!profile) {
        logger.error(`Profile not found: ${this.profileName}`);
        return null;
      }

      return profile;
    } catch (error: any) {
      logger.error(`Failed to load profile: ${error.message}`);
      return null;
    }
  }

  async initialize(): Promise<void> {
    const startTime = Date.now();
    this.indexingStartTime = startTime;
    logger.info(`Initializing NCP orchestrator with profile: ${this.profileName}`);

    const profile = await this.loadProfile();
    if (!profile) {
      logger.error('Failed to load profile');
      this.indexingProgress = null;
      return;
    }

    // Initialize discovery engine first
    await this.discovery.initialize();

    // Initialize CSV cache
    await this.csvCache.initialize();

    // Get profile hash for cache validation
    const profileHash = CSVCache.hashProfile(profile.mcpServers);

    // Check if cache is valid
    const cacheValid = this.csvCache.validateCache(profileHash);

    const mcpConfigs: MCPConfig[] = Object.entries(profile.mcpServers).map(([name, config]) => ({
      name,
      command: config.command,
      args: config.args,
      env: config.env || {}
    }));

    if (cacheValid) {
      // Load from cache
      logger.info('Loading tools from CSV cache...');
      await this.loadFromCSVCache(mcpConfigs);

      if (this.showProgress && this.allTools.length > 0) {
        const cachedMCPs = this.csvCache.getIndexedMCPs().size;
        spinner.success(`Loaded ${this.allTools.length} tools from ${cachedMCPs} cached MCPs`);
      }
    }

    // Get list of MCPs that need indexing
    const indexedMCPs = this.csvCache.getIndexedMCPs();
    const mcpsToIndex = mcpConfigs.filter(config => {
      const tools = profile.mcpServers[config.name];
      const currentHash = CSVCache.hashProfile(tools);
      return !this.csvCache.isMCPIndexed(config.name, currentHash);
    });

    if (mcpsToIndex.length > 0) {
      // Initialize progress tracking
      this.indexingProgress = {
        current: 0,
        total: mcpsToIndex.length,
        currentMCP: 'initializing...'
      };

      if (this.showProgress) {
        const action = cacheValid ? 'Resuming' : 'Indexing';
        const cachedCount = mcpConfigs.length - mcpsToIndex.length;
        const statusMsg = cacheValid
          ? `${action} indexing (${cachedCount} cached, ${mcpsToIndex.length} remaining of ${mcpConfigs.length} total)`
          : `${action} tools (${mcpConfigs.length} MCPs)`;
        spinner.start(statusMsg);
        spinner.updateSubMessage('Initializing discovery engine...');
      }

      // Start incremental cache writing
      await this.csvCache.startIncrementalWrite(profileHash);

      // Index only the MCPs that need it
      await this.discoverMCPTools(mcpsToIndex, profile, true, mcpConfigs.length);

      // Finalize cache
      await this.csvCache.finalize();

      if (this.showProgress) {
        spinner.success(`Indexed ${this.allTools.length} tools from ${this.definitions.size} MCPs`);
      }
    }

    // Clear progress tracking once complete
    this.indexingProgress = null;

    // Start cleanup timer for idle connections
    this.cleanupTimer = setInterval(
      () => this.cleanupIdleConnections(),
      this.CLEANUP_INTERVAL
    );

    const loadTime = Date.now() - startTime;
    logger.info(`🚀 NCP-OSS initialized in ${loadTime}ms with ${this.allTools.length} tools from ${this.definitions.size} MCPs`);
  }

  /**
   * Load cached tools from CSV
   */
  private async loadFromCSVCache(mcpConfigs: MCPConfig[]): Promise<void> {
    const cachedTools = this.csvCache.loadCachedTools();

    // Group tools by MCP
    const toolsByMCP = new Map<string, CachedTool[]>();
    for (const tool of cachedTools) {
      if (!toolsByMCP.has(tool.mcpName)) {
        toolsByMCP.set(tool.mcpName, []);
      }
      toolsByMCP.get(tool.mcpName)!.push(tool);
    }

    // Rebuild definitions and tool mappings from cache
    for (const config of mcpConfigs) {
      const mcpTools = toolsByMCP.get(config.name) || [];
      if (mcpTools.length === 0) continue;

      // Create definition
      this.definitions.set(config.name, {
        name: config.name,
        config,
        tools: mcpTools.map(t => ({
          name: t.toolName,
          description: t.description,
          inputSchema: {}
        })),
        serverInfo: undefined
      });

      // Add to all tools and create mappings
      for (const cachedTool of mcpTools) {
        const tool = {
          name: cachedTool.toolName,
          description: cachedTool.description,
          mcpName: config.name
        };
        this.allTools.push(tool);
        this.toolToMCP.set(cachedTool.toolId, config.name);
      }

      // Index tools in discovery engine
      const discoveryTools = mcpTools.map(t => ({
        id: t.toolId,
        name: t.toolName,
        description: t.description
      }));

      // Use async indexing to avoid blocking
      this.discovery.indexMCPTools(config.name, discoveryTools);
    }

    logger.info(`Loaded ${this.allTools.length} tools from CSV cache`);
  }

  private async discoverMCPTools(mcpConfigs: MCPConfig[], profile?: Profile, incrementalMode: boolean = false, totalMCPCount?: number): Promise<void> {
    // Only clear allTools if not in incremental mode
    if (!incrementalMode) {
      this.allTools = [];
    }

    const displayTotal = totalMCPCount || mcpConfigs.length;

    for (let i = 0; i < mcpConfigs.length; i++) {
      const config = mcpConfigs[i];
      try {
        logger.info(`Discovering tools from MCP: ${config.name}`);

        // Update indexing progress
        if (this.indexingProgress) {
          this.indexingProgress.current = i + 1;
          this.indexingProgress.currentMCP = config.name;

          // Estimate remaining time based on average time per MCP so far
          const elapsedTime = Date.now() - this.indexingStartTime;
          const averageTimePerMCP = elapsedTime / (i + 1);
          const remainingMCPs = mcpConfigs.length - (i + 1);
          this.indexingProgress.estimatedTimeRemaining = remainingMCPs * averageTimePerMCP;
        }

        if (this.showProgress) {
          const progress = `${i + 1}/${mcpConfigs.length}`;
          const percentage = Math.round(((i + 1) / mcpConfigs.length) * 100);

          // Add time estimate to match MCP interface
          let timeDisplay = '';
          if (this.indexingProgress?.estimatedTimeRemaining) {
            const remainingSeconds = Math.ceil(this.indexingProgress.estimatedTimeRemaining / 1000);
            timeDisplay = ` (~${remainingSeconds}s remaining)`;
          }

          // Show appropriate message based on mode
          const action = incrementalMode ? 'Resuming' : 'Indexing';
          const cachedCount = displayTotal - mcpConfigs.length;
          const statusText = incrementalMode
            ? `(${cachedCount} cached, ${progress} remaining)`
            : `(${progress})`;
          spinner.updateMessage(`${action} ${statusText} ${percentage}%${timeDisplay}`);
          spinner.updateSubMessage(`Connecting to ${config.name}...`);
        }

        const result = await this.probeMCPTools(config);

        // Store definition with schema fallback applied
        this.definitions.set(config.name, {
          name: config.name,
          config,
          tools: result.tools.map(tool => ({
            ...tool,
            inputSchema: tool.inputSchema || {}
          })),
          serverInfo: result.serverInfo
        });

        // Add to all tools and create mappings
        const discoveryTools = [];
        for (const tool of result.tools) {
          // Store with prefixed name for consistency with commercial version
          const prefixedToolName = `${config.name}:${tool.name}`;
          const prefixedDescription = `${config.name}: ${tool.description || 'No description available'}`;

          this.allTools.push({
            name: prefixedToolName,
            description: prefixedDescription,
            mcpName: config.name
          });

          // Map both formats for backward compatibility
          this.toolToMCP.set(tool.name, config.name);
          this.toolToMCP.set(prefixedToolName, config.name);

          // Prepare for discovery engine indexing
          // Pass unprefixed name and description - RAG engine will add the prefix
          discoveryTools.push({
            id: prefixedToolName,
            name: tool.name,  // Use unprefixed name here
            description: tool.description || 'No description available',  // Use unprefixed description
            mcpServer: config.name,
            inputSchema: tool.inputSchema || {}
          });
        }

        if (this.showProgress) {
          // Add time estimate to indexing sub-message for parity
          let timeDisplay = '';
          if (this.indexingProgress?.estimatedTimeRemaining) {
            const remainingSeconds = Math.ceil(this.indexingProgress.estimatedTimeRemaining / 1000);
            timeDisplay = ` (~${remainingSeconds}s remaining)`;
          }
          spinner.updateSubMessage(`Indexing ${result.tools.length} tools from ${config.name}...${timeDisplay}`);
        }

        // Index tools with discovery engine for vector search
        await this.discovery.indexMCPTools(config.name, discoveryTools);

        // Append to CSV cache incrementally (if in incremental mode)
        if (incrementalMode && profile) {
          const mcpHash = CSVCache.hashProfile(profile.mcpServers[config.name]);
          const cachedTools: CachedTool[] = result.tools.map(tool => ({
            mcpName: config.name,
            toolId: `${config.name}:${tool.name}`,
            toolName: tool.name,
            description: tool.description || 'No description available',
            hash: this.hashString(tool.description || ''),
            timestamp: new Date().toISOString()
          }));

          await this.csvCache.appendMCP(config.name, cachedTools, mcpHash);
        }

        logger.info(`Discovered ${result.tools.length} tools from ${config.name}`);
      } catch (error: any) {
        // Probe failures are expected - don't alarm users with error messages
        logger.debug(`Failed to discover tools from ${config.name}: ${error.message}`);

        if (this.showProgress) {
          spinner.updateSubMessage(`Skipped ${config.name} (connection failed)`);
        }

        // Update health monitor with the actual error for import feedback
        this.healthMonitor.markUnhealthy(config.name, error.message);
      }
    }
  }

  // Based on commercial NCP's probeMCPTools method
  private async probeMCPTools(config: MCPConfig): Promise<{
    tools: Array<{name: string; description: string; inputSchema?: any}>;
    serverInfo?: {
      name: string;
      title?: string;
      version: string;
      description?: string;
      websiteUrl?: string;
    };
  }> {
    if (!config.command) {
      throw new Error(`Invalid config for ${config.name}`);
    }

    let client: Client | null = null;
    let transport: StdioClientTransport | null = null;

    try {
      // Create wrapper command for discovery phase
      const wrappedCommand = mcpWrapper.createWrapper(
        config.name,
        config.command,
        config.args || []
      );

      // Create temporary connection for discovery
      const silentEnv = {
        ...process.env,
        ...(config.env || {}),
        MCP_SILENT: 'true',
        QUIET: 'true',
        NO_COLOR: 'true'
      };

      transport = new StdioClientTransport({
        command: wrappedCommand.command,
        args: wrappedCommand.args,
        env: silentEnv as Record<string, string>
      });

      client = new Client(
        { name: 'ncp-oss', version: '1.0.0' },
        { capabilities: {} }
      );

      // Connect with timeout and filtered output
      await withFilteredOutput(async () => {
        await Promise.race([
          client!.connect(transport!),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Probe timeout')), this.QUICK_PROBE_TIMEOUT)
          )
        ]);
      });

      // Capture server info after connection
      const serverInfo = client!.getServerVersion();

      // Get tool list with filtered output
      const response = await withFilteredOutput(async () => {
        return await client!.listTools();
      });
      const tools = response.tools.map(t => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || {}
      }));

      // Disconnect immediately
      await client.close();

      return {
        tools,
        serverInfo: serverInfo ? {
          name: serverInfo.name || config.name,
          title: serverInfo.title,
          version: serverInfo.version || 'unknown',
          description: serverInfo.title || serverInfo.name || undefined,
          websiteUrl: serverInfo.websiteUrl
        } : undefined
      };

    } catch (error) {
      // Clean up on error
      if (client) {
        try { await client.close(); } catch {}
      }
      throw error;
    }
  }

  async find(query: string, limit: number = 5, detailed: boolean = false): Promise<DiscoveryResult[]> {
    if (!query) {
      // No query = list all tools, filtered by health
      const healthyTools = this.allTools.filter(tool => this.healthMonitor.getHealthyMCPs([tool.mcpName]).length > 0);
      const results = healthyTools.slice(0, limit).map(tool => {
        // Extract actual tool name from prefixed format
        const actualToolName = tool.name.includes(':') ? tool.name.split(':', 2)[1] : tool.name;
        return {
          toolName: tool.name, // Return prefixed name
          mcpName: tool.mcpName,
          confidence: 1.0,
          description: detailed ? tool.description : undefined,
          schema: detailed ? this.getToolSchema(tool.mcpName, actualToolName) : undefined
        };
      });
      return results;
    }

    // Use battle-tested vector search from commercial NCP
    // DOUBLE SEARCH TECHNIQUE: Request 2x results to account for filtering disabled MCPs
    try {
      const doubleLimit = limit * 2; // Request double to account for filtered MCPs
      const vectorResults = await this.discovery.findRelevantTools(query, doubleLimit);

      // Apply universal term frequency scoring boost
      const adjustedResults = this.adjustScoresUniversally(query, vectorResults);

      // Parse and filter results
      const parsedResults = adjustedResults.map(result => {
        // Parse tool format: "mcp:tool" or just "tool"
        const parts = result.name.includes(':') ? result.name.split(':', 2) : [this.toolToMCP.get(result.name) || 'unknown', result.name];
        const mcpName = parts[0];
        const toolName = parts[1] || result.name;

        // Find the tool - it should be stored with prefixed name
        const prefixedToolName = `${mcpName}:${toolName}`;
        const fullTool = this.allTools.find(t =>
          (t.name === prefixedToolName || t.name === toolName) && t.mcpName === mcpName
        );
        return {
          toolName: fullTool?.name || prefixedToolName, // Return the stored (prefixed) name
          mcpName,
          confidence: result.confidence,
          description: detailed ? fullTool?.description : undefined,
          schema: detailed ? this.getToolSchema(mcpName, toolName) : undefined
        };
      });

      // HEALTH FILTERING: Remove tools from disabled MCPs
      const healthyResults = parsedResults.filter(result => {
        return this.healthMonitor.getHealthyMCPs([result.mcpName]).length > 0;
      });

      // SORT by confidence (highest first) after our scoring adjustments
      const sortedResults = healthyResults.sort((a, b) => b.confidence - a.confidence);

      // Return up to the original limit after filtering and sorting
      const finalResults = sortedResults.slice(0, limit);

      if (healthyResults.length < parsedResults.length) {
        logger.debug(`Health filtering: ${parsedResults.length - healthyResults.length} tools filtered out from disabled MCPs`);
      }

      return finalResults;

    } catch (error: any) {
      logger.error(`Vector search failed: ${error.message}`);

      // Fallback to healthy tools only
      const healthyTools = this.allTools.filter(tool => this.healthMonitor.getHealthyMCPs([tool.mcpName]).length > 0);
      return healthyTools.slice(0, limit).map(tool => {
        // Extract actual tool name from prefixed format for schema lookup
        const actualToolName = tool.name.includes(':') ? tool.name.split(':', 2)[1] : tool.name;
        return {
          toolName: tool.name, // Return prefixed name
          mcpName: tool.mcpName,
          confidence: 0.5,
          description: detailed ? tool.description : undefined,
          schema: detailed ? this.getToolSchema(tool.mcpName, actualToolName) : undefined
        };
      });
    }
  }

  async run(toolName: string, parameters: any): Promise<ExecutionResult> {
    // Parse tool format: "mcp:tool" or just "tool"
    let mcpName: string;
    let actualToolName: string;

    if (toolName.includes(':')) {
      [mcpName, actualToolName] = toolName.split(':', 2);
    } else {
      actualToolName = toolName;
      mcpName = this.toolToMCP.get(toolName) || '';
    }

    if (!mcpName) {
      const similarTools = this.findSimilarTools(toolName);
      let errorMessage = `Tool '${toolName}' not found.`;

      if (similarTools.length > 0) {
        errorMessage += ` Did you mean: ${similarTools.join(', ')}?`;
      }

      errorMessage += ` Use 'ncp find "${toolName}"' to search for similar tools or 'ncp find --depth 0' to list all available tools.`;

      return {
        success: false,
        error: errorMessage
      };
    }

    const definition = this.definitions.get(mcpName);
    if (!definition) {
      const availableMcps = Array.from(this.definitions.keys()).join(', ');
      return {
        success: false,
        error: `MCP '${mcpName}' not found. Available MCPs: ${availableMcps}. Use 'ncp find' to discover tools or check your profile configuration.`
      };
    }

    try {
      // Get or create pooled connection
      const connection = await this.getOrCreateConnection(mcpName);

      // Validate parameters before execution
      const validationError = this.validateToolParameters(mcpName, actualToolName, parameters);
      if (validationError) {
        return {
          success: false,
          error: validationError
        };
      }

      // Execute tool with filtered output to suppress MCP server console messages
      const result = await withFilteredOutput(async () => {
        return await connection.client.callTool({
          name: actualToolName,
          arguments: parameters
        });
      });

      // Mark MCP as healthy on successful execution
      this.healthMonitor.markHealthy(mcpName);

      return {
        success: true,
        content: result.content
      };

    } catch (error: any) {
      logger.error(`Tool execution failed for ${toolName}:`, error);

      // Mark MCP as unhealthy on execution failure
      this.healthMonitor.markUnhealthy(mcpName, error.message);

      return {
        success: false,
        error: this.enhanceErrorMessage(error, actualToolName, mcpName)
      };
    }
  }

  private async getOrCreateConnection(mcpName: string): Promise<MCPConnection> {
    // Return existing connection if available
    const existing = this.connections.get(mcpName);
    if (existing) {
      existing.lastUsed = Date.now();
      existing.executionCount++;
      return existing;
    }

    const definition = this.definitions.get(mcpName);
    if (!definition) {
      const availableMcps = Array.from(this.definitions.keys()).join(', ');
      throw new Error(`MCP '${mcpName}' not found. Available MCPs: ${availableMcps}. Use 'ncp find' to discover tools or check your profile configuration.`);
    }

    logger.info(`🔌 Connecting to ${mcpName} (for execution)...`);
    const connectStart = Date.now();

    try {
      // Create wrapper command that redirects output to logs
      const wrappedCommand = mcpWrapper.createWrapper(
        mcpName,
        definition.config.command,
        definition.config.args || []
      );

      // Add environment variables
      const silentEnv = {
        ...process.env,
        ...(definition.config.env || {}),
        // These may still help some servers
        MCP_SILENT: 'true',
        QUIET: 'true',
        NO_COLOR: 'true'
      };

      const transport = new StdioClientTransport({
        command: wrappedCommand.command,
        args: wrappedCommand.args,
        env: silentEnv as Record<string, string>
      });

      const client = new Client(
        { name: 'ncp-oss', version: '1.0.0' },
        { capabilities: {} }
      );

      // Connect with timeout and filtered output
      await withFilteredOutput(async () => {
        await Promise.race([
          client.connect(transport),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), this.CONNECTION_TIMEOUT)
          )
        ]);
      });

      // Capture server info after successful connection
      const serverInfo = client.getServerVersion();

      const connection: MCPConnection = {
        client,
        transport,
        tools: [], // Will be populated if needed
        serverInfo: serverInfo ? {
          name: serverInfo.name || mcpName,
          title: serverInfo.title,
          version: serverInfo.version || 'unknown',
          description: serverInfo.title || serverInfo.name || undefined,
          websiteUrl: serverInfo.websiteUrl
        } : undefined,
        lastUsed: Date.now(),
        connectTime: Date.now() - connectStart,
        executionCount: 1
      };

      // Store connection for reuse
      this.connections.set(mcpName, connection);
      logger.info(`✅ Connected to ${mcpName} in ${connection.connectTime}ms`);

      return connection;
    } catch (error: any) {
      logger.error(`❌ Failed to connect to ${mcpName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * New optimized cache loading with profile hash validation
   * This is the key optimization - skips re-indexing when profile hasn't changed
   */
  private async loadFromOptimizedCache(profile: Profile): Promise<boolean> {
    try {
      // 1. Validate cache integrity first
      const integrity = await this.cachePatcher.validateAndRepairCache();
      if (!integrity.valid) {
        logger.warn('Cache integrity check failed - rebuilding required');
        return false;
      }

      // 2. Check if cache is valid using profile hash validation
      const currentProfileHash = this.cachePatcher.generateProfileHash(profile);
      const cacheIsValid = await this.cachePatcher.validateCacheWithProfile(currentProfileHash);

      if (!cacheIsValid) {
        logger.info('Cache invalid or missing - profile changed');
        return false;
      }

      // 3. Load tool metadata cache directly
      const toolMetadataCache = await this.cachePatcher.loadToolMetadataCache();

      if (!toolMetadataCache.mcps || Object.keys(toolMetadataCache.mcps).length === 0) {
        logger.info('Tool metadata cache empty');
        return false;
      }

      logger.info(`✅ Using valid cache (${Object.keys(toolMetadataCache.mcps).length} MCPs, hash: ${currentProfileHash.substring(0, 8)}...)`);

      // 4. Load MCPs and tools from cache directly (no re-indexing)
      this.allTools = [];
      let loadedMCPCount = 0;
      let loadedToolCount = 0;

      for (const [mcpName, mcpData] of Object.entries(toolMetadataCache.mcps)) {
        try {
          // Validate MCP data structure
          if (!mcpData.tools || !Array.isArray(mcpData.tools)) {
            logger.warn(`Skipping ${mcpName}: invalid tools data in cache`);
            continue;
          }

          // Check if MCP still exists in current profile
          if (!profile.mcpServers[mcpName]) {
            logger.debug(`Skipping ${mcpName}: removed from profile`);
            continue;
          }

          this.definitions.set(mcpName, {
            name: mcpName,
            config: {
              name: mcpName,
              ...profile.mcpServers[mcpName]
            },
            tools: mcpData.tools.map(tool => ({
              ...tool,
              inputSchema: tool.inputSchema || {}
            })),
            serverInfo: mcpData.serverInfo || { name: mcpName, version: '1.0.0' }
          });

          // Build allTools array and tool mappings
          const discoveryTools = [];
          for (const tool of mcpData.tools) {
            try {
              const prefixedToolName = `${mcpName}:${tool.name}`;
              const prefixedDescription = tool.description.startsWith(`${mcpName}:`)
                ? tool.description
                : `${mcpName}: ${tool.description || 'No description available'}`;

              this.allTools.push({
                name: prefixedToolName,
                description: prefixedDescription,
                mcpName: mcpName
              });

              // Create tool mappings
              this.toolToMCP.set(tool.name, mcpName);
              this.toolToMCP.set(prefixedToolName, mcpName);

              discoveryTools.push({
                id: prefixedToolName,
                name: tool.name,
                description: prefixedDescription,
                mcpServer: mcpName,
                inputSchema: tool.inputSchema || {}
              });

              loadedToolCount++;
            } catch (toolError: any) {
              logger.warn(`Error loading tool ${tool.name} from ${mcpName}: ${toolError.message}`);
            }
          }

          // Use fast indexing (load from embeddings cache, don't regenerate)
          if (discoveryTools.length > 0) {
            // Ensure discovery engine is fully initialized before indexing
            await this.discovery.initialize();
            await this.discovery.indexMCPToolsFromCache(mcpName, discoveryTools);
            loadedMCPCount++;
          }

        } catch (mcpError: any) {
          logger.warn(`Error loading MCP ${mcpName} from cache: ${mcpError.message}`);
        }
      }

      if (loadedMCPCount === 0) {
        logger.warn('No valid MCPs loaded from cache');
        return false;
      }

      logger.info(`⚡ Loaded ${loadedToolCount} tools from ${loadedMCPCount} MCPs (optimized cache)`);
      return true;

    } catch (error: any) {
      logger.warn(`Optimized cache load failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Legacy cache loading (kept for fallback)
   */
  private async loadFromCache(profile: Profile): Promise<boolean> {
    try {
      const cacheDir = getCacheDirectory();
      const cachePath = join(cacheDir, `${this.profileName}-tools.json`);

      if (!existsSync(cachePath)) {
        return false;
      }

      const content = readFileSync(cachePath, 'utf-8');
      const cache = JSON.parse(content);

      // Use cache if less than 24 hours old
      if (Date.now() - cache.timestamp > 24 * 60 * 60 * 1000) {
        logger.info('Cache expired, will refresh tools');
        return false;
      }

      logger.info(`Using cached tools (${Object.keys(cache.mcps).length} MCPs)`)

      // Load MCPs and tools from cache
      for (const [mcpName, mcpData] of Object.entries(cache.mcps)) {
        const data = mcpData as any;

        this.definitions.set(mcpName, {
          name: mcpName,
          config: {
            name: mcpName,
            ...profile.mcpServers[mcpName]
          },
          tools: data.tools || [],
          serverInfo: data.serverInfo
        });

        // Add tools to allTools and create mappings
        const discoveryTools = [];
        for (const tool of data.tools || []) {
          // Handle both old (unprefixed) and new (prefixed) formats in cache
          const isAlreadyPrefixed = tool.name.startsWith(`${mcpName}:`);
          const prefixedToolName = isAlreadyPrefixed ? tool.name : `${mcpName}:${tool.name}`;
          const actualToolName = isAlreadyPrefixed ? tool.name.substring(mcpName.length + 1) : tool.name;

          // Ensure description is prefixed
          const hasPrefixedDesc = tool.description?.startsWith(`${mcpName}: `);
          const prefixedDescription = hasPrefixedDesc ? tool.description : `${mcpName}: ${tool.description || 'No description available'}`;

          this.allTools.push({
            name: prefixedToolName,
            description: prefixedDescription,
            mcpName: mcpName
          });

          // Map both formats for backward compatibility
          this.toolToMCP.set(actualToolName, mcpName);
          this.toolToMCP.set(prefixedToolName, mcpName);

          // Prepare for discovery engine indexing
          // Pass unprefixed name - RAG engine will add the prefix
          discoveryTools.push({
            id: prefixedToolName,
            name: actualToolName,  // Use unprefixed name here
            description: prefixedDescription,
            mcpServer: mcpName,
            inputSchema: {}
          });
        }

        // Index tools with discovery engine
        await this.discovery.indexMCPTools(mcpName, discoveryTools);
      }

      logger.info(`✅ Loaded ${this.allTools.length} tools from cache`);
      return true;

    } catch (error: any) {
      logger.warn(`Cache load failed: ${error.message}`);
      return false;
    }
  }

  private async saveToCache(profile: Profile): Promise<void> {
    try {
      // Use new optimized cache saving with profile hash
      await this.saveToOptimizedCache(profile);

    } catch (error: any) {
      logger.warn(`Cache save failed: ${error.message}`);
    }
  }

  /**
   * New optimized cache saving with profile hash and structured format
   */
  private async saveToOptimizedCache(profile: Profile): Promise<void> {
    try {
      logger.info('💾 Saving tools to optimized cache...');

      // Save all MCP definitions to tool metadata cache
      for (const [mcpName, definition] of this.definitions.entries()) {
        const mcpConfig = profile.mcpServers[mcpName];
        if (mcpConfig) {
          await this.cachePatcher.patchAddMCP(
            mcpName,
            mcpConfig,
            definition.tools,
            definition.serverInfo
          );
        }
      }

      // Update profile hash
      const profileHash = this.cachePatcher.generateProfileHash(profile);
      await this.cachePatcher.updateProfileHash(profileHash);

      logger.info(`💾 Saved ${this.allTools.length} tools to optimized cache with profile hash: ${profileHash.substring(0, 8)}...`);

    } catch (error: any) {
      logger.error(`Optimized cache save failed: ${error.message}`);
      throw error;
    }
  }

  private getToolSchema(mcpName: string, toolName: string): any {
    const connection = this.connections.get(mcpName);
    if (!connection) {
      // No persistent connection, try to get schema from definitions
      const definition = this.definitions.get(mcpName);
      if (!definition) return undefined;

      const tool = definition.tools.find(t => t.name === toolName);
      return tool ? (tool as any).inputSchema : undefined;
    }

    const tool = connection.tools.find(t => t.name === toolName);
    if (!tool) return undefined;

    return (tool as any).inputSchema;
  }

  /**
   * Check if a tool requires parameters
   */
  toolRequiresParameters(toolIdentifier: string): boolean {
    const [mcpName, toolName] = toolIdentifier.split(':');
    if (!mcpName || !toolName) return false;

    const schema = this.getToolSchema(mcpName, toolName);
    return ToolSchemaParser.hasRequiredParameters(schema);
  }

  /**
   * Get tool parameters for interactive prompting
   */
  getToolParameters(toolIdentifier: string): ParameterInfo[] {
    const [mcpName, toolName] = toolIdentifier.split(':');
    if (!mcpName || !toolName) return [];

    const schema = this.getToolSchema(mcpName, toolName);
    return ToolSchemaParser.parseParameters(schema);
  }

  /**
   * Validate tool parameters before execution
   */
  private validateToolParameters(mcpName: string, toolName: string, parameters: any): string | null {
    const schema = this.getToolSchema(mcpName, toolName);
    if (!schema) {
      // No schema available, allow execution (tool may not require validation)
      return null;
    }

    const requiredParams = ToolSchemaParser.getRequiredParameters(schema);
    const missingParams: string[] = [];

    // Check for missing required parameters
    for (const param of requiredParams) {
      if (parameters === null || parameters === undefined || !(param.name in parameters) || parameters[param.name] === null || parameters[param.name] === undefined || parameters[param.name] === '') {
        missingParams.push(param.name);
      }
    }

    if (missingParams.length > 0) {
      return `Missing required parameters: ${missingParams.join(', ')}. Use 'ncp find "${mcpName}:${toolName}" --depth 2' to see parameter details.`;
    }

    return null; // Validation passed
  }

  /**
   * Get tool context for parameter prediction
   */
  getToolContext(toolIdentifier: string): string {
    return ToolContextResolver.getContext(toolIdentifier);
  }

  /**
   * Find similar tool names using fuzzy matching
   */
  private findSimilarTools(targetTool: string, maxSuggestions: number = 3): string[] {
    const allTools = Array.from(this.toolToMCP.keys());
    const similarities = allTools.map(tool => ({
      tool,
      similarity: calculateSimilarity(targetTool, tool)
    }));

    return similarities
      .filter(item => item.similarity > 0.4) // Only suggest if reasonably similar
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxSuggestions)
      .map(item => item.tool);
  }

  /**
   * Generate hash for each MCP configuration
   */
  private generateConfigHashes(profile: Profile): Record<string, string> {
    const hashes: Record<string, string> = {};
    const crypto = require('crypto');

    for (const [mcpName, config] of Object.entries(profile.mcpServers)) {
      // Hash command + args + env for change detection
      const configString = JSON.stringify({
        command: config.command,
        args: config.args || [],
        env: config.env || {}
      });

      hashes[mcpName] = crypto.createHash('sha256').update(configString).digest('hex');
    }

    return hashes;
  }

  /**
   * Get current indexing progress
   */
  getIndexingProgress(): { current: number; total: number; currentMCP: string; estimatedTimeRemaining?: number } | null {
    return this.indexingProgress;
  }

  /**
   * Get MCP health status summary
   */
  getMCPHealthStatus(): { total: number; healthy: number; unhealthy: number; mcps: Array<{name: string; healthy: boolean}> } {
    const allMCPs = Array.from(this.definitions.keys());
    const healthyMCPs = this.healthMonitor.getHealthyMCPs(allMCPs);

    const mcpStatus = allMCPs.map(mcp => ({
      name: mcp,
      healthy: healthyMCPs.includes(mcp)
    }));

    return {
      total: allMCPs.length,
      healthy: healthyMCPs.length,
      unhealthy: allMCPs.length - healthyMCPs.length,
      mcps: mcpStatus
    };
  }

  /**
   * Enhance generic error messages with better context
   */
  private enhanceErrorMessage(error: any, toolName: string, mcpName: string): string {
    const errorMessage = error.message || error.toString() || 'Unknown error';

    // Always provide context and actionable guidance, regardless of specific error patterns
    let enhancedMessage = `Tool '${toolName}' failed in MCP '${mcpName}': ${errorMessage}`;

    // Add generic troubleshooting guidance
    const troubleshootingTips = [
      `• Check MCP '${mcpName}' status and configuration`,
      `• Use 'ncp find "${mcpName}:${toolName}" --depth 2' to verify tool parameters`,
      `• Ensure MCP server is running and accessible`
    ];

    enhancedMessage += `\n\nTroubleshooting:\n${troubleshootingTips.join('\n')}`;

    return enhancedMessage;
  }

  /**
   * Get all resources from active MCPs
   */
  async getAllResources(): Promise<Array<any>> {
    const resources: Array<any> = [];
    const allMCPs = Array.from(this.definitions.keys());
    const healthyMCPs = this.healthMonitor.getHealthyMCPs(allMCPs);

    for (const mcpName of healthyMCPs) {
      try {
        const mcpResources = await this.getResourcesFromMCP(mcpName);
        if (mcpResources && Array.isArray(mcpResources)) {
          // Add MCP source information to each resource with prefix
          const enrichedResources = mcpResources.map(resource => ({
            ...resource,
            name: `${mcpName}:${resource.name}`, // Add MCP prefix
            _source: mcpName
          }));
          resources.push(...enrichedResources);
        }
      } catch (error) {
        logger.warn(`Failed to get resources from ${mcpName}: ${error}`);
      }
    }

    return resources;
  }

  /**
   * Get all prompts from active MCPs
   */
  async getAllPrompts(): Promise<Array<any>> {
    const prompts: Array<any> = [];
    const allMCPs = Array.from(this.definitions.keys());
    const healthyMCPs = this.healthMonitor.getHealthyMCPs(allMCPs);

    for (const mcpName of healthyMCPs) {
      try {
        const mcpPrompts = await this.getPromptsFromMCP(mcpName);
        if (mcpPrompts && Array.isArray(mcpPrompts)) {
          // Add MCP source information to each prompt with prefix
          const enrichedPrompts = mcpPrompts.map(prompt => ({
            ...prompt,
            name: `${mcpName}:${prompt.name}`, // Add MCP prefix
            _source: mcpName
          }));
          prompts.push(...enrichedPrompts);
        }
      } catch (error) {
        logger.warn(`Failed to get prompts from ${mcpName}: ${error}`);
      }
    }

    return prompts;
  }

  /**
   * Get resources from a specific MCP
   */
  private async getResourcesFromMCP(mcpName: string): Promise<Array<any>> {
    try {
      const definition = this.definitions.get(mcpName);
      if (!definition) {
        return [];
      }

      // Create temporary connection for resources request
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

      const silentEnv = {
        ...process.env,
        ...(definition.config.env || {}),
        MCP_SILENT: 'true',
        QUIET: 'true',
        NO_COLOR: 'true'
      };

      const transport = new StdioClientTransport({
        command: definition.config.command,
        args: definition.config.args || [],
        env: silentEnv as Record<string, string>
      });

      const client = new Client(
        { name: 'ncp-oss-resources', version: '1.0.0' },
        { capabilities: {} }
      );

      // Connect with timeout and filtered output
      await withFilteredOutput(async () => {
        await Promise.race([
          client.connect(transport),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Resources connection timeout')), this.QUICK_PROBE_TIMEOUT)
          )
        ]);
      });

      // Get resources list with filtered output
      const response = await withFilteredOutput(async () => {
        return await client.listResources();
      });
      await client.close();

      return response.resources || [];

    } catch (error) {
      logger.debug(`Resources probe failed for ${mcpName}: ${error}`);
      return [];
    }
  }

  /**
   * Get prompts from a specific MCP
   */
  private async getPromptsFromMCP(mcpName: string): Promise<Array<any>> {
    try {
      const definition = this.definitions.get(mcpName);
      if (!definition) {
        return [];
      }

      // Create temporary connection for prompts request
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

      const silentEnv = {
        ...process.env,
        ...(definition.config.env || {}),
        MCP_SILENT: 'true',
        QUIET: 'true',
        NO_COLOR: 'true'
      };

      const transport = new StdioClientTransport({
        command: definition.config.command,
        args: definition.config.args || [],
        env: silentEnv as Record<string, string>
      });

      const client = new Client(
        { name: 'ncp-oss-prompts', version: '1.0.0' },
        { capabilities: {} }
      );

      // Connect with timeout and filtered output
      await withFilteredOutput(async () => {
        await Promise.race([
          client.connect(transport),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Prompts connection timeout')), this.QUICK_PROBE_TIMEOUT)
          )
        ]);
      });

      // Get prompts list with filtered output
      const response = await withFilteredOutput(async () => {
        return await client.listPrompts();
      });
      await client.close();

      return response.prompts || [];

    } catch (error) {
      logger.debug(`Prompts probe failed for ${mcpName}: ${error}`);
      return [];
    }
  }

  /**
   * Clean up idle connections (like commercial version)
   */
  private async cleanupIdleConnections(): Promise<void> {
    const now = Date.now();
    const toDisconnect: string[] = [];

    for (const [name, connection] of this.connections) {
      const idleTime = now - connection.lastUsed;

      if (idleTime > this.IDLE_TIMEOUT) {
        logger.info(`🧹 Disconnecting idle MCP: ${name} (idle for ${Math.round(idleTime / 1000)}s)`);
        toDisconnect.push(name);
      }
    }

    // Disconnect idle connections
    for (const name of toDisconnect) {
      await this.disconnectMCP(name);
    }
  }

  /**
   * Disconnect a specific MCP
   */
  private async disconnectMCP(mcpName: string): Promise<void> {
    const connection = this.connections.get(mcpName);
    if (!connection) return;

    try {
      await connection.client.close();
      this.connections.delete(mcpName);
      logger.debug(`Disconnected ${mcpName}`);
    } catch (error) {
      logger.error(`Error disconnecting ${mcpName}:`, error);
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Shutting down NCP Orchestrator...');

    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Close any active connections
    for (const connection of this.connections.values()) {
      try {
        await connection.client.close();
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    this.connections.clear();
    logger.info('NCP orchestrator cleanup completed');
  }

  /**
   * Get server descriptions for all configured MCPs
   */
  getServerDescriptions(): Record<string, string> {
    const descriptions: Record<string, string> = {};

    // From active connections
    for (const [mcpName, connection] of this.connections) {
      if (connection.serverInfo?.description) {
        descriptions[mcpName] = connection.serverInfo.description;
      } else if (connection.serverInfo?.title) {
        descriptions[mcpName] = connection.serverInfo.title;
      }
    }

    // From cached definitions
    for (const [mcpName, definition] of this.definitions) {
      if (!descriptions[mcpName] && definition.serverInfo?.description) {
        descriptions[mcpName] = definition.serverInfo.description;
      } else if (!descriptions[mcpName] && definition.serverInfo?.title) {
        descriptions[mcpName] = definition.serverInfo.title;
      }
    }

    return descriptions;
  }

  /**
   * Apply universal term frequency scoring boost with action word weighting
   * Uses SearchEnhancer for clean, extensible term classification and semantic mapping
   */
  private adjustScoresUniversally(query: string, results: any[]): any[] {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2); // Skip very short terms

    return results.map(result => {
      const toolName = result.name.toLowerCase();
      const toolDescription = (result.description || '').toLowerCase();

      let nameBoost = 0;
      let descBoost = 0;

      // Process each query term with SearchEnhancer classification
      for (const term of queryTerms) {
        const termType = SearchEnhancer.classifyTerm(term);
        const weight = SearchEnhancer.getTypeWeights(termType);

        // Apply scoring based on term type
        if (toolName.includes(term)) {
          nameBoost += weight.name;
        }
        if (toolDescription.includes(term)) {
          descBoost += weight.desc;
        }

        // Apply semantic action matching for ACTION terms
        if (termType === 'ACTION') {
          const semantics = SearchEnhancer.getActionSemantics(term);
          for (const semanticMatch of semantics) {
            if (toolName.includes(semanticMatch)) {
              nameBoost += weight.name * 1.2; // 120% of full action weight for semantic matches (boosted)
            }
            if (toolDescription.includes(semanticMatch)) {
              descBoost += weight.desc * 1.2;
            }
          }

          // Apply intent penalties for conflicting actions
          const penalty = SearchEnhancer.getIntentPenalty(term, toolName);
          nameBoost -= penalty;
        }
      }

      // Apply diminishing returns to prevent excessive stacking
      const baseWeight = 0.15; // Base weight for diminishing returns calculation
      const finalNameBoost = nameBoost > 0 ? nameBoost * Math.pow(0.8, Math.max(0, nameBoost / baseWeight - 1)) : 0;
      const finalDescBoost = descBoost > 0 ? descBoost * Math.pow(0.8, Math.max(0, descBoost / (baseWeight / 2) - 1)) : 0;

      const totalBoost = 1 + finalNameBoost + finalDescBoost;

      return {
        ...result,
        confidence: result.confidence * totalBoost
      };
    });
  }

  /**
   * Hash a string for change detection
   */
  private hashString(str: string): string {
    return createHash('sha256').update(str).digest('hex');
  }
}

export default NCPOrchestrator;