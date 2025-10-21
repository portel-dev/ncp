#!/usr/bin/env node
/**
 * Submission Agent - Phase 2
 *
 * Reads CSV and submits to both registries (official + custom)
 *
 * Usage:
 *   node dist/curation/submission-agent.js <input.csv> [--dry-run] [--custom-only] [--official-only]
 *
 * Examples:
 *   node dist/curation/submission-agent.js captured-mcps.csv --dry-run
 *   node dist/curation/submission-agent.js captured-mcps.csv --custom-only
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';

interface CSVRow {
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

interface ServerJson {
  $schema: string;
  name: string;
  description: string;
  version: string;
  repository: {
    url: string;
    source: string;
  };
  packages?: Array<{
    registryType: string;
    identifier: string;
  }>;
  _meta: {
    'dev.portel/curation': {
      version: string;
      submittedBy: string;
      submittedAt: string;
      source: string;
      apiEndpoint: string;
      category: string;
      tags: string[];
      verificationStatus: string;
    };
  };
}

class SubmissionAgent {
  private dryRun: boolean;
  private customOnly: boolean;
  private officialOnly: boolean;

  constructor(options: {
    dryRun?: boolean;
    customOnly?: boolean;
    officialOnly?: boolean;
  } = {}) {
    this.dryRun = options.dryRun || false;
    this.customOnly = options.customOnly || false;
    this.officialOnly = options.officialOnly || false;
  }

  /**
   * Main submission workflow
   */
  async submit(csvPath: string): Promise<void> {
    logger.info(`Starting submission from: ${csvPath}`);

    if (this.dryRun) {
      logger.warn('DRY RUN MODE - No actual submissions will be made');
    }

    // Step 1: Read CSV
    logger.info('Reading CSV...');
    const entries = this.readCSV(csvPath);
    logger.info(`Found ${entries.length} entries`);

    // Step 2: Generate server.json files
    logger.info('Generating server.json files...');
    const outputDir = './output/server-jsons';
    mkdirSync(outputDir, { recursive: true });

    const serverJsons = entries.map(entry => this.generateServerJson(entry));

    // Step 3: Save server.json files
    for (let i = 0; i < serverJsons.length; i++) {
      const serverJson = serverJsons[i];
      const entry = entries[i];

      // Create safe filename from MCP name
      const filename = entry.name.replace(/[^a-z0-9.-]/gi, '_') + '.json';
      const filepath = join(outputDir, filename);

      writeFileSync(filepath, JSON.stringify(serverJson, null, 2));
      logger.debug(`Saved ${filename}`);
    }

    logger.info(`✅ Generated ${serverJsons.length} server.json files in ${outputDir}`);

    // Step 4: Submit to custom registry
    if (!this.officialOnly) {
      logger.info('Submitting to custom registry (api.mcps.portel.dev)...');
      await this.submitToCustomRegistry(serverJsons);
    }

    // Step 5: Submit to official registry
    if (!this.customOnly) {
      logger.info('Submitting to official registry (registry.modelcontextprotocol.io)...');
      this.showOfficialSubmissionInstructions(outputDir);
    }

    logger.info('✅ Submission complete!');
  }

  /**
   * Read CSV file
   */
  private readCSV(csvPath: string): CSVRow[] {
    const content = readFileSync(csvPath, 'utf-8');
    const lines = content.trim().split('\n');

    if (lines.length < 2) {
      throw new Error('CSV file is empty or has no data rows');
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const entries: CSVRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const entry: any = {};

      headers.forEach((header, index) => {
        entry[header] = values[index] || '';
      });

      entries.push(entry as CSVRow);
    }

    return entries;
  }

  /**
   * Parse CSV line (handles quoted fields with commas)
   */
  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values;
  }

  /**
   * Generate server.json with Portel branding
   */
  private generateServerJson(entry: CSVRow): ServerJson {
    const serverJson: ServerJson = {
      $schema: 'https://static.modelcontextprotocol.io/schemas/2025-09-16/server.schema.json',
      name: entry.name,
      description: entry.description,
      version: '1.0.0',
      repository: {
        url: entry.repository,
        source: 'github'
      },
      _meta: {
        'dev.portel/curation': {
          version: '1.0',
          submittedBy: 'Portel Registry Team',
          submittedAt: new Date().toISOString(),
          source: 'https://mcps.portel.dev',
          apiEndpoint: 'https://api.mcps.portel.dev',
          category: entry.category,
          tags: entry.tags.split(',').map(t => t.trim()).filter(Boolean),
          verificationStatus: entry.verified === 'true' ? 'verified' : 'unverified'
        }
      }
    };

    // Add npm package if available
    if (entry.npmPackage && entry.npmPackage !== 'unknown') {
      serverJson.packages = [{
        registryType: 'npm',
        identifier: entry.npmPackage
      }];
    }

    return serverJson;
  }

  /**
   * Submit to custom registry via API
   */
  private async submitToCustomRegistry(serverJsons: ServerJson[]): Promise<void> {
    if (this.dryRun) {
      logger.info(`[DRY RUN] Would submit ${serverJsons.length} MCPs to custom registry`);
      return;
    }

    const apiUrl = 'https://api.mcps.portel.dev/admin/import';
    let successCount = 0;
    let failCount = 0;

    for (const serverJson of serverJsons) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.PORTEL_ADMIN_KEY || ''}`
          },
          body: JSON.stringify(serverJson)
        });

        if (response.ok) {
          successCount++;
          logger.debug(`✅ ${serverJson.name}`);
        } else {
          failCount++;
          logger.warn(`❌ ${serverJson.name}: HTTP ${response.status}`);
        }
      } catch (error: any) {
        failCount++;
        logger.error(`❌ ${serverJson.name}: ${error.message}`);
      }
    }

    logger.info(`Custom registry: ${successCount} success, ${failCount} failed`);
  }

  /**
   * Show instructions for official registry submission
   */
  private showOfficialSubmissionInstructions(outputDir: string): void {
    logger.info(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 OFFICIAL REGISTRY SUBMISSION INSTRUCTIONS

Server.json files generated in: ${outputDir}

To submit to the official registry (registry.modelcontextprotocol.io):

1. Install the MCP registry publisher:
   git clone https://github.com/modelcontextprotocol/registry.git
   cd registry
   make publisher

2. Set up authentication (choose one):

   a) GitHub OAuth:
      ./bin/mcp-publisher auth login

   b) Domain verification (for dev.portel namespace):
      Add DNS TXT record:
      _mcp-registry.portel.dev = "verification-token"

3. Publish each server:
   for file in ${outputDir}/*.json; do
     ./bin/mcp-publisher publish "$file"
   done

4. Monitor status:
   ./bin/mcp-publisher list

More info: https://github.com/modelcontextprotocol/registry/tree/main/docs

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1 || args[0] === '--help') {
    console.error(`
Usage: node dist/curation/submission-agent.js <input.csv> [options]

Options:
  --dry-run        Preview without submitting
  --custom-only    Only submit to custom registry
  --official-only  Only generate files for official registry

Examples:
  node dist/curation/submission-agent.js captured-mcps.csv --dry-run
  node dist/curation/submission-agent.js captured-mcps.csv --custom-only
    `);
    process.exit(1);
  }

  const csvPath = args[0];
  const options = {
    dryRun: args.includes('--dry-run'),
    customOnly: args.includes('--custom-only'),
    officialOnly: args.includes('--official-only')
  };

  const agent = new SubmissionAgent(options);

  try {
    await agent.submit(csvPath);
  } catch (error: any) {
    logger.error(`Submission failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { SubmissionAgent };
