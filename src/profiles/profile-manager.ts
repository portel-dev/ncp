/**
 * Profile Manager for NCP
 * Manages different profiles with their MCP configurations
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { getProfilesDirectory } from '../utils/ncp-paths.js';
import { importFromClient, shouldAttemptClientSync } from '../utils/client-importer.js';
import type { OAuthConfig } from '../auth/oauth-device-flow.js';
import { getSecureCredentialStore, type CredentialType } from '../auth/secure-credential-store.js';
import { logger } from '../utils/logger.js';

interface MCPConfig {
  command?: string;  // Optional: for stdio transport
  args?: string[];
  env?: Record<string, string>;
  url?: string;  // Optional: for HTTP/SSE transport
  auth?: {
    type: 'oauth' | 'bearer' | 'apiKey' | 'basic';
    oauth?: OAuthConfig;  // OAuth 2.0 Device Flow configuration
    token?: string;       // Bearer token or API key
    username?: string;    // Basic auth username
    password?: string;    // Basic auth password
  };
}

interface Profile {
  name: string;
  description: string;
  mcpServers: Record<string, MCPConfig>;
  metadata: {
    created: string;
    modified: string;
  };
}

export class ProfileManager {
  private profilesDir: string;
  private profiles: Map<string, Profile> = new Map();
  private credentialStore = getSecureCredentialStore();

  constructor() {
    // Use centralized path utility to determine local vs global .ncp directory
    this.profilesDir = getProfilesDirectory();
  }

  /**
   * Store sensitive credentials in secure storage and replace with references
   */
  private async storeCredentials(mcpName: string, config: MCPConfig): Promise<MCPConfig> {
    if (!config.auth) {
      return config;
    }

    // Clone config to avoid mutating original
    const securConfig = JSON.parse(JSON.stringify(config));

    // Store token/API key
    if (config.auth.token) {
      const type: CredentialType = config.auth.type === 'bearer' ? 'bearer_token' : 'api_key';
      await this.credentialStore.setCredential(
        mcpName,
        type,
        config.auth.token,
        `${config.auth.type} credential for ${mcpName}`
      );
      // Replace with secure reference
      securConfig.auth.token = '_USE_SECURE_STORAGE_';
    }

    // Store basic auth credentials
    if (config.auth.username && config.auth.password) {
      await this.credentialStore.setCredential(
        mcpName,
        'basic_auth',
        { username: config.auth.username, password: config.auth.password },
        `Basic auth credentials for ${mcpName}`
      );
      // Replace with secure references
      securConfig.auth.username = '_USE_SECURE_STORAGE_';
      securConfig.auth.password = '_USE_SECURE_STORAGE_';
    }

    return securConfig;
  }

  /**
   * Load actual credentials from secure storage if references are found
   */
  private async loadCredentials(mcpName: string, config: MCPConfig): Promise<MCPConfig> {
    if (!config.auth) {
      return config;
    }

    // Clone config to avoid mutating cached version
    const fullConfig = JSON.parse(JSON.stringify(config));

    // Load token/API key if it's a reference
    if (config.auth.token === '_USE_SECURE_STORAGE_') {
      const type: CredentialType = config.auth.type === 'bearer' ? 'bearer_token' : 'api_key';
      const credential = await this.credentialStore.getCredential(mcpName, type);
      if (credential && typeof credential === 'string') {
        fullConfig.auth.token = credential;
      } else {
        logger.warn(`Failed to load ${type} for ${mcpName} from secure storage`);
      }
    }

    // Load basic auth credentials if they're references
    if (config.auth.username === '_USE_SECURE_STORAGE_' && config.auth.password === '_USE_SECURE_STORAGE_') {
      const credential = await this.credentialStore.getCredential(mcpName, 'basic_auth');
      if (credential && typeof credential === 'object') {
        fullConfig.auth.username = credential.username;
        fullConfig.auth.password = credential.password;
      } else {
        logger.warn(`Failed to load basic auth for ${mcpName} from secure storage`);
      }
    }

    return fullConfig;
  }

  async initialize(skipAutoImport: boolean = false): Promise<void> {
    // console.error(`[ProfileManager] initialize() called with skipAutoImport=${skipAutoImport}`);

    // Ensure profiles directory exists
    if (!existsSync(this.profilesDir)) {
      await fs.mkdir(this.profilesDir, { recursive: true });
    }
    // console.error(`[ProfileManager] profiles directory ready: ${this.profilesDir}`);

    // Load existing profiles
    await this.loadProfiles();
    // console.error(`[ProfileManager] loaded ${this.profiles.size} profiles`);

    // Create default universal profile if it doesn't exist
    if (!this.profiles.has('all')) {
      // console.error(`[ProfileManager] creating default 'all' profile...`);
      await this.createDefaultProfile();
      // console.error(`[ProfileManager] default profile created`);
    } else {
      // console.error(`[ProfileManager] 'all' profile already exists`);
    }

    // ⚠️ IMPORTANT: Auto-import is now triggered ONLY when a client announces itself
    // via the MCP initialize handshake (see ncp-orchestrator.ts line 2084)
    // This ensures:
    // 1. Auto-import respects the client-initiated protocol
    // 2. Local project .ncp folders don't auto-sync with global Claude Desktop
    // 3. Only known/supported clients trigger auto-import
    // The skipAutoImport parameter is kept for backward compatibility but has no effect

    // console.error(`[ProfileManager] initialize() completed`);
  }

  /**
   * Auto-sync MCPs from any MCP client on every startup
   * Detects both config files (JSON/TOML) and extensions (.dxt/dxt bundles)
   * Imports missing MCPs using add command for cache coherence
   *
   * Supports: Claude Desktop, Perplexity, Cursor, Cline, Continue, and more
   *
   * How it works:
   * 1. Client identifies itself via MCP initialize request (clientInfo.name)
   * 2. Name is matched against CLIENT_REGISTRY (with normalization)
   * 3. Client-specific importer reads config and extensions
   * 4. Missing MCPs are added to 'all' profile
   *
   * ⚠️ CRITICAL: This MUST target the 'all' profile - DO NOT CHANGE!
   * Auto-imported MCPs go to 'all' to maintain consistency with manual `ncp add`.
   */
  async tryAutoImportFromClient(clientName: string): Promise<void> {
    try {
      // Check if we should attempt auto-sync for this client
      if (!shouldAttemptClientSync(clientName)) {
        return; // Client config not found, skip auto-sync
      }

      // Get current 'all' profile
      // ⚠️ DO NOT CHANGE 'all' to 'default' or any other profile name!
      const allProfile = this.profiles.get('all');
      if (!allProfile) {
        return; // Should not happen, but guard anyway
      }

      // Get MCPs from client (both config and extensions)
      const importResult = await importFromClient(clientName);
      if (!importResult || importResult.count === 0) {
        return; // No MCPs found in client
      }

      // Get existing MCPs in NCP profile
      const existingMCPs = allProfile.mcpServers || {};
      const existingMCPNames = new Set(Object.keys(existingMCPs));

      // Find MCPs that are in client but NOT in NCP (missing MCPs)
      const missingMCPs: Array<{ name: string; config: any }> = [];

      // Filter to only new MCPs (not already in NCP)
      // Use simple name-based check to avoid spawning child processes
      const newMCPEntries = Object.entries(importResult.mcpServers).filter(([name]) => {
        // Skip if already in NCP
        if (existingMCPNames.has(name)) return false;

        // Skip NCP itself by name (avoid protocol check that spawns processes)
        const nameLower = name.toLowerCase();
        if (nameLower === 'ncp' || nameLower.includes('ncp-server')) {
          return false;
        }

        return true;
      });

      // Show simple message if there are new MCPs
      if (newMCPEntries.length > 0) {
        console.error(`\n✨ Found ${newMCPEntries.length} new MCPs from ${importResult.clientName}`);
      }

      // Add all new MCPs without spawning them
      for (const [mcpName, mcpConfig] of newMCPEntries) {
        missingMCPs.push({ name: mcpName, config: mcpConfig });
      }

      if (missingMCPs.length === 0) {
        return; // All client MCPs already in NCP
      }

      // Import missing MCPs in parallel with timeout (prevents startup delays)
      const AUTO_IMPORT_TIMEOUT = 30000; // 30 second max for all auto-imports
      const imported: string[] = [];

      try {
        // Parallelize MCP additions for faster startup
        const importPromises = missingMCPs.map(async ({ name, config }) => {
          try {
            // Remove metadata fields before adding (internal use only)
            const cleanConfig = {
              command: config.command,
              args: config.args || [],
              env: config.env || {}
            };

            // Use addMCPToProfile to ensure cache updates happen
            await this.addMCPToProfile('all', name, cleanConfig);
            return { name, success: true };
          } catch (error) {
            console.warn(`Failed to import ${name}: ${error}`);
            return { name, success: false, error };
          }
        });

        // Wait for all imports with timeout
        const results = await Promise.race([
          Promise.allSettled(importPromises),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Auto-import timeout')), AUTO_IMPORT_TIMEOUT)
          )
        ]);

        // Collect successfully imported MCPs
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.success) {
            imported.push(result.value.name);
          }
        }
      } catch (error: any) {
        // Timeout or critical error - log but don't block startup
        console.warn(`Auto-import interrupted: ${error.message}`);
      }

      if (imported.length > 0) {
        // Count by source for logging
        const configCount = missingMCPs.filter(m => m.config._source !== '.dxt' && m.config._source !== 'dxt').length;
        const extensionsCount = missingMCPs.filter(m => m.config._source === '.dxt' || m.config._source === 'dxt').length;

        // Log import summary
        console.error(`   - ${configCount} from config file`);
        if (extensionsCount > 0) {
          console.error(`   - ${extensionsCount} from extensions`);
        }
        console.error(`   → Added to ${path.join(this.profilesDir, 'all.json')}\n`);
      }
    } catch (error) {
      // Silent failure - don't block startup if auto-import fails
      // User can still configure manually
      console.warn(`Auto-sync failed: ${error}`);
    }
  }

  private async loadProfiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.profilesDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const profilePath = path.join(this.profilesDir, file);
          const content = await fs.readFile(profilePath, 'utf-8');
          const profile = JSON.parse(content) as Profile;

          // Skip profiles without a name field (invalid profile files)
          if (!profile.name || typeof profile.name !== 'string') {
            // Log as debug only - not user's problem if internal files are corrupted
            if (process.env.NCP_DEBUG === 'true') {
              console.error(`[DEBUG] Skipping invalid profile ${file}: missing or invalid 'name' field`);
            }
            continue;
          }

          this.profiles.set(profile.name, profile);
        }
      }
    } catch (error) {
      // Directory might not exist yet
    }
  }

  /**
   * ⚠️ CRITICAL: Profile name MUST be 'all' - DO NOT CHANGE!
   *
   * This creates the universal 'all' profile that:
   * 1. Is the default target for `ncp add`, `ncp config import`, auto-import
   * 2. Merges all MCPs from other profiles at runtime
   * 3. Is used by default when running NCP as MCP server
   *
   * DO NOT change the name to 'default' or anything else - it will break:
   * - All CLI commands that depend on 'all' being the default
   * - Auto-import from Claude Desktop
   * - User expectations (docs say 'all' is the universal profile)
   */
  private async createDefaultProfile(): Promise<void> {
    const defaultProfile: Profile = {
      name: 'all', // ⚠️ DO NOT CHANGE THIS NAME!
      description: 'Universal profile with all configured MCP servers',
      mcpServers: {},
      metadata: {
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      }
    };

    await this.saveProfile(defaultProfile);
    this.profiles.set('all', defaultProfile); // ⚠️ DO NOT CHANGE THIS NAME!
  }

  async saveProfile(profile: Profile): Promise<void> {
    const profilePath = path.join(this.profilesDir, `${profile.name}.json`);
    await fs.writeFile(profilePath, JSON.stringify(profile, null, 2));
  }

  async getProfile(name: string): Promise<Profile | undefined> {
    // For 'all' profile, merge with MCPs from other profiles at runtime
    if (name === 'all') {
      const allProfile = this.profiles.get('all');
      if (!allProfile) return undefined;

      // Start with MCPs directly in the all profile
      const mergedServers: Record<string, MCPConfig> = { ...allProfile.mcpServers };

      // Add MCPs from all other profiles
      for (const [profileName, profile] of this.profiles) {
        if (profileName !== 'all') {
          for (const [mcpName, mcpConfig] of Object.entries(profile.mcpServers)) {
            // Only add if not already in merged (preserves direct 'all' additions)
            if (!mergedServers[mcpName]) {
              mergedServers[mcpName] = mcpConfig;
            }
          }
        }
      }

      return {
        ...allProfile,
        mcpServers: mergedServers
      };
    }

    return this.profiles.get(name);
  }

  async addMCPToProfile(
    profileName: string,
    mcpName: string,
    config: MCPConfig
  ): Promise<void> {
    let profile = this.profiles.get(profileName);

    if (!profile) {
      // Create new profile if it doesn't exist
      profile = {
        name: profileName,
        description: `Profile: ${profileName}`,
        mcpServers: {},
        metadata: {
          created: new Date().toISOString(),
          modified: new Date().toISOString()
        }
      };
      this.profiles.set(profileName, profile);
    }

    // Store credentials securely and get config with references
    const secureConfig = await this.storeCredentials(mcpName, config);

    // Add or update MCP config
    profile.mcpServers[mcpName] = secureConfig;
    profile.metadata.modified = new Date().toISOString();

    await this.saveProfile(profile);
  }

  async removeMCPFromProfile(profileName: string, mcpName: string): Promise<void> {
    const profile = this.profiles.get(profileName);
    if (!profile) {
      throw new Error(`Profile ${profileName} not found`);
    }

    delete profile.mcpServers[mcpName];
    profile.metadata.modified = new Date().toISOString();

    await this.saveProfile(profile);
  }

  listProfiles(): string[] {
    return Array.from(this.profiles.keys());
  }

  async getProfileMCPs(profileName: string): Promise<Record<string, MCPConfig> | undefined> {
    const profile = await this.getProfile(profileName);
    if (!profile?.mcpServers) return undefined;

    // Filter out invalid configurations and load credentials from secure storage
    const validMCPs: Record<string, MCPConfig> = {};
    for (const [name, config] of Object.entries(profile.mcpServers)) {
      if (typeof config === 'object' && config !== null) {
        // Valid if it has command (stdio) OR url (HTTP/SSE)
        const hasStdio = 'command' in config && typeof config.command === 'string';
        const hasHttp = 'url' in config && typeof config.url === 'string';

        if (hasStdio || hasHttp) {
          // Load actual credentials from secure storage if needed
          const fullConfig = await this.loadCredentials(name, config as MCPConfig);
          validMCPs[name] = fullConfig;
        }
      }
    }

    return Object.keys(validMCPs).length > 0 ? validMCPs : undefined;
  }

  getConfigPath(): string {
    return this.profilesDir;
  }

  getProfilePath(profileName: string): string {
    return path.join(this.profilesDir, `${profileName}.json`);
  }

  /**
   * Migrate all plain-text credentials in a profile to secure storage
   */
  async migrateProfileCredentials(profileName: string): Promise<{ migrated: number; errors: number }> {
    const profile = this.profiles.get(profileName);
    if (!profile) {
      throw new Error(`Profile ${profileName} not found`);
    }

    let migrated = 0;
    let errors = 0;

    for (const [mcpName, config] of Object.entries(profile.mcpServers)) {
      if (!config.auth) continue;

      // Check if credentials are plain-text (not already secure references)
      const hasPlainTextToken = config.auth.token && config.auth.token !== '_USE_SECURE_STORAGE_';
      const hasPlainTextBasicAuth =
        config.auth.username &&
        config.auth.password &&
        config.auth.username !== '_USE_SECURE_STORAGE_';

      if (hasPlainTextToken || hasPlainTextBasicAuth) {
        try {
          const success = await this.credentialStore.migrateFromPlainText(mcpName, config.auth);
          if (success) {
            // Update profile with secure references
            const secureConfig = await this.storeCredentials(mcpName, config);
            profile.mcpServers[mcpName] = secureConfig;
            migrated++;
            logger.info(`Migrated credentials for ${mcpName}`);
          } else {
            errors++;
          }
        } catch (error) {
          logger.error(`Failed to migrate credentials for ${mcpName}: ${error}`);
          errors++;
        }
      }
    }

    if (migrated > 0) {
      profile.metadata.modified = new Date().toISOString();
      await this.saveProfile(profile);
    }

    return { migrated, errors };
  }

  /**
   * Migrate all plain-text credentials across all profiles
   */
  async migrateAllCredentials(): Promise<{ migrated: number; errors: number }> {
    let totalMigrated = 0;
    let totalErrors = 0;

    for (const profileName of this.listProfiles()) {
      const result = await this.migrateProfileCredentials(profileName);
      totalMigrated += result.migrated;
      totalErrors += result.errors;
    }

    return { migrated: totalMigrated, errors: totalErrors };
  }
}

export default ProfileManager;