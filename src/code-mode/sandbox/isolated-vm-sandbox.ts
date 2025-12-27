/**
 * Isolated VM Sandbox - True V8 Isolate Isolation
 *
 * Uses isolated-vm to create a completely separate V8 isolate:
 * - No shared memory with main process
 * - True memory limits enforced by V8
 * - Same technology as Cloudflare Workers
 * - Cannot access Node.js APIs by design
 *
 * This is the most secure sandbox option available in Node.js.
 */

import ivm from 'isolated-vm';
import { logger } from '../../utils/logger.js';

/**
 * Tool definition for the sandbox
 */
export interface IsolatedVMTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * Result of code execution
 */
export interface IsolatedVMExecutionResult {
  result: unknown;
  logs: string[];
  error?: string;
  duration: number;
}

/**
 * Configuration for the isolated-vm sandbox
 */
export interface IsolatedVMSandboxConfig {
  /** Maximum execution time in milliseconds (default: 30000) */
  timeout: number;
  /** Maximum memory in MB (default: 128) */
  memoryLimit: number;
  /** Inspector support for debugging (default: false) */
  inspector: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: IsolatedVMSandboxConfig = {
  timeout: 30000,
  memoryLimit: 128,
  inspector: false,
};

/**
 * Isolated VM Sandbox implementation using isolated-vm
 *
 * Security properties:
 * - Completely separate V8 isolate (no shared memory)
 * - Memory limits enforced at V8 level
 * - No access to Node.js APIs
 * - No access to file system, network, or process
 * - Tool calls go through explicit callbacks
 */
export class IsolatedVMSandbox {
  private config: IsolatedVMSandboxConfig;
  private isolate: ivm.Isolate | null = null;

  constructor(config?: Partial<IsolatedVMSandboxConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute code in isolated V8 context
   *
   * @param code - Code to execute
   * @param tools - Available tools
   * @param toolExecutor - Function to execute tool calls
   * @returns Execution result
   */
  async execute(
    code: string,
    tools: IsolatedVMTool[],
    toolExecutor: (toolName: string, params: unknown) => Promise<unknown>
  ): Promise<IsolatedVMExecutionResult> {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      // Create isolated V8 isolate with memory limit
      this.isolate = new ivm.Isolate({
        memoryLimit: this.config.memoryLimit,
        inspector: this.config.inspector,
      });

      // Create a new context within the isolate
      const context = await this.isolate.createContext();

      // Get the global object (jail) in the context
      const jail = context.global;

      // Set up basic globals
      await jail.set('global', jail.derefInto());

      // Create log capture
      await this.setupLogging(context, jail, logs);

      // Create tool callback system
      await this.setupToolCallbacks(context, jail, tools, toolExecutor);

      // Set up basic utilities (JSON is built into V8)
      await this.setupUtilities(jail);

      // Compile and run the code
      const wrappedCode = this.wrapCode(code, tools);

      const script = await this.isolate.compileScript(wrappedCode, {
        filename: 'user-code.js',
      });

      // Run with timeout
      const resultRef = await script.run(context, {
        timeout: this.config.timeout,
        promise: true, // Allow async code
      });

      // Copy result out of isolate
      const result = typeof resultRef === 'object' && resultRef !== null
        ? await (resultRef as ivm.Reference<unknown>).copy()
        : resultRef;

      const duration = Date.now() - startTime;

      return {
        result,
        logs,
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      // Handle specific isolated-vm errors
      let errorMessage = error.message || String(error);

      if (errorMessage.includes('Isolate was disposed')) {
        errorMessage = 'Execution terminated (memory limit exceeded)';
      } else if (errorMessage.includes('Script execution timed out')) {
        errorMessage = `Execution timeout after ${this.config.timeout}ms`;
      }

      return {
        result: null,
        logs,
        error: errorMessage,
        duration,
      };
    } finally {
      // Always dispose the isolate to free memory
      this.dispose();
    }
  }

  /**
   * Set up logging in the isolated context
   */
  private async setupLogging(
    context: ivm.Context,
    jail: ivm.Reference<Record<string, unknown>>,
    logs: string[]
  ): Promise<void> {
    // Create log callback that runs in main thread
    const logCallback = new ivm.Callback((...args: unknown[]) => {
      const message = args
        .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
        .join(' ');
      logs.push(message);
    });

    const errorCallback = new ivm.Callback((...args: unknown[]) => {
      const message =
        '[ERROR] ' +
        args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
      logs.push(message);
    });

    const warnCallback = new ivm.Callback((...args: unknown[]) => {
      const message =
        '[WARN] ' +
        args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
      logs.push(message);
    });

    // Inject console object
    await context.evalClosure(
      `
      global.console = {
        log: (...args) => $0.apply(undefined, args, { arguments: { copy: true } }),
        error: (...args) => $1.apply(undefined, args, { arguments: { copy: true } }),
        warn: (...args) => $2.apply(undefined, args, { arguments: { copy: true } }),
        info: (...args) => $0.apply(undefined, args, { arguments: { copy: true } }),
      };
    `,
      [logCallback, errorCallback, warnCallback],
      { arguments: { reference: true } }
    );
  }

  /**
   * Set up tool callbacks in the isolated context
   */
  private async setupToolCallbacks(
    context: ivm.Context,
    jail: ivm.Reference<Record<string, unknown>>,
    tools: IsolatedVMTool[],
    toolExecutor: (toolName: string, params: unknown) => Promise<unknown>
  ): Promise<void> {
    // Create a callback that executes tools in the main thread
    const executeToolCallback = new ivm.Callback(
      async (toolName: string, paramsJson: string): Promise<string> => {
        try {
          const params = paramsJson ? JSON.parse(paramsJson) : {};
          const result = await toolExecutor(toolName, params);
          return JSON.stringify({ success: true, result });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message || String(error),
          });
        }
      }
    );

