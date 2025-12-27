/**
 * Code-Mode Executor - TypeScript code execution with tool access
 * Based on official UTCP Code-Mode implementation pattern
 *
 * Execution hierarchy (most secure first):
 * 1. IsolatedVMSandbox - True V8 Isolate (same tech as Cloudflare Workers)
 * 2. SubprocessSandbox - True process isolation via child_process.spawn
 * 3. Worker Threads - V8 isolate with resource limits
 * 4. VM Module - Same-process sandbox (fallback)
 *
 * Phase 3: Bindings for credential isolation
 * Phase 4: Network isolation
 */

import { Worker } from 'worker_threads';
import { createContext, runInContext } from 'vm';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from '../utils/logger.js';
import { BindingsManager } from './bindings-manager.js';
import { NetworkPolicyManager, SECURE_NETWORK_POLICY } from './network-policy.js';
import { getAuditLogger } from './audit-logger.js';
import { CodeAnalyzer } from './validation/code-analyzer.js';
import { SemanticValidator } from './validation/semantic-validator.js';
import { SubprocessSandbox } from './sandbox/subprocess-sandbox.js';
import { IsolatedVMSandbox } from './sandbox/isolated-vm-sandbox.js';
import { createSandboxedFS, getWorkspacePath, WORKSPACE_DIR_NAME } from './sandboxed-fs.js';
import * as fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  errorDetails?: {
    originalError: any;
    pendingCalls?: {
      toolCalls: number;
      bindingCalls: number;
      networkCalls: number;
    };
  };
}

export class CodeExecutor {
  private toolExecutor: (toolName: string, params: any) => Promise<any>;
  private toolsProvider: () => Promise<ToolDefinition[]>;
  private photonInstancesProvider?: () => Promise<PhotonInstance[]>;
  private bindingsManager: BindingsManager;
  private networkPolicyManager: NetworkPolicyManager;
  private codeAnalyzer: CodeAnalyzer;
  private semanticValidator: SemanticValidator;
  private workspacePath: string;

  constructor(
    toolsProvider: () => Promise<ToolDefinition[]>,
    toolExecutor: (toolName: string, params: any) => Promise<any>,
    photonInstancesProvider?: () => Promise<PhotonInstance[]>,
    bindingsManager?: BindingsManager,
    networkPolicyManager?: NetworkPolicyManager,
    ncpDir?: string
  ) {
    this.toolsProvider = toolsProvider;
    this.toolExecutor = toolExecutor;
    this.photonInstancesProvider = photonInstancesProvider;
    this.bindingsManager = bindingsManager || new BindingsManager();
    this.networkPolicyManager = networkPolicyManager || new NetworkPolicyManager(SECURE_NETWORK_POLICY);
    this.codeAnalyzer = new CodeAnalyzer();
    this.semanticValidator = new SemanticValidator();

    // Set workspace path for sandboxed file system
    // Default to ~/.ncp/workspace if ncpDir not provided
    const baseDir = ncpDir || join(process.env.HOME || process.env.USERPROFILE || '.', '.ncp');
    this.workspacePath = getWorkspacePath(baseDir);
  }

  /**
   * Ensure workspace directory exists
   */
  async ensureWorkspace(): Promise<void> {
    try {
      await fs.mkdir(this.workspacePath, { recursive: true });
      logger.info(`📁 Workspace directory ready: ${this.workspacePath}`);
    } catch (error: any) {
      logger.warn(`Failed to create workspace: ${error.message}`);
    }
  }

  /**
   * Get the workspace path for file operations
   */
  getWorkspacePath(): string {
    return this.workspacePath;
  }

  /**
   * Update network policy manager (for runtime elicitation setup)
   * Called from orchestrator after construction to wire up elicitation function
   */
  setNetworkPolicyManager(networkPolicyManager: NetworkPolicyManager): void {
    this.networkPolicyManager = networkPolicyManager;
    logger.info('🌐 Updated NetworkPolicyManager with elicitation support');
  }

