/**
 * Connection Pool Manager Service
 *
 * Manages MCP client connections with:
 * - Connection pooling and reuse
 * - LRU (Least Recently Used) eviction
 * - Idle connection cleanup
 * - Automatic reconnection after max executions
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { logger } from '../../utils/logger.js';
import { withFilteredOutput } from '../../transports/filtered-stdio-transport.js';
import type {
  MCPConnection,
  MCPDefinition,
  MCPConfig,
  ConnectionPoolConfig,
  DEFAULT_CONNECTION_POOL_CONFIG,
} from '../types/connection.js';
import type { OrchestratorContext } from '../interfaces/orchestrator-context.js';
import type { OrchestratorService } from '../interfaces/service-container.js';

/**
 * Factory for creating MCP transports
 * Abstracted to allow testing and customization
 */
export interface TransportFactory {
  /**
   * Create a transport for the given configuration
   */
  createTransport(
    config: MCPConfig,
    env?: Record<string, string>
  ): Promise<StdioClientTransport | SSEClientTransport>;

  /**
   * Get authentication token for a config (if needed)
   */
  getAuthToken?(config: MCPConfig): Promise<string>;
}

/**
 * Connection Pool Manager
 *
 * Manages a pool of MCP client connections with automatic lifecycle management.
 */
export class ConnectionPoolManager implements OrchestratorService {
  private context: OrchestratorContext;
  private transportFactory: TransportFactory;
  private config: ConnectionPoolConfig;

  private connections: Map<string, MCPConnection> = new Map();
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(
    context: OrchestratorContext,
    transportFactory: TransportFactory,
    config?: Partial<ConnectionPoolConfig>
  ) {
    this.context = context;
    this.transportFactory = transportFactory;
    this.config = {
      maxConnections: config?.maxConnections ?? 50,
      idleTimeout: config?.idleTimeout ?? 5 * 60 * 1000, // 5 minutes
      cleanupInterval: config?.cleanupInterval ?? 60 * 1000, // 1 minute
      maxExecutionsPerConnection: config?.maxExecutionsPerConnection ?? 1000,
      connectionTimeout: config?.connectionTimeout ?? 10000, // 10 seconds
      quickProbeTimeout: config?.quickProbeTimeout ?? 8000, // 8 seconds
      slowProbeTimeout: config?.slowProbeTimeout ?? 30000, // 30 seconds
    };
  }

  /**
   * Initialize the connection pool manager
   * Starts the cleanup timer
   */
  async initialize(): Promise<void> {
    this.startCleanupTimer();
    logger.debug('ConnectionPoolManager initialized');
  }

  /**
   * Get or create a connection to an MCP
   *
   * @param mcpName - Name of the MCP to connect to
   * @returns Active connection to the MCP
   */
  async getOrCreateConnection(mcpName: string): Promise<MCPConnection> {
    // Check if existing connection exists and is still healthy
    const existing = this.connections.get(mcpName);
    if (existing) {
      // Force reconnect if connection has been used too many times
      if (existing.executionCount >= this.config.maxExecutionsPerConnection) {
        logger.info(
          `Reconnecting ${mcpName} (reached ${existing.executionCount} executions)`
        );
        await this.disconnect(mcpName);
        // Fall through to create new connection
      } else {
        existing.lastUsed = Date.now();
        existing.executionCount++;
        return existing;
      }
    }

    // Before creating new connection, check if we're at the limit
    if (this.connections.size >= this.config.maxConnections) {
      await this.evictLRU();
    }

    // Get definition from context state
    const definition = this.context.state.definitions.get(mcpName);
    if (!definition) {
      const availableMcps = Array.from(this.context.state.definitions.keys()).join(', ');
      throw new Error(
        `MCP '${mcpName}' not found. Available MCPs: ${availableMcps}. Use 'ncp find' to discover tools or check your profile configuration.`
      );
    }

    return this.createConnection(mcpName, definition);
  }

