/**
 * Transport Factory
 *
 * Creates MCP transports (Stdio or SSE) based on configuration.
 * Handles authentication, PATH setup, and runtime detection.
 */

import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { logger } from '../../utils/logger.js';
import { mcpWrapper } from '../../utils/mcp-wrapper.js';
import { getRuntimeForExtension } from '../../utils/runtime-detector.js';
import type { MCPConfig } from '../types/connection.js';
import type { TransportFactory } from './connection-pool.js';

/**
 * Auth token provider function type
 */
export type AuthTokenProvider = (config: MCPConfig) => Promise<string>;

/**
 * Default Transport Factory implementation
 *
 * Creates appropriate transports based on MCP configuration.
 */
export class DefaultTransportFactory implements TransportFactory {
  private authTokenProvider?: AuthTokenProvider;

  constructor(authTokenProvider?: AuthTokenProvider) {
    this.authTokenProvider = authTokenProvider;
  }

  /**
   * Set the auth token provider
   */
  setAuthTokenProvider(provider: AuthTokenProvider): void {
    this.authTokenProvider = provider;
  }

  /**
   * Create a transport based on config
   */
  async createTransport(
    config: MCPConfig,
    env?: Record<string, string>
  ): Promise<StdioClientTransport | SSEClientTransport> {
    if (config.url) {
      return this.createSSETransport(config);
    }

    if (config.command) {
      return this.createStdioTransport(config, env);
    }

    throw new Error(
      `Invalid config for ${config.name}: must have either 'command' or 'url'`
    );
  }

  /**
   * Create SSE transport for HTTP-based MCPs
   */
  private async createSSETransport(config: MCPConfig): Promise<SSEClientTransport> {
    const url = new URL(config.url!);
    const headers: Record<string, string> = {};

    // Handle authentication
    if (config.auth) {
      const token = await this.getAuthToken(config);

      switch (config.auth.type) {
        case 'oauth':
        case 'bearer':
          headers['Authorization'] = `Bearer ${token}`;
          break;
        case 'apiKey':
          headers['X-API-Key'] = token;
          break;
        case 'basic':
          if (config.auth.username && config.auth.password) {
            const credentials = Buffer.from(
              `${config.auth.username}:${config.auth.password}`
            ).toString('base64');
            headers['Authorization'] = `Basic ${credentials}`;
          }
          break;
      }
    }

    // Use requestInit and eventSourceInit for headers
    const options =
      Object.keys(headers).length > 0
        ? {
            requestInit: { headers },
            eventSourceInit: { headers } as EventSourceInit,
          }
        : undefined;

    return new SSEClientTransport(url, options);
  }

  /**
   * Create Stdio transport for local process MCPs
   */
  private createStdioTransport(
    config: MCPConfig,
    env?: Record<string, string>
  ): StdioClientTransport {
    const resolvedCommand = getRuntimeForExtension(config.command!);
    const wrappedCommand = mcpWrapper.createWrapper(
      config.name,
      resolvedCommand,
      config.args || []
    );

    // Setup environment with proper PATH
    const processEnv = this.setupEnvironment(config.name, env);

    return new StdioClientTransport({
      command: wrappedCommand.command,
      args: wrappedCommand.args,
      env: processEnv,
    });
  }

  /**
   * Setup environment variables with proper PATH
   */
  private setupEnvironment(
    mcpName: string,
    env?: Record<string, string>
  ): Record<string, string> {
    const processEnv = (env || {}) as Record<string, string>;
    const platform = process.platform;

    const pathSeparator = platform === 'win32' ? ';' : ':';
    let standardPaths: string;
    let pathCheckNeeded = false;

    if (platform === 'darwin') {
      // macOS: Include both Homebrew locations (Intel and Apple Silicon)
      standardPaths = '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin';
      pathCheckNeeded =
        !!processEnv.PATH &&
        !processEnv.PATH.includes('/opt/homebrew/bin') &&
        !processEnv.PATH.includes('/usr/local/bin');
    } else if (platform === 'win32') {
      // Windows: Only ensure basic system paths exist
      const windir = process.env.WINDIR || process.env.windir || 'C:\\Windows';
      standardPaths = `${windir}\\System32;${windir}`;
      pathCheckNeeded =
        !!processEnv.PATH && !processEnv.PATH.toLowerCase().includes('system32');
    } else {
      // Linux: Standard system paths
      standardPaths = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
      pathCheckNeeded =
        !!processEnv.PATH &&
        !processEnv.PATH.includes('/usr/local/bin') &&
        !processEnv.PATH.includes('/usr/bin');
    }

    // Set or augment PATH
    if (!processEnv.PATH) {
      processEnv.PATH = standardPaths;
      logger.debug(`Set PATH for ${mcpName}: ${processEnv.PATH}`);
    } else if (pathCheckNeeded) {
      processEnv.PATH = `${standardPaths}${pathSeparator}${processEnv.PATH}`;
      logger.debug(`Augmented PATH for ${mcpName}: ${processEnv.PATH}`);
    }

    return processEnv;
  }

  /**
   * Get authentication token for config
   */
  async getAuthToken(config: MCPConfig): Promise<string> {
    if (!config.auth) {
      throw new Error('No auth configuration provided');
    }

    if (this.authTokenProvider) {
      return this.authTokenProvider(config);
    }

    // Fallback: return token directly if available
    if (config.auth.token) {
      return config.auth.token;
    }

    throw new Error(
      `No auth token provider configured for ${config.name}. Set authTokenProvider or provide token directly.`
    );
  }
}

/**
 * Create a default transport factory instance
 */
export function createTransportFactory(
  authTokenProvider?: AuthTokenProvider
): DefaultTransportFactory {
  return new DefaultTransportFactory(authTokenProvider);
}
