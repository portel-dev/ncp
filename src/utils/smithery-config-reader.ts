/**
 * Smithery Config Reader
 *
 * Reads configuration schema from smithery.yaml files.
 * Smithery (https://smithery.ai) requires MCP servers to define their
 * configuration requirements in a smithery.yaml file.
 *
 * This provides a second-tier detection strategy after MCP protocol schema.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';

export interface SmitheryConfigSchema {
  type: string;
  required?: string[];
  properties: {
    [key: string]: {
      type: string;
      description?: string;
      default?: any;
      enum?: any[];
      pattern?: string;
    };
  };
}

export interface SmitheryYaml {
  startCommand?: {
    type?: string;
    configSchema?: SmitheryConfigSchema;
    commandFunction?: string;
  };
}

export class SmitheryConfigReader {
  /**
   * Try to read smithery.yaml from an installed npm package
   *
   * @param packageName - npm package name (e.g., "@gongrzhe/server-gmail-autoauth-mcp")
   * @returns Smithery config schema or null if not found
   */
  readFromPackage(packageName: string): SmitheryConfigSchema | null {
    try {
      // Try node_modules lookup
      const smitheryPath = require.resolve(`${packageName}/smithery.yaml`, {
        paths: [process.cwd(), ...module.paths]
      });

      if (existsSync(smitheryPath)) {
        const content = readFileSync(smitheryPath, 'utf-8');
        const parsed = YAML.parse(content) as SmitheryYaml;
        return parsed?.startCommand?.configSchema || null;
      }
    } catch (error) {
      // Package not found or no smithery.yaml - try alternative paths
    }

    // Try common locations relative to cwd
    const commonPaths = [
      join(process.cwd(), 'node_modules', packageName, 'smithery.yaml'),
      join(process.cwd(), 'smithery.yaml'), // Current directory (for local dev)
    ];

    for (const path of commonPaths) {
      if (existsSync(path)) {
        try {
          const content = readFileSync(path, 'utf-8');
          const parsed = YAML.parse(content) as SmitheryYaml;
          return parsed?.startCommand?.configSchema || null;
        } catch (error) {
          // Invalid YAML or missing configSchema
          continue;
        }
      }
    }

    return null;
  }

  /**
   * Check if a config schema is valid and has properties
   */
  isValidSchema(schema: SmitheryConfigSchema | null): boolean {
    if (!schema) return false;
    if (!schema.properties) return false;
    if (Object.keys(schema.properties).length === 0) return false;
    return true;
  }

  /**
   * Get required properties from schema
   */
  getRequiredProperties(schema: SmitheryConfigSchema): string[] {
    return schema.required || [];
  }

  /**
   * Check if schema has any required properties
   */
  hasRequiredConfig(schema: SmitheryConfigSchema | null): boolean {
    if (!schema) return false;
    return (schema.required?.length || 0) > 0;
  }
}
