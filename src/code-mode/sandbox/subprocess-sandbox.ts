/**
 * Subprocess Sandbox
 *
 * Provides true process isolation for code execution by spawning
 * a separate Node.js process. This is more secure than Worker Threads
 * because:
 * - Separate V8 isolate (no shared memory)
 * - Can be killed without affecting main process
 * - Resource limits enforced by OS
 * - No prototype pollution can escape to main process
 */

import { spawn, ChildProcess } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';

/**
 * Tool definition for the sandbox
 */
export interface SandboxTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * Message types for IPC communication
 */
export interface SandboxMessage {
  type:
    | 'execute'
    | 'tool_call'
    | 'tool_result'
    | 'log'
    | 'result'
    | 'error'
    | 'ready';
  id?: string;
  toolName?: string;
  params?: unknown;
  result?: unknown;
  error?: string;
  data?: unknown;
  code?: string;
  tools?: SandboxTool[];
  level?: 'log' | 'warn' | 'error' | 'debug';
}

/**
 * Result of code execution
 */
export interface SandboxExecutionResult {
  result: unknown;
  logs: string[];
  error?: string;
  duration: number;
}

/**
 * Configuration for the subprocess sandbox
 */
export interface SubprocessSandboxConfig {
  /** Maximum execution time in milliseconds (default: 30000) */
  timeout: number;
  /** Maximum memory in MB (default: 128) */
  memoryLimit: number;
  /** Minimum environment (only PATH) */
  minimalEnv: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: SubprocessSandboxConfig = {
  timeout: 30000,
  memoryLimit: 128,
  minimalEnv: true,
};

/**
 * Subprocess Sandbox implementation
 */
export class SubprocessSandbox {
  private config: SubprocessSandboxConfig;
  private process: ChildProcess | null = null;
  private pendingToolCalls: Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  > = new Map();
  private messageId = 0;

  constructor(config?: Partial<SubprocessSandboxConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute code in isolated subprocess
   *
   * @param code - Code to execute
   * @param tools - Available tools
   * @param toolExecutor - Function to execute tool calls
   * @returns Execution result
   */
  async execute(
    code: string,
    tools: SandboxTool[],
    toolExecutor: (toolName: string, params: unknown) => Promise<unknown>
  ): Promise<SandboxExecutionResult> {
    const startTime = Date.now();
    const logs: string[] = [];
    let result: unknown = null;
    let error: string | undefined;

    return new Promise((resolve, reject) => {
      // Spawn isolated process
      const workerPath = join(
        dirname(fileURLToPath(import.meta.url)),
        'sandbox-worker.js'
      );

      this.process = spawn(
        process.execPath,
        [
          `--max-old-space-size=${this.config.memoryLimit}`,
          '--no-warnings',
          '--experimental-vm-modules',
          workerPath,
        ],
        {
          stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
          env: this.config.minimalEnv
            ? {
                PATH: process.env.PATH,
                NODE_ENV: 'sandbox',
              }
            : process.env,
          // Don't inherit file descriptors beyond stdio
          detached: false,
        }
      );

      const proc = this.process;

      // Handle stdout (console.log from sandbox)
      proc.stdout?.on('data', (data: Buffer) => {
        const message = data.toString().trim();
        if (message) {
          logs.push(`[stdout] ${message}`);
        }
      });

      // Handle stderr (console.error from sandbox)
      proc.stderr?.on('data', (data: Buffer) => {
        const message = data.toString().trim();
        if (message) {
          logs.push(`[stderr] ${message}`);
        }
      });

      // Handle IPC messages
      proc.on('message', async (msg: SandboxMessage) => {
        switch (msg.type) {
          case 'ready':
            // Worker is ready, send code to execute
            proc.send({
              type: 'execute',
              code,
              tools: tools.map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
              })),
            } as SandboxMessage);
            break;

          case 'tool_call':
            // Execute tool call in main process
            try {
              const toolResult = await toolExecutor(
                msg.toolName!,
                msg.params
              );
              proc.send({
                type: 'tool_result',
                id: msg.id,
                result: toolResult,
              } as SandboxMessage);
            } catch (err) {
              const errorMessage =
                err instanceof Error ? err.message : String(err);
              proc.send({
                type: 'tool_result',
                id: msg.id,
                error: errorMessage,
              } as SandboxMessage);
            }
            break;

          case 'log':
            const level = msg.level || 'log';
            logs.push(`[${level}] ${JSON.stringify(msg.data)}`);
            break;

          case 'result':
            result = msg.data;
            break;

          case 'error':
            error = msg.error;
            break;
        }
      });

      // Handle process exit
      proc.on('exit', (code, signal) => {
        const duration = Date.now() - startTime;

        if (signal === 'SIGKILL') {
          error = error || `Execution terminated (timeout or resource limit)`;
        } else if (code !== 0 && !error) {
          error = `Process exited with code ${code}`;
        }

        // Clear pending tool calls
        for (const [id, pending] of this.pendingToolCalls) {
          pending.reject(new Error('Process terminated'));
        }
        this.pendingToolCalls.clear();
        this.process = null;

        resolve({
          result,
          logs,
          error,
          duration,
        });
      });

      // Handle process error
      proc.on('error', (err) => {
        const duration = Date.now() - startTime;
        this.process = null;
        reject(err);
      });

      // Enforce timeout
      const timeoutHandle = setTimeout(() => {
        if (proc && !proc.killed) {
          logger.warn(`Sandbox execution timeout after ${this.config.timeout}ms`);
          proc.kill('SIGKILL');
        }
      }, this.config.timeout);

      // Clear timeout when process exits
      proc.on('exit', () => {
        clearTimeout(timeoutHandle);
      });
    });
  }

  /**
   * Terminate the sandbox process if running
   */
  terminate(): void {
    if (this.process && !this.process.killed) {
      this.process.kill('SIGKILL');
      this.process = null;
    }
  }

  /**
   * Check if sandbox process is running
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }
}

/**
 * Create a subprocess sandbox instance
 */
export function createSubprocessSandbox(
  config?: Partial<SubprocessSandboxConfig>
): SubprocessSandbox {
  return new SubprocessSandbox(config);
}
