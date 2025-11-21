/**
 * Code-Mode Executor - TypeScript code execution with tool access
 * Based on official UTCP Code-Mode implementation pattern
 */

import { createContext, runInContext } from 'vm';
import { logger } from '../utils/logger.js';

export interface ToolDefinition {
  name: string; // Format: "namespace:tool" or "namespace.tool"
  description: string;
  inputSchema: any;
}

export interface PhotonInstance {
  name: string;
  instance: any; // The actual Photon class instance
  methods: string[]; // Available method names
}

export interface CodeExecutionResult {
  result: any;
  logs: string[];
  error?: string;
}

export class CodeExecutor {
  private toolExecutor: (toolName: string, params: any) => Promise<any>;
  private toolsProvider: () => Promise<ToolDefinition[]>;
  private photonInstancesProvider?: () => Promise<PhotonInstance[]>;

  constructor(
    toolsProvider: () => Promise<ToolDefinition[]>,
    toolExecutor: (toolName: string, params: any) => Promise<any>,
    photonInstancesProvider?: () => Promise<PhotonInstance[]>
  ) {
    this.toolsProvider = toolsProvider;
    this.toolExecutor = toolExecutor;
    this.photonInstancesProvider = photonInstancesProvider;
  }

  /**
   * Execute TypeScript code with tool access
   */
  async executeCode(code: string, timeout: number = 30000): Promise<CodeExecutionResult> {
    const logs: string[] = [];

    try {
      // Get all available tools
      const tools = await this.toolsProvider();

      logger.info(`🔍 Executing code with ${tools.length} tools available`);

      // Create execution context
      const context = await this.createExecutionContext(tools, logs);
      const vmContext = createContext(context);

      // Wrap code in async function
      const wrappedCode = `(async () => { ${code} })()`;

      // Execute with timeout
      const result = await this.runWithTimeout(wrappedCode, vmContext, timeout);

      return { result, logs };
    } catch (error: any) {
      logger.error(`Code execution failed: ${error.message}`);
      return {
        result: null,
        logs: [...logs, `[ERROR] ${error.message}`],
        error: error.message
      };
    }
  }