    // Store tool metadata for namespace creation
    const toolsJson = JSON.stringify(
      tools.map((t) => ({
        name: t.name,
        description: t.description,
      }))
    );

    // Inject tool system
    await context.evalClosure(
      `
      const __executeTool = $0;
      const __tools = JSON.parse($1);

      // Create namespaces from tools
      for (const tool of __tools) {
        const parts = tool.name.includes(':') ? tool.name.split(':') : tool.name.split('.');
        const namespace = parts[0].replace(/[^a-zA-Z0-9_$]/g, '_');
        const methodName = parts.slice(1).join('_').replace(/[^a-zA-Z0-9_$]/g, '_') || 'call';

        if (!global[namespace]) {
          global[namespace] = {};
        }

        // Create async function that calls back to main thread
        global[namespace][methodName] = async (params) => {
          const paramsJson = params ? JSON.stringify(params) : '{}';
          const resultJson = await __executeTool.apply(
            undefined,
            [tool.name, paramsJson],
            { arguments: { copy: true }, result: { promise: true, copy: true } }
          );
          const parsed = JSON.parse(resultJson);
          if (!parsed.success) {
            throw new Error(parsed.error);
          }
          return parsed.result;
        };
      }
    `,
      [executeToolCallback, toolsJson],
      { arguments: { reference: true } }
    );
  }

  /**
   * Set up basic utilities in the isolated context
   */
  private async setupUtilities(jail: ivm.Reference<Record<string, unknown>>): Promise<void> {
    // JSON, Promise, Array, Object, etc. are already available in V8
    // We just need to ensure they're accessible

    // No additional setup needed - V8 provides all standard JavaScript built-ins
    // The key security property is what we DON'T provide:
    // - No require/import
    // - No process
    // - No fs, child_process, net, etc.
    // - No eval (we control code compilation)
    // - No Function constructor access to outside scope
  }

  /**
   * Wrap user code in async IIFE
   */
  private wrapCode(code: string, tools: IsolatedVMTool[]): string {
    return `
      (async () => {
        try {
          ${code}
        } catch (e) {
          console.error('Execution error:', e.message || e);
          throw e;
        }
      })()
    `;
  }

  /**
   * Dispose of the isolate and free memory
   */
  dispose(): void {
    if (this.isolate) {
      try {
        this.isolate.dispose();
      } catch (e) {
        // Ignore disposal errors
      }
      this.isolate = null;
    }
  }

  /**
   * Check if the sandbox is available (isolated-vm is installed)
   */
  static isAvailable(): boolean {
    if (process.env.NCP_DISABLE_ISOLATED_VM === 'true') {
      logger.warn('isolated-vm sandbox disabled via NCP_DISABLE_ISOLATED_VM');
      return false;
    }

    try {
      // Try to create a minimal isolate to verify the module works
      const testIsolate = new ivm.Isolate({ memoryLimit: 8 });
      testIsolate.dispose();
      return true;
    } catch (e) {
      logger.warn(`isolated-vm unavailable: ${(e as Error)?.message ?? e}`);
      return false;
    }
  }

  /**
   * Get memory usage of the current isolate
   */
  getHeapStatistics(): ivm.HeapStatistics | null {
    if (!this.isolate) return null;

    try {
      return this.isolate.getHeapStatisticsSync();
    } catch (e) {
      return null;
    }
  }
}

/**
 * Create an isolated-vm sandbox instance
 */
export function createIsolatedVMSandbox(
  config?: Partial<IsolatedVMSandboxConfig>
): IsolatedVMSandbox {
  return new IsolatedVMSandbox(config);
}
