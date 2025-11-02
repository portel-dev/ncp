/**
 * SimpleMCP Adapter
 *
 * Adapts SimpleMCP classes to the InternalMCP interface
 * Handles schema extraction and tool registration
 */

import { InternalMCP, InternalTool, InternalToolResult } from './types.js';
import { SimpleMCP } from './base-mcp.js';
import { SchemaExtractor } from './schema-extractor.js';
import { logger } from '../utils/logger.js';
import * as path from 'path';

/**
 * Adapter that converts SimpleMCP instances to InternalMCP interface
 */
export class SimpleMCPAdapter implements InternalMCP {
  public readonly name: string;
  public readonly description: string;
  public tools: InternalTool[];

  private instance: SimpleMCP;
  private mcpClass: typeof SimpleMCP;
  private sourceFilePath?: string;

  private constructor(
    mcpClass: typeof SimpleMCP,
    instance: SimpleMCP,
    sourceFilePath?: string
  ) {
    this.mcpClass = mcpClass;
    this.instance = instance;
    this.sourceFilePath = sourceFilePath;

    // Get MCP name from class
    this.name = mcpClass.getMCPName();

    // Get description from class JSDoc or use default
    this.description = this.extractClassDescription() || `${this.name} MCP (built-in)`;

    // Tools will be initialized asynchronously
    this.tools = [];
  }

  /**
   * Create and initialize a SimpleMCPAdapter
   */
  static async create(
    mcpClass: typeof SimpleMCP,
    instance: SimpleMCP,
    sourceFilePath?: string
  ): Promise<SimpleMCPAdapter> {
    const adapter = new SimpleMCPAdapter(mcpClass, instance, sourceFilePath);
    await adapter.initializeTools();
    return adapter;
  }

  /**
   * Initialize tools from class methods
   */
  private async initializeTools(): Promise<void> {
    const methodNames = this.mcpClass.getToolMethods();

    // If source file available, extract schemas from source code
    if (this.sourceFilePath) {
      await this.extractSchemasFromSource(methodNames);
    } else {
      // Fallback: create basic tools without detailed schemas
      this.createBasicTools(methodNames);
    }
  }

  /**
   * Extract schemas from TypeScript source code
   */
  private async extractSchemasFromSource(methodNames: string[]) {
    if (!this.sourceFilePath) return;

    try {
      const extractor = new SchemaExtractor();
      const schemas = await extractor.extractFromFile(this.sourceFilePath);

      // Create tools from extracted schemas
      for (const schema of schemas) {
        if (methodNames.includes(schema.name)) {
          this.tools.push({
            name: schema.name,
            description: schema.description,
            inputSchema: schema.inputSchema,
          });
        }
      }

      logger.debug(`Extracted ${this.tools.length} tools from ${path.basename(this.sourceFilePath)}`);
    } catch (error: any) {
      logger.warn(`Failed to extract schemas from source: ${error.message}. Using basic tools.`);
      this.createBasicTools(methodNames);
    }
  }

  /**
   * Create basic tools without detailed schemas (fallback)
   */
  private createBasicTools(methodNames: string[]) {
    for (const methodName of methodNames) {
      this.tools.push({
        name: methodName,
        description: `${methodName} tool`,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      });
    }
  }

  /**
   * Extract class description from JSDoc comment
   */
  private extractClassDescription(): string | null {
    // Try to get description from class metadata if available
    // This would require decorator or other mechanism
    return null;
  }

  /**
   * Execute a tool by delegating to the SimpleMCP instance
   */
  async executeTool(toolName: string, parameters: any): Promise<InternalToolResult> {
    try {
      const result = await this.instance.executeTool(toolName, parameters);

      // Normalize result to InternalToolResult format
      if (typeof result === 'string') {
        return {
          success: true,
          content: result,
        };
      } else if (result && typeof result === 'object') {
        if ('success' in result && 'content' in result) {
          return result as InternalToolResult;
        } else {
          return {
            success: true,
            content: JSON.stringify(result, null, 2),
          };
        }
      } else {
        return {
          success: true,
          content: String(result),
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Tool execution failed',
      };
    }
  }
}
