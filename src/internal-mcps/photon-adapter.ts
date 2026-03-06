/**
 * Photon Adapter
 *
 * Adapts Photon classes to the InternalMCP interface
 * Handles schema extraction and tool registration
 */

import { InternalMCP, InternalTool, InternalToolResult, SettingsSchema, NotificationSubscription } from './types.js';
import {
  PhotonMCP,
  SchemaExtractor,
  executeGenerator,
  isAsyncGenerator,
  isAsyncGeneratorFunction,
  isAskYield,
  isEmitYield,
  type PhotonYield,
  type AskYield,
  type EmitYield,
  type InputProvider,
  type OutputHandler,
} from '@portel/photon-core';
import type { MCPClientFactory } from './mcp-client-factory.js';
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
  private mcpClientFactory?: MCPClientFactory;

  /**
   * Settings schema from Photon's `protected settings = {...}` declaration
   * Extracted via photon-core's extractAllFromSource
   */
  public readonly settingsSchema?: SettingsSchema;

  /**
   * Notification subscriptions from Photon's @notify-on JSDoc tag
   */
  public readonly notificationSubscriptions?: NotificationSubscription;

  /**
   * Resolved settings instance - stores user-provided values
   * Prevents re-elicitation on every tool call
   */
  private resolvedSettings?: Record<string, any>;

  private constructor(
    mcpClass: typeof PhotonMCP,
    instance: PhotonMCP,
    sourceFilePath?: string,
    mcpClientFactory?: MCPClientFactory,
    settingsSchema?: SettingsSchema,
    notificationSubscriptions?: NotificationSubscription
  ) {
    this.mcpClass = mcpClass;
    this.instance = instance;
    this.sourceFilePath = sourceFilePath;
    this.mcpClientFactory = mcpClientFactory;
    this.settingsSchema = settingsSchema;
    this.notificationSubscriptions = notificationSubscriptions;

    // Get MCP name from class (handle both Photon subclasses and plain classes)
    this.name = this.getMCPName(mcpClass);

    this.description = `${this.name} Photon (built-in)`;

    // Tools will be initialized asynchronously
    this.tools = [];

    // Inject MCP client factory if instance supports it
    this.injectMCPFactory();
  }

  /**
   * Inject MCP client factory into the Photon instance
   * Enables this.mcp('name') calls within Photons
   */
  private injectMCPFactory(): void {
    if (!this.mcpClientFactory) {
      return;
    }

    // Check if instance has setMCPFactory method (PhotonMCP subclass)
    if (typeof (this.instance as any).setMCPFactory === 'function') {
      (this.instance as any).setMCPFactory(this.mcpClientFactory);
      logger.debug(`Injected MCP factory into ${this.name}`);
    }
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
   *
   * @param mcpClass The Photon class
   * @param instance Instance of the Photon class
   * @param sourceFilePath Path to the source file (for schema extraction)
   * @param mcpClientFactory Optional MCP client factory for enabling this.mcp() calls
   * @param settingsSchema Optional settings schema from photon-core
   * @param notificationSubscriptions Optional notification subscriptions from photon-core
   */
  static async create(
    mcpClass: typeof PhotonMCP,
    instance: PhotonMCP,
    sourceFilePath?: string,
    mcpClientFactory?: MCPClientFactory,
    settingsSchema?: SettingsSchema,
    notificationSubscriptions?: NotificationSubscription
  ): Promise<PhotonAdapter> {
    const adapter = new PhotonAdapter(
      mcpClass,
      instance,
      sourceFilePath,
      mcpClientFactory,
      settingsSchema,
      notificationSubscriptions
    );
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
    const conventionMethods = new Set([
      'constructor',
      'onInitialize',
      'onShutdown',
      'configure',
      'getConfig',
    ]);

    Object.getOwnPropertyNames(prototype).forEach((name) => {
      // Skip private methods (starting with _) and convention methods
      if (
        !name.startsWith('_') &&
        !conventionMethods.has(name) &&
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
   * Uses extractAllFromSource to get full metadata including settings and notifications
   */
  private async extractSchemasFromSource(methodNames: string[]) {
    if (!this.sourceFilePath) return;

    try {
      let metadata: any = null;

      // First, try loading from pre-generated .schema.json file (contains full metadata)
      // This is used in packaged DXT where .ts files aren't included
      const schemaJsonPath = this.sourceFilePath.replace(/\.ts$/, '.photon.schema.json').replace(/\.js$/, '.photon.schema.json');
      try {
        const fs = await import('fs/promises');
        const schemaContent = await fs.readFile(schemaJsonPath, 'utf-8');
        const parsed = JSON.parse(schemaContent);
        // The pre-generated schema is already the full metadata structure
        metadata = parsed;
        logger.debug(`Loaded metadata from ${path.basename(schemaJsonPath)}`);
      } catch (jsonError: any) {
        // .schema.json doesn't exist, try extracting from .ts source
        if (jsonError.code === 'ENOENT') {
          logger.debug(`No .schema.json file found, trying .ts source`);
          const extractor = new SchemaExtractor();
          metadata = await extractor.extractAllFromSource(this.sourceFilePath);
          logger.debug(`Extracted metadata from ${path.basename(this.sourceFilePath)}`);
        } else {
          throw jsonError;
        }
      }

      // If no metadata found, use basic tools fallback
      if (!metadata || !metadata.tools || metadata.tools.length === 0) {
        logger.debug(`No schemas available for ${path.basename(this.sourceFilePath)}, using basic tools`);
        this.createBasicTools(methodNames);
        return;
      }

      // Create tools from schemas, including middleware metadata
      for (const schema of metadata.tools) {
        if (methodNames.includes(schema.name)) {
          this.tools.push({
            name: schema.name,
            description: schema.description,
            inputSchema: schema.inputSchema,
            // Preserve middleware metadata for client visibility
            middleware: schema.middleware,
          });
        }
      }

      // Store settings schema if present (allows settings elicitation)
      if (metadata.settingsSchema) {
        (this as any).settingsSchema = metadata.settingsSchema;
        logger.debug(`Found settings schema with ${Object.keys(metadata.settingsSchema.properties || {}).length} properties`);
      }

      // Store notification subscriptions if present
      if (metadata.notificationSubscriptions) {
        (this as any).notificationSubscriptions = metadata.notificationSubscriptions;
        logger.debug(`Found notification subscriptions for ${metadata.notificationSubscriptions.watchFor.length} events`);
      }

      logger.debug(`Created ${this.tools.length} tools with metadata (${this.tools.filter(t => t.middleware).length} with middleware)`);
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
   * Set the elicitation server for generator input prompts and settings elicitation
   */
  setElicitationServer(server: ElicitationServer): void {
    this.elicitationServer = server;
  }

  /**
   * Elicit required settings from user if not already resolved
   * Returns resolved settings to be injected into Photon instance
   */
  private async elicitRequiredSettings(): Promise<Record<string, any> | null> {
    // Already elicited, don't prompt again
    if (this.resolvedSettings) {
      return this.resolvedSettings;
    }

    // No settings schema, nothing to elicit
    if (!this.settingsSchema) {
      return null;
    }

    const required = this.settingsSchema.required || [];
    if (required.length === 0) {
      return null;
    }

    // No elicitation server, can't prompt user
    if (!this.elicitationServer) {
      logger.warn(`Settings required for ${this.name} but no elicitation server available`);
      return null;
    }

    try {
      const result = await this.elicitationServer.elicitInput({
        message: `Configure settings for ${this.name}`,
        requestedSchema: {
          type: 'object',
          properties: this.settingsSchema.properties,
          required,
        },
      });

      if (result.action !== 'accept' || !result.content) {
        logger.warn(`User declined or cancelled settings elicitation for ${this.name}`);
        return null;
      }

      // Cache resolved settings for subsequent tool calls
      this.resolvedSettings = result.content;
      logger.debug(`Resolved settings for ${this.name}: ${Object.keys(result.content).join(', ')}`);
      return result.content;
    } catch (error: any) {
      logger.error(`Failed to elicit settings for ${this.name}: ${error.message}`);
      return null;
    }
  }

  /**
   * Inject resolved settings into Photon instance
   */
  private injectSettings(settings: Record<string, any>): void {
    if (!settings || Object.keys(settings).length === 0) {
      return;
    }

    // Try to set settings on instance if it has a settings property
    if (typeof (this.instance as any).settings === 'object') {
      Object.assign((this.instance as any).settings, settings);
      logger.debug(`Injected settings into ${this.name} instance`);
    }
  }

  /**
   * Create input provider for generator ask yields using MCP elicitation
   * Supports the new ask/emit pattern from photon-core 1.2.0
   */
  private createInputProvider(): InputProvider {
    return async (ask: AskYield): Promise<any> => {
      // If no elicitation server, throw error with yield info
      if (!this.elicitationServer) {
        throw new Error(`Interactive input required but no elicitation server available: ${ask.message}`);
      }

      // Handle different ask types via MCP elicitation
      switch (ask.ask) {
        case 'text':
        case 'password': {
          const result = await this.elicitationServer.elicitInput({
            message: ask.message,
            requestedSchema: {
              type: 'object',
              properties: {
                value: {
                  type: 'string',
                  description: ask.message,
                  default: 'default' in ask ? ask.default : undefined,
                }
              },
              required: ask.required !== false ? ['value'] : []
            }
          });

          if (result.action !== 'accept') {
            throw new Error(`User ${result.action} input request`);
          }
          return result.content?.value ?? ('default' in ask ? ask.default : null);
        }

        case 'confirm': {
          const result = await this.elicitationServer.elicitInput({
            message: ask.message,
            requestedSchema: {
              type: 'object',
              properties: {
                confirmed: {
                  type: 'boolean',
                  description: ask.message,
                }
              },
              required: ['confirmed']
            }
          });

          if (result.action !== 'accept') {
            return false;
          }
          return result.content?.confirmed ?? ('default' in ask ? ask.default : false);
        }

        case 'select': {
          const options = ask.options || [];
          const values = options.map((o: any) => typeof o === 'string' ? o : o.value);

          const result = await this.elicitationServer.elicitInput({
            message: ask.message,
            requestedSchema: {
              type: 'object',
              properties: {
                selection: ask.multi ? {
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
          return result.content?.selection ?? ('default' in ask ? ask.default : undefined);
        }

        case 'number': {
          const result = await this.elicitationServer.elicitInput({
            message: ask.message,
            requestedSchema: {
              type: 'object',
              properties: {
                value: {
                  type: 'number',
                  description: ask.message,
                  minimum: ask.min,
                  maximum: ask.max,
                  default: ask.default,
                }
              },
              required: ask.required !== false ? ['value'] : []
            }
          });

          if (result.action !== 'accept') {
            throw new Error(`User ${result.action} input request`);
          }
          return result.content?.value ?? ask.default ?? 0;
        }

        case 'date': {
          const result = await this.elicitationServer.elicitInput({
            message: ask.message,
            requestedSchema: {
              type: 'object',
              properties: {
                value: {
                  type: 'string',
                  format: 'date-time',
                  description: ask.message,
                  default: ask.default,
                }
              },
              required: ask.required !== false ? ['value'] : []
            }
          });

          if (result.action !== 'accept') {
            throw new Error(`User ${result.action} input request`);
          }
          return result.content?.value ?? ask.default ?? new Date().toISOString();
        }

        case 'file': {
          // File input is not well supported via MCP elicitation
          // Return null and log a warning
          logger.warn(`File input not supported via MCP elicitation: ${ask.message}`);
          return null;
        }

        default:
          logger.warn(`Unknown ask type: ${(ask as any).ask}`);
          return undefined;
      }
    };
  }

  /**
   * Create output handler for generator emit yields
   * Logs progress, status, and other output types
   */
  private createOutputHandler(toolName: string): OutputHandler {
    return (emit: EmitYield) => {
      switch (emit.emit) {
        case 'progress':
          logger.debug(`[${toolName}] Progress: ${Math.round(emit.value * 100)}%${emit.message ? ` - ${emit.message}` : ''}`);
          break;
        case 'status':
          logger.info(`[${toolName}] ${emit.message}`);
          break;
        case 'log': {
          const level = emit.level || 'info';
          const logFn = (logger as any)[level];
          if (typeof logFn === 'function') {
            logFn(`[${toolName}] ${emit.message}`);
          } else {
            logger.info(`[${toolName}] ${emit.message}`);
          }
          break;
        }
        case 'toast':
          logger.info(`[${toolName}] Toast: ${emit.message} (${emit.type || 'info'})`);
          break;
        case 'thinking':
          logger.debug(`[${toolName}] Thinking: ${emit.active ? 'started' : 'stopped'}`);
          break;
        case 'stream':
          // For streaming data, just log that we received it
          logger.debug(`[${toolName}] Stream chunk received${emit.final ? ' (final)' : ''}`);
          break;
        case 'artifact':
          logger.info(`[${toolName}] Artifact: ${emit.title || emit.type}`);
          break;
      }
    };
  }

  /**
   * Execute a tool (supports both Photon subclasses, plain classes, and generators)
   * Automatically elicits and injects required settings before execution
   */
  async executeTool(toolName: string, parameters: any): Promise<InternalToolResult> {
    try {
      // Elicit required settings if not already done
      const settings = await this.elicitRequiredSettings();
      if (settings) {
        this.injectSettings(settings);
      }

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
          outputHandler: this.createOutputHandler(toolName)
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
            outputHandler: this.createOutputHandler(toolName)
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
