/**
 * Unified Registry Client
 *
 * Uses custom registry (api.mcps.portel.dev) as primary source
 * Falls back to official Anthropic registry on failure
 */

import { logger } from '../utils/logger.js';
import { CustomRegistryClient } from './custom-registry-client.js';
import { RegistryClient, RegistryMCPCandidate, RegistrySearchOptions } from './registry-client.js';

export class UnifiedRegistryClient {
  private customClient = new CustomRegistryClient();
  private officialClient = new RegistryClient();

  /**
   * Search for MCPs with selection format
   * Tries custom registry first, falls back to official
   */
  async searchForSelection(query: string, options: RegistrySearchOptions = {}): Promise<RegistryMCPCandidate[]> {
    try {
      logger.debug('Searching custom registry...');
      const customResults = await this.customClient.searchForSelection(query, options.limit || 20);

      if (customResults.length > 0) {
        logger.debug(`Found ${customResults.length} results from custom registry`);

        // Convert custom registry format to RegistryMCPCandidate format
        return customResults.map((result, index) => ({
          number: index + 1,
          name: result.name,
          displayName: result.displayName,
          description: result.description,
          version: result.version,
          transport: this.guessTransport(result.installCommand),
          command: this.extractCommand(result.installCommand),
          args: this.extractArgs(result.installCommand),
          downloadCount: result.downloads,
          status: result.verified ? 'verified' : 'active',
          repository: {
            url: '', // Not available in custom registry format
            source: ''
          },
          isTrusted: result.verified,
          qualityScore: result.score
        }));
      }

      logger.debug('No results from custom registry, falling back to official...');
    } catch (error: any) {
      logger.warn(`Custom registry search failed: ${error.message}, falling back to official`);
    }

    // Fallback to official registry
    try {
      logger.debug('Searching official registry...');
      const officialResults = await this.officialClient.searchForSelection(query, options);
      logger.debug(`Found ${officialResults.length} results from official registry`);
      return officialResults;
    } catch (error: any) {
      logger.error(`Both registries failed: ${error.message}`);
      throw new Error(`Failed to search registries: ${error.message}`);
    }
  }

  /**
   * Get detailed info for a server
   * Tries custom first, then official
   */
  async getDetailedInfo(serverName: string): Promise<{
    transport: 'stdio' | 'http' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
    remoteType?: string;
    envVars?: Array<{
      name: string;
      description?: string;
      isRequired?: boolean;
      isSecret?: boolean;
      default?: string;
    }>;
  }> {
    try {
      logger.debug(`Getting details from custom registry for: ${serverName}`);

      // Try getting from custom registry by ID (extract last part if it's a namespaced name)
      const mcpId = serverName.includes('/') ? serverName.split('/').pop() || serverName : serverName;
      const customMCP = await this.customClient.getMCP(mcpId);

      // Convert to expected format
      return {
        transport: this.guessTransport(customMCP.installCommand),
        command: this.extractCommand(customMCP.installCommand),
        args: this.extractArgs(customMCP.installCommand),
        envVars: [] // Custom registry doesn't have env vars yet
      };
    } catch (error: any) {
      logger.warn(`Custom registry getDetailedInfo failed: ${error.message}, trying official`);

      // Fallback to official (only if it looks like an official name format)
      if (serverName.startsWith('io.github.') || serverName.includes('modelcontextprotocol')) {
        try {
          return await this.officialClient.getDetailedInfo(serverName);
        } catch (officialError: any) {
          logger.error(`Official registry also failed: ${officialError.message}`);
          throw new Error(`Failed to get server details from both registries`);
        }
      }

      // If it doesn't look like an official name, don't bother with fallback
      throw new Error(`Server not found in custom registry: ${serverName}`);
    }
  }

  /**
   * Helper: Guess transport type from install command
   */
  private guessTransport(installCommand: string): 'stdio' | 'http' | 'sse' {
    if (installCommand.includes('HTTP endpoint') || installCommand.includes('http://') || installCommand.includes('https://')) {
      return 'sse'; // Assume SSE for HTTP endpoints
    }
    return 'stdio';
  }

  /**
   * Helper: Extract command from install instruction
   * Examples:
   *   "npx mcp-merchant" -> "npx"
   *   "Use HTTP endpoint: https://..." -> undefined
   */
  private extractCommand(installCommand: string): string | undefined {
    if (this.guessTransport(installCommand) !== 'stdio') {
      return undefined;
    }

    const parts = installCommand.trim().split(/\s+/);
    return parts[0] || 'npx';
  }

  /**
   * Helper: Extract args from install instruction
   * Examples:
   *   "npx mcp-merchant" -> ["mcp-merchant"]
   *   "npx @smithery/mcp-server" -> ["@smithery/mcp-server"]
   */
  private extractArgs(installCommand: string): string[] | undefined {
    if (this.guessTransport(installCommand) !== 'stdio') {
      return undefined;
    }

    const parts = installCommand.trim().split(/\s+/);
    return parts.slice(1);
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this.customClient.clearCache();
    this.officialClient.clearCache();
  }
}
