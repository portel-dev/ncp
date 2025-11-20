/**
 * Skills Manager - Loads and manages Anthropic Agent Skills
 *
 * Skills are SKILL.md markdown files in ~/.ncp/skills/<skill-name>/
 * Each skill contains metadata in YAML frontmatter and prompts for Claude
 *
 * This aligns with Anthropic's official skills format from:
 * https://github.com/anthropics/skills
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { existsSync } from 'fs';
import * as yaml from 'js-yaml';
import { logger } from '../utils/logger.js';
import { getNcpBaseDirectory } from '../utils/ncp-paths.js';

export interface SkillMetadata {
  name: string;
  description: string;
  version?: string;
  author?: string;
  license?: string;
  tags?: string[];
  tools?: string[];  // Tool names provided by this skill
  plugin?: string;   // Plugin this skill belongs to
}

export interface LoadedSkill {
  metadata: SkillMetadata;
  content: string;      // Full SKILL.md content
  path: string;         // Path to SKILL.md file
  directory: string;    // Skill directory
}

function getSkillsDir(): string {
  return path.join(getNcpBaseDirectory(), 'skills');
}

export class SkillsManager {
  private skillsDir: string;
  private loadedSkills: Map<string, LoadedSkill> = new Map();

  constructor() {
    this.skillsDir = getSkillsDir();
  }

  /**
   * Initialize skills directory structure
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.skillsDir, { recursive: true });
    logger.debug(`Skills directory initialized: ${this.skillsDir}`);
  }

  /**
   * Discover and load all skills from ~/.ncp/skills/
   * Each skill is in its own directory with a SKILL.md file
   */
  async loadAllSkills(): Promise<LoadedSkill[]> {
    await this.initialize();

    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
      const skillDirs = entries.filter(e => e.isDirectory());

      logger.debug(`Found ${skillDirs.length} skill director(ies) in ${this.skillsDir}`);

      const skills: LoadedSkill[] = [];

      for (const dir of skillDirs) {
        try {
          const skill = await this.loadSkill(dir.name);
          if (skill) {
            skills.push(skill);
            this.loadedSkills.set(skill.metadata.name, skill);
          }
        } catch (error: any) {
          logger.warn(`Failed to load skill from ${dir.name}: ${error.message}`);
        }
      }

      if (skills.length > 0) {
        logger.info(`📚 Loaded ${skills.length} Anthropic Agent Skill(s)`);
      }

      return skills;
    } catch (error: any) {
      logger.error(`Failed to read skills directory: ${error.message}`);
      return [];
    }
  }

  /**
   * Load a single skill from its directory
   * Expects: ~/.ncp/skills/<skill-name>/SKILL.md
   */
  async loadSkill(skillDirName: string): Promise<LoadedSkill | null> {
    const skillDir = path.join(this.skillsDir, skillDirName);
    const skillFile = path.join(skillDir, 'SKILL.md');

    if (!existsSync(skillFile)) {
      logger.debug(`No SKILL.md found in ${skillDirName}, skipping`);
      return null;
    }

    logger.debug(`Loading skill: ${skillDirName}`);

    // Read SKILL.md content
    const content = await fs.readFile(skillFile, 'utf-8');

    // Parse YAML frontmatter
    const metadata = this.parseSkillMetadata(content, skillDirName);
    if (!metadata) {
      logger.warn(`Invalid skill metadata in ${skillDirName}/SKILL.md`);
      return null;
    }

    logger.info(`  ✓ ${metadata.name}${metadata.description ? ': ' + metadata.description : ''}`);

    return {
      metadata,
      content,
      path: skillFile,
      directory: skillDir
    };
  }

  /**
   * Parse SKILL.md YAML frontmatter using js-yaml library
   * Format:
   * ---
   * name: skill-name
   * description: Description text
   * version: 1.0.0
   * tags:
   *   - tag1
   *   - tag2
   * ---
   */
  private parseSkillMetadata(content: string, fallbackName: string): SkillMetadata | null {
    try {
      // Extract YAML frontmatter (between --- markers)
      const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        logger.debug(`No frontmatter found in skill, using defaults`);
        return {
          name: fallbackName,
          description: ''
        };
      }

      const frontmatter = frontmatterMatch[1];

      // Use js-yaml for robust YAML parsing (handles arrays, multi-line values, etc.)
      const parsed = yaml.load(frontmatter) as Partial<SkillMetadata>;

      // Use directory name if no name in metadata
      if (!parsed.name) {
        parsed.name = fallbackName;
      }

      return parsed as SkillMetadata;
    } catch (error: any) {
      logger.error(`Failed to parse skill metadata: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all loaded skills
   */
  getLoadedSkills(): LoadedSkill[] {
    return Array.from(this.loadedSkills.values());
  }

  /**
   * Get a specific skill by name
   */
  getSkill(name: string): LoadedSkill | undefined {
    return this.loadedSkills.get(name);
  }

  /**
   * Get skill content for inclusion in prompts
   * This is how skills work - they're injected into Claude's context
   */
  getSkillPrompt(skillName: string): string | null {
    const skill = this.loadedSkills.get(skillName);
    if (!skill) {
      return null;
    }
    return skill.content;
  }

  /**
   * List all available skills with their tools
   */
  listSkills(): Array<{ name: string; description: string; plugin?: string }> {
    return Array.from(this.loadedSkills.values()).map(skill => ({
      name: skill.metadata.name,
      description: skill.metadata.description,
      plugin: skill.metadata.plugin
    }));
  }

  /**
   * Remove a skill
   */
  async removeSkill(skillName: string): Promise<void> {
    const skill = this.loadedSkills.get(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    // Remove skill directory
    await fs.rm(skill.directory, { recursive: true, force: true });

    // Remove from loaded skills
    this.loadedSkills.delete(skillName);

    logger.info(`Removed skill: ${skillName}`);
  }

  /**
   * Install a skill from a SKILL.md file
   * This creates the directory structure expected by loadSkill()
   */
  async installSkillFromFile(sourcePath: string, skillName?: string): Promise<LoadedSkill> {
    // Read SKILL.md content
    const content = await fs.readFile(sourcePath, 'utf-8');

    // Parse metadata to get skill name
    const metadata = this.parseSkillMetadata(content, skillName || path.basename(path.dirname(sourcePath)));
    if (!metadata) {
      throw new Error('Invalid SKILL.md format');
    }

    // Create skill directory
    const skillDir = path.join(this.skillsDir, metadata.name);
    await fs.mkdir(skillDir, { recursive: true });

    // Copy SKILL.md to skill directory
    const destPath = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(destPath, content, 'utf-8');

    // Load the skill
    const skill = await this.loadSkill(metadata.name);
    if (!skill) {
      throw new Error('Failed to load installed skill');
    }

    this.loadedSkills.set(skill.metadata.name, skill);

    logger.info(`Installed skill: ${skill.metadata.name}`);
    return skill;
  }

  /**
   * Get all tool names across all loaded skills
   * Note: Anthropic skills don't provide executable tools,
   * they provide context/prompts that enhance Claude's capabilities
   */
  getAllSkillTools(): string[] {
    const tools: string[] = [];
    for (const skill of this.loadedSkills.values()) {
      if (skill.metadata.tools) {
        for (const tool of skill.metadata.tools) {
          tools.push(`${skill.metadata.name}:${tool}`);
        }
      }
    }
    return tools;
  }
}
