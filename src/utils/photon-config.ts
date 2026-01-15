/**
 * Photon Configuration
 *
 * Manages config.json for unified Photon configuration.
 * Contains both per-photon env vars and MCP server configs.
 *
 * Location follows ncp-paths pattern:
 * - Local: .ncp/config.json (if .ncp exists in project)
 * - Global: ~/.ncp/config.json (fallback)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getNcpBaseDirectory } from './ncp-paths.js';
import { logger } from './logger.js';

export interface MCPServerConfig {
  command?: string;
  args?: string[];
  url?: string;
  transport?: 'stdio' | 'sse' | 'websocket';
  env?: Record<string, string>;
}

export interface PhotonConfig {
  /** Per-photon environment variable configuration */
  photons: Record<string, Record<string, string>>;
  /** MCP server configurations */
  mcpServers: Record<string, MCPServerConfig>;
}

/**
 * Get the config file path (local or global)
 */
export function getConfigFilePath(): string {
  return path.join(getNcpBaseDirectory(), 'config.json');
}

/**
 * Create empty config structure
 */
function emptyConfig(): PhotonConfig {
  return { photons: {}, mcpServers: {} };
}

/**
 * Migrate old config formats to new unified structure
 */
function migrateConfig(raw: any): PhotonConfig {
  // Already new format with both keys
  if (raw.photons !== undefined || raw.mcpServers !== undefined) {
    return {
      photons: raw.photons || {},
      mcpServers: raw.mcpServers || {}
    };
  }

  // Unknown format - return empty
  return emptyConfig();
}

/**
 * Load photon configuration from config.json
 */
export async function loadPhotonConfig(): Promise<PhotonConfig> {
  const filePath = getConfigFilePath();

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const raw = JSON.parse(content);
    return migrateConfig(raw);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      logger.warn(`Failed to load config from ${filePath}: ${error.message}`);
    }
    return emptyConfig();
  }
}

/**
 * Save photon configuration to config.json
 */
export async function savePhotonConfig(config: PhotonConfig): Promise<void> {
  const filePath = getConfigFilePath();
  const dir = path.dirname(filePath);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Get configuration for a specific photon
 */
export async function getPhotonEnvVars(photonName: string): Promise<Record<string, string>> {
  const config = await loadPhotonConfig();
  return config.photons[photonName] || {};
}

/**
 * Set configuration for a specific photon
 */
export async function setPhotonEnvVars(photonName: string, envVars: Record<string, string>): Promise<void> {
  const config = await loadPhotonConfig();
  config.photons[photonName] = envVars;
  await savePhotonConfig(config);
}

/**
 * Apply photon env vars to process.env
 */
export function applyPhotonEnvVars(envVars: Record<string, string>): void {
  for (const [key, value] of Object.entries(envVars)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

/**
 * Resolve environment variable references in a value
 * Supports ${VAR_NAME} syntax
 */
export function resolveEnvValue(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName) => process.env[varName] || '');
}

/**
 * Resolve all env var references in a server config
 */
export function resolveEnvVars(serverConfig: MCPServerConfig): MCPServerConfig {
  const resolved = { ...serverConfig };

  if (resolved.env) {
    const processedEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(resolved.env)) {
      processedEnv[key] = resolveEnvValue(value);
    }
    resolved.env = processedEnv;
  }

  if (resolved.args) {
    resolved.args = resolved.args.map(resolveEnvValue);
  }

  if (resolved.url) {
    resolved.url = resolveEnvValue(resolved.url);
  }

  return resolved;
}
