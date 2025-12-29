/**
 * Photon Adapter
 *
 * Adapts Photon classes to the InternalMCP interface
 * Handles schema extraction and tool registration
 */

import { InternalMCP, InternalTool, InternalToolResult } from './types.js';
import {
  PhotonMCP,
  SchemaExtractor,
  executeGenerator,
  isAsyncGenerator,
  isAsyncGeneratorFunction,
  isInputYield,
  type PhotonYield,
  type InputProvider,
} from '@portel/photon-core';
import { logger } from '../utils/logger.js';
import { ElicitationServer } from '../utils/elicitation-helper.js';
import * as path from 'path';

/**
 * Adapter that converts Photon instances to InternalMCP interface
 */
export class PhotonAdapter implements InternalMCP {
  public readonly name: string;
  public readonly description: string;
  public tools: InternalTool[];

  private instance: PhotonMCP;
  private mcpClass: typeof PhotonMCP;
  private sourceFilePath?: string;
  private elicitationServer?: ElicitationServer;

  private constructor(
    mcpClass: typeof PhotonMCP,
    instance: PhotonMCP,
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
    mcpClass: typeof PhotonMCP,
    instance: PhotonMCP,
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
   * Set the elicitation server for generator input prompts
   */
  setElicitationServer(server: ElicitationServer): void {
    this.elicitationServer = server;
  }

  /**
   * Create input provider for generator yields using MCP elicitation
   */
  private createInputProvider(): InputProvider {
    return async (yielded: PhotonYield): Promise<any> => {
      if (!isInputYield(yielded)) return undefined;

      // If no elicitation server, throw error with yield info
      if (!this.elicitationServer) {
        const message = 'prompt' in yielded ? yielded.prompt :
                       'confirm' in yielded ? yielded.confirm :
                       'select' in yielded ? (yielded as any).select : 'Input required';
        throw new Error(`Interactive input required but no elicitation server available: ${message}`);
      }

      // Handle different yield types via MCP elicitation
      if ('prompt' in yielded) {
        const result = await this.elicitationServer.elicitInput({
          message: yielded.prompt,
          requestedSchema: {
            type: 'object',
            properties: {
              value: {
                type: 'string',
                description: yielded.prompt,
                default: yielded.default,
              }
            },
            required: yielded.required ? ['value'] : []
          }
        });

        if (result.action !== 'accept') {
          throw new Error(`User ${result.action} input request`);
        }
        return result.content?.value ?? yielded.default ?? null;
      }

      if ('confirm' in yielded) {
        const result = await this.elicitationServer.elicitInput({
          message: yielded.confirm,
          requestedSchema: {
            type: 'object',
            properties: {
              confirmed: {
                type: 'boolean',
                description: yielded.confirm,
              }
            },
            required: ['confirmed']
          }
        });

        if (result.action !== 'accept') {
          return false;
        }
        return result.content?.confirmed ?? false;
      }

      if ('select' in yielded) {
        const options = (yielded as any).options || [];
        const values = options.map((o: any) => typeof o === 'string' ? o : o.value);

        const result = await this.elicitationServer.elicitInput({
          message: (yielded as any).select,
          requestedSchema: {
            type: 'object',
            properties: {
              selection: (yielded as any).multi ? {
                type: 'array',
                items: { type: 'string', enum: values }
              } : {
                type: 'string',
                enum: values
              }
            },
            required: ['selection']
          }
        });

        if (result.action !== 'accept') {
          throw new Error(`User ${result.action} selection`);
        }
        return result.content?.selection;
      }

      return undefined;
    };
  }

  /**
   * Execute a tool (supports both Photon subclasses, plain classes, and generators)
   */
  async executeTool(toolName: string, parameters: any): Promise<InternalToolResult> {
    try {
      let result: any;

      // Get the method
      const method = (this.instance as any)[toolName];

      if (!method || typeof method !== 'function') {
        throw new Error(`Tool not found: ${toolName}`);
      }

      // Check if method is an async generator function
      if (isAsyncGeneratorFunction(method)) {
        logger.debug(`Executing generator tool: ${toolName}`);
        const generator = method.call(this.instance, parameters) as AsyncGenerator<PhotonYield, any, any>;
        result = await executeGenerator(generator, {
          inputProvider: this.createInputProvider(),
          outputHandler: (yielded) => {
            // Log progress/stream/log yields
            if ('progress' in yielded) {
              logger.debug(`[${toolName}] Progress: ${yielded.progress}%`);
            } else if ('log' in yielded) {
              logger.debug(`[${toolName}] ${yielded.log}`);
            }
          }
        });
      }
      // Check if instance has Photon's executeTool method
      else if (typeof this.instance.executeTool === 'function') {
        result = await this.instance.executeTool(toolName, parameters);
      }
      // Plain method - call directly
      else {
        const maybeGenerator = method.call(this.instance, parameters);

        // Check if result is already an async generator
        if (isAsyncGenerator(maybeGenerator)) {
          logger.debug(`Executing returned generator for: ${toolName}`);
          result = await executeGenerator(maybeGenerator as AsyncGenerator<PhotonYield, any, any>, {
            inputProvider: this.createInputProvider(),
            outputHandler: (yielded) => {
              if ('progress' in yielded) {
                logger.debug(`[${toolName}] Progress: ${yielded.progress}%`);
              } else if ('log' in yielded) {
                logger.debug(`[${toolName}] ${yielded.log}`);
              }
            }
          });
        } else {
          result = await maybeGenerator;
        }
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
