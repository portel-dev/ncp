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
import { RegistryMCPCandidate } from '../services/registry-client.js';
import { UnifiedRegistryClient } from '../services/unified-registry-client.js';
import { collectCredentials, detectRequiredEnvVars, collectHTTPCredentials, elicitSelect, elicitMultiSelect } from '../utils/elicitation-helper.js';
import { showConfirmDialog } from '../utils/native-dialog.js';

export class NCPManagementMCP implements InternalMCP {
  name = 'mcp';
  description = 'MCP configuration management tools (built-in)';

  private profileManager: ProfileManager | null = null;
  private elicitationServer: ElicitationCapable | null = null;

  tools: InternalTool[] = [
    {
      name: 'add',
      description: 'Add a new MCP server to NCP configuration. Supports two modes: 1) Auto-detect: just provide mcp_name (e.g., "canva", "github") and NCP will look up known providers from registry. 2) Manual: provide command+args for stdio or url for HTTP/SSE. User confirmation required (automatic popup). User can securely provide API keys via clipboard during credential collection.',
      inputSchema: {
        type: 'object',
        properties: {
          mcp_name: {
            type: 'string',
            description: 'Name for the MCP server. For auto-detect, use provider name like "canva", "github", "notion". For manual config, use any name.'
          },
          command: {
            type: 'string',
            description: 'Command to execute for stdio servers (e.g., "npx", "node", "python"). Optional - only needed for manual configuration. Omit for auto-detect mode.'
          },
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'Command arguments for stdio servers (e.g., ["-y", "@modelcontextprotocol/server-github"]). Optional - only needed for manual configuration.'
          },
          url: {
            type: 'string',
            description: 'URL for HTTP/SSE servers (e.g., "https://api.example.com/mcp"). Optional - only needed for manual HTTP/SSE configuration.'
          },
          profile: {
            type: 'string',
            description: 'Target profile name (default: "all")',
            default: 'all'
          }
        },
        required: ['mcp_name']
      }
    },
    {
      name: 'remove',
      description: 'Remove an MCP server from NCP configuration. User confirmation required (automatic popup).',
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
    if (!params?.mcp_name) {
      return {
        success: false,
        error: 'Missing required parameter: mcp_name is required'
      };
    }

    const mcpName = params.mcp_name;
    let command = params.command;
    let commandArgs = params.args || [];
    let url = params.url;
    const profile = params.profile || 'all';

    // Validate transport type parameters
    const hasCommand = !!command;
    const hasUrl = !!url;

    if (hasCommand && hasUrl) {
      return {
        success: false,
        error: 'Cannot specify both command and url. Use command for stdio servers, url for HTTP/SSE servers.'
      };
    }

    // Auto-detect mode: no command or url provided
    if (!hasCommand && !hasUrl) {
      try {
        // Try to fetch provider from registry
        const { fetchProvider } = await import('../registry/provider-registry.js');
        const provider = await fetchProvider(mcpName);

        if (!provider) {
          return {
            success: false,
            error: `Provider "${mcpName}" not found in registry. Either:\n` +
                   `1. Use a known provider name (e.g., "canva", "github", "notion")\n` +
                   `2. Provide manual configuration with command (for stdio) or url (for HTTP/SSE)`
          };
        }

        // Use provider metadata to build config
        const transport = provider.recommended || 'stdio';

        if (transport === 'stdio' && provider.stdio) {
          command = provider.stdio.command;
          commandArgs = provider.stdio.args || [];
        } else if (transport === 'http' && provider.http) {
          url = provider.http.url;
        } else {
          return {
            success: false,
            error: `Provider "${mcpName}" found but missing ${transport} configuration. Please provide manual config.`
          };
        }

        logger.info(`Auto-detected provider "${mcpName}": ${transport} transport`);
      } catch (error: any) {
        return {
          success: false,
          error: `Failed to fetch provider: ${error.message}. Provide manual configuration instead.`
        };
      }
    }

    const transportType = url ? 'http' : 'stdio';

    // Validate stdio command before proceeding (security check)
    if (transportType === 'stdio') {
      const validationError = this.validateMCPCommand(command!, commandArgs);
      if (validationError) {
        return {
          success: false,
          error: `❌ Security validation failed: ${validationError}\n\n` +
                 `For security, NCP validates all MCP commands before installation.\n` +
                 `If you believe this is a legitimate MCP, please review the command and ensure it doesn't contain dangerous characters.`
        };
      }
    }

    // ===== CONFIRM BEFORE ADD (Server-side enforcement) =====
    if (this.elicitationServer) {
      // Build confirmation message based on transport type
      let confirmationMessage: string;

      if (transportType === 'http') {
        confirmationMessage = `⚠️ CONFIRM MCP INSTALLATION

Adding new HTTP/SSE MCP server: ${mcpName}
Profile: ${profile}
URL: ${url}

⚠️ This will allow the MCP server to access your system through HTTP/SSE. Only proceed if you trust this server.

Do you want to install this MCP?`;
      } else {
        const argsStr = commandArgs.length > 0 ? ` ${commandArgs.join(' ')}` : '';
        confirmationMessage = `⚠️ CONFIRM MCP INSTALLATION

Adding new MCP server: ${mcpName}
Profile: ${profile}
Command: ${command}${argsStr}

⚠️ Installing MCPs can execute arbitrary code on your system. Only proceed if you trust this MCP server.

Do you want to install this MCP?`;
      }

      let approved = false;

      try {
        // Try elicitation first (works with supporting MCP clients)
        const result = await this.elicitationServer.elicitInput({
          message: confirmationMessage,
          requestedSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['approve', 'cancel'],
                description: 'Choose: approve (install MCP) or cancel (don\'t install)'
              }
            },
            required: ['action']
          }
        });

