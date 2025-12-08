/**
 * Skills Marketplace Client - Manage Anthropic Agent Skills marketplaces
 *
 * Integrates with the official anthropics/skills repository and
 * user-defined marketplaces to discover and install Agent Skills
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { existsSync } from 'fs';
import { logger } from '../utils/logger.js';

export interface SkillsMarketplace {
  name: string;
  repo: string; // For GitHub sources
  url: string; // Base URL for fetching
  sourceType: 'github' | 'url' | 'local';
  source: string; // Original input (for display)
  enabled: boolean;
  lastUpdated?: string;
}

export interface SkillsMarketplaceConfig {
  marketplaces: SkillsMarketplace[];
}

/**
 * Skill metadata from SKILL.md YAML frontmatter
 */
export interface SkillMetadata {
  name: string;
  description: string;
  license?: string;
  version?: string;
  author?: string;
  tags?: string[];
  tools?: string[];
  plugin?: string; // Plugin name this skill belongs to (example-skills, document-skills)
}

/**
 * Claude Code Plugin from marketplace.json
 */
export interface ClaudePlugin {
  name: string;
  description: string;
  source: string;
  strict: boolean;
  skills: string[]; // Paths to SKILL.md files
}

/**
 * Marketplace manifest (.claude-plugin/marketplace.json)
 */
export interface SkillsMarketplaceManifest {
  name: string;
  owner?: {
    name: string;
    email?: string;
  };
  metadata?: {
    version: string;
    description: string;
  };
  plugins: ClaudePlugin[];
}

// Use NCP's config directory structure
const CONFIG_DIR = path.join(os.homedir(), '.ncp');
const CONFIG_FILE = path.join(CONFIG_DIR, 'skills-marketplaces.json');
const CACHE_DIR = path.join(CONFIG_DIR, '.cache', 'skills-marketplaces');
const SKILLS_DIR = path.join(CONFIG_DIR, 'skills');

// Cache is considered stale after 24 hours
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const DEFAULT_MARKETPLACE: SkillsMarketplace = {
  name: 'anthropic-skills',
  repo: 'anthropics/skills',
  url: 'https://raw.githubusercontent.com/anthropics/skills/main',
  sourceType: 'github',
  source: 'anthropics/skills',
  enabled: true,
};

export class SkillsMarketplaceClient {
  private config: SkillsMarketplaceConfig = { marketplaces: [] };

  async initialize() {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.mkdir(SKILLS_DIR, { recursive: true });

    if (existsSync(CONFIG_FILE)) {
      const data = await fs.readFile(CONFIG_FILE, 'utf-8');
      this.config = JSON.parse(data);
    } else {
      // Initialize with default marketplace
      this.config = {
        marketplaces: [DEFAULT_MARKETPLACE],
      };
      await this.save();
    }
  }

