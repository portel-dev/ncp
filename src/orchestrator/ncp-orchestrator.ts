/**
 * NCP Orchestrator - Real MCP Connections
 * Based on commercial NCP implementation
 */

import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { DiscoveryEngine } from '../discovery/engine.js';
import { MCPHealthMonitor } from '../utils/health-monitor.js';
import { mcpWrapper } from '../utils/mcp-wrapper.js';

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
    args: string[];
    env?: Record<string, string>;
  }>;
  metadata?: any;
}

interface MCPConnection {
  client: Client;
  transport: StdioClientTransport;
  tools: Array<{name: string; description: string}>;
  lastUsed: number;
  connectTime: number;
  executionCount: number;
}

interface MCPDefinition {
  name: string;
  config: MCPConfig;
  tools: Array<{name: string; description: string}>;
}

export class NCPOrchestrator {
  private definitions: Map<string, MCPDefinition> = new Map();
  private connections: Map<string, MCPConnection> = new Map();
  private toolToMCP: Map<string, string> = new Map();
  private allTools: Array<{ name: string; description: string; mcpName: string }> = [];
  private profileName: string;
  private readonly QUICK_PROBE_TIMEOUT = 5000;
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

  private loadProfile(): Profile | null {
    const profilesDir = join(homedir(), '.ncp', 'profiles');
    const profilePath = join(profilesDir, `${this.profileName}.json`);

    if (!existsSync(profilePath)) {
      logger.error(`Profile not found: ${profilePath}`);
      return null;
    }

    try {
      const profileData = readFileSync(profilePath, 'utf8');
      return JSON.parse(profileData) as Profile;
    } catch (error: any) {
      logger.error(`Failed to load profile: ${error.message}`);
      return null;
    }
  }

  async initialize(): Promise<void> {
    const startTime = Date.now();
    logger.info(`Initializing NCP orchestrator with profile: ${this.profileName}`);

    const profile = this.loadProfile();
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
        const tools = await this.probeMCPTools(config);

        // Store definition
        this.definitions.set(config.name, {
          name: config.name,
          config,
          tools
        });

        // Add to all tools and create mappings
        const discoveryTools = [];
        for (const tool of tools) {
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
          discoveryTools.push({
            id: prefixedToolName,
            name: prefixedToolName,
            description: prefixedDescription,
            mcpServer: config.name,
            inputSchema: {}
          });
        }

        // Index tools with discovery engine for vector search
        await this.discovery.indexMCPTools(config.name, discoveryTools);

        logger.info(`Discovered ${tools.length} tools from ${config.name}`);
      } catch (error: any) {
        logger.error(`Failed to discover tools from ${config.name}: ${error.message}`);
      }
    }
  }

  // Based on commercial NCP's probeMCPTools method
  private async probeMCPTools(config: MCPConfig): Promise<Array<{name: string; description: string}>> {
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

      // Connect with timeout
      await Promise.race([
        client.connect(transport),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Probe timeout')), this.QUICK_PROBE_TIMEOUT)
        )
      ]);

      // Get tool list
      const response = await client.listTools();
      const tools = response.tools.map(t => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema
      }));

      // Disconnect immediately
      await client.close();

      return tools;

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

      // Parse and filter results
      const parsedResults = vectorResults.map(result => {
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

      // Return up to the original limit after filtering
      const finalResults = healthyResults.slice(0, limit);

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
        error: `Unknown tool: ${toolName}. Use find() to discover available tools.`
      };
    }

    const definition = this.definitions.get(mcpName);
    if (!definition) {
      return {
        success: false,
        error: `MCP ${mcpName} not configured.`
      };
    }

    try {
      // Get or create pooled connection
      const connection = await this.getOrCreateConnection(mcpName);

      const result = await connection.client.callTool({
        name: actualToolName,
        arguments: parameters
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
      throw new Error(`MCP '${mcpName}' not configured.`);
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

      // Connect with timeout
      await Promise.race([
        client.connect(transport),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), this.CONNECTION_TIMEOUT)
        )
      ]);

      const connection: MCPConnection = {
        client,
        transport,
        tools: [], // Will be populated if needed
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
          tools: data.tools || []
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
          discoveryTools.push({
            id: prefixedToolName,
            name: prefixedToolName,
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
          tools: definition.tools
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

      // Connect with timeout
      await Promise.race([
        client.connect(transport),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Resources connection timeout')), this.QUICK_PROBE_TIMEOUT)
        )
      ]);

      // Get resources list
      const response = await client.listResources();
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

      // Connect with timeout
      await Promise.race([
        client.connect(transport),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Prompts connection timeout')), this.QUICK_PROBE_TIMEOUT)
        )
      ]);

      // Get prompts list
      const response = await client.listPrompts();
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
}

export default NCPOrchestrator;