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
  enableCodeMode: true, // ON by default - code mode enables powerful orchestration
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

  // Debug logging
  if (process.env.NCP_DEBUG === 'true') {
    console.error(`[DEBUG SETTINGS] Loading from: ${settingsPath}`);
    console.error(`[DEBUG SETTINGS] File exists: ${existsSync(settingsPath)}`);
  }

  // Start with defaults
  let settings: GlobalSettings = { ...DEFAULT_SETTINGS };

  // Load from file if it exists
  if (existsSync(settingsPath)) {
    try {
      const content = await fs.readFile(settingsPath, 'utf-8');
      const fileSettings = JSON.parse(content);

      if (process.env.NCP_DEBUG === 'true') {
        console.error(`[DEBUG SETTINGS] Loaded from file: enableCodeMode=${fileSettings.enableCodeMode}`);
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
        enableSkills: fileSettings.enableSkills !== undefined ? fileSettings.enableSkills : DEFAULT_SETTINGS.enableSkills
      };
    } catch (error) {
      console.warn('Failed to load settings, using defaults:', error);
    }
  } else {
    if (process.env.NCP_DEBUG === 'true') {
      console.error(`[DEBUG SETTINGS] No settings file found, using defaults + env vars`);
    }
  }

  // Settings file persistence
  // - If no file exists (first install): Save defaults to create the file
  // - If file exists: Already loaded above, just use it
  //
  // NOTE: Code mode is managed entirely through settings file, not env vars
  // This allows users to toggle it by editing ~/.ncp/settings.json

  if (!existsSync(settingsPath)) {
    // First install - save defaults to create settings file
    await saveGlobalSettings(settings);

    if (process.env.NCP_DEBUG === 'true') {
      console.error('[DEBUG SETTINGS] Created new settings file with defaults');
    }
  }

  // Debug logging for final settings
  if (process.env.NCP_DEBUG === 'true') {
    console.error(`[DEBUG SETTINGS] Final settings: enableCodeMode=${settings.enableCodeMode}, enableSkills=${settings.enableSkills}`);
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
