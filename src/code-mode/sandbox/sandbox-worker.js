/**
 * Sandbox Worker
 *
 * This script runs in an isolated subprocess. It:
 * 1. Creates tool namespace bindings
 * 2. Executes user code with those bindings
 * 3. Communicates tool calls back to main process via IPC
 *
 * Security:
 * - Runs in separate V8 isolate
 * - Limited environment variables
 * - Memory limited via --max-old-space-size
 * - No access to main process memory
 */

// Freeze built-in prototypes to prevent pollution
Object.freeze(Object.prototype);
Object.freeze(Array.prototype);
Object.freeze(String.prototype);
Object.freeze(Number.prototype);
Object.freeze(Boolean.prototype);
Object.freeze(Function.prototype);
Object.freeze(RegExp.prototype);
Object.freeze(Date.prototype);
Object.freeze(Error.prototype);
Object.freeze(Map.prototype);
Object.freeze(Set.prototype);
Object.freeze(Promise.prototype);

// Pending tool calls waiting for response
const pendingToolCalls = new Map();
let messageId = 0;

/**
 * Execute a tool call via IPC
 */
async function executeTool(toolName, params) {
  const id = `tool_${++messageId}`;

  return new Promise((resolve, reject) => {
    pendingToolCalls.set(id, { resolve, reject });

    process.send({
      type: 'tool_call',
      id,
      toolName,
      params,
    });
  });
}

/**
 * Create console wrapper that sends logs to main process
 */
const sandboxConsole = {
  log: (...args) => {
    process.send({ type: 'log', level: 'log', data: args.length === 1 ? args[0] : args });
  },
  warn: (...args) => {
    process.send({ type: 'log', level: 'warn', data: args.length === 1 ? args[0] : args });
  },
  error: (...args) => {
    process.send({ type: 'log', level: 'error', data: args.length === 1 ? args[0] : args });
  },
  debug: (...args) => {
    process.send({ type: 'log', level: 'debug', data: args.length === 1 ? args[0] : args });
  },
  info: (...args) => {
    process.send({ type: 'log', level: 'log', data: args.length === 1 ? args[0] : args });
  },
};

/**
 * Create execution context with tool namespaces
 */
function createContext(tools) {
  const context = {
    console: sandboxConsole,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    Promise,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Map,
    Set,
    Date,
    Math,
    JSON,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    RegExp,
    Uint8Array,
    Int8Array,
    Uint16Array,
    Int16Array,
    Uint32Array,
    Int32Array,
    Float32Array,
    Float64Array,
    ArrayBuffer,
    DataView,
    // Note: no require, no import, no process, no global, no globalThis
  };

  // Create namespaces for each tool
  const namespaces = new Map();

  for (const tool of tools) {
    // Parse tool name: "namespace:method" or just "method"
    let namespace, method;
    if (tool.name.includes(':')) {
      [namespace, method] = tool.name.split(':', 2);
    } else {
      namespace = 'default';
      method = tool.name;
    }

    // Sanitize namespace name to valid JS identifier
    const safeNamespace = namespace.replace(/[^a-zA-Z0-9_$]/g, '_');

    if (!namespaces.has(safeNamespace)) {
      namespaces.set(safeNamespace, {});
      context[safeNamespace] = namespaces.get(safeNamespace);
    }

    // Add method to namespace
    const ns = namespaces.get(safeNamespace);
    ns[method] = async (params) => {
      return executeTool(tool.name, params);
    };
  }

  return context;
}

/**
 * Execute code with context
 */
async function executeCode(code, context) {
  // Build list of context keys for function parameters
  const contextKeys = Object.keys(context);
  const contextValues = contextKeys.map((k) => context[k]);

  // Wrap code in async function body
  const functionBody = `
    "use strict";
    return (async () => {
      ${code}
    })();
  `;

  try {
    // Create function with context as parameters (avoids using with statement)
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction(...contextKeys, functionBody);

    // Execute with context values
    const result = await fn(...contextValues);
    return result;
  } catch (error) {
    throw error;
  }
}

// Handle IPC messages from main process
process.on('message', async (msg) => {
  switch (msg.type) {
    case 'execute':
      try {
        const context = createContext(msg.tools || []);
        const result = await executeCode(msg.code, context);

        process.send({ type: 'result', data: result });
        process.exit(0);
      } catch (error) {
        process.send({
          type: 'error',
          error: error.message || String(error),
        });
        process.exit(1);
      }
      break;

    case 'tool_result':
      const pending = pendingToolCalls.get(msg.id);
      if (pending) {
        pendingToolCalls.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error));
        } else {
          pending.resolve(msg.result);
        }
      }
      break;
  }
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  process.send({
    type: 'error',
    error: `Uncaught exception: ${error.message}`,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  process.send({
    type: 'error',
    error: `Unhandled rejection: ${reason}`,
  });
  process.exit(1);
});

// Signal ready to receive code
process.send({ type: 'ready' });
