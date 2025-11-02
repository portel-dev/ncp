/**
 * MicroMCP Base Class for Internal MCPs
 *
 * Just extend this class and define public methods - they automatically become tools!
 * NCP handles the MCP protocol (find/run), so we just need the class structure.
 *
 * Usage:
 * ```typescript
 * class Calculator extends MicroMCP {
 *   // Method name becomes tool name
 *   // JSDoc becomes tool description
 *   // TypeScript types become schema
 *
 *   /**
 *    * Add two numbers together
 *    * @param a First number
 *    * @param b Second number
 *    *\/
 *   async add(params: { a: number; b: number }) {
 *     return params.a + params.b;
 *   }
 *
 *   /**
 *    * Multiply two numbers
 *    *\/
 *   async multiply(params: { a: number; b: number }) {
 *     return params.a * params.b;
 *   }
 * }
 * ```
 *
 * The class name "Calculator" becomes the MCP name
 * Methods "add" and "multiply" become tools
 */

import { logger } from '../utils/logger.js';

/**
 * Simple base class for creating internal MCPs
 *
 * - Class name = MCP name
 * - Public methods = Tools
 * - Return value = Tool result
 */
export class MicroMCP {
  /**
   * Get MCP name from class name
   * Converts PascalCase to kebab-case (e.g., MyAwesomeMCP → my-awesome-mcp)
   */
  static getMCPName(): string {
    return this.name
      .replace(/MCP$/, '') // Remove "MCP" suffix if present
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, ''); // Remove leading dash
  }

  /**
   * Get all tool methods from this class
   * Returns all public async methods except lifecycle hooks
   */
  static getToolMethods(): string[] {
    const prototype = this.prototype;
    const methods: string[] = [];

    // Get all property names from prototype chain
    let current = prototype;
    while (current && current !== MicroMCP.prototype) {
      Object.getOwnPropertyNames(current).forEach((name) => {
        // Skip constructor, private methods (starting with _), and lifecycle hooks
        if (
          name !== 'constructor' &&
          !name.startsWith('_') &&
          name !== 'onInitialize' &&
          name !== 'onShutdown' &&
          typeof (prototype as any)[name] === 'function' &&
          !methods.includes(name)
        ) {
          methods.push(name);
        }
      });
      current = Object.getPrototypeOf(current);
    }

    return methods;
  }

  /**
   * Execute a tool method
   */
  async executeTool(toolName: string, parameters: any): Promise<any> {
    const method = (this as any)[toolName];

    if (!method || typeof method !== 'function') {
      throw new Error(`Tool not found: ${toolName}`);
    }

    try {
      const result = await method.call(this, parameters);
      return result;
    } catch (error: any) {
      logger.error(`Tool execution failed: ${toolName} - ${error.message}`);
      throw error;
    }
  }

  /**
   * Optional lifecycle hooks
   */
  async onInitialize?(): Promise<void>;
  async onShutdown?(): Promise<void>;
}
