/**
 * CLI Scanner - Runtime Discovery
 * Automatically discovers CLI tools installed on the system
 * Zero maintenance - parses actual help output at runtime
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';
import { CLIParser, CLIToolInfo } from './cli-parser.js';

const execAsync = promisify(exec);

export interface ScannedTool {
  name: string;
  path: string;
  description?: string;
  category: string;
  capabilities: string[];
}

/**
 * CLI Scanner - discovers tools at runtime
 */
export class CLIScanner {
  private parser: CLIParser;
  private scanCache: Map<string, ScannedTool> = new Map();
  private lastScanTime: number = 0;
  private readonly CACHE_TTL = 3600000; // 1 hour

  // Tool name patterns to filter out shell built-ins and noise
  private readonly EXCLUDED_PATTERNS = [
    /^cd$/, /^echo$/, /^test$/, /^true$/, /^false$/,
    /^alias$/, /^bg$/, /^fg$/, /^jobs$/, /^kill$/,
    /^\[/, /^\]/, /^:$/, /^\.$/, /^source$/,
    /^compgen$/, /^complete$/, /^shopt$/,
    // Exclude very short names (likely built-ins)
    /^.{1}$/
  ];

  // Keywords that suggest a tool might be useful
  private readonly USEFUL_KEYWORDS = [
    'convert', 'process', 'encode', 'decode', 'transform',
    'search', 'find', 'grep', 'parse', 'format',
    'compress', 'extract', 'archive', 'download', 'upload',
    'analyze', 'validate', 'check', 'test', 'build',
    'image', 'video', 'audio', 'document', 'file',
    'json', 'xml', 'csv', 'pdf', 'markdown',
    'http', 'api', 'server', 'client', 'request'
  ];

  constructor() {
    this.parser = new CLIParser();
  }

  /**
   * Scan system for available CLI tools
   */
  async scanSystem(forceRefresh: boolean = false): Promise<ScannedTool[]> {
    // Return cached results if fresh
    if (!forceRefresh && this.isCacheFresh()) {
      logger.debug('Returning cached CLI scan results');
      return Array.from(this.scanCache.values());
    }

    logger.info('🔍 Scanning system for CLI tools...');
    const startTime = Date.now();

    try {
      // Get all available commands
      const commands = await this.getAvailableCommands();
      logger.debug(`Found ${commands.length} total commands`);

      // Filter to potentially useful tools
      const candidates = this.filterCandidates(commands);
      logger.debug(`Filtered to ${candidates.length} candidates`);

      // Analyze each candidate
      const scanned: ScannedTool[] = [];
      let analyzed = 0;

      for (const command of candidates.slice(0, 100)) { // Limit to 100 for performance
        const tool = await this.analyzeCommand(command);
        if (tool) {
          scanned.push(tool);
          this.scanCache.set(tool.name, tool);
        }

        analyzed++;
        if (analyzed % 10 === 0) {
          logger.debug(`Analyzed ${analyzed}/${candidates.length} tools...`);
        }
      }

      this.lastScanTime = Date.now();
      const duration = Date.now() - startTime;

      logger.info(`✅ Scanned ${scanned.length} CLI tools in ${duration}ms`);
      return scanned;

    } catch (error: any) {
      logger.error('CLI scan failed:', error);
      return Array.from(this.scanCache.values()); // Return cached on error
    }
  }

