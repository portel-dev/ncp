/**
 * Claude Desktop Config Auto-Importer
 *
 * Automatically imports MCP configurations from Claude Desktop into NCP's profile system.
 * Detects and imports BOTH:
 * 1. Traditional MCPs from claude_desktop_config.json
 * 2. .mcpb-installed extensions from Claude Extensions directory
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { existsSync } from 'fs';

/**
 * Get Claude Desktop directory path for the current platform
 */
export function getClaudeDesktopDir(): string {
  const platform = process.platform;
  const home = os.homedir();

  switch (platform) {
    case 'darwin': // macOS
      return path.join(home, 'Library', 'Application Support', 'Claude');

    case 'win32': // Windows
      const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
      return path.join(appData, 'Claude');

    default: // Linux and others
      const configHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
      return path.join(configHome, 'Claude');
  }
}

/**
 * Get Claude Desktop config file path
 */
export function getClaudeDesktopConfigPath(): string {
  return path.join(getClaudeDesktopDir(), 'claude_desktop_config.json');
}

/**
 * Get Claude Extensions directory path
 */
export function getClaudeExtensionsDir(): string {
  return path.join(getClaudeDesktopDir(), 'Claude Extensions');
}

/**
 * Check if Claude Desktop config exists
 */
export function hasClaudeDesktopConfig(): boolean {
  const configPath = getClaudeDesktopConfigPath();
  return existsSync(configPath);
}

/**
 * Read Claude Desktop config file
 */
export async function readClaudeDesktopConfig(): Promise<any | null> {
  const configPath = getClaudeDesktopConfigPath();

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);
    return config;
  } catch (error) {
    console.error(`Failed to read Claude Desktop config: ${error}`);
    return null;
  }
}

/**
 * Extract MCP servers from Claude Desktop config
 */
export function extractMCPServers(claudeConfig: any): Record<string, any> {
  if (!claudeConfig || typeof claudeConfig !== 'object') {
    return {};
  }

  // Claude Desktop stores MCPs in "mcpServers" property
  const mcpServers = claudeConfig.mcpServers || {};

  return mcpServers;
}

/**
 * Read .mcpb extensions from Claude Extensions directory
 */
export async function readMCPBExtensions(): Promise<Record<string, any>> {
  const extensionsDir = getClaudeExtensionsDir();
  const mcpServers: Record<string, any> = {};

  try {
    // Check if extensions directory exists
    if (!existsSync(extensionsDir)) {
      return {};
    }

    // List all extension directories
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
        if (manifest.server && manifest.server.mcp_config) {
          const mcpConfig = manifest.server.mcp_config;

          // Resolve ${__dirname} to actual extension directory
          const command = mcpConfig.command;
          const args = mcpConfig.args?.map((arg: string) =>
            arg.replace('${__dirname}', extDir)
          ) || [];

          // Use extension name from manifest or directory name
          const mcpName = manifest.name || entry.name.replace(/^local\.dxt\.[^.]+\./, '');

          mcpServers[mcpName] = {
            command,
            args,
            env: mcpConfig.env || {},
            // Add metadata for tracking
            _source: '.mcpb',
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
    console.error(`Failed to read .mcpb extensions: ${error}`);
  }

  return mcpServers;
}

/**
 * Import MCPs from Claude Desktop (both JSON config and .mcpb extensions)
 * Returns the combined profile object ready to be saved
 */
export async function importFromClaudeDesktop(): Promise<{
  mcpServers: Record<string, any>;
  imported: boolean;
  count: number;
  sources: {
    json: number;
    mcpb: number;
  };
} | null> {
  const allMCPs: Record<string, any> = {};
  let jsonCount = 0;
  let mcpbCount = 0;

  // 1. Import from traditional JSON config
  if (hasClaudeDesktopConfig()) {
    const claudeConfig = await readClaudeDesktopConfig();
    if (claudeConfig) {
      const jsonMCPs = extractMCPServers(claudeConfig);
      jsonCount = Object.keys(jsonMCPs).length;

      // Add source metadata
      for (const [name, config] of Object.entries(jsonMCPs)) {
        allMCPs[name] = { ...config, _source: 'json' };
      }
    }
  }

  // 2. Import from .mcpb extensions
  const mcpbMCPs = await readMCPBExtensions();
  mcpbCount = Object.keys(mcpbMCPs).length;

  // Merge .mcpb extensions (json config takes precedence for same name)
  for (const [name, config] of Object.entries(mcpbMCPs)) {
    if (!(name in allMCPs)) {
      allMCPs[name] = config;
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
      json: jsonCount,
      mcpb: mcpbCount
    }
  };
}

/**
 * Check if we should auto-import (first run detection)
 * Returns true if:
 * 1. NCP profile doesn't exist OR is empty
 * 2. Claude Desktop has MCPs (in JSON config OR .mcpb extensions)
 */
export async function shouldAutoImport(ncpProfilePath: string): Promise<boolean> {
  // Check if NCP profile exists and has MCPs
  const ncpProfileExists = existsSync(ncpProfilePath);

  if (ncpProfileExists) {
    try {
      const content = await fs.readFile(ncpProfilePath, 'utf-8');
      const profile = JSON.parse(content);
      const existingMCPs = profile.mcpServers || {};

      // If profile has MCPs already, don't auto-import
      if (Object.keys(existingMCPs).length > 0) {
        return false;
      }
    } catch {
      // If we can't read the profile, treat as empty
    }
  }

  // Check if Claude Desktop has MCPs to import (either JSON or .mcpb)
  const hasJsonConfig = hasClaudeDesktopConfig();
  const hasExtensions = existsSync(getClaudeExtensionsDir());

  return hasJsonConfig || hasExtensions;
}

/**
 * Merge imported MCPs with existing profile
 * Existing MCPs take precedence (no overwrite)
 */
export function mergeConfigs(
  existing: Record<string, any>,
  imported: Record<string, any>
): {
  merged: Record<string, any>;
  added: string[];
  skipped: string[];
} {
  const merged = { ...existing };
  const added: string[] = [];
  const skipped: string[] = [];

  for (const [name, config] of Object.entries(imported)) {
    if (name in merged) {
      skipped.push(name);
    } else {
      merged[name] = config;
      added.push(name);
    }
  }

  return { merged, added, skipped };
}
