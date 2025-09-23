/**
 * NCP Orchestrator - Real MCP Connections
 * Based on commercial NCP implementation
 */

import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
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

  constructor(profileName: string = 'default') {
    this.profileName = profileName;
    this.discovery = new DiscoveryEngine();
    this.healthMonitor = new MCPHealthMonitor();
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
    logger.info(`Initializing NCP orchestrator with profile: ${this.profileName}`);

    const profile = await this.loadProfile();
    if (!profile) {
      logger.error('Failed to load profile');
      return;
    }

    // Initialize discovery engine first
    await this.discovery.initialize();

    // Try to load from cache first
    const cacheLoaded = await this.loadFromCache(profile);

    if (!cacheLoaded) {
      // No cache - discover tools from MCPs
      logger.info('No cache found, discovering tools...');
      const mcpConfigs: MCPConfig[] = Object.entries(profile.mcpServers).map(([name, config]) => ({
        name,
        command: config.command,
        args: config.args,
        env: config.env || {}
      }));

      await this.discoverMCPTools(mcpConfigs);

      // Save to cache for next time
      await this.saveToCache(profile);
    }

    // Start cleanup timer for idle connections
    this.cleanupTimer = setInterval(
      () => this.cleanupIdleConnections(),
      this.CLEANUP_INTERVAL
    );

    const loadTime = Date.now() - startTime;
    logger.info(`🚀 NCP-OSS initialized in ${loadTime}ms with ${this.allTools.length} tools from ${this.definitions.size} MCPs`);
  }

  private async discoverMCPTools(mcpConfigs: MCPConfig[]): Promise<void> {
    this.allTools = [];

    for (const config of mcpConfigs) {
      try {
        logger.info(`Discovering tools from MCP: ${config.name}`);
        const result = await this.probeMCPTools(config);

        // Store definition
        this.definitions.set(config.name, {
          name: config.name,
          config,
          tools: result.tools,
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
            inputSchema: {}
          });
        }

        // Index tools with discovery engine for vector search
        await this.discovery.indexMCPTools(config.name, discoveryTools);

        logger.info(`Discovered ${result.tools.length} tools from ${config.name}`);
      } catch (error: any) {
        // Probe failures are expected - don't alarm users with error messages
        logger.debug(`Failed to discover tools from ${config.name}: ${error.message}`);

        // Update health monitor with the actual error for import feedback
        this.healthMonitor.markUnhealthy(config.name, error.message);
      }
    }
  }

  // Based on commercial NCP's probeMCPTools method
  private async probeMCPTools(config: MCPConfig): Promise<{
    tools: Array<{name: string; description: string}>;
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
        inputSchema: t.inputSchema
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
      return {
        success: false,
        error: `Tool '${toolName}' not found. Use 'ncp find "${toolName}"' to search for similar tools or 'ncp find --depth 0' to list all available tools.`
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
        error: error.message || 'Tool execution failed'
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

  private async loadFromCache(profile: Profile): Promise<boolean> {
    try {
      const cacheDir = join(homedir(), '.ncp', 'cache');
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
      const cacheDir = join(homedir(), '.ncp', 'cache');
      const cachePath = join(cacheDir, `${this.profileName}-tools.json`);

      // Ensure cache directory exists
      const { mkdirSync } = await import('fs');
      mkdirSync(cacheDir, { recursive: true });

      const cache = {
        timestamp: Date.now(),
        profile: this.profileName,
        mcps: {} as any
      };

      // Save all MCP definitions
      for (const [mcpName, definition] of this.definitions.entries()) {
        cache.mcps[mcpName] = {
          config: definition.config,
          tools: definition.tools,
          serverInfo: definition.serverInfo
        };
      }

      const { writeFileSync } = await import('fs');
      writeFileSync(cachePath, JSON.stringify(cache, null, 2));
      logger.info(`💾 Saved ${this.allTools.length} tools to cache`);

    } catch (error: any) {
      logger.warn(`Cache save failed: ${error.message}`);
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
   * Get tool context for parameter prediction
   */
  getToolContext(toolIdentifier: string): string {
    return ToolContextResolver.getContext(toolIdentifier);
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
}

export default NCPOrchestrator;