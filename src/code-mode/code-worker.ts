/**
 * Worker Thread for isolated code execution
 * Phase 2: True process isolation with resource limits
 */

import { parentPort, workerData } from 'worker_threads';

interface ToolCallRequest {
  id: string;
  toolName: string;
  params: any;
}

interface ToolCallResponse {
  id: string;
  result?: any;
  error?: string;
}

interface WorkerMessage {
  type: 'tool_call' | 'log' | 'result' | 'error';
  data: any;
}

if (!parentPort) {
  throw new Error('This module must be run as a Worker Thread');
}

// Apply security hardening
function hardenContext(): void {
  // Freeze built-in prototypes
  Object.freeze(Object.prototype);
  Object.freeze(Array.prototype);
  Object.freeze(String.prototype);
  Object.freeze(Number.prototype);
  Object.freeze(Boolean.prototype);
  Object.freeze(Function.prototype);

  // Delete dangerous constructors
  try {
    delete (Function.prototype as any).constructor;
  } catch (e) {
    // Ignore if already non-configurable
  }
}

// Validate code for dangerous patterns
function validateCode(code: string): void {
  const dangerousPatterns = [
    { pattern: /__proto__/g, name: 'Prototype pollution via __proto__' },
    { pattern: /\.constructor\s*\(/g, name: 'Constructor access' },
    { pattern: /process\./g, name: 'Process object access' },
    { pattern: /require\s*\(/g, name: 'require() call' },
    { pattern: /import\s+/g, name: 'import statement' },
    { pattern: /eval\s*\(/g, name: 'eval() call' },
    { pattern: /Function\s*\(/g, name: 'Function constructor' },
    { pattern: /child_process/g, name: 'child_process access' },
    { pattern: /fs\./g, name: 'Direct filesystem access' },
  ];

  const violations: string[] = [];
  for (const { pattern, name } of dangerousPatterns) {
    if (pattern.test(code)) {
      violations.push(name);
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Code validation failed: Detected dangerous patterns:\n` +
      violations.map(v => `  - ${v}`).join('\n') +
      '\n\nCode-Mode is sandboxed for safety. Use tool namespaces instead.'
    );
  }
}

// Timer tracking for cleanup
const timers = new Set<NodeJS.Timeout>();

// Tool call tracking (for synchronous request/response)
const pendingToolCalls = new Map<string, {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}>();

let toolCallCounter = 0;

// Execute tool via message passing to main thread
async function executeTool(toolName: string, params: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const callId = `tool_${++toolCallCounter}`;

    pendingToolCalls.set(callId, { resolve, reject });

    parentPort!.postMessage({
      type: 'tool_call',
      data: { id: callId, toolName, params }
    } as WorkerMessage);

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingToolCalls.has(callId)) {
        pendingToolCalls.delete(callId);
        reject(new Error(`Tool call timeout: ${toolName}`));
      }
    }, 30000);
  });
}

// Listen for tool call responses from main thread
parentPort.on('message', (message: { type: string; data: ToolCallResponse }) => {
  if (message.type === 'tool_response') {
    const { id, result, error } = message.data;
    const pending = pendingToolCalls.get(id);

    if (pending) {
      pendingToolCalls.delete(id);

      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(result);
      }
    }
  }
});

// Create execution context
function createContext(tools: any[], logs: string[]): Record<string, any> {
  const consoleObj = {
    log: (...args: any[]) => {
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      logs.push(message);

      // Send log to parent
      parentPort!.postMessage({
        type: 'log',
        data: message
      } as WorkerMessage);
    },
    error: (...args: any[]) => {
      const message = '[ERROR] ' + args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      logs.push(message);

      parentPort!.postMessage({
        type: 'log',
        data: message
      } as WorkerMessage);
    },
    warn: (...args: any[]) => {
      const message = '[WARN] ' + args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      logs.push(message);

      parentPort!.postMessage({
        type: 'log',
        data: message
      } as WorkerMessage);
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
    }
  };

  // Organize tools by namespace
  for (const tool of tools) {
    const [namespace, toolName] = tool.name.includes(':')
      ? tool.name.split(':')
      : ['default', tool.name];

    if (!context[namespace]) {
      context[namespace] = {};
    }

    // Create async function that calls back to main thread
    context[namespace][toolName] = async (params?: any) => {
      return executeTool(tool.name, params || {});
    };
  }

  return context;
}

// Cleanup function
function cleanup(): void {
  for (const timer of timers) {
    clearTimeout(timer);
  }
  timers.clear();

  // Clear any pending tool calls
  for (const [id, pending] of pendingToolCalls) {
    pending.reject(new Error('Worker terminated'));
  }
  pendingToolCalls.clear();
}

// Main execution
(async () => {
  const logs: string[] = [];

  try {
    // Apply security hardening
    hardenContext();

    const { code, tools } = workerData;

    // Validate code
    validateCode(code);

    // Create context
    const context = createContext(tools, logs);

    // Execute code
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const fn = new AsyncFunction(...Object.keys(context), `
      'use strict';
      return (async () => {
        ${code}
      })();
    `);

    const result = await fn(...Object.values(context));

    // Send result
    parentPort!.postMessage({
      type: 'result',
      data: { result, logs }
    } as WorkerMessage);

  } catch (error: any) {
    // Send error
    parentPort!.postMessage({
      type: 'error',
      data: {
        error: error.message,
        stack: error.stack,
        logs
      }
    } as WorkerMessage);
  } finally {
    cleanup();
  }
})();
