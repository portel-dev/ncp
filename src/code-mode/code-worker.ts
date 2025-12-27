/**
 * Worker Thread for isolated code execution
 * Phase 2: True process isolation with resource limits
 * Phase 3: Bindings for credential isolation
 * Phase 4: Network isolation
 */

import { parentPort, workerData } from 'worker_threads';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import * as nodePath from 'path';

import { createSandboxedFS, SandboxedFS } from './sandboxed-fs.js';

// Create require function for ESM context (needed for dynamic package loading)
const __filename = fileURLToPath(import.meta.url);
const __dirname = nodePath.dirname(__filename);
const require = createRequire(import.meta.url);

// Built-in whitelisted npm packages for require() in code execution
// This is the default list - it can be extended at runtime via allowedPackages in workerData
//
// NOTE: 'fs' is NOT included - we inject a sandboxed version instead.
// Users should use the `fs` global which is automatically sandboxed to .ncp/workspace/
const BUILTIN_PACKAGES = [
  'pdf-lib',
  'docx',
  'pptxgenjs',
  'xlsx',
  'papaparse',
  'cheerio',
  'axios',
  'lodash',
  'date-fns',
  'uuid',
  'crypto-js',
  'canvas',
  'sharp',
  'jimp',
  'path', // Safe path utilities (no file system access)
];

// Effective allowed packages - populated from workerData.allowedPackages or falls back to BUILTIN_PACKAGES
let ALLOWED_PACKAGES: string[] = BUILTIN_PACKAGES;

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

interface BindingCallRequest {
  id: string;
  bindingName: string;
  method: string;
  args: any[];
}

interface BindingCallResponse {
  id: string;
  result?: any;
  error?: string;
}

interface NetworkCallRequest {
  id: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
}

interface NetworkCallResponse {
  id: string;
  result?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: any;
  };
  error?: string;
}

interface WorkerMessage {
  type: 'tool_call' | 'binding_call' | 'network_call' | 'log' | 'result' | 'error';
  data: any;
}

if (!parentPort) {
  throw new Error('This module must be run as a Worker Thread');
}

/**
 * Pre-load whitelisted packages from code BEFORE freezing prototypes.
 * This allows packages like pdf-lib to define their class methods.
 */
function preloadPackages(code: string): Map<string, any> {
  const packages = new Map<string, any>();

  // Extract all require() calls from the code
  const requireMatches = code.match(/require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g);
  if (!requireMatches) return packages;

  for (const match of requireMatches) {
    const packageMatch = match.match(/require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/);
    if (!packageMatch) continue;

    const packageName = packageMatch[1];
    const basePkg = packageName.split('/')[0];

    // Only pre-load whitelisted packages
    if (ALLOWED_PACKAGES.includes(basePkg)) {
      try {
        packages.set(packageName, require(packageName));
      } catch (e) {
        // Package not installed - will be caught later with better error
      }
    }
  }

  return packages;
}

// Apply security hardening (called AFTER packages are pre-loaded)
function hardenContext(): void {
  // Freeze built-in prototypes
  Object.freeze(Object.prototype);
  Object.freeze(Array.prototype);
  Object.freeze(String.prototype);
  Object.freeze(Number.prototype);
  Object.freeze(Boolean.prototype);
  Object.freeze(Function.prototype);
  Object.freeze(RegExp.prototype);
  Object.freeze(Error.prototype);
  Object.freeze(Promise.prototype);

  // Delete dangerous constructors
  try {
    delete (Function.prototype as any).constructor;
  } catch (e) {
    // Ignore if already non-configurable
  }

  // Remove metaprogramming APIs from global scope
  // These can be used to bypass sandbox protections
  const dangerousGlobals = [
    'Reflect',
    'Proxy',
    'WeakRef',
    'FinalizationRegistry',
  ];

  for (const name of dangerousGlobals) {
    try {
      delete (globalThis as any)[name];
    } catch (e) {
      // Try to make it undefined if delete fails
      try {
        (globalThis as any)[name] = undefined;
      } catch (e2) {
        // Ignore if can't modify
      }
    }
  }

  // Freeze Symbol but keep it available for basic usage
  // (some libraries need Symbol.iterator, Symbol.toStringTag, etc.)
  // But block Symbol creation for custom symbols
  try {
    Object.freeze(Symbol);
  } catch (e) {
    // Ignore if already frozen
  }
}

