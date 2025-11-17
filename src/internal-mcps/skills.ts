/**
 * Skills Management Internal MCP
 *
 * Provides tools for managing Anthropic Agent Skills:
 * - search: Search for skills in marketplaces
 * - add: Install skill from marketplace
 * - list: List installed skills
 * - remove: Remove installed skill
 */

import { InternalMCP, InternalTool, InternalToolResult } from './types.js';
import { SkillsMarketplaceClient } from '../services/skills-marketplace-client.js';
import { logger } from '../utils/logger.js';

export class SkillsManagementMCP implements InternalMCP {
  name = 'skills';
  description = 'Anthropic Agent Skills management tools (built-in)';

  private marketplaceClient: SkillsMarketplaceClient | null = null;

  tools: InternalTool[] = [
    {
      name: 'find',
      description: 'Discover available Anthropic Agent Skills in marketplaces. Dual mode: (1) NO QUERY: List all available skills from configured marketplaces (default behavior for discovery). (2) WITH QUERY: Search and filter skills by name/description. Use this before installing to see what\'s available.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Optional search query to filter skills by name or description (e.g., "document", "pdf", "canvas"). Omit to list ALL available skills (recommended for initial discovery).'
          }
        }
      }
    },
    {
      name: 'add',
      description: 'Install an Anthropic Agent Skill from marketplace. Downloads SKILL.md to ~/.ncp/skills/ for auto-loading. Use "find" first to discover available skills.',
      inputSchema: {
        type: 'object',
        properties: {
          skill_name: {
            type: 'string',
            description: 'REQUIRED. Name of the skill to install (e.g., "canvas-design", "pdf", "docx"). Use "find" method to discover available skills first.'
          }
        },
        required: ['skill_name']
      }
    },
    {
      name: 'list',
      description: 'List installed Anthropic Agent Skills from ~/.ncp/skills/. Shows skills that are currently installed and ready for use. Use "find" to discover available skills before installing.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'remove',
      description: 'Remove an installed Anthropic Agent Skill. Use "list" first to see installed skills.',
      inputSchema: {
        type: 'object',
        properties: {
          skill_name: {
            type: 'string',
            description: 'REQUIRED. Name of the skill to remove. Use "list" method to get exact names of installed skills.'
          }
        },
        required: ['skill_name']
      }
    },
    {
      name: 'marketplace-list',
      description: 'List all configured skill marketplaces (including official anthropics/skills repository)',
      inputSchema: {
        type: 'object',
        properties: {}
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

  async executeTool(toolName: string, params: any): Promise<InternalToolResult> {
    const client = await this.ensureClient();

    try {
      switch (toolName) {
        case 'find':
        case 'search': // Backward compatibility
          return await this.handleFind(client, params);

        case 'add':
          return await this.handleAdd(client, params);

        case 'list':
          return await this.handleList(client);

        case 'remove':
          return await this.handleRemove(client, params);

        case 'marketplace-list':
          return await this.handleMarketplaceList(client);

        default:
          return {
            success: false,
            content: `Unknown skill tool: ${toolName}. Available: find, add, list, remove, marketplace-list`
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

  private async handleFind(client: SkillsMarketplaceClient, params: any): Promise<InternalToolResult> {
    const query = params?.query;

    // Dual mode: no query = list all, with query = search
    const skills = await client.search(query);

    if (skills.length === 0) {
      return {
        success: true,
        content: query
          ? `No skills found matching "${query}". Try a different search term or omit the query to see all available skills.`
          : 'No skills available in configured marketplaces. Check marketplace configuration with skills:marketplace-list.'
      };
    }

    // Different messaging for list vs search mode
    let output = query
      ? `## Skills matching "${query}" (${skills.length} found)\n\n`
      : `## All Available Skills (${skills.length} total)\n\n`;

    for (const skill of skills) {
      output += `### ${skill.name}\n`;
      output += `${skill.description}\n`;
      if (skill.plugin) {
        output += `**Plugin:** ${skill.plugin}\n`;
      }
      if (skill.license) {
        output += `**License:** ${skill.license}\n`;
      }
      output += `**Install:** Use \`skills:add\` with \`skill_name: "${skill.name}"\`\n\n`;
    }

    output += query
      ? `\n💡 **Tip:** Use \`skills:add\` to install a skill. Use \`skills:find\` without query to see all available skills.`
      : `\n💡 **Tip:** Use \`skills:add\` to install a skill, then it will be auto-loaded on next startup. Use \`skills:list\` to see installed skills.`;

    return {
      success: true,
      content: output
    };
  }

  private async handleAdd(client: SkillsMarketplaceClient, params: any): Promise<InternalToolResult> {
    const skillName = params?.skill_name;

    if (!skillName) {
      return {
        success: false,
        content: 'Missing required parameter: skill_name. Use "skills:find" to discover available skills first.'
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
        content: `❌ ${result.message}\n\n💡 **Tip:** Use "skills:find" to discover available skills.`
      };
    }
  }

  private async handleList(client: SkillsMarketplaceClient): Promise<InternalToolResult> {
    const skills = await client.listInstalled();

    if (skills.length === 0) {
      return {
        success: true,
        content: `No skills installed yet.\n\n💡 **Tip:** Use "skills:find" to discover available skills, then "skills:add" to install them.`
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
        content: 'Missing required parameter: skill_name. Use "skills:list" to see installed skills.'
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

  private async handleMarketplaceList(client: SkillsMarketplaceClient): Promise<InternalToolResult> {
    const marketplaces = client.getAll();

    if (marketplaces.length === 0) {
      return {
        success: true,
        content: 'No marketplaces configured. This is unexpected - the default anthropics/skills marketplace should be configured automatically.'
      };
    }

    let output = `## Configured Skill Marketplaces (${marketplaces.length})\n\n`;

    for (const marketplace of marketplaces) {
      output += `### ${marketplace.name}\n`;
      output += `**Repository:** ${marketplace.repo || 'N/A'}\n`;
      output += `**Source:** ${marketplace.source}\n`;
      output += `**Type:** ${marketplace.sourceType}\n`;
      output += `**Status:** ${marketplace.enabled ? '✅ Enabled' : '❌ Disabled'}\n`;
      if (marketplace.lastUpdated) {
        output += `**Last Updated:** ${marketplace.lastUpdated}\n`;
      }
      output += '\n';
    }

    return {
      success: true,
      content: output
    };
  }
}
