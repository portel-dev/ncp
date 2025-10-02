/**
 * Configuration Schema Reader
 *
 * Reads configurationSchema from MCP InitializeResult
 * Caches schemas for future use during `ncp add` and `ncp repair`
 */

export interface ConfigurationParameter {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'path' | 'url';
  required: boolean;
  sensitive?: boolean;
  default?: string | number | boolean;
  multiple?: boolean;
  pattern?: string;
  examples?: string[];
}

export interface ConfigurationSchema {
  environmentVariables?: ConfigurationParameter[];
  arguments?: ConfigurationParameter[];
  other?: ConfigurationParameter[];
}

export interface InitializeResult {
  protocolVersion: string;
  capabilities: any;
  serverInfo: {
    name: string;
    version: string;
  };
  instructions?: string;
  configurationSchema?: ConfigurationSchema;
}

export class ConfigSchemaReader {
  /**
   * Extract configuration schema from InitializeResult
   */
  readSchema(initResult: InitializeResult): ConfigurationSchema | null {
    if (!initResult || !initResult.configurationSchema) {
      return null;
    }

    return initResult.configurationSchema;
  }

  /**
   * Get all required parameters from schema
   */
  getRequiredParameters(schema: ConfigurationSchema): ConfigurationParameter[] {
    const required: ConfigurationParameter[] = [];

    if (schema.environmentVariables) {
      required.push(...schema.environmentVariables.filter(p => p.required));
    }

    if (schema.arguments) {
      required.push(...schema.arguments.filter(p => p.required));
    }

    if (schema.other) {
      required.push(...schema.other.filter(p => p.required));
    }

    return required;
  }

  /**
   * Check if schema has any required parameters
   */
  hasRequiredConfig(schema: ConfigurationSchema | null): boolean {
    if (!schema) return false;

    return this.getRequiredParameters(schema).length > 0;
  }

  /**
   * Get parameter by name from schema
   */
  getParameter(schema: ConfigurationSchema, name: string): ConfigurationParameter | null {
    const allParams = [
      ...(schema.environmentVariables || []),
      ...(schema.arguments || []),
      ...(schema.other || [])
    ];

    return allParams.find(p => p.name === name) || null;
  }

  /**
   * Format schema for display
   */
  formatSchema(schema: ConfigurationSchema): string {
    const lines: string[] = [];

    if (schema.environmentVariables && schema.environmentVariables.length > 0) {
      lines.push('Environment Variables:');
      schema.environmentVariables.forEach(param => {
        const required = param.required ? '(required)' : '(optional)';
        const sensitive = param.sensitive ? ' [sensitive]' : '';
        lines.push(`  - ${param.name} ${required}${sensitive}`);
        lines.push(`    ${param.description}`);
        if (param.examples && param.examples.length > 0 && !param.sensitive) {
          lines.push(`    Examples: ${param.examples.join(', ')}`);
        }
      });
      lines.push('');
    }

    if (schema.arguments && schema.arguments.length > 0) {
      lines.push('Command Arguments:');
      schema.arguments.forEach(param => {
        const required = param.required ? '(required)' : '(optional)';
        const multiple = param.multiple ? ' [multiple]' : '';
        lines.push(`  - ${param.name} ${required}${multiple}`);
        lines.push(`    ${param.description}`);
        if (param.examples && param.examples.length > 0) {
          lines.push(`    Examples: ${param.examples.join(', ')}`);
        }
      });
      lines.push('');
    }

    if (schema.other && schema.other.length > 0) {
      lines.push('Other Configuration:');
      schema.other.forEach(param => {
        const required = param.required ? '(required)' : '(optional)';
        lines.push(`  - ${param.name} ${required}`);
        lines.push(`    ${param.description}`);
      });
    }

    return lines.join('\n');
  }
}