  /**
   * Execute TypeScript code with tool access
   *
   * Execution hierarchy (most secure first):
   * 1. IsolatedVMSandbox - True V8 Isolate (same tech as Cloudflare Workers)
   * 2. SubprocessSandbox - True process isolation via child_process.spawn
   * 3. Worker Threads - V8 isolate with resource limits
   * 4. VM Module - Same-process sandbox (fallback)
   *
   * Phase 5: Audit logging for security monitoring
   */
  async executeCode(code: string, timeout: number = 30000): Promise<CodeExecutionResult> {
    const startTime = Date.now();
    const auditLogger = getAuditLogger();

    // Phase 5: Log code execution start
    await auditLogger.logCodeExecutionStart(code, { mcpName: 'code-mode' });

    // Try IsolatedVMSandbox first (most secure - true V8 Isolate)
    if (IsolatedVMSandbox.isAvailable()) {
      try {
        const result = await this.executeWithIsolatedVM(code, timeout);

        // Phase 5: Log success
        const duration = Date.now() - startTime;
        await auditLogger.logCodeExecutionSuccess(code, result.result, duration, {
          mcpName: 'code-mode',
          userId: 'isolated-vm'
        });

        return result;
      } catch (isolatedVMError: any) {
        logger.warn(`IsolatedVM execution failed: ${isolatedVMError.message}, falling back to Subprocess`);
      }
    }

    // Try SubprocessSandbox (second most secure - true process isolation)
    try {
      const result = await this.executeWithSubprocess(code, timeout);

      // Phase 5: Log success
      const duration = Date.now() - startTime;
      await auditLogger.logCodeExecutionSuccess(code, result.result, duration, {
        mcpName: 'code-mode',
        userId: 'subprocess'
      });

      return result;
    } catch (subprocessError: any) {
      logger.warn(`Subprocess execution failed: ${subprocessError.message}, falling back to Worker Thread`);

      // Fallback to Worker Thread (third most secure)
      try {
        const result = await this.executeWithWorkerThread(code, timeout);

        const duration = Date.now() - startTime;
        await auditLogger.logCodeExecutionSuccess(code, result.result, duration, {
          mcpName: 'code-mode',
          userId: 'worker-fallback'
        });

        return result;
      } catch (workerError: any) {
        logger.warn(`Worker Thread execution failed: ${workerError.message}, falling back to VM`);

        // Final fallback to VM module (least secure but stable)
        try {
          const result = await this.executeWithVM(code, timeout);

          const duration = Date.now() - startTime;
          await auditLogger.logCodeExecutionSuccess(code, result.result, duration, {
            mcpName: 'code-mode',
            userId: 'vm-fallback'
          });

          return result;
        } catch (vmError: any) {
          logger.error(`[VM Execution Error Details]`, {
            message: vmError.message,
            stack: vmError.stack,
            name: vmError.name,
            code: code.substring(0, 100)
          });
          await auditLogger.logCodeExecutionError(code, vmError.message, { mcpName: 'code-mode' });
          throw vmError;
        }
      }
    }
  }

