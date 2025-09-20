/**
 * Shared service for parsing tool schemas
 * Single source of truth for parameter extraction
 */

export interface ParameterInfo {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export class ToolSchemaParser {
  /**
   * Parse parameters from a tool schema
   */
  static parseParameters(schema: any): ParameterInfo[] {
    const params: ParameterInfo[] = [];

    if (!schema || typeof schema !== 'object') {
      return params;
    }

    const properties = schema.properties || {};
    const required = schema.required || [];

    for (const [name, prop] of Object.entries(properties)) {
      const propDef = prop as any;
      params.push({
        name,
        type: propDef.type || 'unknown',
        required: required.includes(name),
        description: propDef.description
      });
    }

    return params;
  }

  /**
   * Get only required parameters from a schema
   */
  static getRequiredParameters(schema: any): ParameterInfo[] {
    return this.parseParameters(schema).filter(p => p.required);
  }

  /**
   * Get only optional parameters from a schema
   */
  static getOptionalParameters(schema: any): ParameterInfo[] {
    return this.parseParameters(schema).filter(p => !p.required);
  }

  /**
   * Check if a schema has any required parameters
   */
  static hasRequiredParameters(schema: any): boolean {
    if (!schema || typeof schema !== 'object') {
      return false;
    }

    const required = schema.required || [];
    return Array.isArray(required) && required.length > 0;
  }

  /**
   * Count total parameters in a schema
   */
  static countParameters(schema: any): { total: number; required: number; optional: number } {
    const params = this.parseParameters(schema);
    const required = params.filter(p => p.required).length;

    return {
      total: params.length,
      required,
      optional: params.length - required
    };
  }

  /**
   * Get parameter by name from schema
   */
  static getParameter(schema: any, paramName: string): ParameterInfo | undefined {
    return this.parseParameters(schema).find(p => p.name === paramName);
  }
}