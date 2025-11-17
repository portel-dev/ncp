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

  async executeTool(toolName: string, params: any): Promise<InternalToolResult> {
    const client = await this.ensureClient();

    try {
      switch (toolName) {
        case 'add':
          return await this.handleAdd(client, params);

        case 'list':
          return await this.handleList(client);

        case 'remove':
          return await this.handleRemove(client, params);

        default:
          return {
            success: false,
            content: `Unknown skill tool: ${toolName}. Available: add, list, remove`
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
