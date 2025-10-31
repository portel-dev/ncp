/**
 * NCP Management Internal MCP
 *
 * Provides tools for managing NCP configuration:
 * - add: Add MCP(s) with smart detection (single/bulk/file/clipboard/URL)
 * - remove: Remove MCP
 * - list: List configured MCPs
 * - export: Export configuration
 */

import * as path from 'path';
import { InternalMCP, InternalTool, InternalToolResult, ElicitationCapable } from './types.js';
import ProfileManager from '../profiles/profile-manager.js';
import { logger } from '../utils/logger.js';
import { RegistryMCPCandidate } from '../services/registry-client.js';
import { UnifiedRegistryClient } from '../services/unified-registry-client.js';
import { collectCredentials, detectRequiredEnvVars, collectHTTPCredentials, collectBulkCredentials, elicitMultiSelect, detectHTTPCredentials } from '../utils/elicitation-helper.js';
import { showConfirmDialog } from '../utils/native-dialog.js';

export class NCPManagementMCP implements InternalMCP {
  name = 'mcp';
  description = 'MCP configuration management tools (built-in)';

  private profileManager: ProfileManager | null = null;
  private elicitationServer: ElicitationCapable | null = null;

  tools: InternalTool[] = [
    {
      name: 'add',
      description: 'Add MCP server(s) to NCP with smart auto-detection of input type. Supports multiple modes: (1) SINGLE: Add one MCP from registry or manual config (e.g., "github", "canva"). (2) BULK: Pipe-separated names for multiple MCPs (e.g., "gmail | slack | github"). (3) FILE IMPORT: Path to config file (e.g., "~/backup.json", "./config.json"). (4) HTTP URL: Direct URL to HTTP/SSE server (e.g., "https://mcp.example.com"). (5) CLIPBOARD: Use special value "clipboard" to import from clipboard. For uncertain names, use "find" method first to discover available MCPs.',
      inputSchema: {
        type: 'object',
        properties: {
          mcp_name: {
            type: 'string',
            description: 'REQUIRED. Smart parameter that auto-detects mode: (1) Single name: "github" → registry lookup or manual. (2) Pipe-separated: "gmail | slack" → bulk install from registry. (3) File path: "~/config.json" or "./backup.json" → import from file. (4) HTTP URL: "https://mcp.example.com" → add HTTP server. (5) "clipboard" → import from clipboard. Pre-fill based on user intent, or use "find" method to discover MCP names first.'
          },
          command: {
            type: 'string',
            description: 'Optional. Command for stdio servers (e.g., "npx", "python"). Only for manual single-MCP configuration when mcp_name is a simple name.'
          },
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional. Command arguments for stdio servers. Only for manual single-MCP configuration.'
          },
          url: {
            type: 'string',
            description: 'Optional. URL for HTTP/SSE servers. Only for manual single-MCP configuration when mcp_name is a simple name (overrides auto-detected URL mode).'
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
      description: 'Remove an MCP server from NCP configuration. First use "find" or "list" to identify the exact mcp_name, then call this tool. User confirmation required (automatic popup).',
      inputSchema: {
        type: 'object',
        properties: {
          mcp_name: {
            type: 'string',
            description: 'REQUIRED. Name of the MCP server to remove. Pre-fill if extractable from user intent, otherwise use "find" or "list" method to get the exact name first.'
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
    },
    {
      name: 'doctor',
      description: 'Run diagnostics on NCP system health and MCP configurations. Read-only - reports issues without making changes. Matches CLI: ncp doctor',
      inputSchema: {
        type: 'object',
        properties: {
          mcp_name: {
            type: 'string',
            description: 'Check specific MCP only (optional - omit to check all)'
          },
          profile: {
            type: 'string',
            description: 'Profile to check (default: "all")',
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

        case 'export':
          return await this.handleExport(parameters);

        case 'doctor':
          return await this.handleDoctor(parameters);

        default:
          return {
            success: false,
            error: `Unknown tool: ${toolName}. Available tools: add, remove, list, export, doctor`
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
        error: 'Missing required parameter: mcp_name. Use "find" method to discover MCPs first, then extract the mcp_name from results.'
      };
    }

    let mcpName = params.mcp_name;
    let command = params.command;
    let commandArgs = params.args || [];
    let url = params.url;
    const profile = params.profile || 'all';

    // === SMART AUTO-DETECTION (matching CLI behavior) ===

    // 1. Special value: "clipboard" → import from clipboard
    if (mcpName.toLowerCase() === 'clipboard') {
      return await this.importFromClipboard();
    }

    // 2. Pipe-delimited bulk add → discovery mode with multiple queries
    if (mcpName.includes('|') && !command && !url) {
      return await this.importFromDiscovery(mcpName);
    }

    // 3. File path detection → import from file
    // Check for: .json extension, path separators (/, ~/, ./)
    if (!command && !url && (
      mcpName.endsWith('.json') ||
      mcpName.startsWith('/') ||
      mcpName.startsWith('~/') ||
      mcpName.startsWith('./')
    )) {
      return await this.importFromFile(mcpName);
    }

    // 4. HTTP URL detection → set url and continue with single add
    if (!command && !url && (
      mcpName.startsWith('http://') ||
      mcpName.startsWith('https://')
    )) {
      try {
        // Extract name from URL (domain-based)
        const urlObj = new URL(mcpName);
        const generatedName = urlObj.hostname
          .replace(/\./g, '-')
          .replace(/^www-/, '');

        // Set url from the URL string and update mcpName to generated name
        url = mcpName;
        mcpName = generatedName;

        logger.info(`Auto-detected HTTP URL: ${url}, using name: ${mcpName}`);
      } catch (error: any) {
        return {
          success: false,
          error: `Invalid URL format: ${mcpName}. Error: ${error.message}`
        };
      }
      // Continue with single add logic below (will be HTTP transport)
    }

    // 5. Otherwise → single add mode (registry or manual)
    // Continue with existing logic below...

    // === END SMART AUTO-DETECTION ===

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
              cliCommand = `Manual config edit required (HTTP URLs not supported via CLI)`;
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
        error: 'Missing required parameter: mcp_name. Use "list" or "find" method to identify MCPs first, then extract the exact mcp_name.'
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

  private async importFromDiscovery(queryString: string): Promise<InternalToolResult> {
    try {
      const registryClient = new UnifiedRegistryClient();

      // Check for pipe-delimited multi-query
      const queries = queryString.includes('|')
        ? queryString.split('|').map((q: string) => q.trim()).filter((q: string) => q.length > 0)
        : [queryString];

      // Search for all queries in parallel
      const searchResults = await Promise.all(
        queries.map(query => registryClient.searchForSelection(query))
      );

      // Flatten and deduplicate candidates
      const allCandidates = searchResults.flat();
      const uniqueCandidates = Array.from(
        new Map(allCandidates.map(c => [c.name, c])).values()
      );

      if (uniqueCandidates.length === 0) {
        return {
          success: false,
          error: queries.length > 1
            ? `No MCPs found for queries: "${queries.join('", "')}". Try different search terms.`
            : `No MCPs found for query: "${queryString}". Try a different search term.`
        };
      }

      // If elicitation server available, show interactive multi-select dialog
      let selectedCandidates = uniqueCandidates;

      if (this.elicitationServer) {
        const options = uniqueCandidates.map(c => {
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

        const unverifiedCount = uniqueCandidates.filter(c => !c.repository?.url).length;
        const queryDesc = queries.length > 1
          ? `"${queries.join('", "')}"`
          : `"${queryString}"`;

        let message = `Select MCPs to import from ${queryDesc}:\n\n`;

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

        // Filter to only selected candidates
        selectedCandidates = uniqueCandidates.filter(c => selected.includes(c.name));
      }
      // If no elicitation server, install all candidates directly (bulk import use case)

      if (selectedCandidates.length === 0) {
        return {
          success: false,
          error: `No valid MCPs selected for import.`
        };
      }

      // Import each selected MCP (without credentials first)
      let imported = 0;
      const importedNames: string[] = [];
      const errors: string[] = [];
      const importedMCPs: Array<{
        name: string;
        displayName: string;
        transport: 'stdio' | 'http' | 'sse';
        details: any;
      }> = [];

      for (const candidate of selectedCandidates) {
        try {
          // Get detailed info including env vars
          const details = await registryClient.getDetailedInfo(candidate.name);

          // Build config based on transport type (without credentials)
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
          importedMCPs.push({
            name: candidate.name,
            displayName: candidate.displayName,
            transport: details.transport,
            details
          });

          logger.info(`Imported ${candidate.displayName} from registry (${details.transport})`);
        } catch (error: any) {
          errors.push(`${candidate.displayName}: ${error.message}`);
          logger.error(`Failed to import ${candidate.displayName}: ${error.message}`);
        }
      }

      // After importing, collect credentials in bulk if elicitation available
      let credentialsConfigured = 0;
      if (imported > 0 && this.elicitationServer) {
        try {
          // Build credential requirements for all imported MCPs
          const bulkCredentials: Record<string, Array<{
            envVarName: string;
            displayName: string;
            example?: string;
            required?: boolean;
            transport?: 'stdio' | 'http';
          }>> = {};

          for (const mcp of importedMCPs) {
            const credentials = [];

            if (mcp.transport === 'stdio') {
              // Detect environment variables for stdio servers
              const envVars = detectRequiredEnvVars(mcp.name);
              for (const envVar of envVars) {
                credentials.push({
                  envVarName: envVar.envVarName,
                  displayName: envVar.displayName,
                  example: envVar.example,
                  required: true, // All detected env vars are required
                  transport: 'stdio' as const
                });
              }
            } else {
              // Detect auth requirements for HTTP servers
              const httpCreds = detectHTTPCredentials(mcp.name, mcp.details.url);
              for (const httpCred of httpCreds) {
                credentials.push({
                  envVarName: 'AUTH_TOKEN',
                  displayName: httpCred.displayName,
                  example: httpCred.example,
                  required: true,
                  transport: 'http' as const
                });
              }
            }

            if (credentials.length > 0) {
              bulkCredentials[mcp.displayName] = credentials;
            }
          }

          // If any MCPs need credentials, show consolidated form
          if (Object.keys(bulkCredentials).length > 0) {
            const collected = await collectBulkCredentials(this.elicitationServer, bulkCredentials);

            if (collected && Object.keys(collected).length > 0) {
              // Update each MCP config with collected credentials
              for (const mcp of importedMCPs) {
                try {
                  const mcpCreds: Record<string, string> = {};
                  let hasCredentials = false;

                  // Extract credentials for this MCP from collected data
                  for (const [key, value] of Object.entries(collected)) {
                    if (key.startsWith(`${mcp.displayName}:`)) {
                      const envVarName = key.split(':')[1];
                      mcpCreds[envVarName] = value;
                      hasCredentials = true;
                    }
                  }

                  if (hasCredentials) {
                    // Get current config
                    const currentConfig = await this.profileManager!.getProfileMCPs('all');
                    if (!currentConfig) {
                      logger.warn(`Could not retrieve profile config for ${mcp.displayName}`);
                      continue;
                    }

                    const mcpConfig = currentConfig[mcp.displayName];
                    if (mcpConfig) {
                      if (mcp.transport === 'stdio') {
                        // Update env vars for stdio
                        mcpConfig.env = { ...mcpConfig.env, ...mcpCreds };
                      } else {
                        // Update auth token for HTTP
                        if (mcpCreds.AUTH_TOKEN) {
                          mcpConfig.auth = {
                            type: 'bearer',
                            token: mcpCreds.AUTH_TOKEN
                          };
                        }
                      }

                      // Save updated config
                      await this.profileManager!.addMCPToProfile('all', mcp.displayName, mcpConfig);
                      credentialsConfigured++;
                      logger.info(`Updated credentials for ${mcp.displayName}`);
                    }
                  }
                } catch (error: any) {
                  logger.warn(`Failed to update credentials for ${mcp.displayName}: ${error.message}`);
                }
              }
            }
          }
        } catch (error: any) {
          logger.warn(`Failed to collect bulk credentials: ${error.message}`);
        }
      }

      const queryDesc = queries.length > 1
        ? `${queries.length} queries ("${queries.join('", "')}")`
        : `"${queryString}"`;

      let message = `✅ Imported ${imported}/${selectedCandidates.length} MCPs from ${queryDesc}:\n\n`;
      message += importedNames.map(name => `  ✓ ${name}`).join('\n');

      if (errors.length > 0) {
        message += `\n\n❌ Failed to import ${errors.length} MCPs:\n`;
        message += errors.map(e => `  ✗ ${e}`).join('\n');
      }

      // Add credential status to message
      if (credentialsConfigured > 0) {
        message += `\n\n🔑 Configured credentials for ${credentialsConfigured}/${imported} MCPs`;
        if (credentialsConfigured < imported) {
          message += `\n💡 ${imported - credentialsConfigured} MCP(s) still need credentials. Use ncp:list to see configs.`;
        }
      } else if (imported > 0 && this.elicitationServer) {
        message += `\n\n💡 Note: Credentials not configured. MCPs may require API keys/tokens to function.`;
      } else if (imported > 0) {
        message += `\n\n💡 Note: MCPs imported without credentials. Use ncp:list to see configs, or manually add credentials.`;
      }

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

  private async handleDoctor(params: any): Promise<InternalToolResult> {
    const mcpName = params?.mcp_name;
    const profile = params?.profile || 'all';

    const issues: string[] = [];
    const warnings: string[] = [];
    let checksPerformed = 0;

    // 1. Check Node.js version
    checksPerformed++;
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    if (majorVersion < 18) {
      issues.push(`Node.js ${nodeVersion} is outdated (minimum: v18.0.0)`);
    }

    // 2. Check config directory
    checksPerformed++;
    const configPath = this.profileManager!.getConfigPath();
    try {
      const fs = await import('fs/promises');
      await fs.access(configPath);
    } catch (error) {
      issues.push(`Config directory not found: ${configPath}`);
    }

    // 3. Check profile exists and is valid JSON
    checksPerformed++;
    try {
      const profilePath = await this.profileManager!.getProfilePath(profile);
      const fs = await import('fs/promises');
      const content = await fs.readFile(profilePath, 'utf-8');
      JSON.parse(content); // Validate JSON
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        issues.push(`Profile "${profile}" not found`);
      } else if (error instanceof SyntaxError) {
        issues.push(`Profile "${profile}" contains invalid JSON`);
      } else {
        issues.push(`Failed to read profile "${profile}": ${error.message}`);
      }
    }

    // 4. Check MCPs in profile
    checksPerformed++;
    let mcpsChecked = 0;
    let mcpIssues = 0;

    try {
      const mcps = await this.profileManager!.getProfileMCPs(profile);
      if (!mcps || Object.keys(mcps).length === 0) {
        warnings.push(`No MCPs configured in profile "${profile}"`);
      } else {
        for (const [name, config] of Object.entries(mcps)) {
          // If specific MCP requested, only check that one
          if (mcpName && name !== mcpName) continue;

          mcpsChecked++;

          // Basic validation
          if (!config.command && !config.url) {
            issues.push(`MCP "${name}" missing both command and URL`);
            mcpIssues++;
            continue;
          }

          // Validate stdio config
          if (config.command) {
            const validationError = this.validateMCPCommand(config.command, config.args || []);
            if (validationError) {
              issues.push(`MCP "${name}" has invalid command: ${validationError}`);
              mcpIssues++;
            }
          }

          // Validate HTTP config
          if (config.url) {
            try {
              new URL(config.url); // Validate URL format
            } catch (error) {
              issues.push(`MCP "${name}" has invalid URL: ${config.url}`);
              mcpIssues++;
            }
          }
        }
      }
    } catch (error: any) {
      issues.push(`Failed to check MCPs: ${error.message}`);
    }

    // Build diagnostic report
    const totalIssues = issues.length;
    const status = totalIssues === 0 ? '✅ Healthy' : `⚠️  ${totalIssues} issue(s) found`;

    let report = `🩺 **NCP Doctor - Diagnostics Report**\n\n`;
    report += `**Status:** ${status}\n`;
    report += `**Profile:** ${profile}\n`;
    report += `**Checks Performed:** ${checksPerformed}\n`;
    if (mcpsChecked > 0) {
      report += `**MCPs Checked:** ${mcpsChecked}${mcpIssues > 0 ? ` (${mcpIssues} with issues)` : ''}\n`;
    }
    report += `\n`;

    // System info
    report += `**System Information:**\n`;
    report += `  • Node.js: ${nodeVersion}\n`;
    report += `  • Platform: ${process.platform}\n`;
    report += `  • Architecture: ${process.arch}\n`;
    report += `\n`;

    // Issues
    if (totalIssues > 0) {
      report += `**Issues Found:**\n`;
      issues.forEach((issue, i) => {
        report += `  ${i + 1}. ❌ ${issue}\n`;
      });
      report += `\n`;
    }

    // Warnings
    if (warnings.length > 0) {
      report += `**Warnings:**\n`;
      warnings.forEach((warning, i) => {
        report += `  ${i + 1}. ⚠️  ${warning}\n`;
      });
      report += `\n`;
    }

    if (totalIssues === 0 && warnings.length === 0) {
      report += `✅ All checks passed! NCP is healthy.\n`;
    } else if (totalIssues > 0) {
      report += `💡 **Note:** This is a read-only diagnostic. To fix issues, use the CLI:\n`;
      report += `   • Run: \`ncp doctor --fix\` (requires user confirmation)\n`;
    }

    return {
      success: totalIssues === 0,
      content: report
    };
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
    const baseCommand = path.basename(command);

    // Check if base command is in allowlist
    if (!SAFE_COMMANDS.includes(baseCommand)) {
      // Not in allowlist - log warning but allow (user may have custom MCPs)
      logger.warn(`MCP command "${baseCommand}" not in known safe commands list. Proceeding with caution.`);
    }

    // Check for shell metacharacters and control characters that could be used for injection
    // Include newlines, carriage returns, and other control characters
    const DANGEROUS_CHARS = /[;&|`$()<>\n\r\t\0]/;
    if (DANGEROUS_CHARS.test(command)) {
      return `Command contains dangerous shell metacharacters or control characters: ${command}`;
    }

    // Special validation for shell commands that can execute arbitrary code
    const SHELL_COMMANDS = ['bash', 'sh', 'zsh'];
    if (SHELL_COMMANDS.includes(baseCommand)) {
      // Check if args contain -c flag which allows arbitrary command execution
      for (const arg of args) {
        if (arg === '-c' || arg.startsWith('-c=')) {
          return `Shell command with -c flag is not allowed for security reasons: ${command}`;
        }
      }
    }

    // Validate args don't contain injection attempts
    for (const arg of args) {
      if (typeof arg !== 'string') {
        return `All arguments must be strings, got: ${typeof arg}`;
      }

      // Check for dangerous patterns in args (same as command for consistency)
      // Allow common arg patterns like --flag, -f, @package, ./path
      if (DANGEROUS_CHARS.test(arg)) {
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
