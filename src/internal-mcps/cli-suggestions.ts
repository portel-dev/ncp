/**
 * CLI Suggestions Internal MCP
 * Provides CLI tool suggestions based on runtime scanning
 * Zero maintenance - discovers tools dynamically
 */

import { InternalMCP, InternalTool, InternalToolResult } from './types.js';
import { CLIScanner } from '../services/cli-scanner.js';
import { CLIParser } from '../services/cli-parser.js';

export class CLISuggestionsMCP implements InternalMCP {
  name = 'cli';
  description = 'CLI tool discovery and suggestions (built-in)';
  private scanner: CLIScanner;

  constructor() {
    this.scanner = new CLIScanner();
  }

  tools: InternalTool[] = [
    {
      name: 'scan',
      description: 'Scan system for available CLI tools. Discovers tools dynamically with zero maintenance.',
      inputSchema: {
        type: 'object',
        properties: {
          force_refresh: {
            type: 'boolean',
            description: 'Force re-scan even if cache is fresh (default: false)',
            default: false
          }
        }
      }
    },
    {
      name: 'search',
      description: 'Search for CLI tools by capability or name. Returns tools actually installed on this system.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (e.g., "convert video", "process json", "search files")'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default: 5)',
            default: 5
          }
        },
        required: ['query']
      }
    },
    {
      name: 'check',
      description: 'Check if a specific CLI tool is installed and get its details',
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
      name: 'browse',
      description: 'Browse available CLI tools by category or list all categories',
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Optional category to filter by. Omit to list all categories.'
          }
        }
      }
    }
  ];

  async executeTool(toolName: string, parameters: any): Promise<InternalToolResult> {
    try {
      switch (toolName) {
        case 'scan':
          return await this.handleScan(parameters);

        case 'search':
          return await this.handleSearch(parameters);

        case 'check':
          return await this.handleCheck(parameters);

        case 'browse':
          return await this.handleBrowse(parameters);

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

  private async handleScan(params: any): Promise<InternalToolResult> {
    const forceRefresh = params?.force_refresh || false;

    const tools = await this.scanner.scanSystem(forceRefresh);

    // Group by category for better presentation
    const byCategory = tools.reduce((acc, tool) => {
      if (!acc[tool.category]) {
        acc[tool.category] = [];
      }
      acc[tool.category].push(tool);
      return acc;
    }, {} as Record<string, typeof tools>);

    let content = `🔍 System Scan Complete\n\n`;
    content += `Found **${tools.length}** CLI tools\n\n`;

    for (const [category, categoryTools] of Object.entries(byCategory)) {
      content += `**${category}** (${categoryTools.length} tools)\n`;
      content += `   ${categoryTools.slice(0, 10).map(t => t.name).join(', ')}`;
      if (categoryTools.length > 10) {
        content += ` ...and ${categoryTools.length - 10} more`;
      }
      content += `\n\n`;
    }

    content += `💡 **Next steps:**\n`;
    content += `   • Search for tools: run("cli:search", { query: "convert video" })\n`;
    content += `   • Browse category: run("cli:browse", { category: "media" })\n`;
    content += `   • Add tool to NCP: run("ncp:add", { mcp_name: "cli:ffmpeg" })`;

    return {
      success: true,
      content
    };
  }

  private async handleSearch(params: any): Promise<InternalToolResult> {
    const query = params.query;
    const limit = params.limit || 5;

    if (!query) {
      return {
        success: false,
        error: 'Missing required parameter: query'
      };
    }

    const results = await this.scanner.searchTools(query);
    const limited = results.slice(0, limit);

    if (limited.length === 0) {
      return {
        success: true,
        content: `No CLI tools found for "${query}" on this system.\n\n💡 Try:\n   • run("cli:scan", { force_refresh: true })\n   • Installing the tool you need, then scanning again`
      };
    }

    let content = `🔍 CLI Tools for "${query}":\n\n`;

    for (const tool of limited) {
      content += `**${tool.name}** - ${tool.description}\n`;
      content += `   Category: ${tool.category}\n`;
      content += `   Path: ${tool.path}\n`;

      if (tool.capabilities.length > 0) {
        content += `   Capabilities: ${tool.capabilities.slice(0, 5).join(', ')}\n`;
      }

      content += `   Add to NCP: run("ncp:add", { mcp_name: "cli:${tool.name}" })\n\n`;
    }

    if (results.length > limit) {
      content += `\n...and ${results.length - limit} more tools.\n`;
      content += `Run with limit: ${results.length} to see all.`;
    }

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

    if (!isAvailable) {
      return {
        success: true,
        content: `❌ **${toolName}** is not installed or not in PATH\n\n💡 **Tips:**\n   • Check spelling\n   • Install the tool if needed\n   • Run cli:scan to see what's available`
      };
    }

    // Try to find in scanned tools
    const scannedTools = await this.scanner.scanSystem();
    const tool = scannedTools.find(t => t.name === toolName);

    let content = `✅ **${toolName}** is installed\n\n`;

    if (tool) {
      content += `**Description:** ${tool.description}\n`;
      content += `**Category:** ${tool.category}\n`;
      content += `**Path:** ${tool.path}\n`;

      if (tool.capabilities.length > 0) {
        content += `**Capabilities:** ${tool.capabilities.join(', ')}\n`;
      }
    } else {
      // Tool exists but wasn't in scan (might be too obscure)
      const version = await parser.getVersion(toolName);
      if (version) {
        content += `**Version:** ${version}\n`;
      }
    }

    content += `\n**Add to NCP:** run("ncp:add", { mcp_name: "cli:${toolName}" })`;

    return {
      success: true,
      content
    };
  }

  private async handleBrowse(params: any): Promise<InternalToolResult> {
    const category = params?.category;

    if (!category) {
      // List all categories
      const categories = await this.scanner.getCategories();
      const allTools = await this.scanner.scanSystem();

      let content = `📚 CLI Tool Categories (${allTools.length} total tools):\n\n`;

      for (const cat of categories) {
        const catTools = allTools.filter(t => t.category === cat);
        content += `**${cat}** (${catTools.length} tools)\n`;
        const examples = catTools.slice(0, 5).map(t => t.name).join(', ');
        content += `   Examples: ${examples}\n`;
        if (catTools.length > 5) {
          content += `   ...and ${catTools.length - 5} more\n`;
        }
        content += `\n`;
      }

      content += `\n💡 **Browse a category:**\n   run("cli:browse", { category: "media" })`;

      return {
        success: true,
        content
      };
    } else {
      // List tools in category
      const tools = await this.scanner.getToolsByCategory(category);

      if (tools.length === 0) {
        const categories = await this.scanner.getCategories();
        return {
          success: true,
          content: `No tools found in category "${category}".\n\nAvailable categories: ${categories.join(', ')}`
        };
      }

      let content = `📚 **${category}** tools (${tools.length} found):\n\n`;

      for (const tool of tools) {
        content += `**${tool.name}** - ${tool.description}\n`;
        content += `   ${tool.path}\n`;
        content += `   Add: run("ncp:add", { mcp_name: "cli:${tool.name}" })\n\n`;
      }

      return {
        success: true,
        content
      };
    }
  }
}
