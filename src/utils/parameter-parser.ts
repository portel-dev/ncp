/**
 * Smart CLI argument parser for MCP tools
 * Supports positional, --named, and --key=value argument styles
 * Automatically type-coerces values based on schema
 */

import { ParameterInfo } from '../services/tool-schema-parser.js';

export interface ToolSchema {
  properties?: Record<string, {
    type?: string;
    description?: string;
    items?: any;
  }>;
  required?: string[];
}

/**
 * Parses CLI arguments into tool parameters using the schema
 * Supports multiple formats:
 * - Positional: tool_name value1 value2
 * - Named: tool_name --param1 value1 --param2 value2
 * - Key=value: tool_name --param1=value1 --param2=value2
 * - Mixed: tool_name value1 --param2 value2 --param3=value3
 */
export class ParameterParser {
  /**
   * Parse CLI arguments into tool parameters
   */
  parse(args: string[], schema: ToolSchema): Record<string, any> {
    const params: Record<string, any> = {};
    const positionalKeys = this.getPositionalOrder(schema);
    let positionalIndex = 0;
    let i = 0;

    while (i < args.length) {
      const arg = args[i];

      if (arg.startsWith('--')) {
        // Named argument: --key value OR --key=value
        const [key, ...valueParts] = arg.slice(2).split('=');
        const paramName = this.normalizeParamName(key);

        if (valueParts.length > 0) {
          // Format: --key=value
          params[paramName] = valueParts.join('=');
        } else {
          // Format: --key value (next arg is the value)
          if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
            params[paramName] = args[++i];
          } else if (i + 1 < args.length && args[i + 1].startsWith('--')) {
            // Next arg is a flag, treat as boolean flag with no value
            // This is intentionally not supported - flags must have values
            throw new Error(
              `Missing value for flag --${key}. Use --${key}=value or --${key} value`
            );
          } else {
            // No more args, treat as boolean flag
            throw new Error(
              `Missing value for flag --${key}. Use --${key}=value or --${key} value`
            );
          }
        }
        i++;
      } else if (!arg.startsWith('-')) {
        // Positional argument
        if (positionalIndex < positionalKeys.length) {
          const paramName = positionalKeys[positionalIndex++];
          params[paramName] = arg;
        } else {
          // Extra positional argument - could be an error or ignored
          console.warn(`Warning: Extra positional argument ignored: ${arg}`);
        }
        i++;
      } else {
        // Unknown flag format
        throw new Error(`Unrecognized argument format: ${arg}`);
      }
    }

    // Apply type coercion based on schema
    return this.coerceTypes(params, schema);
  }

  /**
   * Get positional parameter order from schema
   * Order: required params first (alphabetically), then optional params (alphabetically)
   */
  private getPositionalOrder(schema: ToolSchema): string[] {
    if (!schema.properties) {
      return [];
    }

    const properties = Object.keys(schema.properties);
    const required = schema.required || [];

    const requiredParams = properties
      .filter(name => required.includes(name))
      .sort();

    const optionalParams = properties
      .filter(name => !required.includes(name))
      .sort();

    return [...requiredParams, ...optionalParams];
  }

  /**
   * Normalize parameter names (e.g., convert kebab-case to camelCase if needed)
   * For now, just use as-is since the schema uses the parameter names directly
   */
  private normalizeParamName(key: string): string {
    // Convert kebab-case to camelCase for convenience
    // foo-bar -> fooBar
    return key.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
  }

  /**
   * Type-coerce parsed string values to appropriate types based on schema
   */
  private coerceTypes(
    params: Record<string, any>,
    schema: ToolSchema
  ): Record<string, any> {
    if (!schema.properties) {
      return params;
    }

    const coerced: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      const propSchema = schema.properties[key];

      if (!propSchema) {
        // Property not in schema - keep as string
        coerced[key] = value;
        continue;
      }

      const type = propSchema.type;

      try {
        if (type === 'number' || type === 'integer') {
          coerced[key] = Number(value);
          if (isNaN(coerced[key])) {
            throw new Error(`Cannot convert "${value}" to number`);
          }
        } else if (type === 'boolean') {
          coerced[key] = this.parseBoolean(value);
        } else if (type === 'array' || type === 'object') {
          // Try JSON parsing for complex types
          try {
            coerced[key] = JSON.parse(value);
          } catch {
            // If not valid JSON, treat as string
            // Some tools might accept string arrays like "item1,item2"
            if (type === 'array' && !value.startsWith('[')) {
              // Might be comma-separated list - keep as string, let tool handle
              coerced[key] = value;
            } else {
              throw new Error(
                `Invalid JSON for ${key}: ${value}. Expected valid JSON for type "${type}"`
              );
            }
          }
        } else if (type === 'string' || !type) {
          // String type or unknown - keep as string
          coerced[key] = value;
        } else {
          // Unknown type - keep as string
          coerced[key] = value;
        }
      } catch (error: any) {
        throw new Error(
          `Type coercion error for parameter "${key}": ${error.message}`
        );
      }
    }

    return coerced;
  }

  /**
   * Parse boolean values from various representations
   */
  private parseBoolean(value: string | boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    const str = String(value).toLowerCase().trim();

    if (str === 'true' || str === '1' || str === 'yes' || str === 'on') {
      return true;
    } else if (str === 'false' || str === '0' || str === 'no' || str === 'off') {
      return false;
    } else {
      throw new Error(
        `Cannot parse "${value}" as boolean. Use true/false, 1/0, yes/no, or on/off`
      );
    }
  }

  /**
   * Validate that all required parameters are provided
   */
  validateRequired(params: Record<string, any>, schema: ToolSchema): string[] {
    const missing: string[] = [];
    const required = schema.required || [];

    for (const paramName of required) {
      if (
        !(paramName in params) ||
        params[paramName] === undefined ||
        params[paramName] === null ||
        params[paramName] === ''
      ) {
        missing.push(paramName);
      }
    }

    return missing;
  }

  /**
   * Get help text for parameter parsing
   */
  getHelpText(schema: ToolSchema): string {
    if (!schema.properties || Object.keys(schema.properties).length === 0) {
      return 'This tool has no parameters.';
    }

    let help = 'Parameter Formats:\n';
    help += '  Positional:   ncp run <mcp> <tool> value1 value2\n';
    help += '  Named:        ncp run <mcp> <tool> --param1 value1 --param2 value2\n';
    help += '  Key=value:    ncp run <mcp> <tool> --param1=value1 --param2=value2\n';
    help += '  Mixed:        ncp run <mcp> <tool> value1 --param2 value2\n\n';
    help += 'Parameters:\n';

    const required = schema.required || [];
    const properties = schema.properties;

    for (const [name, prop] of Object.entries(properties)) {
      const propDef = prop as any;
      const isRequired = required.includes(name);
      const typeStr = propDef.type || 'string';
      const reqStr = isRequired ? '[REQUIRED]' : '[optional]';

      help += `  --${name} <${typeStr}> ${reqStr}`;
      if (propDef.description) {
        help += `\n    ${propDef.description}`;
      }
      help += '\n';
    }

    return help;
  }
}