  /**
   * Create VM execution context with tools organized by namespace
   * Based on official UTCP pattern
   */
  private async createExecutionContext(
    tools: ToolDefinition[],
    logs: string[]
  ): Promise<Record<string, any>> {
    // Create console for log capture
    const consoleObj = {
      log: (...args: any[]) => {
        logs.push(args.map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' '));
      },
      error: (...args: any[]) => {
        logs.push('[ERROR] ' + args.map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' '));
      },
      warn: (...args: any[]) => {
        logs.push('[WARN] ' + args.map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' '));
      },
      info: (...args: any[]) => {
        logs.push('[INFO] ' + args.map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' '));
      }
    };

    const context: Record<string, any> = {
      // Basic utilities
      console: consoleObj,
      JSON,
      Promise,
      Array,
      Object,
      String,
      Number,
      Boolean,
      Math,
      Date,
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,

      // Introspection
      __interfaces: this.generateTypeScriptInterfaces(tools),
      __getToolInterface: (toolName: string) => {
        const tool = tools.find(t => t.name === toolName || t.name.replace(':', '.') === toolName);
        return tool ? this.toolToTypeScriptInterface(tool) : null;
      }
    };

    // Organize tools by namespace
    // Format: "namespace:tool" → namespace.tool()
    for (const tool of tools) {
      // Convert "namespace:tool" to ["namespace", "tool"]
      const parts = tool.name.includes(':') ? tool.name.split(':') : tool.name.split('.');

      if (parts.length >= 2) {
        const namespaceName = this.sanitizeIdentifier(parts[0]);
        const toolName = this.sanitizeIdentifier(parts.slice(1).join('_'));

        // Create namespace object if it doesn't exist
        if (!context[namespaceName]) {
          context[namespaceName] = {};
        }

        // Add tool function to namespace
        context[namespaceName][toolName] = async (args?: Record<string, any>) => {
          try {
            return await this.toolExecutor(tool.name, args || {});
          } catch (error: any) {
            throw new Error(`Error calling ${tool.name}: ${error.message}`);
          }
        };
      } else {
        // No namespace - add directly to context
        const sanitizedName = this.sanitizeIdentifier(tool.name);
        context[sanitizedName] = async (args?: Record<string, any>) => {
          try {
            return await this.toolExecutor(tool.name, args || {});
          } catch (error: any) {
            throw new Error(`Error calling ${tool.name}: ${error.message}`);
          }
        };
      }
    }

    // Add direct Photon instance access (zero MCP overhead)
    if (this.photonInstancesProvider) {
      const photons = await this.photonInstancesProvider();

      for (const photon of photons) {
        const photonNamespace = this.sanitizeIdentifier(photon.name);

        // Create namespace object if it doesn't exist
        if (!context[photonNamespace]) {
          context[photonNamespace] = {};
        }

        // Expose each method as a direct call to the instance
        for (const methodName of photon.methods) {
          const sanitizedMethodName = this.sanitizeIdentifier(methodName);

          context[photonNamespace][sanitizedMethodName] = async (params?: any) => {
            try {
              const method = photon.instance[methodName];
              if (!method || typeof method !== 'function') {
                throw new Error(`Method ${methodName} not found on ${photon.name}`);
              }

              // Call method directly on instance (zero overhead!)
              return await method.call(photon.instance, params);
            } catch (error: any) {
              throw new Error(`Error calling ${photon.name}.${methodName}: ${error.message}`);
            }
          };
        }

        logger.info(`📦 Added direct Photon access: ${photonNamespace} with ${photon.methods.length} methods`);
      }
    }

    logger.info(`📦 Context created with namespaces: ${Object.keys(context).filter(k => typeof context[k] === 'object' && !k.startsWith('__')).join(', ')}`);

    // Special handling for ncp.find() to accept string directly
    // Allows: ncp.find("query") or ncp.find("q1 | q2 | q3") instead of ncp.find({ description: "..." })
    if (context['ncp'] && context['ncp']['find']) {
      const originalFind = context['ncp']['find'];
      context['ncp']['find'] = async (arg?: string | Record<string, any>) => {
        // If arg is a string, convert to object format
        if (typeof arg === 'string') {
          return originalFind({ description: arg });
        }
        // Otherwise pass through as-is
        return originalFind(arg);
      };
    }


    return context;
  }

  /**
   * Execute code with timeout
   */
  private async runWithTimeout(
    code: string,
    context: any,
    timeout: number
  ): Promise<any> {
    return await Promise.race([
      runInContext(code, context, { timeout }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Execution timeout')), timeout)
      )
    ]);
  }

  /**
   * Generate TypeScript interface definitions for all tools
   */
  private generateTypeScriptInterfaces(tools: ToolDefinition[]): string {
    const namespaces: Record<string, string[]> = {};

    for (const tool of tools) {
      const parts = tool.name.includes(':') ? tool.name.split(':') : tool.name.split('.');

      if (parts.length >= 2) {
        const ns = parts[0];
        const toolDef = this.toolToTypeScriptInterface(tool);
        if (!namespaces[ns]) {
          namespaces[ns] = [];
        }
        namespaces[ns].push(toolDef);
      }
    }

    let interfaces = '// Available tool namespaces:\n\n';
    for (const [ns, tools] of Object.entries(namespaces)) {
      interfaces += `namespace ${ns} {\n`;
      tools.forEach(tool => {
        interfaces += `  ${tool}\n`;
      });
      interfaces += `}\n\n`;
    }

    return interfaces;
  }

  /**
   * Convert tool to TypeScript function signature
   */
  private toolToTypeScriptInterface(tool: ToolDefinition): string {
    const parts = tool.name.includes(':') ? tool.name.split(':') : tool.name.split('.');
    const toolName = parts.length >= 2 ? this.sanitizeIdentifier(parts.slice(1).join('_')) : this.sanitizeIdentifier(tool.name);

    const params = tool.inputSchema?.properties
      ? `{ ${Object.keys(tool.inputSchema.properties).join(', ')} }`
      : 'any';

    return `${toolName}(params?: ${params}): Promise<any>; // ${tool.description}`;
  }

  /**
   * Sanitize identifier for valid TypeScript
   */
  private sanitizeIdentifier(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }
}
