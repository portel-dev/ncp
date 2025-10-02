/**
 * Schema Cache
 *
 * Caches MCP configuration schemas for reuse across add/repair/import commands
 * Stores in JSON files alongside CSV cache
 */

import fs from 'fs';
import path from 'path';
import { ConfigurationSchema } from '../services/config-schema-reader.js';
import { logger } from '../utils/logger.js';

export class SchemaCache {
  private cacheDir: string;

  constructor(cacheDir: string) {
    this.cacheDir = path.join(cacheDir, 'schemas');
    this.ensureCacheDir();
  }

  /**
   * Ensure cache directory exists
   */
  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Save configuration schema to cache
   */
  save(mcpName: string, schema: ConfigurationSchema): void {
    try {
      const filepath = this.getSchemaPath(mcpName);
      const data = {
        mcpName,
        schema,
        cachedAt: new Date().toISOString(),
        version: '1.0'
      };

      fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
      logger.debug(`Cached configuration schema for ${mcpName}`);
    } catch (error: any) {
      logger.error(`Failed to cache schema for ${mcpName}:`, error.message);
    }
  }

  /**
   * Load configuration schema from cache
   */
  get(mcpName: string): ConfigurationSchema | null {
    try {
      const filepath = this.getSchemaPath(mcpName);

      if (!fs.existsSync(filepath)) {
        return null;
      }

      const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
      logger.debug(`Loaded cached schema for ${mcpName}`);
      return data.schema as ConfigurationSchema;
    } catch (error: any) {
      logger.error(`Failed to load cached schema for ${mcpName}:`, error.message);
      return null;
    }
  }

  /**
   * Check if schema is cached
   */
  has(mcpName: string): boolean {
    const filepath = this.getSchemaPath(mcpName);
    return fs.existsSync(filepath);
  }

  /**
   * Delete cached schema
   */
  delete(mcpName: string): void {
    try {
      const filepath = this.getSchemaPath(mcpName);

      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        logger.debug(`Deleted cached schema for ${mcpName}`);
      }
    } catch (error: any) {
      logger.error(`Failed to delete cached schema for ${mcpName}:`, error.message);
    }
  }

  /**
   * Clear all cached schemas
   */
  clear(): void {
    try {
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        for (const file of files) {
          if (file.endsWith('.schema.json')) {
            fs.unlinkSync(path.join(this.cacheDir, file));
          }
        }
        logger.debug('Cleared all cached schemas');
      }
    } catch (error: any) {
      logger.error('Failed to clear schema cache:', error.message);
    }
  }

  /**
   * Get all cached schemas
   */
  listAll(): Array<{ mcpName: string; cachedAt: string }> {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        return [];
      }

      const files = fs.readdirSync(this.cacheDir);
      const schemas: Array<{ mcpName: string; cachedAt: string }> = [];

      for (const file of files) {
        if (file.endsWith('.schema.json')) {
          const filepath = path.join(this.cacheDir, file);
          const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
          schemas.push({
            mcpName: data.mcpName,
            cachedAt: data.cachedAt
          });
        }
      }

      return schemas;
    } catch (error: any) {
      logger.error('Failed to list cached schemas:', error.message);
      return [];
    }
  }

  /**
   * Get file path for schema
   */
  private getSchemaPath(mcpName: string): string {
    // Sanitize MCP name for filename
    const safeName = mcpName.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(this.cacheDir, `${safeName}.schema.json`);
  }

  /**
   * Get cache statistics
   */
  getStats(): { total: number; oldestCache: string | null; newestCache: string | null } {
    const all = this.listAll();

    if (all.length === 0) {
      return { total: 0, oldestCache: null, newestCache: null };
    }

    const sorted = all.sort((a, b) =>
      new Date(a.cachedAt).getTime() - new Date(b.cachedAt).getTime()
    );

    return {
      total: all.length,
      oldestCache: sorted[0].cachedAt,
      newestCache: sorted[sorted.length - 1].cachedAt
    };
  }
}
