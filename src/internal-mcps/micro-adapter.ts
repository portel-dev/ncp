/**
 * Photon Adapter
 *
 * Adapts Photon classes to the InternalMCP interface
 * Handles schema extraction and tool registration
 */

import { InternalMCP, InternalTool, InternalToolResult } from './types.js';
import { Photon } from './base-photon.js';
import { SchemaExtractor } from './schema-extractor.js';
import { logger } from '../utils/logger.js';
import * as path from 'path';

/**
 * Adapter that converts Photon instances to InternalMCP interface
 */
export class PhotonAdapter implements InternalMCP {
  public readonly name: string;
  public readonly description: string;
  public tools: InternalTool[];

  private instance: Photon;
  private mcpClass: typeof Photon;
  private sourceFilePath?: string;

  private constructor(
    mcpClass: typeof Photon,
    instance: Photon,
    sourceFilePath?: string
  ) {
    this.mcpClass = mcpClass;
    this.instance = instance;
    this.sourceFilePath = sourceFilePath;

    // Get MCP name from class (handle both Photon subclasses and plain classes)
    this.name = this.getMCPName(mcpClass);

    // Get description from class JSDoc or use default
    this.description = this.extractClassDescription() || `${this.name} Photon (built-in)`;

    // Tools will be initialized asynchronously
    this.tools = [];
  }

  /**
   * Get MCP name from class (supports both Photon subclasses and plain classes)
   */
  private getMCPName(mcpClass: any): string {
    // Try to use Photon's method if available
    if (typeof mcpClass.getMCPName === 'function') {
      return mcpClass.getMCPName();
    }

    // Fallback: implement convention for plain classes
    // Convert PascalCase to kebab-case (e.g., MyAwesomeMCP → my-awesome-mcp)
    return mcpClass.name
      .replace(/MCP$/, '') // Remove "MCP" suffix if present
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, ''); // Remove leading dash
  }

  /**
   * Create and initialize a PhotonAdapter
   */
  static async create(
    mcpClass: typeof Photon,
    instance: Photon,
    sourceFilePath?: string
  ): Promise<PhotonAdapter> {
    const adapter = new PhotonAdapter(mcpClass, instance, sourceFilePath);
    await adapter.initializeTools();
    return adapter;
  }

  /**
   * Get tool methods from class (supports both Photon subclasses and plain classes)
   */
  private getToolMethods(mcpClass: any): string[] {
    // Try to use Photon's method if available
    if (typeof mcpClass.getToolMethods === 'function') {
      return mcpClass.getToolMethods();
    }

    // Fallback: implement convention for plain classes
    const prototype = mcpClass.prototype;
    const methods: string[] = [];

    Object.getOwnPropertyNames(prototype).forEach((name) => {
      // Skip constructor, private methods (starting with _), and lifecycle hooks
      if (
        name !== 'constructor' &&
        !name.startsWith('_') &&
        name !== 'onInitialize' &&
        name !== 'onShutdown' &&
        typeof prototype[name] === 'function'
      ) {
        methods.push(name);
      }
    });

    return methods;
  }

  /**
   * Initialize tools from class methods
   */
  private async initializeTools(): Promise<void> {
    const methodNames = this.getToolMethods(this.mcpClass);

    // If source file available, extract schemas from source code
    if (this.sourceFilePath) {
      await this.extractSchemasFromSource(methodNames);
    } else {
      // Fallback: create basic tools without detailed schemas
      this.createBasicTools(methodNames);
    }
  }

  /**
   * Extract schemas from .schema.json or TypeScript source code
   */
  private async extractSchemasFromSource(methodNames: string[]) {
    if (!this.sourceFilePath) return;

    try {
      let schemas: any[] = [];

      // First, try loading from pre-generated .schema.json file
      // This is used in packaged DXT where .ts files aren't included
      const schemaJsonPath = this.sourceFilePath.replace(/\.ts$/, '.schema.json');
      try {
        const fs = await import('fs/promises');
        const schemaContent = await fs.readFile(schemaJsonPath, 'utf-8');
        schemas = JSON.parse(schemaContent);
        logger.debug(`Loaded ${schemas.length} schemas from ${path.basename(schemaJsonPath)}`);
      } catch (jsonError: any) {
        // .schema.json doesn't exist, try extracting from .ts source
        if (jsonError.code === 'ENOENT') {
          logger.debug(`No .schema.json file found, trying .ts source`);
          const extractor = new SchemaExtractor();
          schemas = await extractor.extractFromFile(this.sourceFilePath);
          logger.debug(`Extracted ${schemas.length} schemas from ${path.basename(this.sourceFilePath)}`);
        } else {
          throw jsonError;
        }
      }

      // If no schemas found, use basic tools fallback
      if (schemas.length === 0) {
        logger.debug(`No schemas available for ${path.basename(this.sourceFilePath)}, using basic tools`);
        this.createBasicTools(methodNames);
        return;
      }

      // Create tools from schemas
      for (const schema of schemas) {
        if (methodNames.includes(schema.name)) {
          this.tools.push({
            name: schema.name,
            description: schema.description,
            inputSchema: schema.inputSchema,
          });
        }
      }

      logger.debug(`Created ${this.tools.length} tools with schemas`);
    } catch (error: any) {
      logger.warn(`Failed to load schemas: ${error.message}. Using basic tools.`);
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
   * Execute a tool (supports both Photon subclasses and plain classes)
   */
  async executeTool(toolName: string, parameters: any): Promise<InternalToolResult> {
    try {
      let result: any;

      // Check if instance has Photon's executeTool method
      if (typeof this.instance.executeTool === 'function') {
        result = await this.instance.executeTool(toolName, parameters);
      } else {
        // Plain class - call method directly
        const method = (this.instance as any)[toolName];

        if (!method || typeof method !== 'function') {
          throw new Error(`Tool not found: ${toolName}`);
        }

        result = await method.call(this.instance, parameters);
      }

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