// Validate code for dangerous patterns
function validateCode(code: string): void {
function isAllowedRequire(code: string): boolean {
  // Extract all require() calls
  const requireMatches = code.match(/require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g);
  if (!requireMatches) return true; // No requires = OK

  for (const match of requireMatches) {
    const packageMatch = match.match(/require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/);
    if (!packageMatch) continue;
    
    const packageName = packageMatch[1];
    
    // Allow relative paths (./file.js, ../utils.js)
    if (packageName.startsWith('./') || packageName.startsWith('../')) {
      continue; // Relative imports are OK
    }
    
    // Extract base package name (e.g., 'pdf-lib/subfolder' -> 'pdf-lib')
    const basePkg = packageName.split('/')[0];
    
    // Check if it's in whitelist
    if (!ALLOWED_PACKAGES.includes(basePkg)) {
      return false; // Not allowed!
    }
  }
  
  return true; // All requires are whitelisted
}

const dangerousPatterns = [
    { pattern: /__proto__/g, name: 'Prototype pollution via __proto__' },
    { pattern: /\.constructor\s*\(/g, name: 'Constructor access' },
    { pattern: /process\./g, name: 'Process object access' },
    // require() is now validated separately - see isAllowedRequire()
    { pattern: /import\s+/g, name: 'import statement' },
    { pattern: /eval\s*\(/g, name: 'eval() call' },
    { pattern: /Function\s*\(/g, name: 'Function constructor' },
    { pattern: /child_process/g, name: 'child_process access' },
    // NOTE: fs. is now ALLOWED - we inject a sandboxed version
    // { pattern: /fs\./g, name: 'Direct filesystem access' },
    // Metaprogramming APIs - can bypass sandbox protections
    { pattern: /\bReflect\b/g, name: 'Reflect API access (metaprogramming)' },
    { pattern: /\bProxy\b/g, name: 'Proxy API access (metaprogramming)' },
    { pattern: /\bSymbol\b/g, name: 'Symbol API access (metaprogramming)' },
    { pattern: /\bWeakRef\b/g, name: 'WeakRef access (GC probing)' },
    { pattern: /\bFinalizationRegistry\b/g, name: 'FinalizationRegistry access (GC probing)' },
    // Object descriptor manipulation
    { pattern: /\.getOwnPropertyDescriptor\s*\(/g, name: 'getOwnPropertyDescriptor (descriptor manipulation)' },
    { pattern: /\.defineProperty\s*\(/g, name: 'defineProperty (descriptor manipulation)' },
    { pattern: /\.setPrototypeOf\s*\(/g, name: 'setPrototypeOf (prototype manipulation)' },
    { pattern: /\.getPrototypeOf\s*\(/g, name: 'getPrototypeOf (prototype access)' },
  ];

  const violations: string[] = [];
  for (const { pattern, name } of dangerousPatterns) {
    if (pattern.test(code)) {
      violations.push(name);
    }
  }

  // Check require() calls separately (allow whitelisted packages)
  if (!isAllowedRequire(code)) {
    violations.push('require() with non-whitelisted package (only document/data processing libraries allowed)');
  }

  if (violations.length > 0) {
    throw new Error(
      `Code validation failed: Detected dangerous patterns:\n` +
      violations.map(v => `  - ${v}`).join('\n') +
      '\n\nCode-Mode is sandboxed for safety. Use tool namespaces instead.' +
      '\n\nAllowed packages: ' + ALLOWED_PACKAGES.join(', ')
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

// Binding call tracking (Phase 3: credential isolation)
const pendingBindingCalls = new Map<string, {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}>();

// Network call tracking (Phase 4: network isolation)
const pendingNetworkCalls = new Map<string, {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}>();

let toolCallCounter = 0;
let bindingCallCounter = 0;
let networkCallCounter = 0;

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

// Execute binding via message passing to main thread (Phase 3)
// Bindings are pre-authenticated clients - worker never sees credentials
async function executeBinding(bindingName: string, method: string, args: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const callId = `binding_${++bindingCallCounter}`;

    pendingBindingCalls.set(callId, { resolve, reject });

    parentPort!.postMessage({
      type: 'binding_call',
      data: { id: callId, bindingName, method, args }
    } as WorkerMessage);

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingBindingCalls.has(callId)) {
        pendingBindingCalls.delete(callId);
        reject(new Error(`Binding call timeout: ${bindingName}.${method}()`));
      }
    }, 30000);
  });
}

// Execute network request via main thread (Phase 4: network isolation)
// All network requests go through main thread with policy enforcement
async function executeNetworkRequest(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'GET',
  options?: { headers?: Record<string, string>; body?: any }
): Promise<any> {
  return new Promise((resolve, reject) => {
    const callId = `network_${++networkCallCounter}`;

    pendingNetworkCalls.set(callId, { resolve, reject });

    parentPort!.postMessage({
      type: 'network_call',
      data: {
        id: callId,
        url,
        method,
        headers: options?.headers,
        body: options?.body
      }
    } as WorkerMessage);

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingNetworkCalls.has(callId)) {
        pendingNetworkCalls.delete(callId);
        reject(new Error(`Network request timeout: ${method} ${url}`));
      }
    }, 30000);
  });
}

// Serialize errors to preserve full context (not just message)
function serializeError(error: any): { message: string; stack?: string; type: string; code?: string; details?: any } {
  return {
    message: error?.message || String(error),
    stack: error?.stack,
    type: error?.constructor?.name || 'Error',
    code: error?.code,
    details: {
      errno: error?.errno,
      syscall: error?.syscall,
      path: error?.path,
      statusCode: error?.statusCode,
      statusMessage: error?.statusMessage
    }
  };
}

// Reconstruct error with preserved context
function deserializeError(errorData: any): Error {
  let err = new Error(errorData.message);
  if (errorData.stack) {
    err.stack = errorData.stack;
  }
  if (errorData.code) {
    (err as any).code = errorData.code;
  }
  if (errorData.type && errorData.type !== 'Error') {
    // Preserve the original error type in the message
    err.message = `[${errorData.type}] ${err.message}`;
  }
  return err;
}

// Listen for responses from main thread
parentPort.on('message', (message: { type: string; data: any }) => {
  if (message.type === 'tool_response') {
    const { id, result, error } = message.data;
    const pending = pendingToolCalls.get(id);

    if (pending) {
      pendingToolCalls.delete(id);

      if (error) {
        // Reconstruct error with full context
        const err = deserializeError(error);
        pending.reject(err);
      } else {
        pending.resolve(result);
      }
    }
  } else if (message.type === 'binding_response') {
    const { id, result, error } = message.data;
    const pending = pendingBindingCalls.get(id);

    if (pending) {
      pendingBindingCalls.delete(id);

      if (error) {
        // Reconstruct error with full context
        const err = deserializeError(error);
        pending.reject(err);
      } else {
        pending.resolve(result);
      }
    }
  } else if (message.type === 'network_response') {
    const { id, result, error } = message.data;
    const pending = pendingNetworkCalls.get(id);

    if (pending) {
      pendingNetworkCalls.delete(id);

      if (error) {
        // Reconstruct error with full context
        const err = deserializeError(error);
        pending.reject(err);
      } else {
        pending.resolve(result);
      }
    }
  }
});

// Create execution context with tools, bindings, sandboxed FS, and pre-loaded packages
function createContext(
  tools: any[],
  bindings: any[],
  logs: string[],
  workspacePath?: string,
  preloadedPackages?: Map<string, any>
): Record<string, any> {
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
    },

    // Phase 4: Controlled network access (NO direct fetch/XMLHttpRequest)
    // All network requests go through main thread with policy enforcement
    fetch: async (url: string, options?: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
      headers?: Record<string, string>;
      body?: any;
    }) => {
      return executeNetworkRequest(
        url,
        options?.method || 'GET',
        { headers: options?.headers, body: options?.body }
      );
    },

    // Path utilities (safe - no file system access)
    path: nodePath,
  };

  // Sandboxed file system - all operations confined to workspace directory
  if (workspacePath) {
    const sandboxedFs = createSandboxedFS(workspacePath);
    context.fs = sandboxedFs;

    // Also expose workspace path for user reference
    context.__workspacePath = workspacePath;
  }

  // Organize tools by namespace (mcp:tool convention)
  for (const tool of tools) {
    const [mcp, toolName] = tool.name.includes(':')
      ? tool.name.split(':')
      : ['default', tool.name];

    // Normalize MCP namespace to valid JavaScript identifier
    // Unify naming: my-tool → my_tool, my.tool → my_tool
    const namespace = mcp.replace(/[^a-zA-Z0-9_$]/g, '_');

    if (!context[namespace]) {
      context[namespace] = {};
    }

    // Create async function that calls back to main thread with original tool name
    context[namespace][toolName] = async (params?: any) => {
      return executeTool(tool.name, params || {});
    };
  }

  // Inject bindings (Phase 3: credential isolation)
  // Bindings are pre-authenticated clients - NO CREDENTIALS IN WORKER!
  for (const binding of bindings) {
    const bindingObj: Record<string, any> = {};

    // Create methods for this binding
    for (const method of binding.methods) {
      bindingObj[method] = async (...args: any[]) => {
        return executeBinding(binding.name, method, args);
      };
    }

    // Normalize binding name to valid JavaScript identifier
    const validBindingName = binding.name.replace(/[^a-zA-Z0-9_$]/g, '_');

    // Attach binding to context
    context[validBindingName] = bindingObj;
  }

  // Add safe require() for whitelisted packages
  // Uses pre-loaded packages to avoid prototype freezing issues
  context.require = (moduleName: string) => {
    const basePkg = moduleName.split('/')[0];

    if (!ALLOWED_PACKAGES.includes(basePkg)) {
      throw new Error(
        `Cannot require '${moduleName}': Package not in whitelist.\n` +
        `Allowed packages: ${ALLOWED_PACKAGES.join(', ')}`
      );
    }

    // Check pre-loaded packages first (loaded before prototype freezing)
    if (preloadedPackages?.has(moduleName)) {
      return preloadedPackages.get(moduleName);
    }

    // Fallback to dynamic require (may fail if package modifies prototypes)
    try {
      return require(moduleName);
    } catch (error: any) {
      throw new Error(
        `Failed to load '${moduleName}': ${error.message}\n` +
        `Make sure the package is installed: npm install ${basePkg}`
      );
    }
  };

  return context;
}

