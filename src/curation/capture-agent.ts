#!/usr/bin/env node
/**
 * Capture Agent - Phase 1
 *
 * Takes an awesome-mcp page URL and populates all needed fields in a CSV
 *
 * Usage:
 *   node dist/curation/capture-agent.js <awesome-page-url> [output.csv]
 *
 * Example:
 *   node dist/curation/capture-agent.js https://github.com/punkpeye/awesome-mcp-servers mcps.csv
 */

import Anthropic from '@anthropic-ai/sdk';
import { createWriteStream } from 'fs';
import { logger } from '../utils/logger.js';

interface MCPEntry {
  name: string;
  displayName: string;
  description: string;
  repository: string;
  category: string;
  tags: string;
  installCommand: string;
  transport: string;
  npmPackage: string;
  verified: string;
  sourceUrl: string;
}

class CaptureAgent {
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Main capture workflow
   */
  async capture(awesomePageUrl: string, outputCsv: string): Promise<void> {
    logger.info(`Starting capture from: ${awesomePageUrl}`);

    // Step 1: Fetch the awesome page
    logger.info('Fetching awesome page...');
    const content = await this.fetchAwesomePage(awesomePageUrl);

    // Step 2: Parse with AI
    logger.info('Parsing with Claude Haiku...');
    const entries = await this.parseWithAI(content, awesomePageUrl);

    // Step 3: Write to CSV
    logger.info(`Writing ${entries.length} entries to ${outputCsv}...`);
    await this.writeCSV(entries, outputCsv);

    logger.info(`✅ Capture complete! ${entries.length} MCPs saved to ${outputCsv}`);
  }

  /**
   * Fetch awesome page content
   */
  private async fetchAwesomePage(url: string): Promise<string> {
    // Convert to raw GitHub URL
    const rawUrl = url
      .replace('github.com', 'raw.githubusercontent.com')
      .replace('/blob/', '/') + (url.includes('README') ? '' : '/main/README.md');

    const response = await fetch(rawUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch: HTTP ${response.status}`);
    }

    return await response.text();
  }

  /**
   * Parse awesome page content using Claude Haiku
   */
  private async parseWithAI(content: string, sourceUrl: string): Promise<MCPEntry[]> {
    const prompt = `You are an MCP registry data extraction expert. Parse this awesome-mcp-servers README and extract ALL MCP servers listed.

**Awesome Page Content:**
${content}

**Task:**
Extract every MCP server entry and return a JSON array with this exact structure:

[
  {
    "name": "io.github.owner/repo-name",
    "displayName": "Human Friendly Name",
    "description": "Clear 1-2 sentence description",
    "repository": "https://github.com/owner/repo",
    "category": "Developer Tools|Data & APIs|Knowledge & Memory|Productivity|Entertainment|Other",
    "tags": "tag1,tag2,tag3",
    "installCommand": "npx package-name",
    "transport": "stdio|sse|http",
    "npmPackage": "@scope/package or package-name",
    "verified": "false"
  }
]

**Field Guidelines:**
- name: Use "io.github.owner/repo-name" format (extract owner/repo from GitHub URL)
- displayName: Clean, title-cased version (remove "mcp-" prefix)
- description: Rewrite to be clear and concise
- repository: Full GitHub URL
- category: Choose most appropriate from the list
- tags: 3-5 relevant tags, comma-separated
- installCommand: Extract from docs or infer "npx [package]"
- transport: "stdio" for CLI tools, "sse" for HTTP endpoints
- npmPackage: Infer from repo name or look for package.json mentions
- verified: Always "false" initially

**Important:**
- Extract EVERY MCP entry, even if info is incomplete
- Skip table of contents, headers, and non-MCP content
- If a field is unknown, use best guess or "unknown"
- Return ONLY the JSON array, no markdown code blocks

Return the complete JSON array now:`;

    const response = await this.client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 8000,
      temperature: 0,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const textContent = response.content[0];
    if (textContent.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Parse JSON response
    let jsonText = textContent.text.trim();

    // Remove markdown code blocks if present
    jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');

    const parsed = JSON.parse(jsonText);

    // Add sourceUrl to each entry
    return parsed.map((entry: any) => ({
      ...entry,
      sourceUrl
    }));
  }

  /**
   * Write entries to CSV
   */
  private async writeCSV(entries: MCPEntry[], outputPath: string): Promise<void> {
    const stream = createWriteStream(outputPath);

    // Write header
    const headers = [
      'name',
      'displayName',
      'description',
      'repository',
      'category',
      'tags',
      'installCommand',
      'transport',
      'npmPackage',
      'verified',
      'sourceUrl'
    ];
    stream.write(headers.join(',') + '\n');

    // Write entries
    for (const entry of entries) {
      const row = headers.map(header => {
        const value = entry[header as keyof MCPEntry] || '';
        // Escape commas and quotes
        const escaped = String(value).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      stream.write(row.join(',') + '\n');
    }

    stream.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error(`
Usage: node dist/curation/capture-agent.js <awesome-page-url> [output.csv]

Examples:
  node dist/curation/capture-agent.js https://github.com/punkpeye/awesome-mcp-servers
  node dist/curation/capture-agent.js https://github.com/wong2/awesome-mcp-servers mcps.csv
    `);
    process.exit(1);
  }

  const [awesomePageUrl, outputCsv = 'captured-mcps.csv'] = args;

  const agent = new CaptureAgent();

  try {
    await agent.capture(awesomePageUrl, outputCsv);
  } catch (error: any) {
    logger.error(`Capture failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { CaptureAgent };
