/**
 * Generic Client Importer
 *
 * Imports MCP configurations from any registered MCP client.
 * Supports both config files (JSON/TOML) and extensions (.dxt bundles).
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import {
  getClientDefinition,
  getClientConfigPath,
  getClientExtensionsDir,
  clientSupportsExtensions,
  type ClientDefinition
} from './client-registry.js';

export interface ImportedMCP {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  _source?: string; // 'json' | 'toml' | '.dxt'
  _client?: string; // Client name
  _extensionId?: string; // For .dxt extensions
  _version?: string; // Extension version
}

export interface ImportResult {
  mcpServers: Record<string, ImportedMCP>;
  imported: boolean;
  count: number;
  sources: {
    config: number; // From JSON/TOML config
    extensions: number; // From .dxt extensions
  };
  clientName: string;
}

/**
 * Import MCPs from a specific client
 */
export async function importFromClient(clientName: string): Promise<ImportResult | null> {
  const definition = getClientDefinition(clientName);
  if (!definition) {
    console.warn(`Unknown client: ${clientName}`);
    return null;
  }

  const allMCPs: Record<string, ImportedMCP> = {};
  let configCount = 0;
  let extensionsCount = 0;

  // 1. Import from config file (JSON/TOML)
  const configMCPs = await importFromConfig(clientName, definition);
  if (configMCPs) {
    configCount = Object.keys(configMCPs).length;
    for (const [name, config] of Object.entries(configMCPs)) {
      allMCPs[name] = {
        ...config,
        _source: definition.configFormat,
        _client: clientName
      };
    }
  }

  // 2. Import from extensions (.dxt bundles) if supported
  if (clientSupportsExtensions(clientName)) {
    const extensionMCPs = await importFromExtensions(clientName);
    if (extensionMCPs) {
      extensionsCount = Object.keys(extensionMCPs).length;

      // Merge extensions (config takes precedence for same name)
      for (const [name, config] of Object.entries(extensionMCPs)) {
        if (!(name in allMCPs)) {
          allMCPs[name] = {
            ...config,
            _client: clientName
          };
        }
      }
    }
  }

  const totalCount = Object.keys(allMCPs).length;

  if (totalCount === 0) {
    return null;
  }

  return {
    mcpServers: allMCPs,
    imported: true,
    count: totalCount,
    sources: {
      config: configCount,
      extensions: extensionsCount
    },
    clientName: definition.displayName
  };
}

/**
 * Import MCPs from client's config file
 */
async function importFromConfig(
  clientName: string,
  definition: ClientDefinition
): Promise<Record<string, ImportedMCP> | null> {
  const configPath = getClientConfigPath(clientName);
  if (!configPath || !existsSync(configPath)) {
    return null;
  }

  try {
    const content = await fs.readFile(configPath, 'utf-8');

    // Parse based on format
    let config: any;
    if (definition.configFormat === 'json') {
      config = JSON.parse(content);
    } else if (definition.configFormat === 'toml') {
      // TOML support ready for future clients (none currently use TOML)
      // Uncomment when needed:
      // const { default: toml } = await import('@iarna/toml');
      // config = toml.parse(content);
      console.warn(`TOML parsing not yet needed. No clients in registry currently use TOML format.`);
      return null;
    } else {
      console.warn(`Unsupported config format: ${definition.configFormat}`);
      return null;
    }

    // Extract MCP servers from config using mcpServersPath
    const mcpServersPath = definition.mcpServersPath || 'mcpServers';
    const mcpServersData = getNestedProperty(config, mcpServersPath);

    if (!mcpServersData) {
      return null;
    }

    // Handle Perplexity's array format: { servers: [...] }
    if (clientName === 'perplexity' && Array.isArray(mcpServersData)) {
      return convertPerplexityServers(mcpServersData);
    }

    // Standard object format
    if (typeof mcpServersData !== 'object') {
      return null;
    }

    return mcpServersData;
  } catch (error) {
    console.error(`Failed to read ${clientName} config: ${error}`);
    return null;
  }
}

/**
 * Import MCPs from client's extensions directory (.dxt bundles)
 *
 * NOTE: We store the original commands (node, python3) as-is.
 * Runtime resolution happens dynamically at spawn time, not at import time.
 * This allows the runtime to change if user toggles "Use Built-in Node.js for MCP" setting.
 */
