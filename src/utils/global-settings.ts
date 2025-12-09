/**
 * Global Settings Manager for NCP
 * Manages user preferences in ~/.ncp/settings.json
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { getNcpBaseDirectory } from './ncp-paths.js';

export interface ConfirmBeforeRunSettings {
  enabled: boolean;
  modifierPattern: string;
  vectorThreshold: number;
  approvedTools: string[];
}

export interface LogRotationSettings {
  enabled: boolean;
  maxDebugFiles: number;
  maxProtocolLines: number;
}

export interface GlobalSettings {
  confirmBeforeRun: ConfirmBeforeRunSettings;
  logRotation: LogRotationSettings;
  enableCodeMode: boolean;
  enableSkills: boolean;
  enablePhotonRuntime: boolean;
}

/**
 * Default settings - confirmBeforeRun is ENABLED by default
 * Users see the confirmation dialog first, then can turn it off if they want
 */
export const DEFAULT_SETTINGS: GlobalSettings = {
  confirmBeforeRun: {
    // User-facing: "Confirm modifications before executing"
    // Protects against unwanted writes, deletes, and executions
    enabled: true, // ON by default

    // ADVANCED: Tag-based pattern for semantic matching
    // Space-separated tags with hyphens for multi-word concepts
    // Tested against 83 MCP tools - achieved 46.4% peak accuracy
    // Most users should not modify this - use CLI toggle instead
    modifierPattern: 'delete-files remove-data-permanently create-files write-to-disk send-emails send-messages publish-content-online execute-shell-commands run-scripts modify-database-records deploy-to-production push-to-production http-post-requests http-put-requests http-delete-requests update-data patch-data drop-database-tables truncate-tables git-commit git-push transfer-money charge-payments revoke-access revoke-permissions permanent-changes irreversible-changes',

    // ADVANCED: Similarity threshold (0.0-1.0)
    // 0.40 catches 5 critical operations (~6% of tools)
    // Lower = more sensitive, Higher = less sensitive
    // Most users should not modify this
    vectorThreshold: 0.40,

    // Tools user approved via "Approve Always" button
    // Managed automatically - can be cleared via CLI
    approvedTools: []
  },
  logRotation: {
    // Auto-rotate log files to prevent disk space issues
    enabled: true, // ON by default

    // Maximum number of debug log files to keep
    // Older files are deleted automatically
    maxDebugFiles: 10,

    // Maximum number of protocol log lines to keep (request+response pairs)
    // 2000 lines = 1000 request/response pairs
    maxProtocolLines: 2000
  },
  enableCodeMode: true, // ON by default - DXT: edit ~/.ncp/settings.json, NPM: set NCP_ENABLE_CODE_MODE env var
  enableSkills: true, // ON by default - skills provide valuable tools
  enablePhotonRuntime: true // ON by default - DXT: edit ~/.ncp/settings.json, NPM: set NCP_ENABLE_PHOTON_RUNTIME env var
};

/**
 * Get settings file path
 */
function getSettingsPath(): string {
  return path.join(getNcpBaseDirectory(), 'settings.json');
}

/**
 * Load global settings
 * Returns default settings if file doesn't exist
 * Respects NCP_CONFIRM_BEFORE_RUN environment variable from extension settings
 */
