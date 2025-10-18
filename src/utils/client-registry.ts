/**
 * Client Registry for Auto-Import
 *
 * Maps MCP clients to their configuration locations and import strategies.
 * Supports expansion to multiple clients (Claude Desktop, Cursor, Cline, Enconvo, etc.)
 */

import * as path from 'path';
import * as os from 'os';

export type ConfigFormat = 'json' | 'toml';

export interface ClientPaths {
  darwin?: string;
  win32?: string;
  linux?: string;
}

export interface ClientDefinition {
  /** Human-readable client name */
  displayName: string;

  /** Config file paths for different platforms */
  configPaths: ClientPaths;

  /** Configuration file format */
  configFormat: ConfigFormat;

  /** Optional: Extensions/plugins directory (for .dxt-like bundles) */
  extensionsDir?: ClientPaths;

  /** Optional: Path to MCP servers config within main config file */
  mcpServersPath?: string;

  /** Optional: Bundled runtime paths (Node.js, Python) */
  bundledRuntimes?: {
    node?: ClientPaths;
    python?: ClientPaths;
  };

  /** Optional: Settings path in config for runtime preferences */
  runtimeSettingsPath?: string;
}

/**
 * Registry of known MCP clients
 *
 * Client IDs should match the `clientInfo.name` from MCP initialize request.
 * The getClientDefinition() function handles normalization (lowercase, no spaces/dashes).
 *
 * Adding a new client:
 * 1. Add entry to this registry with config paths and format
 * 2. If client uses custom format, add parser in client-importer.ts
 * 3. Auto-import will work automatically via tryAutoImportFromClient()
 *
 * Expected clientInfo.name values:
 * - Claude Desktop sends: "claude-desktop" or "Claude Desktop"
 * - Perplexity sends: "perplexity" or "Perplexity"
 * - Cursor sends: "cursor" or "Cursor"
 * - etc.
 */
