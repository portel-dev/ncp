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

        default:
          return {
            success: false,
            content: `Unknown marketplace tool: ${toolName}. Available: list`
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
}
