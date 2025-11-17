/**
 * Photon Base Class
 *
 * Optional base class for creating Photons. You don't need to extend this - any class with async methods works!
 *
 * Photons are single-file TypeScript classes with pure business logic.
 * NCP converts them to MCP servers, CLI tools, and exposes them in Code-Mode.
 *
 * Usage:
 * ```typescript
 * class Calculator extends Photon {
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
 * Or without extending (plain class):
 * ```typescript
 * export default class Calculator {
 *   async add(params: { a: number; b: number }) {
 *     return params.a + params.b;
 *   }
 * }
 * ```
 *
 * Convention:
 * - Class name → MCP name (PascalCase → kebab-case)
 * - Public async methods → Tools
 * - Methods starting with _ → Private (not exposed)
 * - onInitialize() / onShutdown() → Lifecycle hooks
 */

import { logger } from '../utils/logger.js';

/**
 * Simple base class for creating Photons
 *
 * - Class name = MCP name
 * - Public async methods = Tools
 * - Return value = Tool result
 */
export class Photon {
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
    while (current && current !== Photon.prototype) {
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