  /**
   * Execute code in IsolatedVMSandbox (most secure)
   *
   * Uses isolated-vm for true V8 Isolate separation:
   * - Completely separate V8 isolate (no shared memory at all)
   * - Same technology as Cloudflare Workers
   * - Memory limits enforced at V8 level
   * - No access to Node.js APIs by design
   * - Cannot access file system, network, or process
   *
   * Note: Bindings and network calls are currently not supported in
   * isolated-vm mode - they require the Worker Thread fallback.
   */
  private async executeWithIsolatedVM(code: string, timeout: number = 30000): Promise<CodeExecutionResult> {
    // Get all available tools
    const tools = await this.toolsProvider();

    // Extract available MCP namespaces for semantic validation
    const availableMCPs = [...new Set(
      tools.map((t) => t.name.split(':')[0] || t.name.split('.')[0])
    )];

    // Validate code using AST + semantic pipeline before execution
    await this.validateCodeWithPipeline(code, availableMCPs);

    logger.info(`🔒 Executing code in IsolatedVM with ${tools.length} tools (true V8 Isolate - Cloudflare Workers tech)`);

    // Create sandbox instance
    const sandbox = new IsolatedVMSandbox({
      timeout,
      memoryLimit: 128,
      inspector: false,
    });

    // Convert ToolDefinition[] to IsolatedVMTool[]
    const sandboxTools = tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));

    // Execute code
    const result = await sandbox.execute(code, sandboxTools, this.toolExecutor);

    // Convert to CodeExecutionResult format
    if (result.error) {
      throw new Error(result.error);
    }

    return {
      result: result.result,
      logs: result.logs,
    };
  }

  /**
   * Execute code in SubprocessSandbox (second most secure)
   *
   * Uses child_process.spawn for true process isolation:
   * - Separate V8 isolate (no shared memory)
   * - Can be killed without affecting main process
   * - Resource limits enforced by OS
   * - No prototype pollution can escape to main process
   *
   * Note: Bindings and network calls are currently not supported in subprocess
   * mode - they require the Worker Thread fallback.
   */
  private async executeWithSubprocess(code: string, timeout: number = 30000): Promise<CodeExecutionResult> {
    // Get all available tools
    const tools = await this.toolsProvider();

    // Extract available MCP namespaces for semantic validation
    const availableMCPs = [...new Set(
      tools.map((t) => t.name.split(':')[0] || t.name.split('.')[0])
    )];

    // Validate code using AST + semantic pipeline before execution
    await this.validateCodeWithPipeline(code, availableMCPs);

    logger.info(`🔒 Executing code in SubprocessSandbox with ${tools.length} tools (true process isolation)`);

    // Create sandbox instance
    const sandbox = new SubprocessSandbox({
      timeout,
      memoryLimit: 128,
      minimalEnv: true,
    });

    // Convert ToolDefinition[] to SandboxTool[]
    const sandboxTools = tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));

    // Execute code
    const result = await sandbox.execute(code, sandboxTools, this.toolExecutor);

    // Convert to CodeExecutionResult format
    if (result.error) {
      throw new Error(result.error);
    }

    return {
      result: result.result,
      logs: result.logs,
    };
  }

  /**
   * Execute code in Worker Thread with resource limits
   * Phase 2: True process isolation
   * Phase 3: Bindings for credential isolation
   * Phase 5: AST-based validation pipeline
   */
  private async executeWithWorkerThread(code: string, timeout: number = 30000): Promise<CodeExecutionResult> {
    // Get all available tools first (needed for validation)
    const tools = await this.toolsProvider();

    // Extract available MCP namespaces for semantic validation
    const availableMCPs = [...new Set(
      tools.map((t) => t.name.split(':')[0] || t.name.split('.')[0])
    )];

    // Validate code using AST + semantic pipeline before execution
    await this.validateCodeWithPipeline(code, availableMCPs);

    // Get bindings (Phase 3: credentials stay in main thread)
    const bindings = this.bindingsManager.getBindingsForWorker();

    logger.info(`🔍 Executing code in Worker Thread with ${tools.length} tools, ${bindings.length} bindings (isolated process)`);

    // Ensure workspace exists for sandboxed FS (before Promise)
    await this.ensureWorkspace();

    return new Promise((resolve, reject) => {
      const logs: string[] = [];
      let worker: Worker | null = null;

      try {
        // Create worker with resource limits
        const workerPath = join(__dirname, 'code-worker.js');

        worker = new Worker(workerPath, {
          workerData: {
            code,
            tools,
            bindings,  // Phase 3: pass bindings (no credentials!)
            workspacePath: this.workspacePath  // Sandboxed FS root
          },
          resourceLimits: {
            maxOldGenerationSizeMb: 128,  // 128MB memory limit
            maxYoungGenerationSizeMb: 32,  // 32MB for young generation
            codeRangeSizeMb: 16            // 16MB for code
          }
        });

        // Timeout handling
        const timeoutHandle = setTimeout(() => {
          if (worker) {
            worker.terminate();
            reject(new Error(`Execution timeout after ${timeout}ms`));
          }
        }, timeout);

        // Handle messages from worker
        worker.on('message', (message: { type: string; data: any }) => {
          switch (message.type) {
            case 'log':
              logs.push(message.data);
              break;

            case 'tool_call':
              // Worker needs to execute a tool
              const { id, toolName, params } = message.data;

              this.toolExecutor(toolName, params)
                .then(result => {
                  worker?.postMessage({
                    type: 'tool_response',
                    data: { id, result }
                  });
                })
                .catch(error => {
                  // Serialize error with full context including tool name for debugging
                  const serializedError = {
                    message: error?.message || String(error),
                    stack: error?.stack,
                    type: error?.constructor?.name || 'Error',
                    code: error?.code,
                    toolName  // Include tool name for debugging
                  };
                  worker?.postMessage({
                    type: 'tool_response',
                    data: { id, error: serializedError }
                  });
                });
              break;

            case 'binding_call':
              // Phase 3: Worker needs to execute a binding method
              // Credentials stay in main thread - worker never sees them!
              const { id: bindingId, bindingName, method, args } = message.data;

              this.bindingsManager.executeBinding({ bindingName, method, args })
                .then(result => {
                  worker?.postMessage({
                    type: 'binding_response',
                    data: { id: bindingId, result }
                  });
                })
                .catch(error => {
                  // Serialize error with full context
                  const serializedError = {
                    message: error?.message || String(error),
                    stack: error?.stack,
                    type: error?.constructor?.name || 'Error',
                    code: error?.code
                  };
                  worker?.postMessage({
                    type: 'binding_response',
                    data: { id: bindingId, error: serializedError }
                  });
                });
              break;

            case 'network_call':
              // Phase 4: Worker needs to make a network request
              // Phase 4.1: With runtime permission prompts (elicitations)
              const { id: networkId, url, method: httpMethod, headers, body } = message.data;

              this.networkPolicyManager.executeRequest(
                { url, method: httpMethod, headers, body },
                { mcpName: 'Worker Code' }  // Context for elicitation
              )
                .then(result => {
                  worker?.postMessage({
                    type: 'network_response',
                    data: { id: networkId, result }
                  });
                })
                .catch(error => {
                  // Serialize error with full context
                  const serializedError = {
                    message: error?.message || String(error),
                    stack: error?.stack,
                    type: error?.constructor?.name || 'Error',
                    code: error?.code,
                    statusCode: error?.statusCode
                  };
                  worker?.postMessage({
                    type: 'network_response',
                    data: { id: networkId, error: serializedError }
                  });
                });
              break;

            case 'result':
              clearTimeout(timeoutHandle);
              worker?.terminate();
              resolve({
                result: message.data.result,
                logs: message.data.logs
              });
              break;

            case 'error':
              clearTimeout(timeoutHandle);
              worker?.terminate();

              // Reconstruct error message with full context
              const errorData = message.data.error;
              let errorMessage = errorData.message || 'Unknown error';

              if (errorData.type && errorData.type !== 'Error') {
                errorMessage = `[${errorData.type}] ${errorMessage}`;
              }

              if (errorData.toolName) {
                errorMessage = `[Tool: ${errorData.toolName}] ${errorMessage}`;
              }

              resolve({
                result: null,
                logs: message.data.logs,
                error: errorMessage,
                errorDetails: {
                  originalError: errorData,
                  pendingCalls: message.data.pendingCallsInfo
                }
              });
              break;
          }
        });

        // Handle worker errors
        worker.on('error', (error) => {
          clearTimeout(timeoutHandle);
          reject(error);
        });

        // Handle worker exit
        worker.on('exit', (code) => {
          clearTimeout(timeoutHandle);

          if (code !== 0) {
            reject(new Error(`Worker stopped with exit code ${code}`));
          }
        });

      } catch (error: any) {
        if (worker) {
          worker.terminate();
        }
        reject(error);
      }
    });
  }

  /**
   * Execute code in VM context (fallback)
   * Phase 1: Basic security with frozen prototypes
   * Phase 5: AST-based validation pipeline
   */
  private async executeWithVM(code: string, timeout: number = 30000): Promise<CodeExecutionResult> {
    const logs: string[] = [];
    let context: Record<string, any> | null = null;

    try {
      // Get all available tools first (needed for validation)
      const tools = await this.toolsProvider();

      // Extract available MCP namespaces for semantic validation
      const availableMCPs = [...new Set(
        tools.map((t) => t.name.split(':')[0] || t.name.split('.')[0])
      )];

      // Validate code using AST + semantic pipeline before execution
      await this.validateCodeWithPipeline(code, availableMCPs);

      logger.info(`🔍 Executing code with ${tools.length} tools available (vm fallback)`);

      // Create execution context
      context = await this.createExecutionContext(tools, logs);
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
    } finally {
      // Always cleanup timers, even on error or timeout
      if (context) {
        try {
          context.__cleanup?.();
        } catch (e: any) {
          logger.warn(`Timer cleanup failed: ${e.message || e}`);
        }
      }
    }
  }

  /**
   * Harden JavaScript context to prevent prototype pollution and sandbox escape
   * Phase 1: Quick Security Wins
   */
  private hardenContext(): void {
    // Freeze built-in prototypes to prevent modification
    Object.freeze(Object.prototype);
    Object.freeze(Array.prototype);
    Object.freeze(String.prototype);
    Object.freeze(Number.prototype);
    Object.freeze(Boolean.prototype);
    Object.freeze(Function.prototype);

    // Delete dangerous constructors that could escape sandbox
    // Note: In VM context, these will be recreated but this signals intent
    try {
      delete (Function.prototype as any).constructor;
    } catch (e) {
      // Ignore if already non-configurable
    }

    logger.info('🔒 Context hardened: prototypes frozen, dangerous globals removed');
  }

  /**
   * Validate code using AST-based analysis and semantic validation
   * Phase 1: Static Analysis with TypeScript AST
   * Phase 2: Semantic validation for intent classification
   */
  private async validateCodeWithPipeline(
    code: string,
    availableMCPs: string[]
  ): Promise<void> {
    // Phase 1: AST-based static analysis
    const analysisResult = this.codeAnalyzer.analyze(code);

    // Check for critical violations that must be rejected
    const criticalViolations = analysisResult.violations.filter(
      (v) => v.severity === 'critical'
    );

    if (criticalViolations.length > 0) {
      const violationMessages = criticalViolations
        .map((v) => `  - ${v.description}${v.location ? ` (line ${v.location.line})` : ''}`)
        .join('\n');

      throw new Error(
        `Code validation failed: Detected dangerous patterns:\n` +
        violationMessages +
        '\n\nCode-Mode is sandboxed for safety. Use tool namespaces instead.'
      );
    }

    // Phase 2: Semantic validation for intent classification
    const validatorContext = {
      availableMCPs: availableMCPs,
    };

    const semanticResult = this.semanticValidator.validate(
      code,
      analysisResult,
      validatorContext
    );

    if (!semanticResult.approved) {
      throw new Error(
        `Code validation failed: ${semanticResult.reason || 'Security policy violation'}\n` +
        `Risk level: ${semanticResult.riskLevel}\n` +
        (semanticResult.recommendations.length > 0
          ? `Recommendations:\n${semanticResult.recommendations.map(r => `  - ${r}`).join('\n')}`
          : '')
      );
    }

    // Log the analysis for audit purposes
    const intentTypes = semanticResult.detectedIntents.map(i => i.type);
    logger.debug(
      `Code validation passed - Risk: ${semanticResult.riskLevel}, ` +
      `Intents: ${intentTypes.join(', ')}, ` +
      `MCP calls: ${analysisResult.detectedPatterns.mcpCalls.length}`
    );
  }

  /**
   * Create VM execution context with tools organized by namespace
   * Based on official UTCP pattern
   */
  private async createExecutionContext(
    tools: ToolDefinition[],
    logs: string[]
  ): Promise<Record<string, any>> {
    // Apply security hardening first
    this.hardenContext();

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

    // Timer tracking for cleanup
    const timers = new Set<NodeJS.Timeout>();

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

      // Tracked timers with automatic cleanup
      setTimeout: (callback: (...args: any[]) => void, ms: number, ...args: any[]) => {
        const timer = setTimeout(callback, ms, ...args);
        timers.add(timer);
        return timer;
      },
      setInterval: (callback: (...args: any[]) => void, ms: number, ...args: any[]) => {
        const timer = setInterval(callback, ms, ...args);
        timers.add(timer);
        return timer;
      },
      clearTimeout: (timer: NodeJS.Timeout) => {
        timers.delete(timer);
        clearTimeout(timer);
      },
      clearInterval: (timer: NodeJS.Timeout) => {
        timers.delete(timer);
        clearInterval(timer);
      },

      // Cleanup function (called after execution)
      __cleanup: () => {
        for (const timer of timers) {
          clearTimeout(timer);
        }
        timers.clear();
      },

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
