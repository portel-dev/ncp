/**
 * Awesome MCP Lists Scraper
 * Scrapes MCPs from GitHub awesome-mcp repositories
 */

import { logger } from '../../utils/logger.js';

export interface RawMCPData {
  name: string;
  description?: string;
  repository?: string;
  installCommand?: string;
  category?: string;
  source: string;
  rawData?: any;
}

export class AwesomeMCPScraper {
  private awesomeLists = [
    'https://github.com/punkpeye/awesome-mcp-servers',
    'https://github.com/wong2/awesome-mcp-servers',
    'https://github.com/appcypher/awesome-mcp-servers',
  ];

  /**
   * Scrape all awesome lists
   */
  async scrapeAll(): Promise<RawMCPData[]> {
    const allMCPs: RawMCPData[] = [];

    for (const listUrl of this.awesomeLists) {
      logger.info(`Scraping ${listUrl}...`);
      try {
        const mcps = await this.scrapeAwesomeList(listUrl);
        allMCPs.push(...mcps);
        logger.info(`Found ${mcps.length} MCPs from ${listUrl}`);
      } catch (error: any) {
        logger.error(`Failed to scrape ${listUrl}: ${error.message}`);
      }
    }

    // Deduplicate by repository URL
    return this.deduplicate(allMCPs);
  }

  /**
   * Scrape a single awesome list
   */
  private async scrapeAwesomeList(url: string): Promise<RawMCPData[]> {
    const mcps: RawMCPData[] = [];

    // Get raw README content from GitHub
    const rawUrl = url.replace('github.com', 'raw.githubusercontent.com') + '/main/README.md';

    const response = await fetch(rawUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const content = await response.text();

    // Parse markdown to extract MCP entries
    // Format: - [Name](repo-url) - Description
    const lines = content.split('\n');
    let currentCategory = 'General';

    for (const line of lines) {
      // Detect category headers
      if (line.startsWith('##') && !line.includes('Contents')) {
        currentCategory = line.replace(/^#+\s*/, '').trim();
        continue;
      }

      // Parse MCP entries
      const match = line.match(/^[-*]\s+\[([^\]]+)\]\(([^)]+)\)\s*[-–—]\s*(.+)/);
      if (match) {
        const [, name, repoUrl, description] = match;

        mcps.push({
          name: name.trim(),
          description: description.trim(),
          repository: repoUrl.trim(),
          category: currentCategory,
          source: url,
          rawData: { line }
        });
      }
    }

    return mcps;
  }

  /**
   * Deduplicate MCPs by repository URL
   */
  private deduplicate(mcps: RawMCPData[]): RawMCPData[] {
    const seen = new Map<string, RawMCPData>();

    for (const mcp of mcps) {
      if (!mcp.repository) continue;

      const key = this.normalizeRepoUrl(mcp.repository);
      if (!seen.has(key)) {
        seen.set(key, mcp);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Normalize repository URL for comparison
   */
  private normalizeRepoUrl(url: string): string {
    return url
      .toLowerCase()
      .replace(/\/$/, '')
      .replace(/\.git$/, '')
      .replace(/^https?:\/\//, '');
  }
}
