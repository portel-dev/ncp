/**
 * Skills Manager - Loads and manages Anthropic Agent Skills
 * 
 * Skills are packaged tools distributed as ZIP files in ~/.ncp/skills/
 * Each skill contains tools, metadata, and code that can be loaded dynamically
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger.js';
import AdmZip from 'adm-zip';

export interface SkillMetadata {
  name: string;
  version: string;
  description: string;
  author?: string;
  tools: SkillTool[];
}

export interface SkillTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: string; // Path to handler function within skill
}

export interface LoadedSkill {
  metadata: SkillMetadata;
  path: string;
  extractedPath: string;
}

export class SkillsManager {
  private skillsDir: string;
  private cacheDir: string;
  private loadedSkills: Map<string, LoadedSkill> = new Map();

  constructor() {
    this.skillsDir = path.join(os.homedir(), '.ncp', 'skills');
    this.cacheDir = path.join(os.homedir(), '.ncp', '.cache', 'skills');
  }

  /**
   * Initialize skills directory structure
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.skillsDir, { recursive: true });
    await fs.mkdir(this.cacheDir, { recursive: true });
    logger.debug(`Skills directory initialized: ${this.skillsDir}`);
  }

  /**
   * Discover and load all skills from ~/.ncp/skills
   */
  async loadAllSkills(): Promise<LoadedSkill[]> {
    await this.initialize();

    const files = await fs.readdir(this.skillsDir);
    const zipFiles = files.filter(f => f.endsWith('.zip'));

    logger.info(`Found ${zipFiles.length} skill(s) in ${this.skillsDir}`);

    const skills: LoadedSkill[] = [];

    for (const zipFile of zipFiles) {
      try {
        const skill = await this.loadSkill(zipFile);
        skills.push(skill);
        this.loadedSkills.set(skill.metadata.name, skill);
      } catch (error: any) {
        logger.warn(`Failed to load skill ${zipFile}: ${error.message}`);
      }
    }

    return skills;
  }

  /**
   * Load a single skill from ZIP file
   */
  async loadSkill(zipFileName: string): Promise<LoadedSkill> {
    const zipPath = path.join(this.skillsDir, zipFileName);
    const skillName = path.basename(zipFileName, '.zip');
    const extractPath = path.join(this.cacheDir, skillName);

    logger.debug(`Loading skill: ${zipFileName}`);

    // Extract ZIP to cache
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractPath, true);

    // Load skill.json metadata
    const metadataPath = path.join(extractPath, 'skill.json');
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: SkillMetadata = JSON.parse(metadataContent);

    logger.info(`Loaded skill: ${metadata.name} v${metadata.version} (${metadata.tools.length} tools)`);

    return {
      metadata,
      path: zipPath,
      extractedPath: extractPath
    };
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
   * Execute a skill tool
   */
  async executeSkillTool(skillName: string, toolName: string, params: any): Promise<any> {
    const skill = this.loadedSkills.get(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    const tool = skill.metadata.tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName} in skill ${skillName}`);
    }

    // Load and execute handler
    const handlerPath = path.join(skill.extractedPath, tool.handler);
    const handler = await import(handlerPath);

    if (typeof handler.default !== 'function') {
      throw new Error(`Invalid handler for ${skillName}:${toolName}`);
    }

    // Execute handler
    return await handler.default(params);
  }

  /**
   * List all available skills with their tools
   */
  listSkills(): Array<{ name: string; version: string; description: string; tools: number }> {
    return Array.from(this.loadedSkills.values()).map(skill => ({
      name: skill.metadata.name,
      version: skill.metadata.version,
      description: skill.metadata.description,
      tools: skill.metadata.tools.length
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

    // Remove ZIP file
    await fs.unlink(skill.path);

    // Remove extracted cache
    await fs.rm(skill.extractedPath, { recursive: true, force: true });

    // Remove from loaded skills
    this.loadedSkills.delete(skillName);

    logger.info(`Removed skill: ${skillName}`);
  }

  /**
   * Install a skill from a ZIP file path
   */
  async installSkill(sourcePath: string): Promise<LoadedSkill> {
    const fileName = path.basename(sourcePath);
    
    if (!fileName.endsWith('.zip')) {
      throw new Error('Skill must be a ZIP file');
    }

    // Copy to skills directory
    const destPath = path.join(this.skillsDir, fileName);
    await fs.copyFile(sourcePath, destPath);

    // Load the skill
    const skill = await this.loadSkill(fileName);
    this.loadedSkills.set(skill.metadata.name, skill);

    logger.info(`Installed skill: ${skill.metadata.name}`);
    return skill;
  }
}