  /**
   * Get all available commands using compgen
   */
  private async getAvailableCommands(): Promise<string[]> {
    try {
      // Use compgen -c to list all commands
      const { stdout } = await execAsync('compgen -c', {
        shell: '/bin/bash',
        timeout: 5000
      });

      const commands = stdout
        .split('\n')
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0);

      // Remove duplicates
      return Array.from(new Set(commands));

    } catch (error: any) {
      // Fallback: scan PATH directories
      logger.warn('compgen failed, falling back to PATH scan');
      return await this.scanPathDirectories();
    }
  }

  /**
   * Fallback: scan PATH directories
   */
  private async scanPathDirectories(): Promise<string[]> {
    try {
      const { stdout } = await execAsync(
        'echo $PATH | tr ":" "\\n" | xargs -I {} find {} -maxdepth 1 -type f -executable 2>/dev/null | xargs -n1 basename | sort -u',
        { timeout: 10000 }
      );

      return stdout
        .split('\n')
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0);

    } catch (error) {
      logger.error('PATH scan failed:', error);
      return [];
    }
  }

  /**
   * Filter candidates to likely useful tools
   */
  private filterCandidates(commands: string[]): string[] {
    return commands.filter(cmd => {
      // Exclude based on patterns
      if (this.EXCLUDED_PATTERNS.some(pattern => pattern.test(cmd))) {
        return false;
      }

      // Include if name suggests usefulness
      const nameLower = cmd.toLowerCase();
      if (this.USEFUL_KEYWORDS.some(keyword => nameLower.includes(keyword))) {
        return true;
      }

      // Include common tool patterns
      if (/^[a-z]+[0-9]*$/.test(cmd)) { // Simple alphanumeric names
        return true;
      }

      return false;
    });
  }

  /**
   * Analyze a command to extract metadata
   */
  private async analyzeCommand(command: string): Promise<ScannedTool | null> {
    try {
      // Check if tool exists and is accessible
      const isAvailable = await this.parser.isCliAvailable(command);
      if (!isAvailable) {
        return null;
      }

      // Get tool path
      const path = await this.getCommandPath(command);
      if (!path) {
        return null;
      }

      // Try to get help output (with timeout)
      const helpOutput = await this.getHelpOutput(command);
      if (!helpOutput) {
        return null;
      }

      // Extract description and capabilities
      const description = this.extractDescription(helpOutput);
      const capabilities = this.extractCapabilities(command, helpOutput);

      // Categorize
      const category = this.categorize(command, description, capabilities);

      return {
        name: command,
        path,
        description,
        category,
        capabilities
      };

    } catch (error) {
      logger.debug(`Failed to analyze ${command}: ${error}`);
      return null;
    }
  }

  /**
   * Get command path
   */
  private async getCommandPath(command: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`which ${command}`, { timeout: 1000 });
      return stdout.trim();
    } catch {
      return null;
    }
  }

  /**
   * Get help output with multiple attempts
   */
  private async getHelpOutput(command: string): Promise<string | null> {
    const helpFlags = ['--help', '-h', '-help', 'help'];

    for (const flag of helpFlags) {
      try {
        const { stdout, stderr } = await execAsync(`${command} ${flag} 2>&1`, {
          timeout: 2000,
          maxBuffer: 1024 * 100 // 100KB
        });

        const output = stdout || stderr;
        if (output && output.length > 50) {
          return output;
        }
      } catch (error: any) {
        // Some tools exit with non-zero but still print help
        if (error.stdout || error.stderr) {
          const output = error.stdout || error.stderr;
          if (output.length > 50) {
            return output;
          }
        }
      }
    }

    return null;
  }

  /**
   * Extract description from help output
   */
  private extractDescription(helpOutput: string): string {
    const lines = helpOutput.split('\n').filter(l => l.trim());

    // Try to find description line
    for (const line of lines.slice(0, 10)) {
      const trimmed = line.trim();

      // Skip empty, usage, or option lines
      if (!trimmed || trimmed.startsWith('Usage:') || trimmed.startsWith('-')) {
        continue;
      }

      // This is likely the description
      if (trimmed.length > 20 && trimmed.length < 200) {
        return trimmed.replace(/^[:\-\s]+/, '').trim();
      }
    }

    return 'Command-line tool';
  }

  /**
   * Extract capabilities from help output
   */
  private extractCapabilities(command: string, helpOutput: string): string[] {
    const capabilities: Set<string> = new Set();
    const lowerOutput = helpOutput.toLowerCase();

    // Add command name
    capabilities.add(command);

    // Extract verbs (convert, process, etc.)
    const verbs = [
      'convert', 'process', 'transform', 'encode', 'decode',
      'compress', 'extract', 'archive', 'search', 'find',
      'download', 'upload', 'sync', 'copy', 'move',
      'analyze', 'validate', 'test', 'check', 'build',
      'create', 'generate', 'make', 'compile', 'run'
    ];

    for (const verb of verbs) {
      if (lowerOutput.includes(verb)) {
        capabilities.add(verb);
      }
    }

    // Extract file types
    const fileTypes = [
      'json', 'xml', 'csv', 'yaml', 'toml',
      'pdf', 'html', 'markdown', 'text',
      'image', 'video', 'audio', 'media',
      'mp4', 'mp3', 'png', 'jpg', 'gif'
    ];

    for (const type of fileTypes) {
      if (lowerOutput.includes(type)) {
        capabilities.add(type);
      }
    }

    return Array.from(capabilities);
  }

  /**
   * Categorize tool based on name and capabilities
   */
  private categorize(name: string, description: string, capabilities: string[]): string {
    const combined = `${name} ${description} ${capabilities.join(' ')}`.toLowerCase();

    if (/video|audio|media|ffmpeg|mp4|mp3/.test(combined)) return 'media';
    if (/image|photo|png|jpg|gif|convert/.test(combined)) return 'media';
    if (/json|xml|csv|yaml|parse|jq/.test(combined)) return 'data';
    if (/pdf|document|markdown|pandoc/.test(combined)) return 'documents';
    if (/git|svn|version|commit/.test(combined)) return 'development';
    if (/http|api|curl|wget|download/.test(combined)) return 'network';
    if (/search|find|grep|rg/.test(combined)) return 'search';
    if (/compress|archive|zip|tar|gzip/.test(combined)) return 'archive';
    if (/encrypt|decrypt|hash|crypto/.test(combined)) return 'security';

    return 'utilities';
  }

  /**
   * Check if scan cache is fresh
   */
  private isCacheFresh(): boolean {
    if (this.scanCache.size === 0) return false;
    return (Date.now() - this.lastScanTime) < this.CACHE_TTL;
  }

  /**
   * Search scanned tools by query
   */
  async searchTools(query: string): Promise<ScannedTool[]> {
    const allTools = await this.scanSystem();
    const queryLower = query.toLowerCase();

    const matches = allTools.filter(tool => {
      // Check name
      if (tool.name.toLowerCase().includes(queryLower)) return true;

      // Check description
      if (tool.description?.toLowerCase().includes(queryLower)) return true;

      // Check capabilities
      if (tool.capabilities.some(cap => cap.toLowerCase().includes(queryLower))) return true;

      return false;
    });

    // Sort by relevance (name match > capability match > description match)
    return matches.sort((a, b) => {
      const aScore = a.name.toLowerCase().includes(queryLower) ? 10 :
                    a.capabilities.some(c => c.toLowerCase() === queryLower) ? 5 : 1;
      const bScore = b.name.toLowerCase().includes(queryLower) ? 10 :
                    b.capabilities.some(c => c.toLowerCase() === queryLower) ? 5 : 1;
      return bScore - aScore;
    });
  }

  /**
   * Get tools by category
   */
  async getToolsByCategory(category: string): Promise<ScannedTool[]> {
    const allTools = await this.scanSystem();
    return allTools.filter(tool => tool.category === category);
  }

  /**
   * Get all categories
   */
  async getCategories(): Promise<string[]> {
    const allTools = await this.scanSystem();
    const categories = new Set(allTools.map(t => t.category));
    return Array.from(categories).sort();
  }
}
