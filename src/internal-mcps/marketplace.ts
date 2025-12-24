/**
 * Marketplace Management Internal MCP
 *
 * Provides tools for managing skill marketplaces.
 * Aligned with Photon's marketplace management pattern.
 */

import { InternalMCP, InternalTool, InternalToolResult } from './types.js';
import { SkillsMarketplaceClient } from '../services/skills-marketplace-client.js';
import { logger } from '../utils/logger.js';

export class MarketplaceMCP implements InternalMCP {
  name = 'marketplace';
  description = 'Skill marketplace management tools (built-in)';

  private marketplaceClient: SkillsMarketplaceClient | null = null;

  tools: InternalTool[] = [
    {
      name: 'list',
      description: 'List all configured skill marketplaces',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'search',
      description: 'Search all skill marketplaces for available skills to install',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Optional search query to filter skills. Supports "|" for multi-search (e.g., "pdf|excel"). If omitted, returns all available skills.'
          },
          limit: {
            type: 'number',
            default: 20,
            description: 'Maximum number of results to return'
          }
        }
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
        case 'list':
          return await this.handleList(client);

        case 'search':
          return await this.handleSearch(client, params);

        default:
          return {
            success: false,
            content: `Unknown marketplace tool: ${toolName}. Available: list, search`
          };
      }
    } catch (error: any) {
      logger.error(`Marketplace tool execution failed: ${toolName} - ${error.message}`);
      return {
        success: false,
        content: `Failed to execute ${toolName}: ${error.message}`
      };
    }
  }

  private async handleList(client: SkillsMarketplaceClient): Promise<InternalToolResult> {
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

  private async handleSearch(client: SkillsMarketplaceClient, params: any): Promise<InternalToolResult> {
    const query = params.query;
    const limit = params.limit || 20;

    // Parse multi-query if present
    const queries = query ? query.split('|').map((q: string) => q.trim()).filter((q: string) => q) : [];
    
    const skills = await client.searchMarketplace(queries.length > 0 ? queries : undefined);

    if (skills.length === 0) {
      const searchInfo = query ? ` matching "${query}"` : '';
      return {
        success: true,
        content: `No skills found in marketplace${searchInfo}.\n\nTip: Use marketplace:list() to see configured marketplaces.`
      };
    }

    // Limit results
    const limitedSkills = skills.slice(0, limit);
    const searchInfo = query ? ` matching "${query}"` : '';
    
    let output = `## Available Skills in Marketplace (${limitedSkills.length}${skills.length > limit ? ` of ${skills.length}` : ''})${searchInfo}\n\n`;

    // Group by plugin
    const byPlugin = new Map<string, typeof skills>();
    for (const skill of limitedSkills) {
      const plugin = skill.plugin || 'other';
      if (!byPlugin.has(plugin)) {
        byPlugin.set(plugin, []);
      }
      byPlugin.get(plugin)!.push(skill);
    }

    for (const [plugin, pluginSkills] of byPlugin) {
      output += `### ${plugin}\n\n`;
      for (const skill of pluginSkills) {
        output += `**${skill.name}**`;
        if (skill.version) output += ` (v${skill.version})`;
        output += `\n`;
        if (skill.description) output += `${skill.description}\n`;
        output += `*Install:* \`skills:add({ skill_name: "${skill.name}" })\`\n\n`;
      }
    }

    if (skills.length > limit) {
      output += `\n*Showing ${limit} of ${skills.length} results. Use limit parameter to see more.*\n`;
    }

    return {
      success: true,
      content: output
    };
  }
}
