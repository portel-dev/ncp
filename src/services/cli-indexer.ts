/**
 * CLI Tool Indexer
 * Indexes CLI tools for discovery through NCP's search
 */

import { CLIParser, CLIToolInfo, CLIOperation } from './cli-parser.js';
import { CachePatcher, Tool } from '../cache/cache-patcher.js';
import { logger } from '../utils/logger.js';

export interface CLIToolConfig {
  baseCommand: string;
  description?: string;
  operations?: CLIOperation[];  // Optional pre-defined operations
}

export class CLIIndexer {
  private parser: CLIParser;
  private cachePatcher: CachePatcher;

  constructor() {
    this.parser = new CLIParser();
    this.cachePatcher = new CachePatcher();
  }

  /**
   * Index a CLI tool for discovery
   * Returns the number of operations/tools indexed
   */
  async indexCliTool(config: CLIToolConfig): Promise<number> {
    try {
      logger.info(`🔍 Indexing CLI tool: ${config.baseCommand}`);

      // Check if tool is available
      const isAvailable = await this.parser.isCliAvailable(config.baseCommand);
      if (!isAvailable) {
        throw new Error(`CLI tool not found: ${config.baseCommand}. Please install it first.`);
      }

      // Parse tool to get operations
      let toolInfo: CLIToolInfo;
      if (config.operations && config.operations.length > 0) {
        // Use pre-defined operations
        toolInfo = {
          baseCommand: config.baseCommand,
          description: config.description || `CLI tool: ${config.baseCommand}`,
          operations: config.operations
        };
      } else {
        // Parse automatically
        toolInfo = await this.parser.parseCliTool(config.baseCommand);
      }

      logger.info(`📦 Found ${toolInfo.operations.length} operations in ${config.baseCommand}`);

      // Convert operations to Tool format for cache
      const tools: Tool[] = toolInfo.operations.map(op => ({
        name: op.name,
        description: op.description,
        inputSchema: {
          type: 'object',
          properties: {
            command_template: {
              type: 'string',
              description: op.commandTemplate || `${config.baseCommand} command template`,
              default: op.commandTemplate
            },
            parameters: {
              type: 'object',
              description: 'Parameters to substitute in command template'
            }
          },
          // Include examples and keywords in schema for better discovery
          examples: op.examples || [],
          keywords: op.keywords || []
        }
      }));

      // Add to tool metadata cache
      const mcpConfig = {
        command: config.baseCommand,
        args: [],
        env: {}
      };

      const serverInfo = {
        name: config.baseCommand,
        version: toolInfo.version || '1.0.0',
        description: toolInfo.description || `CLI tool: ${config.baseCommand}`
      };

      await this.cachePatcher.patchAddMCP(
        config.baseCommand,
        mcpConfig,
        tools,
        serverInfo
      );

      logger.info(`✅ Indexed ${tools.length} tools from ${config.baseCommand}`);

      // Note: Embeddings will be generated automatically when the orchestrator
      // loads these tools from the cache during initialization

      return tools.length;

    } catch (error: any) {
      logger.error(`Failed to index CLI tool ${config.baseCommand}:`, error);
      throw error;
    }
  }

  /**
   * Remove CLI tool from index
   */
  async removeCliTool(baseCommand: string): Promise<void> {
    logger.info(`🗑️  Removing CLI tool: ${baseCommand}`);

    await this.cachePatcher.patchRemoveMCP(baseCommand);
    await this.cachePatcher.patchRemoveEmbeddings(baseCommand);

    logger.info(`✅ Removed ${baseCommand} from index`);
  }

  /**
   * Check if CLI tool is already indexed
   */
  async isIndexed(baseCommand: string): Promise<boolean> {
    const cache = await this.cachePatcher.loadToolMetadataCache();
    return baseCommand in cache.mcps;
  }

  /**
   * List all indexed CLI tools
   */
  async listIndexedCliTools(): Promise<string[]> {
    const cache = await this.cachePatcher.loadToolMetadataCache();
    const cliTools: string[] = [];

    for (const mcpName in cache.mcps) {
      const mcp = cache.mcps[mcpName];
      // CLI tools have empty args and just a command
      if (mcp.configHash && !mcp.tools.some(t => t.inputSchema?.type === 'stdin')) {
        // Simple heuristic: if it looks like a CLI tool
        cliTools.push(mcpName);
      }
    }

    return cliTools;
  }
}
