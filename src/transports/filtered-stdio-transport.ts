/**
 * Filtered Output for MCP Clients
 *
 * Since we're running as a client (not intercepting server output),
 * we need to filter the console output that leaks through when
 * executing tools via subprocess MCPs.
 */

import { logger } from '../utils/logger.js';

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

// Track if filtering is active
let filteringActive = false;

/**
 * List of patterns to filter from console output
 */
const FILTER_PATTERNS = [
  // MCP server startup messages
  'running on stdio',
  'MCP Server running',
  'MCP server running',
  'Server running on stdio',
  'Client does not support',

  // Specific MCP messages
  'Secure MCP Filesystem Server',
  'Knowledge Graph MCP Server',
  'Sequential Thinking MCP Server',
  'Stripe MCP Server',

  // Connection messages
  'Connecting to server:',
  'Streamable HTTP connection',
  'Received exit signal',
  'Starting cleanup process',
  'Final cleanup on exit',
  '[Runner]',

  // Tool execution artifacts
  'Shell cwd was reset'
];

/**
 * Check if a message should be filtered
 */
function shouldFilter(args: any[]): boolean {
  if (!filteringActive) return false;

  const message = args.map(arg =>
    typeof arg === 'string' ? arg : JSON.stringify(arg)
  ).join(' ');

  return FILTER_PATTERNS.some(pattern => message.includes(pattern));
}

/**
 * Create a filtered console method
 */
function createFilteredMethod(originalMethod: typeof console.log): typeof console.log {
  return function(...args: any[]) {
    if (!shouldFilter(args)) {
      originalMethod.apply(console, args);
    } else if (process.env.NCP_DEBUG_FILTER === 'true') {
      // In debug mode, show what we're filtering
      originalConsoleError.call(console, '[Filtered]:', ...args);
    }
  } as typeof console.log;
}

/**
 * Enable console output filtering
 */
export function enableOutputFilter(): void {
  if (filteringActive) return;

  filteringActive = true;
  console.log = createFilteredMethod(originalConsoleLog) as typeof console.log;
  console.error = createFilteredMethod(originalConsoleError) as typeof console.error;
  console.warn = createFilteredMethod(originalConsoleWarn) as typeof console.warn;
  console.info = createFilteredMethod(originalConsoleInfo) as typeof console.info;

  logger.debug('Console output filtering enabled');
}

/**
 * Disable console output filtering
 */
export function disableOutputFilter(): void {
  if (!filteringActive) return;

  filteringActive = false;
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.info = originalConsoleInfo;

  logger.debug('Console output filtering disabled');
}

/**
 * Execute a function with filtered output
 */
export async function withFilteredOutput<T>(fn: () => Promise<T>): Promise<T> {
  enableOutputFilter();
  try {
    return await fn();
  } finally {
    disableOutputFilter();
  }
}

/**
 * Check if we're in CLI mode (where filtering should be applied)
 */
export function shouldApplyFilter(): boolean {
  // Apply filter in CLI mode but not in server mode
  return !process.argv.includes('--server') &&
         !process.env.NCP_MODE?.includes('mcp');
}