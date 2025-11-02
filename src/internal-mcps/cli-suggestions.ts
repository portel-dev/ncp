/**
 * CLI Suggestions Internal MCP
 * Provides CLI tool suggestions based on user queries
 */

import { InternalMCP, InternalTool, InternalToolResult } from './types.js';
import { suggestCLITools, getInstallCommand, getCategories, getToolsByCategory, CLI_TOOL_CATALOG } from '../services/cli-catalog.js';
import { CLIParser } from '../services/cli-parser.js';

export class CLISuggestionsMCP implements InternalMCP {
  name = 'cli';
  description = 'CLI tool suggestions and catalog (built-in)';

  tools: InternalTool[] = [
    {
      name: 'suggest',
      description: 'Get CLI tool suggestions for a specific task. Returns popular CLI tools that can help with the task, along with installation instructions.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Task description (e.g., "convert video", "process json", "search files")'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of suggestions (default: 3)',
            default: 3
          }
        },
        required: ['query']
      }
    },
    {
      name: 'check',
      description: 'Check if a CLI tool is installed on the system',
      inputSchema: {
        type: 'object',
        properties: {
          tool_name: {
            type: 'string',
            description: 'Name of the CLI tool to check (e.g., "ffmpeg", "jq", "git")'
          }
        },
        required: ['tool_name']
      }
    },
    {
      name: 'catalog',
      description: 'Browse the CLI tool catalog by category or list all categories',
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Optional category to filter by (e.g., "media", "data", "development"). Omit to list all categories.'
          }
        }
      }
    }
  ];

  async executeTool(toolName: string, parameters: any): Promise<InternalToolResult> {
    try {
      switch (toolName) {
        case 'suggest':
          return await this.handleSuggest(parameters);

        case 'check':
          return await this.handleCheck(parameters);

        case 'catalog':
          return await this.handleCatalog(parameters);

        default:
          return {
            success: false,
            error: `Unknown tool: ${toolName}`
          };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  private async handleSuggest(params: any): Promise<InternalToolResult> {
    const query = params.query;
    const limit = params.limit || 3;

    if (!query) {
      return {
        success: false,
        error: 'Missing required parameter: query'
      };
    }

    const suggestions = suggestCLITools(query, limit);

    if (suggestions.length === 0) {
      return {
        success: true,
        content: `No CLI tool suggestions found for "${query}".\n\nTry browsing the catalog with:\n  run("cli:catalog")`
      };
    }

    let content = `💡 CLI Tool Suggestions for "${query}":\n\n`;

    for (const tool of suggestions) {
      content += `**${tool.name}** - ${tool.description}\n`;

      const installCmd = getInstallCommand(tool.name);
      if (installCmd) {
        content += `   Install: \`${installCmd}\`\n`;
      }

      if (tool.homepage) {
        content += `   Learn more: ${tool.homepage}\n`;
      }

      content += `   Add to NCP: run("ncp:add", { mcp_name: "cli:${tool.name}" })\n\n`;
    }

    content += `💡 **Tip**: Install the tool first, then add it to NCP to make it discoverable.`;

    return {
      success: true,
      content
    };
  }

  private async handleCheck(params: any): Promise<InternalToolResult> {
    const toolName = params.tool_name;

    if (!toolName) {
      return {
        success: false,
        error: 'Missing required parameter: tool_name'
      };
    }

    const parser = new CLIParser();
    const isAvailable = await parser.isCliAvailable(toolName);

    if (isAvailable) {
      const version = await parser.getVersion(toolName);

      let content = `✅ **${toolName}** is installed\n`;
      if (version) {
        content += `   Version: ${version}\n`;
      }
      content += `\nAdd to NCP: run("ncp:add", { mcp_name: "cli:${toolName}" })`;

      return {
        success: true,
        content
      };
    } else {
      const catalogTool = CLI_TOOL_CATALOG[toolName];
      const installCmd = getInstallCommand(toolName);

      let content = `❌ **${toolName}** is not installed\n\n`;

      if (catalogTool) {
        content += `${catalogTool.description}\n\n`;
      }

      if (installCmd) {
        content += `Install with:\n   ${installCmd}\n\n`;
      }

      if (catalogTool?.homepage) {
        content += `Learn more: ${catalogTool.homepage}`;
      }

      return {
        success: true,
        content
      };
    }
  }

  private async handleCatalog(params: any): Promise<InternalToolResult> {
    const category = params?.category;

    if (!category) {
      // List all categories
      const categories = getCategories();

      let content = `📚 CLI Tool Catalog Categories:\n\n`;

      for (const cat of categories) {
        const tools = getToolsByCategory(cat);
        content += `**${cat}** (${tools.length} tools)\n`;
        content += `   ${tools.map(t => t.name).join(', ')}\n\n`;
      }

      content += `\nView tools in a category:\n  run("cli:catalog", { category: "media" })`;

      return {
        success: true,
        content
      };
    } else {
      // List tools in category
      const tools = getToolsByCategory(category);

      if (tools.length === 0) {
        return {
          success: true,
          content: `No tools found in category "${category}".\n\nAvailable categories: ${getCategories().join(', ')}`
        };
      }

      let content = `📚 **${category}** tools:\n\n`;

      for (const tool of tools) {
        content += `**${tool.name}** - ${tool.description}\n`;

        const parser = new CLIParser();
        const isInstalled = await parser.isCliAvailable(tool.name);

        if (isInstalled) {
          content += `   ✅ Installed\n`;
        } else {
          const installCmd = getInstallCommand(tool.name);
          if (installCmd) {
            content += `   Install: \`${installCmd}\`\n`;
          }
        }
        content += `\n`;
      }

      return {
        success: true,
        content
      };
    }
  }
}
