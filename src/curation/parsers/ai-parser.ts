/**
 * AI-Powered Metadata Parser
 * Uses Claude Haiku to parse unstructured data and extract metadata
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../utils/logger.js';
import { RawMCPData } from '../scrapers/awesome-mcp-scraper.js';

export interface ParsedMetadata {
  displayName: string;
  description: string;
  category: string;
  tags: string[];
  installCommand?: string;
  transport?: 'stdio' | 'sse' | 'http';
  verified: boolean;
}

export class AIMetadataParser {
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Parse metadata from raw MCP data using AI
   */
  async parseMetadata(rawMCP: RawMCPData, repoContent?: string): Promise<ParsedMetadata> {
    const prompt = this.buildPrompt(rawMCP, repoContent);

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-haiku-20241022', // Fast and cheap
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      // Parse JSON response
      const parsed = JSON.parse(content.text);
      return parsed;

    } catch (error: any) {
      logger.error(`AI parsing failed for ${rawMCP.name}: ${error.message}`);

      // Fallback to simple heuristics
      return this.fallbackParse(rawMCP);
    }
  }

  /**
   * Build prompt for AI parsing
   */
  private buildPrompt(rawMCP: RawMCPData, repoContent?: string): string {
    return `You are an MCP metadata extraction expert. Extract structured metadata from the following MCP server information.

**Input Data:**
Name: ${rawMCP.name}
Description: ${rawMCP.description || 'Not provided'}
Repository: ${rawMCP.repository || 'Not provided'}
Category: ${rawMCP.category || 'Not provided'}

${repoContent ? `**Repository README (first 1000 chars):**
${repoContent.substring(0, 1000)}` : ''}

**Task:**
Extract and infer the following metadata. Return ONLY a JSON object, no explanation.

**Output JSON Format:**
{
  "displayName": "Human-friendly name",
  "description": "Clear, concise description (1-2 sentences)",
  "category": "One of: Developer Tools, Data & APIs, Knowledge & Memory, Productivity, Entertainment, Other",
  "tags": ["tag1", "tag2", "tag3"],
  "installCommand": "npx package-name or HTTP endpoint (if found in README)",
  "transport": "stdio or sse or http (guess based on install command)",
  "verified": false
}

**Instructions:**
- displayName: Clean up the name (remove prefixes like "mcp-", make it title case)
- description: Rewrite to be clear and concise, avoid marketing fluff
- category: Choose the most appropriate category
- tags: 3-5 relevant lowercase tags
- installCommand: Extract from README if available, otherwise infer "npx [package-name]"
- transport: "stdio" for CLI tools, "sse"/"http" for web endpoints
- verified: Always false (we'll verify separately)

Return only the JSON, no markdown code blocks.`;
  }

  /**
   * Fallback parser when AI fails (simple heuristics)
   */
  private fallbackParse(rawMCP: RawMCPData): ParsedMetadata {
    return {
      displayName: this.cleanName(rawMCP.name),
      description: rawMCP.description || 'No description available',
      category: rawMCP.category || 'Other',
      tags: this.extractTags(rawMCP),
      installCommand: this.guessInstallCommand(rawMCP),
      transport: 'stdio',
      verified: false
    };
  }

  /**
   * Clean MCP name for display
   */
  private cleanName(name: string): string {
    return name
      .replace(/^mcp-?/i, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Extract tags from name and description
   */
  private extractTags(rawMCP: RawMCPData): string[] {
    const text = `${rawMCP.name} ${rawMCP.description || ''}`.toLowerCase();
    const tags: string[] = [];

    const keywords = ['git', 'file', 'database', 'api', 'web', 'search', 'notion', 'slack'];
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        tags.push(keyword);
      }
    }

    return tags.slice(0, 5);
  }

  /**
   * Guess install command from repository
   */
  private guessInstallCommand(rawMCP: RawMCPData): string | undefined {
    if (!rawMCP.repository) return undefined;

    // Extract package name from GitHub URL
    const match = rawMCP.repository.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (match) {
      const [, owner, repo] = match;
      return `npx ${repo.replace(/\.git$/, '')}`;
    }

    return undefined;
  }

  /**
   * Batch parse multiple MCPs
   */
  async parseBatch(rawMCPs: RawMCPData[], concurrency = 3): Promise<Map<string, ParsedMetadata>> {
    const results = new Map<string, ParsedMetadata>();

    // Process in batches to avoid rate limits
    for (let i = 0; i < rawMCPs.length; i += concurrency) {
      const batch = rawMCPs.slice(i, i + concurrency);

      const promises = batch.map(async (rawMCP) => {
        const metadata = await this.parseMetadata(rawMCP);
        results.set(rawMCP.repository || rawMCP.name, metadata);
      });

      await Promise.all(promises);

      logger.info(`Parsed ${Math.min(i + concurrency, rawMCPs.length)}/${rawMCPs.length} MCPs`);
    }

    return results;
  }
}
