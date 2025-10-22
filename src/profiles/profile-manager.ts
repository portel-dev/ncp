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

  constructor() {
    // Use centralized path utility to determine local vs global .ncp directory
    this.profilesDir = getProfilesDirectory();
  }

  async initialize(): Promise<void> {
    // Ensure profiles directory exists
    if (!existsSync(this.profilesDir)) {
      await fs.mkdir(this.profilesDir, { recursive: true });
    }

    // Load existing profiles
    await this.loadProfiles();

    // Create default universal profile if it doesn't exist
    if (!this.profiles.has('all')) {
      await this.createDefaultProfile();
    }

    // Auto-import from Claude Desktop on startup (restores 1.5.3 behavior)
    // This ensures profile is populated BEFORE orchestrator initialization
    await this.tryAutoImportFromClient('claude-desktop');
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
      const needBackgroundVerification: Array<{ name: string; config: any }> = [];

      for (const [mcpName, mcpConfig] of Object.entries(importResult.mcpServers)) {
        // Skip if already exists in NCP
        if (existingMCPNames.has(mcpName)) {
          continue;
        }

        // Quick check (2s timeout) - skip NCP if confirmed
        // If timeout/error, add now and verify in background
        try {
          const serverInfoName = await this.getServerInfoName(mcpConfig, 2000);
          if (serverInfoName?.toLowerCase() === 'ncp') {
            continue; // Skip NCP itself - confirmed via protocol
          }
          // If serverInfo retrieved successfully and it's NOT ncp, add it
          missingMCPs.push({ name: mcpName, config: mcpConfig });
        } catch (error) {
          // Quick check failed (timeout, port conflict, etc)
          // Add it now, verify in background (silently - this is expected)
          missingMCPs.push({ name: mcpName, config: mcpConfig });
          needBackgroundVerification.push({ name: mcpName, config: mcpConfig });
        }
      }

      if (missingMCPs.length === 0) {
        return; // All client MCPs already in NCP
      }

      // Import missing MCPs using add command (ensures cache coherence)
      const imported: string[] = [];
      for (const { name, config } of missingMCPs) {
        try {
          // Remove metadata fields before adding (internal use only)
          const cleanConfig = {
            command: config.command,
            args: config.args || [],
            env: config.env || {}
          };

          // Use addMCPToProfile to ensure cache updates happen
          await this.addMCPToProfile('all', name, cleanConfig);
          imported.push(name);
        } catch (error) {
          console.warn(`Failed to import ${name}: ${error}`);
        }
      }

      if (imported.length > 0) {
        // Count by source for logging
        const configCount = missingMCPs.filter(m => m.config._source !== '.dxt' && m.config._source !== 'dxt').length;
        const extensionsCount = missingMCPs.filter(m => m.config._source === '.dxt' || m.config._source === 'dxt').length;

        // Log import summary
        console.error(`\n✨ Auto-synced ${imported.length} new MCPs from ${importResult.clientName}:`);
        if (configCount > 0) {
          console.error(`   - ${configCount} from config file`);
        }
        if (extensionsCount > 0) {
          console.error(`   - ${extensionsCount} from extensions`);
        }
        console.error(`   → Added to ~/.ncp/profiles/all.json\n`);
      }

      // Start background verification for MCPs that failed quick check
      if (needBackgroundVerification.length > 0) {
        console.warn(`⏳ ${needBackgroundVerification.length} MCPs queued for background verification...`);
        this.verifyAndRemoveNCPInBackground(needBackgroundVerification);
      }
    } catch (error) {
      // Silent failure - don't block startup if auto-import fails
      // User can still configure manually
      console.warn(`Auto-sync failed: ${error}`);
    }
  }

  /**
   * Get serverInfo.name from an MCP by briefly connecting to it
   * This is the protocol-based way to identify an MCP server
   * Uses a short timeout to avoid blocking startup
   */
  private async getServerInfoName(config: any, timeoutMs: number = 2000): Promise<string | null> {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    const { Writable } = await import('stream');

    let transport: any = null;
    let client: any = null;

    try {
      // Create a null stream to suppress stderr
      const nullStream = new Writable({
        write(chunk, encoding, callback) {
          callback(); // Discard all output
        }
      });

      // Create transport (it will spawn the child process internally)
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: { ...process.env, ...config.env },
        stderr: nullStream as any // Suppress stderr
      });

      client = new Client(
        {
          name: 'ncp-detector',
          version: '1.0.0'
        },
        {
          capabilities: {}
        }
      );

      // Connect with configurable timeout (default 2s for quick check)
      await Promise.race([
        client.connect(transport),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), timeoutMs)
        )
      ]);

      // Get server info from the initialized connection
      const serverInfo = client.getServerVersion();
      return serverInfo?.name || null;
    } catch (error) {
      throw new Error(`Failed to get serverInfo: ${error}`);
    } finally {
      // Clean up
      try {
        if (client) {
          await client.close();
        }
      } catch (e) {
        // Ignore cleanup errors
      }

      try {
        if (transport) {
          await transport.close();
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Background verification of MCPs to identify NCP instances
   * Runs after startup to avoid blocking, removes confirmed NCP instances
   */
  private async verifyAndRemoveNCPInBackground(mcpsToVerify: Array<{ name: string; config: any }>): Promise<void> {
    // Run in background, don't await
    setTimeout(async () => {
      for (const { name, config } of mcpsToVerify) {
        try {
          // Use longer timeout for background check (5s)
          const serverInfoName = await this.getServerInfoName(config, 5000);
          if (serverInfoName?.toLowerCase() === 'ncp') {
            // Confirmed NCP - remove it from 'all' profile
            console.warn(`⚠️  Background check: Removing NCP instance "${name}" from auto-imported MCPs`);
            await this.removeMCPFromProfile('all', name);
          }
        } catch (error) {
          // If still can't verify after 5s, assume it's NOT NCP
          // Keep it in the profile
        }
      }
    }, 100); // Start background checks 100ms after startup
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
            console.warn(`⚠️  Skipping invalid profile ${file}: missing or invalid 'name' field`);
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

    // Add or update MCP config
    profile.mcpServers[mcpName] = config;
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

    // Filter out invalid configurations (ensure they have command property)
    const validMCPs: Record<string, MCPConfig> = {};
    for (const [name, config] of Object.entries(profile.mcpServers)) {
      if (typeof config === 'object' && config !== null && 'command' in config && typeof config.command === 'string') {
        validMCPs[name] = config as MCPConfig;
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
}

export default ProfileManager;