export const CLIENT_REGISTRY: Record<string, ClientDefinition> = {
  /**
   * Claude Desktop (Anthropic)
   * PRIMARY CLIENT: Supports both JSON config and .dxt extensions
   * Most widely used MCP client with native .dxt bundle support
   */
  'claude-desktop': {
    displayName: 'Claude Desktop',
    configPaths: {
      darwin: '~/Library/Application Support/Claude/claude_desktop_config.json',
      win32: '%APPDATA%/Claude/claude_desktop_config.json',
      linux: '~/.config/Claude/claude_desktop_config.json'
    },
    configFormat: 'json',
    extensionsDir: {
      darwin: '~/Library/Application Support/Claude/Claude Extensions',
      win32: '%APPDATA%/Claude/Claude Extensions',
      linux: '~/.config/Claude/Claude Extensions'
    },
    mcpServersPath: 'mcpServers',
    // Note: Claude Desktop does NOT bundle Node/Python runtimes
    // It uses system-installed runtimes (node, npx, python3)
    // The bundled runtime paths below are kept for reference but do not exist
    bundledRuntimes: undefined,
    runtimeSettingsPath: 'extensionSettings.useBuiltInNodeForMCP'
  },

  /**
   * Cursor (IDE)
   * Uses JSON config in VS Code-like structure
   */
  'cursor': {
    displayName: 'Cursor',
    configPaths: {
      darwin: '~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
      win32: '%APPDATA%/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
      linux: '~/.config/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json'
    },
    configFormat: 'json',
    mcpServersPath: 'mcpServers'
  },

  /**
   * Cline (VS Code Extension)
   * Uses JSON config
   */
  'cline': {
    displayName: 'Cline',
    configPaths: {
      darwin: '~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
      win32: '%APPDATA%/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
      linux: '~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json'
    },
    configFormat: 'json',
    mcpServersPath: 'mcpServers'
  },

  /**
   * Continue (VS Code Extension)
   * Uses TOML config
   */
  'continue': {
    displayName: 'Continue',
    configPaths: {
      darwin: '~/.continue/config.json',
      win32: '%USERPROFILE%/.continue/config.json',
      linux: '~/.continue/config.json'
    },
    configFormat: 'json',
    mcpServersPath: 'experimental.modelContextProtocolServers'
  },

  /**
   * Perplexity (Mac App)
   * Uses JSON config in sandboxed container
   * Supports "dxt" extensions (similar to .dxt)
   */
  'perplexity': {
    displayName: 'Perplexity',
    configPaths: {
      darwin: '~/Library/Containers/ai.perplexity.mac/Data/Documents/mcp_servers',
      // Windows and Linux support TBD when available
    },
    configFormat: 'json',
    extensionsDir: {
      darwin: '~/Library/Containers/ai.perplexity.mac/Data/Documents/connectors/dxt/installed',
    },
    mcpServersPath: 'servers' // Array format, not object
  },

  /**
   * Zed (IDE)
   * Uses JSON config with MCP settings
   */
  'zed': {
    displayName: 'Zed',
    configPaths: {
      darwin: '~/.config/zed/settings.json',
      linux: '~/.config/zed/settings.json',
      // Windows path TBD
    },
    configFormat: 'json',
    mcpServersPath: 'context_servers'
  },

  /**
   * Windsurf (Codeium's IDE)
   * Uses JSON config similar to Cursor
   */
  'windsurf': {
    displayName: 'Windsurf',
    configPaths: {
      darwin: '~/Library/Application Support/Windsurf/User/globalStorage/Codeium.windsurf/mcp_settings.json',
      win32: '%APPDATA%/Windsurf/User/globalStorage/Codeium.windsurf/mcp_settings.json',
      linux: '~/.config/Windsurf/User/globalStorage/Codeium.windsurf/mcp_settings.json'
    },
    configFormat: 'json',
    mcpServersPath: 'mcpServers'
  },

  /**
   * Enconvo (Mac AI Assistant)
   * Uses JSON config in application support
   */
  'enconvo': {
    displayName: 'Enconvo',
    configPaths: {
      darwin: '~/Library/Application Support/Enconvo/mcp_config.json'
      // macOS only currently
    },
    configFormat: 'json',
    mcpServersPath: 'mcpServers'
  },

  /**
   * Raycast (Mac Launcher)
   * Uses JSON config for AI/MCP integration
   */
  'raycast': {
    displayName: 'Raycast',
    configPaths: {
      darwin: '~/Library/Application Support/com.raycast.macos/mcp_servers.json'
      // macOS only
    },
    configFormat: 'json',
    mcpServersPath: 'servers'
  },

  /**
   * VS Code (with native MCP support)
   * Uses settings.json for MCP configuration
   */
  'vscode': {
    displayName: 'VS Code',
    configPaths: {
      darwin: '~/Library/Application Support/Code/User/settings.json',
      win32: '%APPDATA%/Code/User/settings.json',
      linux: '~/.config/Code/User/settings.json'
    },
    configFormat: 'json',
    mcpServersPath: 'mcp.servers'
  },

  /**
   * GitHub Copilot (VS Code Extension with MCP)
   * Uses workspace or global settings
   */
  'github-copilot': {
    displayName: 'GitHub Copilot',
    configPaths: {
      darwin: '~/Library/Application Support/Code/User/settings.json',
      win32: '%APPDATA%/Code/User/settings.json',
      linux: '~/.config/Code/User/settings.json'
    },
    configFormat: 'json',
    mcpServersPath: 'github.copilot.mcp.servers'
  },

  /**
   * Pieces (Developer productivity tool)
   * Uses JSON config in application support
   */
  'pieces': {
    displayName: 'Pieces',
    configPaths: {
      darwin: '~/Library/Application Support/Pieces/mcp_config.json',
      win32: '%APPDATA%/Pieces/mcp_config.json',
      linux: '~/.config/Pieces/mcp_config.json'
    },
    configFormat: 'json',
    mcpServersPath: 'mcpServers'
  },

  /**
   * Tabnine (AI Code Assistant)
   * Uses JSON config for MCP integration
   */
  'tabnine': {
    displayName: 'Tabnine',
    configPaths: {
      darwin: '~/.tabnine/mcp_config.json',
      win32: '%USERPROFILE%/.tabnine/mcp_config.json',
      linux: '~/.tabnine/mcp_config.json'
    },
    configFormat: 'json',
    mcpServersPath: 'mcpServers'
  },

  /**
   * Claude Code (Anthropic's IDE)
   * Uses NCP natively, but may have fallback config
   */
  'claude-code': {
    displayName: 'Claude Code',
    configPaths: {
      darwin: '~/Library/Application Support/Claude Code/mcp_config.json',
      win32: '%APPDATA%/Claude Code/mcp_config.json',
      linux: '~/.config/Claude Code/mcp_config.json'
    },
    configFormat: 'json',
    mcpServersPath: 'mcpServers'
  }
};

