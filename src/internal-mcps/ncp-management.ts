/**
 * NCP Management Internal MCP
 *
 * Provides tools for managing NCP configuration:
 * - add: Add single MCP
 * - remove: Remove MCP
 * - list: List configured MCPs
 * - import: Bulk import (clipboard/file/discovery)
 * - export: Export configuration
 */

import { InternalMCP, InternalTool, InternalToolResult, ElicitationCapable } from './types.js';
import ProfileManager from '../profiles/profile-manager.js';
import { logger } from '../utils/logger.js';
import { RegistryClient, RegistryMCPCandidate } from '../services/registry-client.js';
import { collectCredentials, detectRequiredEnvVars } from '../utils/elicitation-helper.js';

export class NCPManagementMCP implements InternalMCP {
  name = 'ncp';
  description = 'NCP configuration management tools';

  private profileManager: ProfileManager | null = null;
  private elicitationServer: ElicitationCapable | null = null;

  tools: InternalTool[] = [
    {
      name: 'add',
      description: 'Add a new MCP server to NCP configuration. IMPORTANT: AI must first call confirm_add_mcp prompt for user approval. User can securely provide API keys via clipboard before approving.',
      inputSchema: {
        type: 'object',
        properties: {
          mcp_name: {
            type: 'string',
            description: 'Name for the MCP server (e.g., "github", "filesystem")'
          },
          command: {
            type: 'string',
            description: 'Command to execute (e.g., "npx", "node", "python")'
          },
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'Command arguments (e.g., ["-y", "@modelcontextprotocol/server-github"])'
          },
          profile: {
            type: 'string',
            description: 'Target profile name (default: "all")',
            default: 'all'
          }
        },
        required: ['mcp_name', 'command']
      }
    },
    {
      name: 'remove',
      description: 'Remove an MCP server from NCP configuration. IMPORTANT: AI must first call confirm_remove_mcp prompt for user approval.',
      inputSchema: {
        type: 'object',
        properties: {
          mcp_name: {
            type: 'string',
            description: 'Name of the MCP server to remove'
          },
          profile: {
            type: 'string',
            description: 'Profile to remove from (default: "all")',
            default: 'all'
          }
        },
        required: ['mcp_name']
      }
    },
    {
      name: 'list',
      description: 'List all configured MCP servers in a profile',
      inputSchema: {
        type: 'object',
        properties: {
          profile: {
            type: 'string',
            description: 'Profile name to list (default: "all")',
            default: 'all'
          }
        }
      }
    },
    {
      name: 'import',
      description: 'Import MCPs from clipboard, file, or discovery. For discovery: first call shows numbered list, second call with selection imports chosen MCPs.',
      inputSchema: {
        type: 'object',
        properties: {
          from: {
            type: 'string',
            enum: ['clipboard', 'file', 'discovery'],
            default: 'clipboard',
            description: 'Import source: clipboard (default), file path, or discovery (search registry)'
          },
          source: {
            type: 'string',
            description: 'File path (when from=file) or search query (when from=discovery). Not needed for clipboard.'
          },
          selection: {
            type: 'string',
            description: 'Selection from discovery results (only for from=discovery). Format: "1,3,5" or "1-5" or "*" for all'
          }
        }
      }
    },
    {
      name: 'export',
      description: 'Export current NCP configuration. Use clipboard for security (no chat history), response for transparency.',
      inputSchema: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            enum: ['clipboard', 'response', 'file'],
            default: 'clipboard',
            description: 'Export destination: clipboard (silent, secure), response (visible to AI), or file'
          },
          destination: {
            type: 'string',
            description: 'File path (only for to=file)'
          },
          profile: {
            type: 'string',
            description: 'Profile to export (default: "all")',
            default: 'all'
          }
        }
      }
    }
  ];

  /**
   * Set the ProfileManager instance
   * Called by orchestrator after initialization
   */
  setProfileManager(profileManager: ProfileManager): void {
    this.profileManager = profileManager;
  }

  /**
   * Set the elicitation server for user interaction
   * Called by MCP server after initialization
   */
  setElicitationServer(server: ElicitationCapable): void {
    this.elicitationServer = server;
  }

  async executeTool(toolName: string, parameters: any): Promise<InternalToolResult> {
    if (!this.profileManager) {
      return {
        success: false,
        error: 'ProfileManager not initialized. Please try again.'
      };
    }

    try {
      switch (toolName) {
        case 'add':
          return await this.handleAdd(parameters);

        case 'remove':
          return await this.handleRemove(parameters);

        case 'list':
          return await this.handleList(parameters);

        case 'import':
          return await this.handleImport(parameters);

        case 'export':
          return await this.handleExport(parameters);

        default:
          return {
            success: false,
            error: `Unknown tool: ${toolName}. Available tools: add, remove, list, import, export`
          };
      }
    } catch (error: any) {
      logger.error(`Internal MCP tool execution failed: ${error.message}`);
      return {
        success: false,
        error: error.message || 'Tool execution failed'
      };
    }
  }

  private async handleAdd(params: any): Promise<InternalToolResult> {
    if (!params?.mcp_name || !params?.command) {
      return {
        success: false,
        error: 'Missing required parameters: mcp_name and command are required'
      };
    }

    const mcpName = params.mcp_name;
    const command = params.command;
    const commandArgs = params.args || [];
    const profile = params.profile || 'all';

    // Build base config
    const config: any = {
      command,
      args: commandArgs
    };

    // Detect if this MCP needs environment variables
    const requiredCredentials = detectRequiredEnvVars(mcpName);

    if (requiredCredentials.length > 0 && this.elicitationServer) {
      // Use elicitation to collect credentials one by one
      logger.info(`MCP "${mcpName}" requires ${requiredCredentials.length} credentials`);

      const credentials = await collectCredentials(
        this.elicitationServer,
        requiredCredentials.map(c => ({
          ...c,
          required: true
        }))
      );

      if (credentials === null) {
        return {
          success: false,
          error: 'User cancelled credential collection'
        };
      }

      // Add collected credentials to config
      if (Object.keys(credentials).length > 0) {
        config.env = credentials;
        logger.info(`Collected ${Object.keys(credentials).length} credentials for "${mcpName}"`);
      }
    }

    // Add MCP to profile
    await this.profileManager!.addMCPToProfile(profile, mcpName, config);

    // Log success (without revealing secrets)
    const hasCredentials = config.env && Object.keys(config.env).length > 0;
    const credInfo = hasCredentials ? ` with ${Object.keys(config.env).length} credential(s)` : '';
    const successMessage = `✅ MCP server "${mcpName}" added to profile "${profile}"${credInfo}\n\n` +
      `Command: ${command} ${config.args?.join(' ') || ''}\n\n` +
      `The MCP server will be available after NCP is restarted.`;

    logger.info(`Added MCP "${mcpName}" to profile "${profile}"${hasCredentials ? ' with credentials' : ''}`);

    return {
      success: true,
      content: successMessage
    };
  }

  private async handleRemove(params: any): Promise<InternalToolResult> {
    if (!params?.mcp_name) {
      return {
        success: false,
        error: 'Missing required parameter: mcp_name is required'
      };
    }

    const mcpName = params.mcp_name;
    const profile = params.profile || 'all';

    // Remove MCP from profile
    await this.profileManager!.removeMCPFromProfile(profile, mcpName);

    const successMessage = `✅ MCP server "${mcpName}" removed from profile "${profile}"\n\n` +
      `The change will take effect after NCP is restarted.`;

    logger.info(`Removed MCP "${mcpName}" from profile "${profile}"`);

    return {
      success: true,
      content: successMessage
    };
  }

  private async handleList(params: any): Promise<InternalToolResult> {
    const profile = params?.profile || 'all';

    const mcps = await this.profileManager!.getProfileMCPs(profile);

    if (!mcps || Object.keys(mcps).length === 0) {
      return {
        success: true,
        content: `No MCPs configured in profile "${profile}"`
      };
    }

    const mcpList = Object.entries(mcps)
      .map(([name, config]) => {
        const isRemote = 'url' in config;
        const transportBadge = isRemote ? '🌐' : '💻';

        if (isRemote) {
          // HTTP/SSE server
          const authType = config.auth?.type || 'none';
          return `${transportBadge} ${name}\n  URL: ${config.url}\n  Auth: ${authType}`;
        } else {
          // stdio server
          const argsStr = config.args?.join(' ') || '';
          const envKeys = config.env ? Object.keys(config.env).join(', ') : '';
          const envInfo = envKeys ? `\n  Environment: ${envKeys}` : '';
          return `${transportBadge} ${name}\n  Command: ${config.command} ${argsStr}${envInfo}`;
        }
      })
      .join('\n\n');

    const successMessage = `📋 Configured MCPs in profile "${profile}":\n\n${mcpList}\n\n💡 Badges: 💻=stdio 🌐=HTTP/SSE`;

    return {
      success: true,
      content: successMessage
    };
  }

  private async handleImport(params: any): Promise<InternalToolResult> {
    const from = params?.from || 'clipboard';
    const source = params?.source;
    const selection = params?.selection;

    switch (from) {
      case 'clipboard':
        return await this.importFromClipboard();

      case 'file':
        if (!source) {
          return {
            success: false,
            error: 'source parameter required when from=file'
          };
        }
        return await this.importFromFile(source);

      case 'discovery':
        if (!source) {
          return {
            success: false,
            error: 'source parameter required when from=discovery (search query)'
          };
        }
        return await this.importFromDiscovery(source, selection);

      default:
        return {
          success: false,
          error: `Invalid from parameter: ${from}. Use: clipboard, file, or discovery`
        };
    }
  }

  private async importFromClipboard(): Promise<InternalToolResult> {
    try {
      const clipboardy = await import('clipboardy');
      const clipboardContent = await clipboardy.default.read();

      if (!clipboardContent || clipboardContent.trim().length === 0) {
        return {
          success: false,
          error: 'Clipboard is empty. Copy a valid MCP configuration JSON first.'
        };
      }

      const config = JSON.parse(clipboardContent.trim());

      // Validate and import
      if (!config.mcpServers || typeof config.mcpServers !== 'object') {
        return {
          success: false,
          error: 'Invalid config format. Expected: {"mcpServers": {...}}'
        };
      }

      let imported = 0;
      for (const [name, mcpConfig] of Object.entries(config.mcpServers)) {
        if (typeof mcpConfig === 'object' && mcpConfig !== null && 'command' in mcpConfig) {
          await this.profileManager!.addMCPToProfile('all', name, mcpConfig as any);
          imported++;
        }
      }

      return {
        success: true,
        content: `✅ Imported ${imported} MCPs from clipboard`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to import from clipboard: ${error.message}`
      };
    }
  }

  private async importFromFile(filePath: string): Promise<InternalToolResult> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Expand ~ to home directory
      const expandedPath = filePath.startsWith('~')
        ? path.join(process.env.HOME || process.env.USERPROFILE || '', filePath.slice(1))
        : filePath;

      const content = await fs.readFile(expandedPath, 'utf-8');
      const config = JSON.parse(content);

      // Validate and import
      if (!config.mcpServers || typeof config.mcpServers !== 'object') {
        return {
          success: false,
          error: 'Invalid config format. Expected: {"mcpServers": {...}}'
        };
      }

      let imported = 0;
      for (const [name, mcpConfig] of Object.entries(config.mcpServers)) {
        if (typeof mcpConfig === 'object' && mcpConfig !== null && 'command' in mcpConfig) {
          await this.profileManager!.addMCPToProfile('all', name, mcpConfig as any);
          imported++;
        }
      }

      return {
        success: true,
        content: `✅ Imported ${imported} MCPs from ${filePath}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to import from file: ${error.message}`
      };
    }
  }

  private async importFromDiscovery(query: string, selection?: string): Promise<InternalToolResult> {
    try {
      const registryClient = new RegistryClient();
      const candidates = await registryClient.searchForSelection(query);

      if (candidates.length === 0) {
        return {
          success: false,
          error: `No MCPs found for query: "${query}". Try a different search term.`
        };
      }

      // If no selection, show numbered list
      if (!selection) {
        const listItems = candidates.map(c => {
          const statusBadge = c.status === 'active' ? '⭐' : '📦';
          const transportBadge = c.transport === 'stdio' ? '💻' : '🌐';
          const envInfo = c.envVars?.length ? ` (${c.envVars.length} env vars required)` : '';
          const transportInfo = c.transport !== 'stdio' ? ` [${c.transport.toUpperCase()}]` : '';
          return `${c.number}. ${statusBadge}${transportBadge} ${c.displayName}${transportInfo}${envInfo}\n   ${c.description}\n   Version: ${c.version}`;
        }).join('\n\n');

        const message = `📋 Found ${candidates.length} MCPs matching "${query}":\n\n${listItems}\n\n` +
          `⚙️  To import, call ncp:import again with selection:\n` +
          `   Example: { from: "discovery", source: "${query}", selection: "1,3,5" }\n\n` +
          `   - Select individual: "1,3,5"\n` +
          `   - Select range: "1-5"\n` +
          `   - Select all: "*"\n\n` +
          `💡 Badges: ⭐=active 📦=package 💻=stdio 🌐=HTTP/SSE`;

        return {
          success: true,
          content: message
        };
      }

      // Parse selection
      const selectedIndices = this.parseSelection(selection, candidates.length);
      if (selectedIndices.length === 0) {
        return {
          success: false,
          error: `Invalid selection: "${selection}". Use format like "1,3,5" or "1-5" or "*"`
        };
      }

      const selectedCandidates = selectedIndices.map(i => candidates[i - 1]).filter(Boolean);

      if (selectedCandidates.length === 0) {
        return {
          success: false,
          error: `No valid MCPs selected. Check your selection numbers.`
        };
      }

      // Import each selected MCP
      let imported = 0;
      const importedNames: string[] = [];
      const errors: string[] = [];

      for (const candidate of selectedCandidates) {
        try {
          // Get detailed info including env vars
          const details = await registryClient.getDetailedInfo(candidate.name);

          // Build config based on transport type
          // TODO: Add elicitation support for bulk import credentials
          let config: any;

          if (details.transport === 'stdio') {
            // stdio server
            config = {
              command: details.command!,
              args: details.args || [],
              env: {}
            };
          } else {
            // HTTP/SSE server
            config = {
              url: details.url!,
              auth: {
                type: 'bearer'
              }
            };
          }

          await this.profileManager!.addMCPToProfile('all', candidate.displayName, config);
          imported++;
          importedNames.push(candidate.displayName);

          logger.info(`Imported ${candidate.displayName} from registry (${details.transport})`);
        } catch (error: any) {
          errors.push(`${candidate.displayName}: ${error.message}`);
          logger.error(`Failed to import ${candidate.displayName}: ${error.message}`);
        }
      }

      let message = `✅ Imported ${imported}/${selectedCandidates.length} MCPs from registry:\n\n`;
      message += importedNames.map(name => `  ✓ ${name}`).join('\n');

      if (errors.length > 0) {
        message += `\n\n❌ Failed to import ${errors.length} MCPs:\n`;
        message += errors.map(e => `  ✗ ${e}`).join('\n');
      }

      message += `\n\n💡 Note: MCPs imported without environment variables. Use ncp:list to see configs, or use clipboard pattern with ncp:add to add secrets.`;

      return {
        success: imported > 0,
        content: message
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to import from registry: ${error.message}`
      };
    }
  }

  /**
   * Parse selection string into array of indices
   * Supports: "1,3,5" (individual), "1-5" (range), "*" (all)
   */
  private parseSelection(selection: string, maxCount: number): number[] {
    const indices: number[] = [];

    // Handle "*" (all)
    if (selection.trim() === '*') {
      for (let i = 1; i <= maxCount; i++) {
        indices.push(i);
      }
      return indices;
    }

    // Split by comma
    const parts = selection.split(',').map(s => s.trim());

    for (const part of parts) {
      // Check for range (e.g., "1-5")
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(s => parseInt(s.trim(), 10));
        if (!isNaN(start) && !isNaN(end) && start <= end && start >= 1 && end <= maxCount) {
          for (let i = start; i <= end; i++) {
            if (!indices.includes(i)) {
              indices.push(i);
            }
          }
        }
      } else {
        // Individual number
        const num = parseInt(part, 10);
        if (!isNaN(num) && num >= 1 && num <= maxCount && !indices.includes(num)) {
          indices.push(num);
        }
      }
    }

    return indices.sort((a, b) => a - b);
  }

  private async handleExport(params: any): Promise<InternalToolResult> {
    const to = params?.to || 'clipboard';
    const destination = params?.destination;
    const profile = params?.profile || 'all';

    try {
      const mcps = await this.profileManager!.getProfileMCPs(profile);

      if (!mcps || Object.keys(mcps).length === 0) {
        return {
          success: false,
          error: `No MCPs to export from profile "${profile}"`
        };
      }

      const exportConfig = {
        mcpServers: mcps
      };

      const jsonContent = JSON.stringify(exportConfig, null, 2);

      switch (to) {
        case 'clipboard': {
          // Write to clipboard (security pattern - no chat history)
          try {
            const clipboardy = await import('clipboardy');
            await clipboardy.default.write(jsonContent);
            return {
              success: true,
              content: `✅ Copied ${Object.keys(mcps).length} MCPs from profile "${profile}" to clipboard\n\n` +
                       `Use ncp:import with from=clipboard to restore later.`
            };
          } catch (error: any) {
            // Clipboard failed - fallback to response mode
            logger.warn(`Clipboard write failed: ${error.message}, falling back to response mode`);
            return {
              success: true,
              content: `⚠️  Clipboard unavailable. Showing configuration instead:\n\n` +
                       `\`\`\`json\n${jsonContent}\n\`\`\`\n\n` +
                       `Please copy manually.`
            };
          }
        }

        case 'response': {
          // Return JSON in response (visible to AI, for transparency)
          return {
            success: true,
            content: `✅ Exported ${Object.keys(mcps).length} MCPs from profile "${profile}"\n\n` +
                     `📋 Configuration:\n\n` +
                     `\`\`\`json\n${jsonContent}\n\`\`\`\n\n` +
                     `💡 You can:\n` +
                     `• Copy and paste into another MCP client's config\n` +
                     `• Save to a file for backup\n` +
                     `• Share with your team\n` +
                     `• Use with 'ncp import' to restore later`
          };
        }

        case 'file': {
          if (!destination) {
            return {
              success: false,
              error: 'destination parameter required when to=file'
            };
          }

          const fs = await import('fs/promises');
          const path = await import('path');

          // Expand ~ to home directory
          const expandedPath = destination.startsWith('~')
            ? path.join(process.env.HOME || process.env.USERPROFILE || '', destination.slice(1))
            : destination;

          await fs.writeFile(expandedPath, jsonContent, 'utf-8');

          return {
            success: true,
            content: `✅ Exported ${Object.keys(mcps).length} MCPs to ${destination}`
          };
        }

        default:
          return {
            success: false,
            error: `Invalid to parameter: ${to}. Use: clipboard, response, or file`
          };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to export: ${error.message}`
      };
    }
  }
}
