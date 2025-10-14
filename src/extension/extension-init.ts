/**
 * Extension Initialization
 *
 * Handles NCP initialization when running as a Claude Desktop extension (.dxt).
 * Processes user configuration and sets up the environment accordingly.
 */

import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, symlinkSync, unlinkSync, chmodSync } from 'fs';
import { logger } from '../utils/logger.js';
import { importFromClient } from '../utils/client-importer.js';
import ProfileManager from '../profiles/profile-manager.js';

export interface ExtensionConfig {
  profile: string;
  configPath: string;
  enableGlobalCLI: boolean;
  autoImport: boolean;
  debug: boolean;
}

/**
 * Parse extension configuration from environment variables
 */
export function parseExtensionConfig(): ExtensionConfig {
  return {
    profile: process.env.NCP_PROFILE || 'all',
    configPath: expandPath(process.env.NCP_CONFIG_PATH || '~/.ncp'),
    enableGlobalCLI: process.env.NCP_ENABLE_GLOBAL_CLI === 'true',
    autoImport: process.env.NCP_AUTO_IMPORT !== 'false', // Default true
    debug: process.env.NCP_DEBUG === 'true'
  };
}

/**
 * Expand ~ to home directory
 */
function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

/**
 * Initialize NCP as an extension
 */
export async function initializeExtension(): Promise<void> {
  const config = parseExtensionConfig();

  if (config.debug) {
    process.env.NCP_DEBUG = 'true';
    console.error('[Extension] Configuration:');
    console.error(`  Profile: ${config.profile}`);
    console.error(`  Config Path: ${config.configPath}`);
    console.error(`  Global CLI: ${config.enableGlobalCLI}`);
    console.error(`  Auto-import: ${config.autoImport}`);
  }

  // 1. Ensure config directory exists
  ensureConfigDirectory(config.configPath);

  // 2. Set up global CLI if enabled
  if (config.enableGlobalCLI) {
    await setupGlobalCLI(config.debug);
  }

  // 3. Auto-import Claude Desktop MCPs if enabled
  if (config.autoImport) {
    await autoImportClaudeMCPs(config.profile, config.debug);
  }

  logger.info(`✅ NCP extension initialized (profile: ${config.profile})`);
}

/**
 * Ensure configuration directory exists
 */
function ensureConfigDirectory(configPath: string): void {
  const profilesDir = join(configPath, 'profiles');

  if (!existsSync(profilesDir)) {
    mkdirSync(profilesDir, { recursive: true });
    logger.info(`Created NCP config directory: ${profilesDir}`);
  }
}

/**
 * Set up global CLI access via symlink
 */
async function setupGlobalCLI(debug: boolean): Promise<void> {
  try {
    // Find NCP executable (within extension bundle)
    const extensionDir = join(__dirname, '..');
    const ncpExecutable = join(extensionDir, 'dist', 'index.js');

    if (!existsSync(ncpExecutable)) {
      logger.warn('NCP executable not found, skipping global CLI setup');
      return;
    }

    // Create symlink in /usr/local/bin (requires sudo, may fail)
    const globalLink = '/usr/local/bin/ncp';

    // Remove existing symlink if present
    if (existsSync(globalLink)) {
      try {
        unlinkSync(globalLink);
      } catch (err) {
        // Ignore errors, might be a file or permission issue
      }
    }

    // Try to create symlink
    try {
      symlinkSync(ncpExecutable, globalLink);
      chmodSync(globalLink, 0o755);
      logger.info('✅ Global CLI access enabled: ncp command available');
      if (debug) {
        console.error(`[Extension] Created symlink: ${globalLink} -> ${ncpExecutable}`);
      }
    } catch (err: any) {
      // Likely permission error
      logger.warn(`Could not create global CLI link (requires sudo): ${err.message}`);
      logger.info(`Run manually: sudo ln -sf ${ncpExecutable} /usr/local/bin/ncp`);
    }
  } catch (error: any) {
    logger.error(`Failed to set up global CLI: ${error.message}`);
  }
}

