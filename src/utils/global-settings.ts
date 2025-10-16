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

export interface GlobalSettings {
  confirmBeforeRun: ConfirmBeforeRunSettings;
  // Future settings can be added here
}

/**
 * Default settings - confirmBeforeRun is ENABLED by default
 * Users see the confirmation dialog first, then can turn it off if they want
 */
export const DEFAULT_SETTINGS: GlobalSettings = {
  confirmBeforeRun: {
    enabled: true, // ON by default - show dialog first, let users turn it off

    // Comprehensive modifier pattern - the "long sentence"
    modifierPattern: 'operations that delete files, remove data permanently, create or write files to disk, send emails or messages, post or publish content online, execute shell commands or scripts, modify database records, deploy or push to production, make HTTP POST PUT or DELETE requests, update or patch existing data, drop or truncate tables, commit or push to git repositories, transfer money or charge payments, revoke access or permissions, or make any changes that cannot be easily undone',

    // How closely tool must match (0.0-1.0)
    vectorThreshold: 0.65,

    // Whitelist of tools user approved permanently
    approvedTools: []
  }
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
 */
export async function loadGlobalSettings(): Promise<GlobalSettings> {
  const settingsPath = getSettingsPath();

  if (!existsSync(settingsPath)) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content);

    // Merge with defaults to ensure all fields exist
    return {
      confirmBeforeRun: {
        ...DEFAULT_SETTINGS.confirmBeforeRun,
        ...(settings.confirmBeforeRun || {})
      }
      // Add other settings here in the future
    };
  } catch (error) {
    console.warn('Failed to load settings, using defaults:', error);
    return { ...DEFAULT_SETTINGS };
  }
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
