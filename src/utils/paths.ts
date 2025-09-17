/**
 * NCP Standardized File System Paths
 *
 * This file defines all file paths used by NCP components.
 * DO NOT hardcode paths elsewhere - always import from here.
 *
 * Cross-platform directory locations:
 * - Windows: %APPDATA%\ncp\ (e.g., C:\Users\Username\AppData\Roaming\ncp\)
 * - macOS: ~/Library/Preferences/ncp/
 * - Linux: ~/.config/ncp/
 *
 * See NCP_FILE_SYSTEM_ARCHITECTURE.md for complete documentation.
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import envPaths from 'env-paths';

// Cross-platform user directories using env-paths
const paths = envPaths('ncp');

// Base Directories (cross-platform)
export const NCP_BASE_DIR = paths.config;
export const NCP_PROFILES_DIR = path.join(NCP_BASE_DIR, 'profiles');
export const NCP_CACHE_DIR = path.join(NCP_BASE_DIR, 'cache');
export const NCP_LOGS_DIR = path.join(NCP_BASE_DIR, 'logs');
export const NCP_CONFIG_DIR = path.join(NCP_BASE_DIR, 'config');
export const NCP_TEMP_DIR = path.join(NCP_BASE_DIR, 'temp');

// Profile Files
export const PROFILE_ALL = path.join(NCP_PROFILES_DIR, 'all.json');
export const PROFILE_CLAUDE_DESKTOP = path.join(NCP_PROFILES_DIR, 'claude-desktop.json');
export const PROFILE_CLAUDE_CODE = path.join(NCP_PROFILES_DIR, 'claude-code.json');
export const PROFILE_DEV = path.join(NCP_PROFILES_DIR, 'dev.json');
export const PROFILE_MINIMAL = path.join(NCP_PROFILES_DIR, 'minimal.json');

// Cache Files (currently stored in base directory, not cache subdirectory)
export const TOOL_CACHE_FILE = path.join(NCP_BASE_DIR, 'tool-cache.json');
export const MCP_HEALTH_CACHE = path.join(NCP_BASE_DIR, 'mcp-health.json');
export const DISCOVERY_INDEX_CACHE = path.join(NCP_CACHE_DIR, 'discovery-index.json');

// Profile-specific vector database files
export const EMBEDDINGS_DIR = path.join(NCP_CACHE_DIR, 'embeddings');
export const EMBEDDINGS_METADATA_DIR = path.join(NCP_CACHE_DIR, 'metadata');

// Log Files
export const MAIN_LOG_FILE = path.join(NCP_LOGS_DIR, 'ncp.log');
export const MCP_LOG_FILE = path.join(NCP_LOGS_DIR, 'mcp-connections.log');
export const DISCOVERY_LOG_FILE = path.join(NCP_LOGS_DIR, 'discovery.log');

// Config Files
export const GLOBAL_SETTINGS = path.join(NCP_CONFIG_DIR, 'settings.json');

// Client-specific configs
export const CLIENT_CONFIGS_DIR = path.join(NCP_CONFIG_DIR, 'client-configs');
export const CLAUDE_DESKTOP_CONFIG = path.join(CLIENT_CONFIGS_DIR, 'claude-desktop.json');
export const CLAUDE_CODE_CONFIG = path.join(CLIENT_CONFIGS_DIR, 'claude-code.json');

// Temporary directories
export const MCP_PROBES_TEMP = path.join(NCP_TEMP_DIR, 'mcp-probes');
export const INSTALLATION_TEMP = path.join(NCP_TEMP_DIR, 'installation');

/**
 * Ensures all NCP directories exist
 * MUST be called on startup by all NCP components
 */
export async function ensureNCPDirectories(): Promise<void> {
  const directories = [
    NCP_BASE_DIR,
    NCP_PROFILES_DIR,
    NCP_CACHE_DIR,
    NCP_LOGS_DIR,
    NCP_CONFIG_DIR,
    NCP_TEMP_DIR,
    CLIENT_CONFIGS_DIR,
    MCP_PROBES_TEMP,
    INSTALLATION_TEMP,
    EMBEDDINGS_DIR,
    EMBEDDINGS_METADATA_DIR
  ];

  for (const dir of directories) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      console.error(`Failed to create directory ${dir}:`, error);
    }
  }
}

/**
 * Gets profile path by name
 * @param profileName - Name of the profile (without .json extension)
 * @returns Full path to profile file
 */
export function getProfilePath(profileName: string): string {
  return path.join(NCP_PROFILES_DIR, `${profileName}.json`);
}

/**
 * Migration utility: Move file if it exists at old location
 * @param oldPath - Current file location
 * @param newPath - New standardized location
 */
export async function migrateFile(oldPath: string, newPath: string): Promise<boolean> {
  try {
    // Check if old file exists
    await fs.access(oldPath);
    
    // Ensure new directory exists
    await fs.mkdir(path.dirname(newPath), { recursive: true });
    
    // Move file
    await fs.rename(oldPath, newPath);
    console.log(`Migrated: ${oldPath} → ${newPath}`);
    return true;
  } catch (error) {
    // File doesn't exist at old location, that's fine
    return false;
  }
}

/**
 * Migrate all files from old locations to standardized locations
 * Should be called once during upgrade
 */
export async function migrateAllFiles(): Promise<void> {
  console.log('Starting NCP file migration...');
  
  // Migrate tool cache
  await migrateFile('.tool-cache.json', TOOL_CACHE_FILE);
  await migrateFile('tool-cache.json', TOOL_CACHE_FILE);
  
  // Migrate old profile files
  await migrateFile('.ncp/profiles/default.json', PROFILE_ALL);
  await migrateFile('.ncp/profiles/development.json', PROFILE_DEV);
  
  console.log('NCP file migration complete');
}