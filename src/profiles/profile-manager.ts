/**
 * Profile Manager for NCP
 * Manages different profiles with their MCP configurations
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { getProfilesDirectory } from '../utils/ncp-paths.js';
import { importFromClaudeDesktop, shouldAutoImport } from '../utils/claude-desktop-importer.js';

interface MCPConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
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

    // Auto-sync from Claude Desktop (runs every startup to detect new MCPs)
    await this.tryAutoImport();
  }

  /**
   * Auto-sync MCPs from Claude Desktop on every startup
   * Detects both JSON config and .mcpb extensions
   * Imports missing MCPs using add command for cache coherence
   */
  private async tryAutoImport(): Promise<void> {
    try {
      // Get current 'all' profile
      const allProfile = this.profiles.get('all');
      if (!allProfile) {
        return; // Should not happen, but guard anyway
      }

      // Get MCPs from Claude Desktop (both JSON config and .mcpb extensions)
      const importResult = await importFromClaudeDesktop();
      if (!importResult || importResult.count === 0) {
        return; // No Claude Desktop MCPs found
      }

      // Get existing MCPs in NCP profile
      const existingMCPs = allProfile.mcpServers || {};
      const existingMCPNames = new Set(Object.keys(existingMCPs));

      // Find MCPs that are in Claude Desktop but NOT in NCP (missing MCPs)
      const missingMCPs: Array<{ name: string; config: any }> = [];

      for (const [mcpName, mcpConfig] of Object.entries(importResult.mcpServers)) {
        if (!existingMCPNames.has(mcpName)) {
          missingMCPs.push({ name: mcpName, config: mcpConfig });
        }
      }

      if (missingMCPs.length === 0) {
        return; // All Claude Desktop MCPs already in NCP
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
        const jsonCount = missingMCPs.filter(m => m.config._source === 'json').length;
        const mcpbCount = missingMCPs.filter(m => m.config._source === '.mcpb').length;

        // Log import summary
        console.error(`\n✨ Auto-synced ${imported.length} new MCPs from Claude Desktop:`);
        if (jsonCount > 0) {
          console.error(`   - ${jsonCount} from claude_desktop_config.json`);
        }
        if (mcpbCount > 0) {
          console.error(`   - ${mcpbCount} from .mcpb extensions`);
        }
        console.error(`   → Added to ~/.ncp/profiles/all.json\n`);
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
          this.profiles.set(profile.name, profile);
        }
      }
    } catch (error) {
      // Directory might not exist yet
    }
  }

  private async createDefaultProfile(): Promise<void> {
    const defaultProfile: Profile = {
      name: 'all',
      description: 'Universal profile with all configured MCP servers',
      mcpServers: {},
      metadata: {
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      }
    };

    await this.saveProfile(defaultProfile);
    this.profiles.set('all', defaultProfile);
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