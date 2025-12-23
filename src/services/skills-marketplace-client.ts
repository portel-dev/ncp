/**
 * Skills Marketplace Client - Manage Anthropic Agent Skills marketplaces
 *
 * Integrates with the official anthropics/skills repository and
 * user-defined marketplaces to discover and install Agent Skills
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { logger } from '../utils/logger.js';
import { getNcpBaseDirectory } from '../utils/ncp-paths.js';

export interface SkillsMarketplace {
  name: string;
  repo: string; // For GitHub sources
  url: string; // Base URL for fetching
  sourceType: 'github' | 'git-ssh' | 'url' | 'local';
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

// Helper functions to get directories (respects getNcpBaseDirectory for flexibility)
function getConfigDir(): string {
  return getNcpBaseDirectory();
}

function getConfigFile(): string {
  return path.join(getConfigDir(), 'skills-marketplaces.json');
}

function getCacheDir(): string {
  return path.join(getConfigDir(), '.cache', 'skills-marketplaces');
}

function getSkillsDir(): string {
  return path.join(getConfigDir(), 'skills');
}

// Cache is considered stale after 24 hours
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const DEFAULT_MARKETPLACE: SkillsMarketplace = {
  name: 'ncp-skills',
  repo: 'portel-dev/skills',
  url: 'https://raw.githubusercontent.com/portel-dev/skills/main',
  sourceType: 'github',
  source: 'portel-dev/skills',
  enabled: true,
};

export class SkillsMarketplaceClient {
  private config: SkillsMarketplaceConfig = { marketplaces: [] };

  async initialize() {
    await fs.mkdir(getConfigDir(), { recursive: true });
    await fs.mkdir(getCacheDir(), { recursive: true });
    await fs.mkdir(getSkillsDir(), { recursive: true });

    if (existsSync(getConfigFile())) {
      const data = await fs.readFile(getConfigFile(), 'utf-8');
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
    await fs.writeFile(getConfigFile(), JSON.stringify(this.config, null, 2), 'utf-8');
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
   * Supports:
   * - GitHub shorthand: username/repo
   * - GitHub HTTPS: https://github.com/username/repo[.git]
   * - GitHub SSH: git@github.com:username/repo.git
   * - Direct URL: https://example.com/skills.json
   * - Local path: ./path or /absolute/path
   */
  private detectSourceType(source: string): 'github' | 'git-ssh' | 'url' | 'local' {
    if (source.startsWith('http://') || source.startsWith('https://')) {
      return 'url';
    } else if (source.startsWith('/') || source.startsWith('.')) {
      return 'local';
    } else if (source.startsWith('git@') || source.startsWith('ssh://')) {
      return 'git-ssh';
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
  private buildUrl(source: string, sourceType: 'github' | 'git-ssh' | 'url' | 'local'): string {
    switch (sourceType) {
      case 'github':
        return `https://raw.githubusercontent.com/${source}/main`;
      case 'git-ssh': {
        // Convert SSH URL to HTTPS
        // git@github.com:username/repo.git -> https://raw.githubusercontent.com/username/repo/main
        const sshMatch = source.match(/^git@github\.com:([a-zA-Z0-9-]+)\/([a-zA-Z0-9-_.]+?)(\.git)?$/);
        if (sshMatch) {
          const [, username, repo] = sshMatch;
          const repoName = repo.replace(/\.git$/, '');
          return `https://raw.githubusercontent.com/${username}/${repoName}/main`;
        }
        // Fallback for ssh:// URLs
        const sshUrlMatch = source.match(/^ssh:\/\/git@github\.com\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9-_.]+?)(\.git)?$/);
        if (sshUrlMatch) {
          const [, username, repo] = sshUrlMatch;
          const repoName = repo.replace(/\.git$/, '');
          return `https://raw.githubusercontent.com/${username}/${repoName}/main`;
        }
        return source;
      }
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
      const cacheFile = path.join(getCacheDir(), `${marketplace.name}-manifest.json`);
      await fs.writeFile(cacheFile, JSON.stringify(manifest, null, 2), 'utf-8');

      return manifest;
    } catch (error: any) {
      logger.error(`Failed to fetch manifest from ${marketplace.name}: ${error.message}`);

      // Try to load from cache
      try {
        const cacheFile = path.join(getCacheDir(), `${marketplace.name}-manifest.json`);
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
   * Build and cache skills index from all marketplaces
   */
  private async buildSkillsIndex(): Promise<SkillMetadata[]> {
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
          allSkills.push(metadata);
        }
      }
    }

    return allSkills;
  }

  /**
   * Get cached skills index (builds if cache is stale/missing)
   */
  private async getSkillsIndex(): Promise<SkillMetadata[]> {
    const cacheFile = path.join(getCacheDir(), 'skills-index.json');
    
    try {
      // Check if cache exists and is fresh
      if (existsSync(cacheFile)) {
        const stats = await fs.stat(cacheFile);
        const age = Date.now() - stats.mtimeMs;
        
        if (age < CACHE_TTL_MS) {
          // Cache is fresh - load it
          const cached = await fs.readFile(cacheFile, 'utf-8');
          const index = JSON.parse(cached);
          logger.debug(`Using cached skills index (${index.length} skills, age: ${Math.round(age / 1000 / 60)}m)`);
          return index;
        }
      }
    } catch (error) {
      logger.debug(`Cache load failed, will rebuild: ${error}`);
    }

    // Cache is stale/missing - rebuild
    logger.debug('Building skills index...');
    const allSkills = await this.buildSkillsIndex();
    
    // Save to cache
    try {
      await fs.writeFile(cacheFile, JSON.stringify(allSkills, null, 2), 'utf-8');
      logger.debug(`Cached ${allSkills.length} skills`);
    } catch (error) {
      logger.warn(`Failed to cache skills index: ${error}`);
    }
    
    return allSkills;
  }

  /**
   * Search for skills across all enabled marketplaces (FAST - uses cached index + fuzzy matching)
   * @deprecated Use searchMarketplace() instead for clarity
   */
  async search(query?: string): Promise<SkillMetadata[]> {
    return this.searchMarketplace(query ? [query] : undefined);
  }

  /**
   * Search marketplace with support for multi-query (| separated)
   * Uses cached index for fast results
   */
  async searchMarketplace(queries?: string[]): Promise<SkillMetadata[]> {
    // Get cached index (fast)
    const allSkills = await this.getSkillsIndex();
    
    // No queries = return all
    if (!queries || queries.length === 0) {
      return allSkills;
    }

    // Multi-query support with OR logic (like MCP search)
    const results = allSkills.filter(skill => {
      const searchText = `${skill.name} ${skill.description || ''} ${skill.tags?.join(' ') || ''}`.toLowerCase();
      // Match any query (OR logic)
      return queries.some(query => searchText.includes(query.toLowerCase()));
    });

    return results;
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

            // Found the skill! Install full directory structure
            const skillDir = path.join(getSkillsDir(), skillName);
            await fs.mkdir(skillDir, { recursive: true });

            // Download SKILL.md
            const skillFile = path.join(skillDir, 'SKILL.md');
            await fs.writeFile(skillFile, content, 'utf-8');

            // Download entire skill directory (reference/, scripts/, etc.)
            await this.downloadSkillDirectory(marketplace, skillPath, skillDir);

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
   * Download entire skill directory structure (reference/, scripts/, etc.)
   */
  private async downloadSkillDirectory(marketplace: SkillsMarketplace, skillPath: string, localDir: string): Promise<void> {
    try {
      // Construct GitHub API URL to get directory listing
      // skillPath is like "skills/mcp-builder"
      const apiUrl = marketplace.url
        .replace('https://raw.githubusercontent.com/', 'https://api.github.com/repos/')
        .replace('/main', `/contents/${skillPath}`);

      logger.debug(`Fetching skill directory structure from: ${apiUrl}`);

      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'NCP-Skills-Installer'
        }
      });

      if (!response.ok) {
        logger.warn(`Failed to fetch directory structure: ${response.status}`);
        return; // Graceful fallback - at least we have SKILL.md
      }

      const items = await response.json();

      if (!Array.isArray(items)) {
        return; // Not a directory or API error
      }

      // Download each item
      for (const item of items) {
        if (item.name === 'SKILL.md') {
          continue; // Already downloaded
        }

        if (item.type === 'file') {
          // Download file
          const fileUrl = `${marketplace.url}/${skillPath}/${item.name}`;
          const fileResponse = await fetch(fileUrl);

          if (fileResponse.ok) {
            const content = await fileResponse.text();
            const filePath = path.join(localDir, item.name);
            await fs.writeFile(filePath, content, 'utf-8');
            logger.debug(`  Downloaded: ${item.name}`);
          }
        } else if (item.type === 'dir') {
          // Recursively download directory
          const subDir = path.join(localDir, item.name);
          await fs.mkdir(subDir, { recursive: true });
          await this.downloadSkillDirectoryRecursive(
            marketplace,
            `${skillPath}/${item.name}`,
            subDir
          );
        }
      }
    } catch (error: any) {
      logger.warn(`Could not download full skill directory: ${error.message}`);
      // Non-fatal - at least we have SKILL.md
    }
  }

  /**
   * Recursively download directory contents
   */
  private async downloadSkillDirectoryRecursive(marketplace: SkillsMarketplace, remotePath: string, localDir: string): Promise<void> {
    try {
      const apiUrl = marketplace.url
        .replace('https://raw.githubusercontent.com/', 'https://api.github.com/repos/')
        .replace('/main', `/contents/${remotePath}`);

      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'NCP-Skills-Installer'
        }
      });

      if (!response.ok) {
        return;
      }

      const items = await response.json();

      if (!Array.isArray(items)) {
        return;
      }

      for (const item of items) {
        if (item.type === 'file') {
          const fileUrl = `${marketplace.url}/${remotePath}/${item.name}`;
          const fileResponse = await fetch(fileUrl);

          if (fileResponse.ok) {
            const content = await fileResponse.text();
            const filePath = path.join(localDir, item.name);
            await fs.writeFile(filePath, content, 'utf-8');
            logger.debug(`  Downloaded: ${remotePath}/${item.name}`);
          }
        } else if (item.type === 'dir') {
          const subDir = path.join(localDir, item.name);
          await fs.mkdir(subDir, { recursive: true });
          await this.downloadSkillDirectoryRecursive(
            marketplace,
            `${remotePath}/${item.name}`,
            subDir
          );
        }
      }
    } catch (error: any) {
      logger.debug(`Could not download directory ${remotePath}: ${error.message}`);
    }
  }

  /**
   * List installed skills from ~/.ncp/skills/
   */
  async listInstalled(): Promise<SkillMetadata[]> {
    try {
      const installed: SkillMetadata[] = [];
      const entries = await fs.readdir(getSkillsDir(), { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillFile = path.join(getSkillsDir(), entry.name, 'SKILL.md');
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
   * Refresh skills index cache (force rebuild)
   */
  async refreshCache(): Promise<number> {
    const cacheFile = path.join(getCacheDir(), 'skills-index.json');
    
    // Delete old cache
    try {
      if (existsSync(cacheFile)) {
        await fs.unlink(cacheFile);
      }
    } catch (error) {
      logger.warn(`Failed to delete old cache: ${error}`);
    }
    
    // Rebuild index
    const allSkills = await this.buildSkillsIndex();
    
    // Save new cache
    try {
      await fs.writeFile(cacheFile, JSON.stringify(allSkills, null, 2), 'utf-8');
      logger.info(`Refreshed skills cache: ${allSkills.length} skills indexed`);
    } catch (error) {
      logger.error(`Failed to save refreshed cache: ${error}`);
    }
    
    return allSkills.length;
  }

  /**
   * Remove an installed skill
   */
  async remove(skillName: string): Promise<{ success: boolean; message: string }> {
    try {
      const skillDir = path.join(getSkillsDir(), skillName);

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
