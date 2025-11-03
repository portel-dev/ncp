#!/usr/bin/env node
/**
 * Extract schemas from SimpleMCP .ts files and save as .schema.json
 * Run this during build to preserve parameter information in packaged DXT
 */

import { SchemaExtractor } from '../src/internal-mcps/schema-extractor.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function extractSchemasForFile(sourceFile: string): Promise<void> {
  try {
    const extractor = new SchemaExtractor();
    const schemas = await extractor.extractFromFile(sourceFile);

    if (schemas.length === 0) {
      console.log(`⚠️  No schemas extracted from ${path.basename(sourceFile)}`);
      return;
    }

    // Save schemas as .schema.json alongside the source file
    const schemaFile = sourceFile.replace(/\.ts$/, '.schema.json');
    await fs.writeFile(schemaFile, JSON.stringify(schemas, null, 2));

    console.log(`✅ Extracted ${schemas.length} schemas from ${path.basename(sourceFile)} -> ${path.basename(schemaFile)}`);
  } catch (error: any) {
    console.error(`❌ Failed to extract schemas from ${sourceFile}: ${error.message}`);
  }
}

async function findSimpleMCPFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recursively search subdirectories
        const subFiles = await findSimpleMCPFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.micro.ts')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Directory doesn't exist, skip
  }

  return files;
}

async function main() {
  console.log('🔍 Extracting schemas from SimpleMCP files...\n');

  const projectRoot = path.join(__dirname, '..');
  const searchDirs = [
    path.join(projectRoot, 'src/internal-mcps/examples'),
    // Add more directories if needed
  ];

  let totalSchemas = 0;

  for (const dir of searchDirs) {
    console.log(`\nSearching ${dir}...`);
    const mcpFiles = await findSimpleMCPFiles(dir);

    for (const file of mcpFiles) {
      await extractSchemasForFile(file);
      totalSchemas++;
    }
  }

  console.log(`\n✅ Schema extraction complete! Processed ${totalSchemas} files.`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
