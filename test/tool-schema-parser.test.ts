/**
 * Comprehensive Tests for ToolSchemaParser
 * Following ncp-oss3 patterns for 95%+ coverage
 */

import { describe, it, expect } from '@jest/globals';
import { ToolSchemaParser, ParameterInfo } from '../src/services/tool-schema-parser';

describe('ToolSchemaParser - Comprehensive Coverage', () => {

  const sampleSchema = {
    properties: {
      path: {
        type: 'string',
        description: 'File path to read'
      },
      encoding: {
        type: 'string',
        description: 'File encoding (optional)'
      },
      maxSize: {
        type: 'number',
        description: 'Maximum file size in bytes'
      },
      recursive: {
        type: 'boolean',
        description: 'Whether to read recursively'
      }
    },
    required: ['path', 'maxSize']
  };

  const emptySchema = {};
  const noPropertiesSchema = { required: ['something'] };
  const noRequiredSchema = {
    properties: {
      optional1: { type: 'string' },
      optional2: { type: 'number' }
    }
  };

  describe('🎯 Parameter Parsing - Core Functionality', () => {
    it('should parse complete schema with all parameter types', () => {
      const params = ToolSchemaParser.parseParameters(sampleSchema);

      expect(params).toHaveLength(4);

      // Check path parameter (required string)
      const pathParam = params.find(p => p.name === 'path');
      expect(pathParam).toEqual({
        name: 'path',
        type: 'string',
        required: true,
        description: 'File path to read'
      });

      // Check encoding parameter (optional string)
      const encodingParam = params.find(p => p.name === 'encoding');
      expect(encodingParam).toEqual({
        name: 'encoding',
        type: 'string',
        required: false,
        description: 'File encoding (optional)'
      });

      // Check maxSize parameter (required number)
      const maxSizeParam = params.find(p => p.name === 'maxSize');
      expect(maxSizeParam).toEqual({
        name: 'maxSize',
        type: 'number',
        required: true,
        description: 'Maximum file size in bytes'
      });

      // Check recursive parameter (optional boolean)
      const recursiveParam = params.find(p => p.name === 'recursive');
      expect(recursiveParam).toEqual({
        name: 'recursive',
        type: 'boolean',
        required: false,
        description: 'Whether to read recursively'
      });
    });

    it('should handle schema with missing properties', () => {
      const params = ToolSchemaParser.parseParameters(noPropertiesSchema);
      expect(params).toEqual([]);
    });

    it('should handle schema with no required array', () => {
      const params = ToolSchemaParser.parseParameters(noRequiredSchema);
      expect(params).toHaveLength(2);

      params.forEach(param => {
        expect(param.required).toBe(false);
      });
    });

    it('should handle properties without type information', () => {
      const schemaWithoutTypes = {
        properties: {
          mystery1: { description: 'Unknown type parameter' },
          mystery2: { /* no type or description */ }
        },
        required: ['mystery1']
      };

      const params = ToolSchemaParser.parseParameters(schemaWithoutTypes);
      expect(params).toHaveLength(2);

      const mystery1 = params.find(p => p.name === 'mystery1');
      expect(mystery1).toEqual({
        name: 'mystery1',
        type: 'unknown',
        required: true,
        description: 'Unknown type parameter'
      });

      const mystery2 = params.find(p => p.name === 'mystery2');
      expect(mystery2).toEqual({
        name: 'mystery2',
        type: 'unknown',
        required: false,
        description: undefined
      });
    });
  });

  describe('🎯 Edge Cases and Error Handling', () => {
    it('should handle null and undefined schemas', () => {
      expect(ToolSchemaParser.parseParameters(null)).toEqual([]);
      expect(ToolSchemaParser.parseParameters(undefined)).toEqual([]);
    });

    it('should handle non-object schemas', () => {
      expect(ToolSchemaParser.parseParameters('string')).toEqual([]);
      expect(ToolSchemaParser.parseParameters(123)).toEqual([]);
      expect(ToolSchemaParser.parseParameters([])).toEqual([]);
      expect(ToolSchemaParser.parseParameters(true)).toEqual([]);
    });

    it('should handle empty schema object', () => {
      expect(ToolSchemaParser.parseParameters(emptySchema)).toEqual([]);
    });

    it('should handle schema with null/undefined properties', () => {
      const badSchema = {
        properties: null,
        required: undefined
      };
      expect(ToolSchemaParser.parseParameters(badSchema)).toEqual([]);
    });

    it('should handle schema with non-array required field', () => {
      const invalidRequiredSchema = {
        properties: {
          param1: { type: 'string' }
        },
        required: 'not-an-array'
      };
      const params = ToolSchemaParser.parseParameters(invalidRequiredSchema);
      expect(params).toHaveLength(1);
      expect(params[0].required).toBe(false);
    });
  });

  describe('🎯 Required Parameters Filtering', () => {
    it('should extract only required parameters', () => {
      const requiredParams = ToolSchemaParser.getRequiredParameters(sampleSchema);

      expect(requiredParams).toHaveLength(2);
      expect(requiredParams.map(p => p.name)).toEqual(['path', 'maxSize']);

      requiredParams.forEach(param => {
        expect(param.required).toBe(true);
      });
    });

    it('should return empty array for schema with no required parameters', () => {
      const requiredParams = ToolSchemaParser.getRequiredParameters(noRequiredSchema);
      expect(requiredParams).toEqual([]);
    });

    it('should handle invalid schemas in getRequiredParameters', () => {
      expect(ToolSchemaParser.getRequiredParameters(null)).toEqual([]);
      expect(ToolSchemaParser.getRequiredParameters({})).toEqual([]);
    });
  });

  describe('🎯 Optional Parameters Filtering', () => {
    it('should extract only optional parameters', () => {
      const optionalParams = ToolSchemaParser.getOptionalParameters(sampleSchema);

      expect(optionalParams).toHaveLength(2);
      expect(optionalParams.map(p => p.name)).toEqual(['encoding', 'recursive']);

      optionalParams.forEach(param => {
        expect(param.required).toBe(false);
      });
    });

    it('should return all parameters when none are required', () => {
      const optionalParams = ToolSchemaParser.getOptionalParameters(noRequiredSchema);
      expect(optionalParams).toHaveLength(2);

      optionalParams.forEach(param => {
        expect(param.required).toBe(false);
      });
    });

    it('should handle invalid schemas in getOptionalParameters', () => {
      expect(ToolSchemaParser.getOptionalParameters(null)).toEqual([]);
      expect(ToolSchemaParser.getOptionalParameters({})).toEqual([]);
    });
  });

  describe('🎯 Required Parameters Detection', () => {
    it('should detect schemas with required parameters', () => {
      expect(ToolSchemaParser.hasRequiredParameters(sampleSchema)).toBe(true);
    });

    it('should detect schemas without required parameters', () => {
      expect(ToolSchemaParser.hasRequiredParameters(noRequiredSchema)).toBe(false);
      expect(ToolSchemaParser.hasRequiredParameters(emptySchema)).toBe(false);
    });

    it('should handle edge cases in hasRequiredParameters', () => {
      expect(ToolSchemaParser.hasRequiredParameters(null)).toBe(false);
      expect(ToolSchemaParser.hasRequiredParameters(undefined)).toBe(false);
      expect(ToolSchemaParser.hasRequiredParameters('string')).toBe(false);
      expect(ToolSchemaParser.hasRequiredParameters(123)).toBe(false);
    });

    it('should handle schema with empty required array', () => {
      const emptyRequiredSchema = {
        properties: { param1: { type: 'string' } },
        required: []
      };
      expect(ToolSchemaParser.hasRequiredParameters(emptyRequiredSchema)).toBe(false);
    });

    it('should handle schema with non-array required field', () => {
      const invalidRequiredSchema = {
        properties: { param1: { type: 'string' } },
        required: 'not-an-array'
      };
      expect(ToolSchemaParser.hasRequiredParameters(invalidRequiredSchema)).toBe(false);
    });
  });

  describe('🎯 Parameter Counting', () => {
    it('should count all parameter types correctly', () => {
      const counts = ToolSchemaParser.countParameters(sampleSchema);

      expect(counts).toEqual({
        total: 4,
        required: 2,
        optional: 2
      });
    });

    it('should count parameters in schema with no required fields', () => {
      const counts = ToolSchemaParser.countParameters(noRequiredSchema);

      expect(counts).toEqual({
        total: 2,
        required: 0,
        optional: 2
      });
    });

    it('should count parameters in schema with all required fields', () => {
      const allRequiredSchema = {
        properties: {
          param1: { type: 'string' },
          param2: { type: 'number' }
        },
        required: ['param1', 'param2']
      };

      const counts = ToolSchemaParser.countParameters(allRequiredSchema);

      expect(counts).toEqual({
        total: 2,
        required: 2,
        optional: 0
      });
    });

    it('should handle empty schemas in countParameters', () => {
      expect(ToolSchemaParser.countParameters(emptySchema)).toEqual({
        total: 0,
        required: 0,
        optional: 0
      });

      expect(ToolSchemaParser.countParameters(null)).toEqual({
        total: 0,
        required: 0,
        optional: 0
      });
    });
  });

  describe('🎯 Individual Parameter Lookup', () => {
    it('should find existing parameters by name', () => {
      const pathParam = ToolSchemaParser.getParameter(sampleSchema, 'path');
      expect(pathParam).toEqual({
        name: 'path',
        type: 'string',
        required: true,
        description: 'File path to read'
      });

      const encodingParam = ToolSchemaParser.getParameter(sampleSchema, 'encoding');
      expect(encodingParam).toEqual({
        name: 'encoding',
        type: 'string',
        required: false,
        description: 'File encoding (optional)'
      });
    });

    it('should return undefined for non-existent parameters', () => {
      expect(ToolSchemaParser.getParameter(sampleSchema, 'nonexistent')).toBeUndefined();
      expect(ToolSchemaParser.getParameter(sampleSchema, '')).toBeUndefined();
    });

    it('should handle invalid schemas in getParameter', () => {
      expect(ToolSchemaParser.getParameter(null, 'any')).toBeUndefined();
      expect(ToolSchemaParser.getParameter({}, 'any')).toBeUndefined();
      expect(ToolSchemaParser.getParameter('invalid', 'any')).toBeUndefined();
    });

    it('should handle case-sensitive parameter names', () => {
      expect(ToolSchemaParser.getParameter(sampleSchema, 'Path')).toBeUndefined();
      expect(ToolSchemaParser.getParameter(sampleSchema, 'PATH')).toBeUndefined();
      expect(ToolSchemaParser.getParameter(sampleSchema, 'path')).toBeDefined();
    });
  });

  describe('🎯 Complex Schema Scenarios', () => {
    it('should handle nested object schemas', () => {
      const nestedSchema = {
        properties: {
          config: {
            type: 'object',
            description: 'Configuration object',
            properties: {
              nested: { type: 'string' }
            }
          }
        },
        required: ['config']
      };

      const params = ToolSchemaParser.parseParameters(nestedSchema);
      expect(params).toHaveLength(1);
      expect(params[0]).toEqual({
        name: 'config',
        type: 'object',
        required: true,
        description: 'Configuration object'
      });
    });

    it('should handle array type schemas', () => {
      const arraySchema = {
        properties: {
          items: {
            type: 'array',
            description: 'List of items',
            items: { type: 'string' }
          }
        },
        required: ['items']
      };

      const params = ToolSchemaParser.parseParameters(arraySchema);
      expect(params[0]).toEqual({
        name: 'items',
        type: 'array',
        required: true,
        description: 'List of items'
      });
    });

    it('should handle schemas with special characters in property names', () => {
      const specialSchema = {
        properties: {
          'kebab-case': { type: 'string' },
          'snake_case': { type: 'number' },
          'dot.notation': { type: 'boolean' },
          'space name': { type: 'string' }
        },
        required: ['kebab-case', 'space name']
      };

      const params = ToolSchemaParser.parseParameters(specialSchema);
      expect(params).toHaveLength(4);

      const kebabParam = params.find(p => p.name === 'kebab-case');
      expect(kebabParam?.required).toBe(true);

      const spaceParam = params.find(p => p.name === 'space name');
      expect(spaceParam?.required).toBe(true);

      const snakeParam = params.find(p => p.name === 'snake_case');
      expect(snakeParam?.required).toBe(false);
    });
  });
});