  async save() {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  /**
   * Get all marketplaces
   */
  getAll(): SkillsMarketplace[] {
    return this.config.marketplaces;
  }

  /**
   * Get enabled marketplaces
   */
  getEnabled(): SkillsMarketplace[] {
    return this.config.marketplaces.filter((m) => m.enabled);
  }

  /**
   * Add a new marketplace
   */
  async addMarketplace(source: string): Promise<SkillsMarketplace> {
    const name = this.extractMarketplaceName(source);
    const sourceType = this.detectSourceType(source);
    const url = this.buildUrl(source, sourceType);

    const marketplace: SkillsMarketplace = {
      name,
      repo: sourceType === 'github' ? source : '',
      url,
      sourceType,
      source,
      enabled: true,
      lastUpdated: new Date().toISOString()
    };

    // Check if marketplace already exists
    const existing = this.config.marketplaces.find(m => m.name === name);
    if (!existing) {
      this.config.marketplaces.push(marketplace);
      await this.save();
    }

    return marketplace;
  }

  /**
   * Remove a marketplace
   */
  async removeMarketplace(name: string): Promise<boolean> {
    const index = this.config.marketplaces.findIndex(m => m.name === name);
    if (index === -1) {
      return false;
    }

    this.config.marketplaces.splice(index, 1);
    await this.save();
    return true;
  }

  /**
   * Detect source type from a string
   */
  private detectSourceType(source: string): 'github' | 'url' | 'local' {
    if (source.startsWith('http://') || source.startsWith('https://')) {
      return 'url';
    } else if (source.startsWith('/') || source.startsWith('.')) {
      return 'local';
    } else {
      // Assume GitHub format: username/repo
      return 'github';
    }
  }

  /**
   * Extract marketplace name from source
   */
  private extractMarketplaceName(source: string): string {
    if (source.includes('/')) {
      const parts = source.split('/');
      return parts[parts.length - 1].replace('.git', '').toLowerCase();
    }
    return source.toLowerCase();
  }

  /**
   * Build URL from source based on type
   */
  private buildUrl(source: string, sourceType: 'github' | 'url' | 'local'): string {
    switch (sourceType) {
      case 'github':
        return `https://raw.githubusercontent.com/${source}/main`;
      case 'url':
        return source.endsWith('/') ? source.slice(0, -1) : source;
      case 'local':
        return source;
      default:
        return source;
    }
  }

  /**
   * Fetch marketplace manifest from remote source
   */
  async fetchManifest(marketplace: SkillsMarketplace): Promise<SkillsMarketplaceManifest | null> {
    try {
      const manifestUrl = `${marketplace.url}/.claude-plugin/marketplace.json`;
      logger.debug(`Fetching skills manifest from: ${manifestUrl}`);

      const response = await fetch(manifestUrl);
      if (!response.ok) {
        logger.warn(`Failed to fetch manifest from ${manifestUrl}: ${response.status}`);
        return null;
      }

      const manifest: SkillsMarketplaceManifest = await response.json();

      // Cache the manifest
      const cacheFile = path.join(CACHE_DIR, `${marketplace.name}-manifest.json`);
      await fs.writeFile(cacheFile, JSON.stringify(manifest, null, 2), 'utf-8');

      return manifest;
    } catch (error: any) {
      logger.error(`Failed to fetch manifest from ${marketplace.name}: ${error.message}`);

      // Try to load from cache
      try {
        const cacheFile = path.join(CACHE_DIR, `${marketplace.name}-manifest.json`);
        if (existsSync(cacheFile)) {
          logger.debug(`Using cached manifest for ${marketplace.name}`);
          const cached = await fs.readFile(cacheFile, 'utf-8');
          return JSON.parse(cached);
        }
      } catch {
        // Cache also failed
      }

      return null;
    }
  }

  /**
   * Fetch SKILL.md content from marketplace
   */
  async fetchSkillContent(marketplace: SkillsMarketplace, skillPath: string): Promise<string | null> {
    try {
      const skillUrl = `${marketplace.url}/${skillPath}/SKILL.md`;
      logger.debug(`Fetching skill from: ${skillUrl}`);

      const response = await fetch(skillUrl);
      if (!response.ok) {
        logger.warn(`Failed to fetch skill from ${skillUrl}: ${response.status}`);
        return null;
      }

      return await response.text();
    } catch (error: any) {
      logger.error(`Failed to fetch skill ${skillPath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse SKILL.md YAML frontmatter
   */
  parseSkillMetadata(content: string, skillPath: string): SkillMetadata | null {
    try {
      // Extract YAML frontmatter (between --- markers)
      const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        logger.warn(`No frontmatter found in skill: ${skillPath}`);
        return null;
      }

      const frontmatter = frontmatterMatch[1];
      const metadata: Partial<SkillMetadata> = {};

      // Simple YAML parser (only handles key: value pairs)
      const lines = frontmatter.split('\n');
      for (const line of lines) {
        const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.+)$/);
        if (match) {
          const [, key, value] = match;
          const trimmedValue = value.trim();
          // Store as string (arrays would need more complex YAML parsing)
          (metadata as any)[key] = trimmedValue;
        }
      }

      if (!metadata.name) {
        logger.warn(`Skill missing required 'name' field: ${skillPath}`);
        return null;
      }

      return metadata as SkillMetadata;
    } catch (error: any) {
      logger.error(`Failed to parse skill metadata: ${error.message}`);
      return null;
    }
  }

  /**
   * Search for skills across all enabled marketplaces
   */
  async search(query?: string): Promise<SkillMetadata[]> {
    const enabledMarketplaces = this.getEnabled();
    const allSkills: SkillMetadata[] = [];

    for (const marketplace of enabledMarketplaces) {
      const manifest = await this.fetchManifest(marketplace);
      if (!manifest) continue;

      // Iterate through all plugins
      for (const plugin of manifest.plugins) {
        // Determine skill paths - use explicit list or auto-discover from plugin source
        const skillPaths = plugin.skills && Array.isArray(plugin.skills)
          ? plugin.skills
          : [plugin.source];

        // Iterate through all skills in the plugin
        for (const skillPath of skillPaths) {
          const content = await this.fetchSkillContent(marketplace, skillPath);
          if (!content) continue;

          const metadata = this.parseSkillMetadata(content, skillPath);
          if (!metadata) continue;

          // Add plugin name for context
          metadata.plugin = plugin.name;

          // Filter by query if provided
          if (query) {
            const searchText = `${metadata.name} ${metadata.description}`.toLowerCase();
            if (!searchText.includes(query.toLowerCase())) {
              continue;
            }
          }

          allSkills.push(metadata);
        }
      }
    }

    return allSkills;
  }

  /**
   * Install a skill from marketplace
   */
  async install(skillName: string): Promise<{ success: boolean; message: string; skillPath?: string }> {
    try {
      const enabledMarketplaces = this.getEnabled();

      for (const marketplace of enabledMarketplaces) {
        const manifest = await this.fetchManifest(marketplace);
        if (!manifest) continue;

        // Find the skill in the manifest
        for (const plugin of manifest.plugins) {
          // Determine skill paths - use explicit list or auto-discover from plugin source
          const skillPaths = plugin.skills && Array.isArray(plugin.skills)
            ? plugin.skills
            : [plugin.source];

          for (const skillPath of skillPaths) {
            const content = await this.fetchSkillContent(marketplace, skillPath);
            if (!content) continue;

            const metadata = this.parseSkillMetadata(content, skillPath);
            if (!metadata || metadata.name !== skillName) continue;

            // Found the skill! Install it
            const skillDir = path.join(SKILLS_DIR, skillName);
            await fs.mkdir(skillDir, { recursive: true });

            const skillFile = path.join(skillDir, 'SKILL.md');
            await fs.writeFile(skillFile, content, 'utf-8');

            logger.info(`Installed skill: ${skillName} from ${marketplace.name}`);

            return {
              success: true,
              message: `Successfully installed ${skillName} from ${marketplace.name}`,
              skillPath: skillFile
            };
          }
        }
      }

      return {
        success: false,
        message: `Skill '${skillName}' not found in any enabled marketplace`
      };
    } catch (error: any) {
      logger.error(`Failed to install skill ${skillName}: ${error.message}`);
      return {
        success: false,
        message: `Failed to install ${skillName}: ${error.message}`
      };
    }
  }

  /**
   * List installed skills from ~/.ncp/skills/
   */
  async listInstalled(): Promise<SkillMetadata[]> {
    try {
      const installed: SkillMetadata[] = [];
      const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillFile = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
        if (!existsSync(skillFile)) continue;

        const content = await fs.readFile(skillFile, 'utf-8');
        const metadata = this.parseSkillMetadata(content, entry.name);
        if (metadata) {
          installed.push(metadata);
        }
      }

      return installed;
    } catch (error: any) {
      logger.error(`Failed to list installed skills: ${error.message}`);
      return [];
    }
  }

  /**
   * Remove an installed skill
   */
  async remove(skillName: string): Promise<{ success: boolean; message: string }> {
    try {
      const skillDir = path.join(SKILLS_DIR, skillName);

      if (!existsSync(skillDir)) {
        return {
          success: false,
          message: `Skill '${skillName}' is not installed`
        };
      }

      await fs.rm(skillDir, { recursive: true, force: true });
      logger.info(`Removed skill: ${skillName}`);

      return {
        success: true,
        message: `Successfully removed ${skillName}`
      };
    } catch (error: any) {
      logger.error(`Failed to remove skill ${skillName}: ${error.message}`);
      return {
        success: false,
        message: `Failed to remove ${skillName}: ${error.message}`
      };
    }
  }
}
