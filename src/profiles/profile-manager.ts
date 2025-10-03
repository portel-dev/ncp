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

    // Auto-import from Claude Desktop if needed (first run or empty profile)
    await this.tryAutoImport();
  }

  /**
   * Auto-import MCPs from Claude Desktop on first run
   * Detects both JSON config and .mcpb extensions
   */
  private async tryAutoImport(): Promise<void> {
    try {
      // Check if 'all' profile already has MCPs
      const allProfile = this.profiles.get('all');
      if (!allProfile) {
        return; // Should not happen, but guard anyway
      }

      const existingMCPs = allProfile.mcpServers || {};
      const existingMCPCount = Object.keys(existingMCPs).length;

      // If profile already has MCPs, don't auto-import
      if (existingMCPCount > 0) {
        return;
      }

      // Import from Claude Desktop
      const importResult = await importFromClaudeDesktop();
      if (!importResult || importResult.count === 0) {
        return; // Nothing to import
      }

      // Merge imported MCPs with existing profile (existingMCPs is already empty, but keep for future-proofing)
      const mergedMCPs = { ...existingMCPs, ...importResult.mcpServers };

      // Update profile with imported MCPs
      allProfile.mcpServers = mergedMCPs;
      allProfile.metadata.modified = new Date().toISOString();

      // Save updated profile
      await this.saveProfile(allProfile);
      this.profiles.set('all', allProfile);

      // Log import summary (visible to user)
      console.error(`\n✨ Auto-imported ${importResult.count} MCPs from Claude Desktop:`);
      if (importResult.sources.json > 0) {
        console.error(`   - ${importResult.sources.json} from claude_desktop_config.json`);
      }
      if (importResult.sources.mcpb > 0) {
        console.error(`   - ${importResult.sources.mcpb} from .mcpb extensions`);
      }
      console.error(`   → Saved to ~/.ncp/profiles/all.json\n`);
    } catch (error) {
      // Silent failure - don't block startup if auto-import fails
      // User can still configure manually
      console.warn(`Auto-import failed: ${error}`);
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