export async function loadGlobalSettings(): Promise<GlobalSettings> {
  const settingsPath = getSettingsPath();

  // Debug logging
  if (process.env.NCP_DEBUG === 'true') {
    console.error(`[DEBUG SETTINGS] Settings path: ${settingsPath}`);
    console.error(`[DEBUG SETTINGS] File exists: ${existsSync(settingsPath)}`);
    console.error(`[DEBUG SETTINGS] Working directory: ${process.cwd()}`);
    console.error(`[DEBUG SETTINGS] ENV NCP_ENABLE_CODE_MODE: ${process.env.NCP_ENABLE_CODE_MODE || 'not set'}`);
  }

  // Start with defaults
  let settings: GlobalSettings = { ...DEFAULT_SETTINGS };

  // Load from file if it exists
  if (existsSync(settingsPath)) {
    try {
      const content = await fs.readFile(settingsPath, 'utf-8');
      const fileSettings = JSON.parse(content);

      if (process.env.NCP_DEBUG === 'true') {
        console.error(`[DEBUG SETTINGS] Loaded from file: enableCodeMode=${fileSettings.enableCodeMode}, enableSkills=${fileSettings.enableSkills}`);
      }

      // Merge with defaults to ensure all fields exist
      settings = {
        confirmBeforeRun: {
          ...DEFAULT_SETTINGS.confirmBeforeRun,
          ...(fileSettings.confirmBeforeRun || {})
        },
        logRotation: {
          ...DEFAULT_SETTINGS.logRotation,
          ...(fileSettings.logRotation || {})
        },
        enableCodeMode: fileSettings.enableCodeMode !== undefined ? fileSettings.enableCodeMode : DEFAULT_SETTINGS.enableCodeMode,
        enableSkills: fileSettings.enableSkills !== undefined ? fileSettings.enableSkills : DEFAULT_SETTINGS.enableSkills,
        enablePhotonRuntime: fileSettings.enablePhotonRuntime !== undefined ? fileSettings.enablePhotonRuntime : DEFAULT_SETTINGS.enablePhotonRuntime
      };
    } catch (error) {
      console.warn('Failed to load settings, using defaults:', error);
    }
  } else {
    if (process.env.NCP_DEBUG === 'true') {
      console.error(`[DEBUG SETTINGS] No settings file found, using defaults + env vars`);
    }
  }

  // Handle environment variable overrides (for NPM installations)
  // DXT installations: No env vars set → use settings file
  // NPM installations: Env vars set in claude_desktop_config.json → use env vars
  //
  // Logic: If env var is set, prefer it over settings file
  // This allows NPM users to configure via claude_desktop_config.json

  if (process.env.NCP_ENABLE_CODE_MODE !== undefined) {
    const envValue = process.env.NCP_ENABLE_CODE_MODE === 'true';
    if (settings.enableCodeMode !== envValue) {
      settings.enableCodeMode = envValue;

      if (process.env.NCP_DEBUG === 'true') {
        console.error(`[DEBUG SETTINGS] Applied env var (non-persistent): enableCodeMode=${envValue}`);
      }
    }
  }

  if (process.env.NCP_ENABLE_PHOTON_RUNTIME !== undefined) {
    const envValue = process.env.NCP_ENABLE_PHOTON_RUNTIME === 'true';
    if (settings.enablePhotonRuntime !== envValue) {
      settings.enablePhotonRuntime = envValue;

      if (process.env.NCP_DEBUG === 'true') {
        console.error(`[DEBUG SETTINGS] Applied env var (non-persistent): enablePhotonRuntime=${envValue}`);
      }
    }
  } else {
    // No env var set - set it based on settings file value
    // This allows internal-mcp-manager to check process.env.NCP_ENABLE_PHOTON_RUNTIME
    process.env.NCP_ENABLE_PHOTON_RUNTIME = settings.enablePhotonRuntime ? 'true' : 'false';

    if (process.env.NCP_DEBUG === 'true') {
      console.error(`[DEBUG SETTINGS] Set env var from settings: NCP_ENABLE_PHOTON_RUNTIME=${process.env.NCP_ENABLE_PHOTON_RUNTIME}`);
    }
  }

  if (!existsSync(settingsPath)) {
    // No settings file - save defaults
    await saveGlobalSettings(settings);

    if (process.env.NCP_DEBUG === 'true') {
      console.error('[DEBUG SETTINGS] Created new settings file with defaults');
    }
  }

  // Debug logging for final settings
  if (process.env.NCP_DEBUG === 'true') {
    console.error(`[DEBUG SETTINGS] Final settings: enableCodeMode=${settings.enableCodeMode}, enableSkills=${settings.enableSkills}, enablePhotonRuntime=${settings.enablePhotonRuntime}`);
  }

  return settings;
}

/**
 * Save global settings
 */
export async function saveGlobalSettings(settings: GlobalSettings): Promise<void> {
  const settingsPath = getSettingsPath();
  const settingsDir = path.dirname(settingsPath);

  // Ensure directory exists
  if (!existsSync(settingsDir)) {
    await fs.mkdir(settingsDir, { recursive: true });
  }

  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * Update confirm-before-run settings
 */
export async function updateConfirmBeforeRunSettings(
  updates: Partial<ConfirmBeforeRunSettings>
): Promise<void> {
  const settings = await loadGlobalSettings();

  settings.confirmBeforeRun = {
    ...settings.confirmBeforeRun,
    ...updates
  };

  await saveGlobalSettings(settings);
}

/**
 * Add tool to whitelist (user clicked "Approve Always")
 */
export async function addToolToWhitelist(toolIdentifier: string): Promise<void> {
  const settings = await loadGlobalSettings();

  if (!settings.confirmBeforeRun.approvedTools.includes(toolIdentifier)) {
    settings.confirmBeforeRun.approvedTools.push(toolIdentifier);
    await saveGlobalSettings(settings);
  }
}

/**
 * Check if tool is in whitelist
 */
export async function isToolWhitelisted(toolIdentifier: string): Promise<boolean> {
  const settings = await loadGlobalSettings();
  return settings.confirmBeforeRun.approvedTools.includes(toolIdentifier);
}

/**
 * Remove tool from whitelist
 */
export async function removeToolFromWhitelist(toolIdentifier: string): Promise<void> {
  const settings = await loadGlobalSettings();

  settings.confirmBeforeRun.approvedTools = settings.confirmBeforeRun.approvedTools.filter(
    tool => tool !== toolIdentifier
  );

  await saveGlobalSettings(settings);
}