/**
 * Get client definition by client name (from clientInfo.name)
 */
export function getClientDefinition(clientName: string): ClientDefinition | null {
  // Normalize client name (lowercase, remove spaces/dashes)
  const normalized = clientName.toLowerCase().replace(/[\s-]/g, '');

  // Try exact match first
  if (CLIENT_REGISTRY[clientName]) {
    return CLIENT_REGISTRY[clientName];
  }

  // Try normalized match
  for (const [key, definition] of Object.entries(CLIENT_REGISTRY)) {
    if (key.replace(/[\s-]/g, '') === normalized) {
      return definition;
    }
  }

  return null;
}

/**
 * Resolve platform-specific path
 */
export function resolvePlatformPath(paths: ClientPaths): string | null {
  const platform = process.platform as keyof ClientPaths;
  const pathTemplate = paths[platform];

  if (!pathTemplate) {
    return null;
  }

  const home = os.homedir();

  // Expand ~ and environment variables
  let resolved = pathTemplate
    .replace(/^~/, home)
    .replace(/%APPDATA%/g, process.env.APPDATA || path.join(home, 'AppData', 'Roaming'))
    .replace(/%USERPROFILE%/g, process.env.USERPROFILE || home)
    .replace(/\$HOME/g, home);

  return resolved;
}

/**
 * Get config path for client on current platform
 */
export function getClientConfigPath(clientName: string): string | null {
  const definition = getClientDefinition(clientName);
  if (!definition) {
    return null;
  }

  return resolvePlatformPath(definition.configPaths);
}

/**
 * Get extensions directory for client on current platform
 */
export function getClientExtensionsDir(clientName: string): string | null {
  const definition = getClientDefinition(clientName);
  if (!definition?.extensionsDir) {
    return null;
  }

  return resolvePlatformPath(definition.extensionsDir);
}

/**
 * Check if client supports extensions (.dxt bundles)
 */
export function clientSupportsExtensions(clientName: string): boolean {
  const definition = getClientDefinition(clientName);
  return !!definition?.extensionsDir;
}

/**
 * List all registered client names
 */
export function listRegisteredClients(): string[] {
  return Object.keys(CLIENT_REGISTRY);
}

/**
 * Get bundled runtime path for a client
 */
export function getBundledRuntimePath(
  clientName: string,
  runtime: 'node' | 'python'
): string | null {
  const definition = getClientDefinition(clientName);
  if (!definition?.bundledRuntimes?.[runtime]) {
    return null;
  }

  return resolvePlatformPath(definition.bundledRuntimes[runtime]!);
}

/**
 * Check if client has "use built-in runtime" setting enabled
 * Returns null if setting not found, true/false if found
 */
export function shouldUseBuiltInRuntime(
  clientName: string,
  clientConfig: any
): boolean | null {
  const definition = getClientDefinition(clientName);
  if (!definition?.runtimeSettingsPath) {
    return null;
  }

  const settingValue = getNestedProperty(clientConfig, definition.runtimeSettingsPath);
  return typeof settingValue === 'boolean' ? settingValue : null;
}

/**
 * Get nested property from object using dot notation
 * Example: 'extensionSettings.useBuiltInNodeForMCP' -> obj.extensionSettings.useBuiltInNodeForMCP
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