// Cleanup function
function cleanup(): void {
  for (const timer of timers) {
    clearTimeout(timer);
  }
  timers.clear();

  // Clear any pending tool calls
  for (const pending of pendingToolCalls.values()) {
    pending.reject(new Error('Worker terminated'));
  }
  pendingToolCalls.clear();

  // Clear any pending binding calls
  for (const pending of pendingBindingCalls.values()) {
    pending.reject(new Error('Worker terminated'));
  }
  pendingBindingCalls.clear();

  // Clear any pending network calls
  for (const pending of pendingNetworkCalls.values()) {
    pending.reject(new Error('Worker terminated'));
  }
  pendingNetworkCalls.clear();
}

// Main execution
(async () => {
  const logs: string[] = [];

  try {
    const { code, tools, bindings, workspacePath, allowedPackages } = workerData;

    // Phase 6: Use dynamic whitelist from main thread if provided
    // This allows runtime-approved packages to be used for this execution
    if (allowedPackages && Array.isArray(allowedPackages) && allowedPackages.length > 0) {
      ALLOWED_PACKAGES = allowedPackages;
    }

    // Pre-load whitelisted packages BEFORE freezing prototypes
    // This allows packages like pdf-lib to define their class methods
    const preloadedPackages = preloadPackages(code);

    // Apply security hardening AFTER packages are loaded
    hardenContext();

    // Validate code
    validateCode(code);

    // Create context with tools, bindings, sandboxed FS, and pre-loaded packages
    const context = createContext(tools || [], bindings || [], logs, workspacePath, preloadedPackages);

    // Execute code using a wrapper function instead of spreading parameters
    // This avoids "Arg string terminates parameters early" error from Function constructor
    // when there are many context keys (tools, bindings, skills)
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const contextKeys = Object.keys(context).join(',');
    // Use string concatenation to avoid template string interpolation issues with user code
    const fnBody = [
      "'use strict';",
      `const {${contextKeys}} = __context__;`,
      'return (async () => {',
      code,
      '})();'
    ].join('\n');
    const fn = new AsyncFunction('__context__', fnBody);

    const result = await fn(context);

    // Send result
    parentPort!.postMessage({
      type: 'result',
      data: { result, logs }
    } as WorkerMessage);

  } catch (error: any) {
    // Send error with full context preserved
    parentPort!.postMessage({
      type: 'error',
      data: {
        error: serializeError(error),
        logs,
        pendingCallsInfo: {
          toolCalls: pendingToolCalls.size,
          bindingCalls: pendingBindingCalls.size,
          networkCalls: pendingNetworkCalls.size
        }
      }
    } as WorkerMessage);
  } finally {
    cleanup();
  }
})();