  /**
   * Create a new connection to an MCP
   */
  private async createConnection(
    mcpName: string,
    definition: MCPDefinition
  ): Promise<MCPConnection> {
    logger.info(`Connecting to ${mcpName} (for execution)...`);
    const connectStart = Date.now();

    try {
      // Add environment variables
      const silentEnv = {
        ...process.env,
        ...(definition.config.env || {}),
        MCP_SILENT: 'true',
        QUIET: 'true',
        NO_COLOR: 'true',
      };

      const transport = await this.transportFactory.createTransport(
        definition.config,
        silentEnv
      );

      // Use client info from context
      const client = new Client(this.context.clientInfo, { capabilities: {} });

      // Connect with timeout and filtered output
      await withFilteredOutput(async () => {
        await Promise.race([
          client.connect(transport),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('Connection timeout')),
              this.config.connectionTimeout
            )
          ),
        ]);
      });

      // Capture server info after successful connection
      const serverInfo = client.getServerVersion();

      const connection: MCPConnection = {
        client,
        transport,
        tools: [], // Will be populated if needed
        serverInfo: serverInfo
          ? {
              name: serverInfo.name || mcpName,
              title: serverInfo.title,
              version: serverInfo.version || 'unknown',
              description: serverInfo.title || serverInfo.name || undefined,
              websiteUrl: serverInfo.websiteUrl,
            }
          : undefined,
        lastUsed: Date.now(),
        connectTime: Date.now() - connectStart,
        executionCount: 1,
      };

      // Store connection for reuse
      this.connections.set(mcpName, connection);

      // Emit connection event
      this.context.events.emit('mcp:connected', { mcpName });

      logger.info(`Connected to ${mcpName} in ${connection.connectTime}ms`);

      return connection;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to connect to ${mcpName}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Disconnect a specific MCP
   */
  async disconnect(mcpName: string): Promise<void> {
    const connection = this.connections.get(mcpName);
    if (!connection) return;

    try {
      await connection.client.close();
      this.connections.delete(mcpName);

      // Emit disconnection event
      this.context.events.emit('mcp:disconnected', { mcpName });

      logger.debug(`Disconnected ${mcpName}`);
    } catch (error) {
      logger.error(`Error disconnecting ${mcpName}:`, error);
    }
  }

  /**
   * Get an existing connection (without creating)
   */
  getConnection(mcpName: string): MCPConnection | undefined {
    return this.connections.get(mcpName);
  }

  /**
   * Check if a connection exists
   */
  hasConnection(mcpName: string): boolean {
    return this.connections.has(mcpName);
  }

  /**
   * Get number of active connections
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get all connection names
   */
  getConnectionNames(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): Array<{
    mcpName: string;
    executionCount: number;
    idleTime: number;
    connectTime: number;
  }> {
    const now = Date.now();
    return Array.from(this.connections.entries()).map(([mcpName, conn]) => ({
      mcpName,
      executionCount: conn.executionCount,
      idleTime: now - conn.lastUsed,
      connectTime: conn.connectTime,
    }));
  }

  /**
   * Evict least recently used connection when pool is full
   */
  private async evictLRU(): Promise<void> {
    if (this.connections.size === 0) return;

    // Find the least recently used connection
    let lruName: string | null = null;
    let oldestLastUsed = Infinity;

    for (const [name, connection] of this.connections) {
      if (connection.lastUsed < oldestLastUsed) {
        oldestLastUsed = connection.lastUsed;
        lruName = name;
      }
    }

    if (lruName) {
      const idleTime = Date.now() - oldestLastUsed;
      logger.info(
        `Evicting LRU connection: ${lruName} (idle for ${Math.round(idleTime / 1000)}s, pool at limit)`
      );
      await this.disconnect(lruName);
    }
  }

  /**
   * Start the cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(
      () => this.cleanupIdleConnections(),
      this.config.cleanupInterval
    );
  }

  /**
   * Clean up idle connections and enforce pool health
   */
  private async cleanupIdleConnections(): Promise<void> {
    const now = Date.now();
    const toDisconnect: string[] = [];

    for (const [name, connection] of this.connections) {
      const idleTime = now - connection.lastUsed;

      // Disconnect if idle too long
      if (idleTime > this.config.idleTimeout) {
        logger.info(
          `Disconnecting idle MCP: ${name} (idle for ${Math.round(idleTime / 1000)}s)`
        );
        toDisconnect.push(name);
      }
      // Also disconnect if execution count is too high
      else if (connection.executionCount >= this.config.maxExecutionsPerConnection) {
        logger.info(
          `Disconnecting overused MCP: ${name} (${connection.executionCount} executions)`
        );
        toDisconnect.push(name);
      }
    }

    // Disconnect marked connections
    for (const name of toDisconnect) {
      await this.disconnect(name);
    }

    // Log pool health stats occasionally
    if (Math.random() < 0.1) {
      logger.debug(
        `Connection pool: ${this.connections.size}/${this.config.maxConnections} connections active`
      );
    }
  }

  /**
   * Cleanup - stop timer and close all connections
   */
  async cleanup(): Promise<void> {
    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Close all connections
    for (const connection of this.connections.values()) {
      try {
        await connection.client.close();
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    this.connections.clear();
    logger.debug('ConnectionPoolManager cleaned up');
  }
}

/**
 * Factory function for creating ConnectionPoolManager
 */
export function createConnectionPoolManager(
  context: OrchestratorContext,
  transportFactory: TransportFactory,
  config?: Partial<ConnectionPoolConfig>
): ConnectionPoolManager {
  return new ConnectionPoolManager(context, transportFactory, config);
}
