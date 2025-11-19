/**
 * Skills Management Internal MCP
 *
 * Provides tools for managing Anthropic Agent Skills:
 * - find: Search and discover installed skills with progressive disclosure (depth 1-3)
 * - add: Install skill from marketplace
 * - list: List installed skills
 * - remove: Remove installed skill
 * - read_resource: Read additional files from skill (resources/, scripts/, etc.)
 */

import { InternalMCP, InternalTool, InternalToolResult } from './types.js';
import { SkillsMarketplaceClient } from '../services/skills-marketplace-client.js';
import { SkillsManager } from '../services/skills-manager.js';
import { logger } from '../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export class SkillsManagementMCP implements InternalMCP {
  name = 'skills';
  description = 'Anthropic Agent Skills management and discovery (built-in)';

  private marketplaceClient: SkillsMarketplaceClient | null = null;
  private skillsManager: SkillsManager | null = null;

  tools: InternalTool[] = [
    {
      name: 'find',
      description: 'Search and discover installed Anthropic Agent Skills with progressive detail levels. Use depth parameter for progressive disclosure: 1=metadata only, 2=+SKILL.md content (AI learns skill), 3=+file listings.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Optional search query to filter skills. If omitted, returns all skills.'
          },
          depth: {
            type: 'number',
            enum: [1, 2, 3],
            default: 1,
            description: 'Progressive disclosure level:\n- 1: Metadata only (name + description)\n- 2: + Full SKILL.md content (AI learns the skill)\n- 3: + File tree listing (scripts/, resources/, templates/)'
          },
          page: {
            type: 'number',
            default: 1,
            description: 'Page number for pagination (starts at 1)'
          },
          limit: {
            type: 'number',
            default: 10,
            description: 'Number of results per page'
          }
        }
      }
    },
    {
      name: 'read_resource',
      description: 'Read additional files from an installed skill (resources/, scripts/, templates/, etc.). Use after skills:find with depth=3 to see available files.',
      inputSchema: {
        type: 'object',
        properties: {
          skill_name: {
            type: 'string',
            description: 'Name of the installed skill'
          },
          file_path: {
            type: 'string',
            description: 'Relative path within skill directory (e.g., "resources/forms.md", "scripts/process.py")'
          }
        },
        required: ['skill_name', 'file_path']
      }
    },
    {
      name: 'add',
      description: 'Install an Anthropic Agent Skill from marketplace. Downloads SKILL.md to ~/.ncp/skills/ for auto-loading.',
      inputSchema: {
        type: 'object',
        properties: {
          skill_name: {
            type: 'string',
            description: 'REQUIRED. Name of the skill to install (e.g., "canvas-design", "pdf", "docx").'
          }
        },
        required: ['skill_name']
      }
    },
    {
      name: 'list',
      description: 'List installed Anthropic Agent Skills from ~/.ncp/skills/. Shows skills currently installed and ready for use.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'remove',
      description: 'Remove an installed Anthropic Agent Skill.',
      inputSchema: {
        type: 'object',
        properties: {
          skill_name: {
            type: 'string',
            description: 'REQUIRED. Name of the skill to remove.'
          }
        },
        required: ['skill_name']
      }
    }
  ];

  /**
   * Initialize marketplace client
   */
  private async ensureClient(): Promise<SkillsMarketplaceClient> {
    if (!this.marketplaceClient) {
      this.marketplaceClient = new SkillsMarketplaceClient();
      await this.marketplaceClient.initialize();
    }
    return this.marketplaceClient;
  }

  /**
   * Initialize skills manager
   */
  private async ensureSkillsManager(): Promise<SkillsManager> {
    if (!this.skillsManager) {
      this.skillsManager = new SkillsManager();
      await this.skillsManager.initialize();
      await this.skillsManager.loadAllSkills();
    }
    return this.skillsManager;
  }

  async executeTool(toolName: string, params: any): Promise<InternalToolResult> {
    try {
      switch (toolName) {
        case 'find':
          return await this.handleFind(params);

        case 'read_resource':
          return await this.handleReadResource(params);

        case 'add':
          const client = await this.ensureClient();
          return await this.handleAdd(client, params);

        case 'list':
          const listClient = await this.ensureClient();
          return await this.handleList(listClient);

        case 'remove':
          const removeClient = await this.ensureClient();
          return await this.handleRemove(removeClient, params);

        default:
          return {
            success: false,
            content: `Unknown skill tool: ${toolName}. Available: find, read_resource, add, list, remove`
          };
      }
    } catch (error: any) {
      logger.error(`Skills tool execution failed: ${toolName} - ${error.message}`);
      return {
        success: false,
        content: `Failed to execute ${toolName}: ${error.message}`
      };
    }
  }

  /**
   * Handle skills:find - Progressive skill discovery
   * Level 1: Metadata only (name + description)
   * Level 2: + Full SKILL.md content (AI learns the skill)
   * Level 3: + File tree listing
   */
  private async handleFind(params: any): Promise<InternalToolResult> {
    const manager = await this.ensureSkillsManager();
    const query = params?.query?.toLowerCase() || '';
    const depth = params?.depth || 1;
    const page = params?.page || 1;
    const limit = params?.limit || 10;

    // Get all loaded skills
    const allSkills = manager.getLoadedSkills();

    // Filter by query if provided
    let filteredSkills = allSkills;
    if (query) {
      filteredSkills = allSkills.filter(skill =>
        skill.metadata.name.toLowerCase().includes(query) ||
        skill.metadata.description?.toLowerCase().includes(query)
      );
    }

    // Handle empty results
    if (filteredSkills.length === 0) {
      return {
        success: true,
        content: query
          ? `No skills found matching "${query}". Try skills:add to install new skills.`
          : 'No skills installed yet. Use skills:add to install skills from the marketplace.'
      };
    }

    // Pagination
    const totalResults = filteredSkills.length;
    const totalPages = Math.ceil(totalResults / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = Math.min(startIndex + limit, totalResults);
    const paginatedSkills = filteredSkills.slice(startIndex, endIndex);

    // Build output based on depth
    let output = `## Skills Search Results (${totalResults} total)\n\n`;

    if (totalPages > 1) {
      output += `**Page ${page} of ${totalPages}** (showing ${startIndex + 1}-${endIndex})\n\n`;
    }

    for (const skill of paginatedSkills) {
      output += `### 📚 ${skill.metadata.name}\n`;
      output += `**Description:** ${skill.metadata.description || '(no description)'}\n`;

      // Level 1: Metadata only (always included)
      if (skill.metadata.version) {
        output += `**Version:** ${skill.metadata.version}\n`;
      }
      if (skill.metadata.author) {
        output += `**Author:** ${skill.metadata.author}\n`;
      }
      if (skill.metadata.tools && skill.metadata.tools.length > 0) {
        output += `**Tools:** ${skill.metadata.tools.join(', ')}\n`;
      }

      // Level 2: Full SKILL.md content (AI learns the skill!)
      if (depth >= 2) {
        output += `\n**Full Content:**\n\n`;
        output += '```markdown\n';
        output += skill.content;
        output += '\n```\n';
      }

      // Level 3: File tree listing
      if (depth >= 3) {
        const fileTree = await this.getSkillFileTree(skill.directory);
        if (fileTree.length > 0) {
          output += `\n**Available Files:**\n`;
          for (const file of fileTree) {
            output += `- ${file}\n`;
          }
          output += `\n💡 Use \`skills:read_resource\` to read specific files.\n`;
        }
      }

      output += `\n---\n\n`;
    }

    // Pagination hint
    if (page < totalPages) {
      output += `\n💡 More results available. Use \`page: ${page + 1}\` to see next page.\n`;
    }

    return {
      success: true,
      content: output
    };
  }

  /**
   * Get file tree for a skill directory
   */
  private async getSkillFileTree(skillDir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(skillDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name === 'SKILL.md') continue; // Already shown in content

        const relativePath = entry.name;

        if (entry.isDirectory()) {
          // Recursively list directory contents
          const subFiles = await this.listDirectoryRecursive(path.join(skillDir, entry.name), entry.name);
          files.push(...subFiles);
        } else {
          files.push(relativePath);
        }
      }
    } catch (error: any) {
      logger.debug(`Failed to list skill files: ${error.message}`);
    }

    return files.sort();
  }

  /**
   * Recursively list directory contents
   */
  private async listDirectoryRecursive(dirPath: string, prefix: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const relativePath = `${prefix}/${entry.name}`;

        if (entry.isDirectory()) {
          const subFiles = await this.listDirectoryRecursive(path.join(dirPath, entry.name), relativePath);
          files.push(...subFiles);
        } else {
          files.push(relativePath);
        }
      }
    } catch (error: any) {
      logger.debug(`Failed to list directory: ${error.message}`);
    }

    return files;
  }

  /**
   * Handle skills:read_resource - Read additional files from skill
   */
  private async handleReadResource(params: any): Promise<InternalToolResult> {
    const skillName = params?.skill_name;
    const filePath = params?.file_path;

    if (!skillName || !filePath) {
      return {
        success: false,
        content: 'Missing required parameters: skill_name and file_path'
      };
    }

    // Security: Prevent path traversal
    if (filePath.includes('..') || path.isAbsolute(filePath)) {
      return {
        success: false,
        content: 'Invalid file_path: must be relative path without ".."'
      };
    }

    const manager = await this.ensureSkillsManager();
    const skill = manager.getLoadedSkills().find(s => s.metadata.name === skillName);

    if (!skill) {
      return {
        success: false,
        content: `Skill not found: ${skillName}. Use skills:find to see available skills.`
      };
    }

    const fullPath = path.join(skill.directory, filePath);

    try {
      // Check if file exists and is within skill directory
      const realPath = await fs.realpath(fullPath);
      const realSkillDir = await fs.realpath(skill.directory);

      if (!realPath.startsWith(realSkillDir)) {
        return {
          success: false,
          content: 'Invalid file_path: must be within skill directory'
        };
      }

      // Read file content
      const content = await fs.readFile(fullPath, 'utf-8');
      const fileExtension = path.extname(filePath).toLowerCase();

      // Determine syntax highlighting
      const syntaxMap: Record<string, string> = {
        '.py': 'python',
        '.js': 'javascript',
        '.ts': 'typescript',
        '.sh': 'bash',
        '.json': 'json',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.md': 'markdown',
        '.html': 'html',
        '.css': 'css'
      };

      const syntax = syntaxMap[fileExtension] || '';

      return {
        success: true,
        content: `## ${filePath}\n\n\`\`\`${syntax}\n${content}\n\`\`\``
      };

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return {
          success: false,
          content: `File not found: ${filePath}. Use skills:find with depth=3 to see available files.`
        };
      }

      return {
        success: false,
        content: `Failed to read file: ${error.message}`
      };
    }
  }

  private async handleAdd(client: SkillsMarketplaceClient, params: any): Promise<InternalToolResult> {
    const skillName = params?.skill_name;

    if (!skillName) {
      return {
        success: false,
        content: 'Missing required parameter: skill_name'
      };
    }

    logger.info(`Installing skill: ${skillName}`);
    const result = await client.install(skillName);

    if (result.success) {
      return {
        success: true,
        content: `✅ ${result.message}\n\n**Installed to:** ${result.skillPath}\n\n💡 **Note:** Skill will be auto-loaded on next NCP restart. To use it now, restart NCP or use Claude Code's \`/plugin install\` command.`
      };
    } else {
      return {
        success: false,
        content: `❌ ${result.message}`
      };
    }
  }

  private async handleList(client: SkillsMarketplaceClient): Promise<InternalToolResult> {
    const skills = await client.listInstalled();

    if (skills.length === 0) {
      return {
        success: true,
        content: 'No skills installed yet.'
      };
    }

    let output = `## Installed Skills (${skills.length})\n\n`;

    for (const skill of skills) {
      output += `### ${skill.name}\n`;
      output += `${skill.description}\n`;
      if (skill.plugin) {
        output += `**Plugin:** ${skill.plugin}\n`;
      }
      if (skill.license) {
        output += `**License:** ${skill.license}\n`;
      }
      output += `**Remove:** Use \`skills:remove\` with \`skill_name: "${skill.name}"\`\n\n`;
    }

    return {
      success: true,
      content: output
    };
  }

  private async handleRemove(client: SkillsMarketplaceClient, params: any): Promise<InternalToolResult> {
    const skillName = params?.skill_name;

    if (!skillName) {
      return {
        success: false,
        content: 'Missing required parameter: skill_name'
      };
    }

    logger.info(`Removing skill: ${skillName}`);
    const result = await client.remove(skillName);

    if (result.success) {
      return {
        success: true,
        content: `✅ ${result.message}\n\n💡 **Note:** Changes take effect after NCP restart.`
      };
    } else {
      return {
        success: false,
        content: `❌ ${result.message}`
      };
    }
  }
}
