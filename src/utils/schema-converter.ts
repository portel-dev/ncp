/**
 * Schema Converter
 *
 * Converts between different configuration schema formats.
 * Currently supports: Smithery JSON Schema → MCP configurationSchema
 */

import { ConfigurationSchema, ConfigurationParameter } from '../services/config-schema-reader.js';
import { SmitheryConfigSchema } from './smithery-config-reader.js';

export class SchemaConverter {
  /**
   * Convert Smithery JSON Schema to MCP configurationSchema format
   *
   * @param jsonSchema - Smithery configSchema (JSON Schema format)
   * @returns MCP-compatible configurationSchema
   */
  convertSmitheryToMCP(jsonSchema: SmitheryConfigSchema): ConfigurationSchema {
    const environmentVariables: ConfigurationParameter[] = [];
    const args: ConfigurationParameter[] = [];

    // Iterate through all properties in the JSON Schema
    for (const [propName, propDef] of Object.entries(jsonSchema.properties || {})) {
      const param = this.convertProperty(propName, propDef, jsonSchema.required || []);

      // Heuristic: properties with "path" likely become env vars or args
      // Properties ending in "Path" or containing "path" are common
      // For now, treat all as environment variables
      // TODO: Could be enhanced with more sophisticated detection
      environmentVariables.push(param);
    }

    return {
      environmentVariables: environmentVariables.length > 0 ? environmentVariables : undefined,
      arguments: args.length > 0 ? args : undefined,
    };
  }

  /**
   * Convert a single JSON Schema property to MCP ConfigurationParameter
   */
  private convertProperty(
    propName: string,
    propDef: any,
    required: string[]
  ): ConfigurationParameter {
    return {
      name: this.inferEnvVarName(propName),
      description: propDef.description || `Configuration for ${propName}`,
      type: this.inferMCPType(propDef),
      required: required.includes(propName),
      sensitive: this.isSensitive(propName, propDef),
      default: propDef.default,
      pattern: propDef.pattern,
      examples: propDef.enum ? propDef.enum : undefined,
    };
  }

  /**
   * Convert camelCase property name to UPPER_SNAKE_CASE environment variable name
   *
   * Examples:
   *   gcpOauthKeysPath → GCP_OAUTH_KEYS_PATH
   *   apiKey → API_KEY
   *   credentialsPath → CREDENTIALS_PATH
   */
  private inferEnvVarName(propName: string): string {
    return propName
      .replace(/([A-Z])/g, '_$1') // Insert _ before capitals
      .toUpperCase()
      .replace(/^_/, ''); // Remove leading underscore
  }

  /**
   * Infer MCP parameter type from JSON Schema type and property name
   *
   * JSON Schema types: string, number, boolean, object, array
   * MCP types: string, number, boolean, path, url
   */
  private inferMCPType(propDef: any): 'string' | 'number' | 'boolean' | 'path' | 'url' {
    const jsonType = propDef.type || 'string';
    const description = (propDef.description || '').toLowerCase();

    // If description mentions path, treat as path type
    if (description.includes('path') || description.includes('file') || description.includes('directory')) {
      return 'path';
    }

    // If description mentions URL, treat as url type
    if (description.includes('url') || description.includes('endpoint') || description.includes('uri')) {
      return 'url';
    }

    // Map JSON Schema types to MCP types
    switch (jsonType) {
      case 'number':
      case 'integer':
        return 'number';
      case 'boolean':
        return 'boolean';
      default:
        return 'string';
    }
  }

  /**
   * Determine if a property should be treated as sensitive (masked input)
   *
   * Heuristics:
   * - Contains "key", "secret", "token", "password", "credentials"
   * - Contains "oauth" (often sensitive)
   */
  private isSensitive(propName: string, propDef: any): boolean {
    const nameAndDesc = `${propName} ${propDef.description || ''}`.toLowerCase();

    const sensitiveKeywords = [
      'key',
      'secret',
      'token',
      'password',
      'credential',
      'oauth',
      'api_key',
      'apikey',
    ];

    return sensitiveKeywords.some(keyword => nameAndDesc.includes(keyword));
  }

  /**
   * Check if converted schema has any required parameters
   */
  hasRequiredConfig(schema: ConfigurationSchema): boolean {
    const envVars = schema.environmentVariables || [];
    const args = schema.arguments || [];
    const other = schema.other || [];

    return [...envVars, ...args, ...other].some(param => param.required);
  }
}