async function importFromExtensions(
  clientName: string
): Promise<Record<string, ImportedMCP> | null> {
  const extensionsDir = getClientExtensionsDir(clientName);
  if (!extensionsDir || !existsSync(extensionsDir)) {
    return null;
  }

  const mcpServers: Record<string, ImportedMCP> = {};

  try {
    const entries = await fs.readdir(extensionsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const extDir = path.join(extensionsDir, entry.name);
      const manifestPath = path.join(extDir, 'manifest.json');

      try {
        // Read manifest.json for each extension
        const manifestContent = await fs.readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(manifestContent);

        // Extract MCP server config from manifest
        if (manifest.server?.mcp_config) {
          const mcpConfig = manifest.server.mcp_config;

          // Resolve ${__dirname} to actual extension directory
          const command = mcpConfig.command;
          const args = mcpConfig.args?.map((arg: string) =>
            arg.replace('${__dirname}', extDir)
          ) || [];

          // Use extension name from manifest or derive from directory name
          const mcpName = manifest.name || deriveExtensionName(entry.name, clientName);

          // Determine source type based on client
          const sourceType = clientName === 'perplexity' ? 'dxt' : '.dxt';

          // Store original command (node, python3, etc.)
          // Runtime resolution happens at spawn time, not here
          mcpServers[mcpName] = {
            command, // Original command, not resolved
            args,
            env: mcpConfig.env || {},
            _source: sourceType,
            _extensionId: entry.name,
            _version: manifest.version
          };
        }
      } catch (error) {
        // Skip extensions with invalid manifests
        console.warn(`Failed to read extension ${entry.name}: ${error}`);
      }
    }
  } catch (error) {
    console.error(`Failed to read ${clientName} extensions: ${error}`);
  }

  return Object.keys(mcpServers).length > 0 ? mcpServers : null;
}

/**
 * Derive extension name from directory name based on client naming convention
 *
 * Claude Desktop: "local.dxt.{author}.{name}" -> "{name}"
 * Perplexity: "{author}%2F{name}" -> "{name}"
 */
function deriveExtensionName(dirName: string, clientName: string): string {
  if (clientName === 'perplexity') {
    // Perplexity: "ferrislucas%2Fiterm-mcp" -> "iterm-mcp"
    const decoded = decodeURIComponent(dirName);
    const parts = decoded.split('/');
    return parts[parts.length - 1]; // Last part is the package name
  } else if (clientName === 'claude-desktop') {
    // Claude Desktop: "local.dxt.anthropic.file-system" -> "file-system"
    return dirName.replace(/^local\.dxt\.[^.]+\./, '');
  }

  // Default: use directory name as-is
  return dirName;
}

/**
 * Get nested property from object using dot notation
 * Example: 'experimental.modelContextProtocolServers' -> obj.experimental.modelContextProtocolServers
 */
function getNestedProperty(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Convert Perplexity's server array format to standard object format
 *
 * Perplexity format:
 * {
 *   servers: [{
 *     name: "server-name",
 *     connetionInfo: { command, args, env, useBuiltInNode },
 *     enabled: true,
 *     uuid: "...",
 *     useBuiltinNode: false
 *   }]
 * }
 *
 * Standard format:
 * {
 *   "server-name": { command, args, env }
 * }
 */
function convertPerplexityServers(servers: any[]): Record<string, ImportedMCP> {
  const mcpServers: Record<string, ImportedMCP> = {};

  for (const server of servers) {
    // Skip disabled servers
    if (server.enabled === false) {
      continue;
    }

    const name = server.name;
    const connInfo = server.connetionInfo || server.connectionInfo; // Handle typo

    if (!name || !connInfo) {
      continue;
    }

    mcpServers[name] = {
      command: connInfo.command,
      args: connInfo.args || [],
      env: connInfo.env || {}
    };
  }

  return mcpServers;
}

/**
 * Check if we should attempt auto-import from a client
 * Returns true if client config or extensions directory exists
 */
export function shouldAttemptClientSync(clientName: string): boolean {
  const configPath = getClientConfigPath(clientName);
  const extensionsDir = getClientExtensionsDir(clientName);

  return (
    (configPath !== null && existsSync(configPath)) ||
    (extensionsDir !== null && existsSync(extensionsDir))
  );
}
