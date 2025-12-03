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
  enableCodeMode: false, // Default to find-and-run mode for backward compatibility
  enableSkills: true // ON by default - skills provide valuable tools
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

  // Start with defaults
  let settings: GlobalSettings = { ...DEFAULT_SETTINGS };

  // Load from file if it exists
  if (existsSync(settingsPath)) {
    try {
      const content = await fs.readFile(settingsPath, 'utf-8');
      const fileSettings = JSON.parse(content);

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
        enableSkills: fileSettings.enableSkills !== undefined ? fileSettings.enableSkills : DEFAULT_SETTINGS.enableSkills
      };
    } catch (error) {
      console.warn('Failed to load settings, using defaults:', error);
    }
  }

  // IMPORTANT: Saved settings file is the source of truth
  //
  // User's expectation: Once settings are saved to .ncp/settings.json, they should
  // always be respected, regardless of what env vars Claude Desktop sets on reinstall.
  //
  // Logic:
  // - If settings file exists: Use saved settings, ignore all env vars
  // - If settings file doesn't exist (first install): Use env vars or defaults, then save
  //
  // This ensures user preferences persist across DXT updates/reinstalls.

  if (!existsSync(settingsPath)) {
    // First install - no saved settings yet
    // Apply env vars from Claude Desktop UI (if any)
    if (process.env.NCP_CONFIRM_BEFORE_RUN !== undefined) {
      settings.confirmBeforeRun.enabled = process.env.NCP_CONFIRM_BEFORE_RUN === 'true';
    }

    if (process.env.NCP_ENABLE_LOG_ROTATION !== undefined) {
      settings.logRotation.enabled = process.env.NCP_ENABLE_LOG_ROTATION === 'true';
    }

    if (process.env.NCP_ENABLE_CODE_MODE !== undefined) {
      settings.enableCodeMode = process.env.NCP_ENABLE_CODE_MODE === 'true';
    }

    if (process.env.NCP_ENABLE_SKILLS !== undefined) {
      settings.enableSkills = process.env.NCP_ENABLE_SKILLS === 'true';
    }

    // Save initial settings for persistence
    await saveGlobalSettings(settings);
  }
  // else: Settings file exists - use saved settings, ignore env vars completely

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