        approved = !(result.action === 'decline' || result.action === 'cancel' ||
                    (result.action === 'accept' && result.content?.action === 'cancel'));

      } catch (error: any) {
        // Check if client doesn't support elicitation (error -32601: Method not found)
        const isMethodNotFound = error.code === -32601 ||
                                 (error.message && error.message.includes('Method not found'));

        if (isMethodNotFound) {
          logger.warn('Elicitation not supported by client, falling back to native OS dialog');

          // Fallback to native OS dialog
          try {
            const result = await showConfirmDialog(
              'NCP: Confirm MCP Installation',
              confirmationMessage,
              'Approve',
              'Cancel'
            );

            // Handle timeout with retry instruction
            if (result.timedOut && result.stillPending) {
              return {
                success: false,
                error: `⏳ Waiting for user confirmation...\n\n` +
                       `A confirmation dialog is still open on your system. Please:\n` +
                       `1. Check for a dialog box asking to approve MCP installation\n` +
                       `2. Click "Approve" or "Cancel" in that dialog\n` +
                       `3. Retry this operation (I'll check if you already responded)\n\n` +
                       `💡 If you already clicked Approve, just retry this exact same operation and it will proceed.`
              };
            }

            approved = result.approved;
          } catch (nativeError: any) {
            // Dialog system failed (missing zenity, PowerShell error, etc.)
            // This is our limitation, not user's choice - provide manual installation instructions
            logger.error(`Native dialog failed: ${nativeError.message}`);

            const profilePath = await this.profileManager!.getProfilePath(profile);

            // Build config based on transport type
            let configToAdd: any;
            let cliCommand: string;

            if (transportType === 'http') {
              configToAdd = {
                url
              };
              cliCommand = `ncp add-http ${mcpName} ${url}`;
            } else {
              const argsStr = commandArgs.length > 0 ? commandArgs.join(' ') : '';
              configToAdd = {
                command,
                args: commandArgs
              };
              cliCommand = `ncp add ${mcpName} ${command} ${argsStr}`;
            }

            // Check if running as extension with global CLI disabled
            const isExtension = process.env.NCP_MODE === 'extension';
            const globalCliEnabled = process.env.NCP_ENABLE_GLOBAL_CLI === 'true';

            let errorMessage = `⚠️  Cannot show confirmation dialog: ${nativeError.message}\n\n` +
                               `For security, NCP requires user confirmation before installing MCPs.\n\n`;

            // If extension without global CLI, suggest enabling it first
            if (isExtension && !globalCliEnabled) {
              errorMessage += `📌 EASIEST OPTION: Enable the global NCP command\n\n` +
                              `1. Edit your Claude Desktop extension settings (.dxt file)\n` +
                              `2. Set: "enableGlobalCLI": true\n` +
                              `3. Restart Claude Desktop\n` +
                              `4. Use command: ${cliCommand}\n\n` +
                              `────────────────────────────────────────\n\n`;
            }

            const credentialHint = transportType === 'http'
              ? `💡 If this MCP requires authentication, add the "auth" field in the config.`
              : `💡 If this MCP requires API keys/credentials, add them to the "env" field in the config.`;

            errorMessage += `📝 OR: Install manually by editing configuration\n\n` +
                            `1. Open your profile configuration file:\n` +
                            `   ${profilePath}\n\n` +
                            `2. Add this to the "mcpServers" section:\n` +
                            `   "${mcpName}": ${JSON.stringify(configToAdd, null, 2).split('\n').join('\n   ')}\n\n` +
                            `3. Save the file\n\n` +
                            `4. Restart NCP or your MCP client\n\n` +
                            `⚙️  Full reference: ${cliCommand}\n\n` +
                            credentialHint;

            return {
              success: false,
              error: errorMessage
            };
          }
        } else {
          // Other elicitation error
          logger.error(`Elicitation error: ${error.message}`);
          throw error;
        }
      }

      if (!approved) {
        return {
          success: false,
          error: `⛔ Installation cancelled by user. MCP "${mcpName}" was not added.`
        };
      }
    }
    // ===== END CONFIRM BEFORE ADD =====

    // Build config and collect credentials based on transport type
    let config: any;
    let credentialInfo = '';

    if (transportType === 'http') {
      // HTTP/SSE server configuration
      config = {
        url
      };

      // Try to collect HTTP credentials (bearer tokens) if needed
      if (this.elicitationServer) {
        try {
          const httpAuth = await collectHTTPCredentials(this.elicitationServer, mcpName, url);

          if (httpAuth) {
            config.auth = httpAuth;
            credentialInfo = ' with authentication';
            logger.info(`Collected HTTP authentication for "${mcpName}"`);
          } else {
            logger.info(`No authentication required for HTTP MCP "${mcpName}"`);
          }
        } catch (error: any) {
          // User cancelled credential collection
          if (error.message && error.message.includes('cancelled')) {
            return {
              success: false,
              error: 'User cancelled credential collection'
            };
          }
          // Other errors - log but continue without auth (might be public endpoint)
          logger.warn(`Failed to collect HTTP credentials: ${error.message}`);
        }
      }
    } else {
      // stdio server configuration
      config = {
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
          credentialInfo = ` with ${Object.keys(credentials).length} credential(s)`;
          logger.info(`Collected ${Object.keys(credentials).length} credentials for "${mcpName}"`);
        }
      }
    }

    // Add MCP to profile
    await this.profileManager!.addMCPToProfile(profile, mcpName, config);

    // Try to get tools from the newly added MCP
    let toolsList = '';
    try {
      const tools = await this.getToolsFromMCP(mcpName, config, transportType);
      if (tools && tools.length > 0) {
        toolsList = `\n\n**Available tools** (${tools.length} total):\n`;
        // Show first 10 tools
        const displayTools = tools.slice(0, 10);
        displayTools.forEach(tool => {
          toolsList += `  • \`${tool.name}\` - ${tool.description || 'No description'}\n`;
        });
        if (tools.length > 10) {
          toolsList += `  ... and ${tools.length - 10} more\n`;
        }
      }
    } catch (error: any) {
      // Failed to get tools - non-fatal, just skip the tools list
      logger.warn(`Could not retrieve tools from "${mcpName}": ${error.message}`);
    }

    // Build success message based on transport type
    let successMessage: string;

    if (transportType === 'http') {
      const authInfo = config.auth ? ` (${config.auth.type} auth)` : ' (no auth)';
      successMessage = `✅ HTTP/SSE MCP server "${mcpName}" added to profile "${profile}"${credentialInfo}\n\n` +
        `URL: ${url}${authInfo}${toolsList}`;
    } else {
      successMessage = `✅ MCP server "${mcpName}" added to profile "${profile}"${credentialInfo}\n\n` +
        `Command: ${command} ${config.args?.join(' ') || ''}${toolsList}`;
    }

    logger.info(`Added MCP "${mcpName}" to profile "${profile}" (${transportType})${credentialInfo}`);

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

    // ===== CONFIRM BEFORE REMOVE (Server-side enforcement) =====
    if (this.elicitationServer) {
      const confirmationMessage = `⚠️ CONFIRM MCP REMOVAL

Removing MCP server: ${mcpName}
Profile: ${profile}

This will remove the MCP configuration. You can always add it back later.

Do you want to remove this MCP?`;

      let approved = false;

      try {
        // Try elicitation first (works with supporting MCP clients)
        const result = await this.elicitationServer.elicitInput({
          message: confirmationMessage,
          requestedSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['approve', 'cancel'],
                description: 'Choose: approve (remove MCP) or cancel (keep it)'
              }
            },
            required: ['action']
          }
        });

        approved = !(result.action === 'decline' || result.action === 'cancel' ||
                    (result.action === 'accept' && result.content?.action === 'cancel'));

      } catch (error: any) {
        // Check if client doesn't support elicitation (error -32601: Method not found)
        const isMethodNotFound = error.code === -32601 ||
                                 (error.message && error.message.includes('Method not found'));

        if (isMethodNotFound) {
          logger.warn('Elicitation not supported by client, falling back to native OS dialog');

          // Fallback to native OS dialog
          try {
            const result = await showConfirmDialog(
              'NCP: Confirm MCP Removal',
              confirmationMessage,
              'Approve',
              'Cancel'
            );

            // Handle timeout with retry instruction
            if (result.timedOut && result.stillPending) {
              return {
                success: false,
                error: `⏳ Waiting for user confirmation...\n\n` +
                       `A confirmation dialog is still open on your system. Please:\n` +
                       `1. Check for a dialog box asking to approve MCP removal\n` +
                       `2. Click "Approve" or "Cancel" in that dialog\n` +
                       `3. Retry this operation (I'll check if you already responded)\n\n` +
                       `💡 If you already clicked Approve, just retry this exact same operation and it will proceed.`
              };
            }

            approved = result.approved;
          } catch (nativeError: any) {
            // Dialog system failed (missing zenity, PowerShell error, etc.)
            // This is our limitation, not user's choice - provide manual removal instructions
            logger.error(`Native dialog failed: ${nativeError.message}`);

            const profilePath = await this.profileManager!.getProfilePath(profile);

            // Check if running as extension with global CLI disabled
            const isExtension = process.env.NCP_MODE === 'extension';
            const globalCliEnabled = process.env.NCP_ENABLE_GLOBAL_CLI === 'true';

            let errorMessage = `⚠️  Cannot show confirmation dialog: ${nativeError.message}\n\n` +
                               `For security, NCP requires user confirmation before removing MCPs.\n\n`;

            // If extension without global CLI, suggest enabling it first
            if (isExtension && !globalCliEnabled) {
              errorMessage += `📌 EASIEST OPTION: Enable the global NCP command\n\n` +
                              `1. Edit your Claude Desktop extension settings (.dxt file)\n` +
                              `2. Set: "enableGlobalCLI": true\n` +
                              `3. Restart Claude Desktop\n` +
                              `4. Use command: ncp remove ${mcpName}\n\n` +
                              `────────────────────────────────────────\n\n`;
            }

            errorMessage += `📝 OR: Remove manually by editing configuration\n\n` +
                            `1. Open your profile configuration file:\n` +
                            `   ${profilePath}\n\n` +
                            `2. Find and delete the "${mcpName}" entry from the "mcpServers" section\n\n` +
                            `3. Save the file\n\n` +
                            `4. Restart NCP or your MCP client\n\n` +
                            `💡 Make sure to preserve valid JSON format (watch for trailing commas).`;

            return {
              success: false,
              error: errorMessage
            };
          }
        } else {
          // Other elicitation error
          logger.error(`Elicitation error: ${error.message}`);
          throw error;
        }
      }

      if (!approved) {
        return {
          success: false,
          error: `⛔ Removal cancelled by user. MCP "${mcpName}" was not removed.`
        };
      }
    }
    // ===== END CONFIRM BEFORE REMOVE =====

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
    let from = params?.from;
    const source = params?.source;
    const selection = params?.selection;

    // If 'from' not specified and we have elicitation, let user choose source
    if (!from && this.elicitationServer) {
      const sources = [
        { value: 'clipboard', label: 'Clipboard - Paste saved config' },
        { value: 'file', label: 'File - Load from file path' },
        { value: 'discovery', label: 'Discovery - Search registry' }
      ];

      from = await elicitSelect(
        this.elicitationServer,
        'import_source',
        sources,
        'Where would you like to import MCPs from?'
      );

      if (!from) {
        return {
          success: false,
          error: 'Import source selection cancelled'
        };
      }

      // Guide AI on next step if client has execution limitations
      // (e.g., Copilot can't complete full elicitation flow)
      if (!source && from === 'discovery') {
        return {
          success: true,
          content: `✓ You selected: **Discovery**\n\n` +
                   `Next step: Call \`mcp:import\` with:\n` +
                   `- \`from\`: "discovery"\n` +
                   `- \`source\`: your search term (e.g., "github", "filesystem")\n\n` +
                   `Example: \`mcp:import\` with from="discovery" and source="github"`
        };
      }

      if (!source && (from === 'file' || from === 'clipboard')) {
        const nextAction = from === 'file'
          ? 'provide a file path in the \`source\` parameter'
          : 'have your MCP config JSON ready to paste to clipboard';

        return {
          success: true,
          content: `✓ You selected: **${from.charAt(0).toUpperCase() + from.slice(1)}**\n\n` +
                   `Next step: ${nextAction} and call \`mcp:import\` again with:\n` +
                   `- \`from\`: "${from}"\n` +
                   `- \`source\`: ${from === 'file' ? 'file path' : 'N/A (reads from clipboard)'}`
        };
      }
    }

    // Default to clipboard if no elicitation available
    from = from || 'clipboard';

    switch (from) {
      case 'clipboard':
        return await this.importFromClipboard();

      case 'file':
        if (!source) {
          return {
            success: false,
            error: 'source parameter required when from=file (file path). Example: source="/path/to/config.json"'
          };
        }
        return await this.importFromFile(source);

      case 'discovery':
        if (!source) {
          return {
            success: false,
            error: 'source parameter required when from=discovery (search query). Example: source="github" to search for GitHub MCPs'
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
      const registryClient = new UnifiedRegistryClient();
      const candidates = await registryClient.searchForSelection(query);

      if (candidates.length === 0) {
        return {
          success: false,
          error: `No MCPs found for query: "${query}". Try a different search term.`
        };
      }

      // If no selection, use elicitation to let user choose (if available)
      if (!selection) {
        // If elicitation server available, show interactive multi-select dialog
        if (this.elicitationServer) {
          const options = candidates.map(c => {
            // Build label with security indicators
            const trustBadge = c.isTrusted ? '✓ ' : '';
            const transportBadge = c.transport === 'stdio' ? '💻' : '🌐';
            const envInfo = c.envVars?.length ? ` (${c.envVars.length} env vars)` : '';
            const transportInfo = c.transport !== 'stdio' ? ` [${c.transport.toUpperCase()}]` : '';

            return {
              value: c.name,
              label: `${trustBadge}${transportBadge} ${c.displayName}${transportInfo}${envInfo}`
            };
          });

          const unverifiedCount = candidates.filter(c => !c.repository?.url).length;
          let message = `Select MCPs to import from "${query}":\n\n`;

          if (unverifiedCount > 0) {
            message += `⚠️  WARNING: ${unverifiedCount} server${unverifiedCount !== 1 ? 's have' : ' has'} no repository.\n` +
                       `Only select MCPs from sources you trust.\n\n`;
          }

          message += `Badges: ✓=Trusted 💻=stdio 🌐=HTTP/SSE`;

          const selected = await elicitMultiSelect(
            this.elicitationServer,
            'mcps',
            options,
            message
          );

          if (selected.length === 0) {
            return {
              success: false,
              error: 'No MCPs selected for import'
            };
          }

          // Convert selected names to indices for processing
          selection = selected.map(name => {
            const idx = candidates.findIndex(c => c.name === name);
            return (idx + 1).toString();
          }).join(',');
        } else {
          // Fallback: show numbered list for non-elicitation clients
          const listItems = candidates.map(c => {
            const trustBadge = c.isTrusted ? '✓' : '';
            const transportBadge = c.transport === 'stdio' ? '💻' : '🌐';
            const envInfo = c.envVars?.length ? ` (${c.envVars.length} env vars required)` : '';
            const transportInfo = c.transport !== 'stdio' ? ` [${c.transport.toUpperCase()}]` : '';
            let mainLine = `${c.number}. ${trustBadge}${transportBadge} ${c.displayName}${transportInfo}${envInfo}`;

            let details = `   ${c.description}`;
            details += `\n   Version: ${c.version}`;

            if (c.repository?.url) {
              details += `\n   ✓ Repository: ${c.repository.url}`;
            } else {
              details += `\n   ⚠️  NO REPOSITORY - Unverified source`;
            }

            if (c.publishedAt) {
              const ageMs = Date.now() - new Date(c.publishedAt).getTime();
              const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
              if (ageDays < 7) {
                details += `\n   ⚠️  Published ${ageDays} day${ageDays !== 1 ? 's' : ''} ago - Very new`;
              }
            }

            return mainLine + '\n' + details;
          }).join('\n\n');

          const trustedCount = candidates.filter(c => c.isTrusted).length;
          const unverifiedCount = candidates.filter(c => !c.repository?.url).length;

          let message = `📋 Found ${candidates.length} MCPs matching "${query}"`;
          if (trustedCount > 0) {
            message += ` (${trustedCount} from trusted sources)`;
          }
          message += `:\n\n${listItems}\n\n`;

          if (unverifiedCount > 0) {
            message += `⚠️  WARNING: ${unverifiedCount} server${unverifiedCount !== 1 ? 's have' : ' has'} no repository.\n` +
                       `   Only install MCPs from sources you trust.\n\n`;
          }

          message += `⚙️  To import, call ncp:import again with selection:\n` +
            `   Example: { from: "discovery", source: "${query}", selection: "1,3,5" }\n\n` +
            `   - Select individual: "1,3,5"\n` +
            `   - Select range: "1-5"\n` +
            `   - Select all: "*"\n\n` +
            `💡 Badges: ✓=Trusted 💻=stdio 🌐=HTTP/SSE`;

          return {
            success: true,
            content: message
          };
        }
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

  /**
   * Get tools from a newly added MCP by temporarily connecting to it
   * Returns array of tools or null if connection fails
   */
  private async getToolsFromMCP(
    mcpName: string,
    config: any,
    transportType: 'stdio' | 'http'
  ): Promise<Array<{ name: string; description?: string }> | null> {
    const timeoutMs = 5000; // 5 second timeout

    if (transportType === 'stdio') {
      // Stdio transport - use MCP SDK client
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

      let transport: any = null;
      let client: any = null;

      try {
        // Validate command for security (prevent command injection)
        const validationError = this.validateMCPCommand(config.command, config.args || []);
        if (validationError) {
          logger.warn(`Command validation failed for "${mcpName}": ${validationError}`);
          return null;
        }

        // Create transport
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env: { ...process.env, ...(config.env || {}) },
          stderr: 'ignore'
        });

        client = new Client(
          {
            name: 'ncp-tool-discovery',
            version: '1.0.0'
          },
          {
            capabilities: {}
          }
        );

        // Connect with timeout
        await Promise.race([
          client.connect(transport),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), timeoutMs)
          )
        ]);

        // Get tools list
        const response = await Promise.race([
          client.listTools(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('listTools timeout')), timeoutMs)
          )
        ]) as any;

        return response.tools.map((t: any) => ({
          name: t.name,
          description: t.description || ''
        }));
      } catch (error: any) {
        logger.warn(`Failed to get tools from stdio MCP "${mcpName}": ${error.message}`);
        return null;
      } finally {
        // Clean up
        try {
          if (client) await client.close();
        } catch (e) { /* ignore */ }
        try {
          if (transport) await transport.close();
        } catch (e) { /* ignore */ }
      }
    } else {
      // HTTP/SSE transport - make HTTP request
      try {
        const url = config.url;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };

        // Add auth if configured
        if (config.auth?.type === 'bearer' && config.auth.token) {
          headers['Authorization'] = `Bearer ${config.auth.token}`;
        }

        const response = await Promise.race([
          fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'tools/list',
              params: {}
            })
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('HTTP timeout')), timeoutMs)
          )
        ]) as Response;

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json() as any;

        if (data.error) {
          throw new Error(data.error.message || 'Unknown error');
        }

        return data.result.tools.map((t: any) => ({
          name: t.name,
          description: t.description || ''
        }));
      } catch (error: any) {
        logger.warn(`Failed to get tools from HTTP MCP "${mcpName}": ${error.message}`);
        return null;
      }
    }
  }

  /**
   * Validate MCP command for security
   * Prevents command injection by checking against allowlist and validating format
   *
   * @returns null if valid, error message if invalid
   */
  private validateMCPCommand(command: string, args: string[]): string | null {
    // Validate command is a string and not empty
    if (!command || typeof command !== 'string') {
      return 'Command must be a non-empty string';
    }

    // Allowlist of safe command names (base name only, not full path)
    const SAFE_COMMANDS = [
      'node', 'npx', 'npm', 'pnpm', 'yarn', 'bun', 'deno',  // Node.js runtimes
      'python', 'python3', 'pip', 'pipx', 'uv',              // Python
      'docker', 'podman',                                     // Containers
      'bash', 'sh', 'zsh',                                    // Shells (for wrapper scripts)
      'go', 'cargo', 'rustc',                                 // Other runtimes
      'java', 'javac'                                         // Java
    ];

    // Extract base command name (handle paths)
    const path = require('path');
    const baseCommand = path.basename(command);

    // Check if base command is in allowlist
    if (!SAFE_COMMANDS.includes(baseCommand)) {
      // Not in allowlist - log warning but allow (user may have custom MCPs)
      logger.warn(`MCP command "${baseCommand}" not in known safe commands list. Proceeding with caution.`);
    }

    // Check for shell metacharacters that could be used for injection
    const DANGEROUS_CHARS = /[;&|`$()<>]/;
    if (DANGEROUS_CHARS.test(command)) {
      return `Command contains dangerous shell metacharacters: ${command}`;
    }

    // Validate args don't contain injection attempts
    for (const arg of args) {
      if (typeof arg !== 'string') {
        return `All arguments must be strings, got: ${typeof arg}`;
      }

      // Check for dangerous patterns in args (more lenient than command)
      // Allow common arg patterns like --flag, -f, @package, ./path
      const VERY_DANGEROUS = /[;&|`$()><]/;
      if (VERY_DANGEROUS.test(arg)) {
        return `Argument contains dangerous characters: ${arg}`;
      }
    }

    // Path traversal check - ensure command doesn't escape upward
    if (command.includes('../')) {
      return 'Command contains path traversal (../)';
    }

    return null; // Valid
  }
}
