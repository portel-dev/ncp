/**
 * Intelligence Photon - Simple Claude CLI Wrapper
 *
 * Takes a prompt and list of MCPs, runs Claude CLI, returns response.
 * Uses your Claude Desktop subscription (no API key needed).
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

export default class IntelligenceMCP {
  name = 'intelligence';
  description = 'Run Claude CLI with specific MCPs - simple wrapper using your Claude Desktop subscription';

  private claudePath: string;
  private claudeConfigPath: string;

  constructor() {
    this.claudePath = '/opt/homebrew/bin/claude';
    this.claudeConfigPath = join(homedir(), '.config', 'claude-desktop', 'claude_desktop_config.json');
  }

  /**
   * Execute a prompt with Claude CLI using specified MCPs
   */
  async execute(params: {
    prompt: string;
    mcps?: string[];
  }): Promise<{ success: boolean; content?: string; error?: string }> {
    const { prompt, mcps } = params;

    if (!prompt || prompt.trim().length === 0) {
      return {
        success: false,
        error: 'Prompt is required'
      };
    }

    // Check Claude CLI exists
    try {
      await execAsync(`${this.claudePath} --version`);
    } catch (error) {
      return {
        success: false,
        error: `Claude CLI not found at ${this.claudePath}. Please install Claude Code.`
      };
    }

    // Read Claude Desktop config
    let claudeConfig: any;
    try {
      const configData = await fs.readFile(this.claudeConfigPath, 'utf-8');
      claudeConfig = JSON.parse(configData);
    } catch (error) {
      return {
        success: false,
        error: `Failed to read Claude Desktop config at ${this.claudeConfigPath}`
      };
    }

    if (!claudeConfig.mcpServers || Object.keys(claudeConfig.mcpServers).length === 0) {
      return {
        success: false,
        error: 'No MCPs configured in Claude Desktop'
      };
    }

    // Filter MCPs if requested
    let filteredConfig = claudeConfig;
    if (mcps && mcps.length > 0) {
      const filtered: any = { mcpServers: {} };
      for (const mcpName of mcps) {
        if (claudeConfig.mcpServers[mcpName]) {
          filtered.mcpServers[mcpName] = claudeConfig.mcpServers[mcpName];
        } else {
          logger.warn(`[Intelligence] MCP "${mcpName}" not found in Claude Desktop config, skipping`);
        }
      }

      if (Object.keys(filtered.mcpServers).length === 0) {
        return {
          success: false,
          error: `None of the requested MCPs (${mcps.join(', ')}) are configured in Claude Desktop`
        };
      }

      filteredConfig = filtered;
    }

    // Write temp config
    const tempConfigPath = join(tmpdir(), `intelligence-mcp-${Date.now()}.json`);
    await fs.writeFile(tempConfigPath, JSON.stringify(filteredConfig, null, 2));

    const mcpCount = Object.keys(filteredConfig.mcpServers).length;
    logger.info(`[Intelligence] Executing Claude CLI with ${mcpCount} MCPs: ${Object.keys(filteredConfig.mcpServers).join(', ')}`);

    try {
      // Execute Claude CLI
      // IMPORTANT: prompt must come BEFORE --mcp-config!
      const { stdout, stderr } = await execAsync(
        `"${this.claudePath}" --print --output-format text "${prompt.replace(/"/g, '\\"')}" --mcp-config "${tempConfigPath}"`,
        {
          maxBuffer: 10 * 1024 * 1024, // 10MB
          timeout: 5 * 60 * 1000 // 5 minutes
        }
      );

      // Clean up temp file
      await fs.unlink(tempConfigPath).catch(() => {});

      if (stderr && stderr.trim()) {
        logger.debug(`[Intelligence] Claude CLI stderr: ${stderr}`);
      }

      logger.info(`[Intelligence] Execution complete`);

      return {
        success: true,
        content: stdout.trim() || 'Execution completed'
      };

    } catch (error: any) {
      // Clean up temp file
      await fs.unlink(tempConfigPath).catch(() => {});

      logger.error(`[Intelligence] Claude CLI failed: ${error.message}`);
      return {
        success: false,
        error: `Claude CLI execution failed: ${error.message}`
      };
    }
  }
}