/**
 * Auto-import MCPs from Claude Desktop
 */
async function autoImportClaudeMCPs(profileName: string, debug: boolean): Promise<void> {
  try {
    if (debug) {
      console.error('[Extension] Auto-importing Claude Desktop MCPs...');
    }

    // Import from Claude Desktop
    const result = await importFromClient('claude-desktop');

    if (!result || result.count === 0) {
      if (debug) {
        console.error('[Extension] No MCPs found in Claude Desktop config');
      }
      return;
    }

    // Initialize profile manager
    const profileManager = new ProfileManager();
    await profileManager.initialize();

    // Get or create profile
    let profile = await profileManager.getProfile(profileName);
    if (!profile) {
      profile = {
        name: profileName,
        description: `Auto-imported from Claude Desktop`,
        mcpServers: {},
        metadata: {
          created: new Date().toISOString(),
          modified: new Date().toISOString()
        }
      };
    }

    // Import each MCP
    let importedCount = 0;
    let skippedNCP = 0;
    for (const [name, config] of Object.entries(result.mcpServers)) {
      // Skip NCP instances (avoid importing ourselves!)
      if (isNCPInstance(name, config)) {
        skippedNCP++;
        if (debug) {
          console.error(`[Extension] Skipping ${name} (NCP instance - avoiding recursion)`);
        }
        continue;
      }

      // Skip if already exists (don't overwrite user configs)
      if (profile!.mcpServers[name]) {
        if (debug) {
          console.error(`[Extension] Skipping ${name} (already configured)`);
        }
        continue;
      }

      // Detect transport type for logging
      const transport = detectTransportType(config);

      // Add to profile
      profile!.mcpServers[name] = config;
      importedCount++;

      if (debug) {
        const source = config._source || 'config';
        console.error(`[Extension] Imported ${name} from ${source} (transport: ${transport})`);
      }
    }

    // Update metadata
    profile!.metadata.modified = new Date().toISOString();

    // Save profile
    await profileManager.saveProfile(profile!);

    logger.info(`✅ Auto-imported ${importedCount} MCPs from Claude Desktop into '${profileName}' profile`);
    if (skippedNCP > 0) {
      logger.info(`   (Skipped ${skippedNCP} NCP instance${skippedNCP > 1 ? 's' : ''} to avoid recursion)`);
    }
    if (debug) {
      console.error(`[Extension] Total MCPs in profile: ${Object.keys(profile!.mcpServers).length}`);
    }
  } catch (error: any) {
    logger.error(`Failed to auto-import Claude Desktop MCPs: ${error.message}`);
  }
}

/**
 * Check if running as extension
 */
export function isRunningAsExtension(): boolean {
  return process.env.NCP_MODE === 'extension';
}

/**
 * Detect transport type from MCP config
 */
function detectTransportType(config: any): string {
  // HTTP/SSE transport uses 'url' field (Claude Desktop native support)
  if (config.url) {
    return 'HTTP/SSE';
  }

  // stdio transport uses 'command' and 'args' fields
  if (config.command) {
    return 'stdio';
  }

  return 'unknown';
}

/**
 * Detect if an MCP config is an NCP instance
 * Prevents importing ourselves and causing recursion
 */
function isNCPInstance(name: string, config: any): boolean {
  // Check 1: Name contains "ncp" (case-insensitive)
  if (name.toLowerCase().includes('ncp')) {
    return true;
  }

  // Check 2: Command points to NCP executable
  const command = config.command?.toLowerCase() || '';
  if (command.includes('ncp')) {
    return true;
  }

  // Check 3: Args contain NCP-specific flags
  const args = config.args || [];
  const argsStr = args.join(' ').toLowerCase();
  if (argsStr.includes('--profile') || argsStr.includes('ncp')) {
    return true;
  }

  // Check 4: Display name in env vars
  const env = config.env || {};
  if (env.NCP_PROFILE || env.NCP_DISPLAY_NAME) {
    return true;
  }

  return false;
}
