/**
 * Tests for MCP Error Parser
 */

import { MCPErrorParser } from '../src/utils/mcp-error-parser.js';

describe('MCPErrorParser', () => {
  let parser: MCPErrorParser;

  beforeEach(() => {
    parser = new MCPErrorParser();
  });

  describe('API Key Detection', () => {
    it('should detect ELEVENLABS_API_KEY requirement', () => {
      const stderr = 'Error: ELEVENLABS_API_KEY is required';
      const needs = parser.parseError('elevenlabs', stderr, 1);

      expect(needs).toHaveLength(1);
      expect(needs[0].type).toBe('api_key');
      expect(needs[0].variable).toBe('ELEVENLABS_API_KEY');
      expect(needs[0].sensitive).toBe(true);
    });

    it('should detect GITHUB_TOKEN missing', () => {
      const stderr = 'Error: GITHUB_TOKEN not set';
      const needs = parser.parseError('github', stderr, 1);

      expect(needs).toHaveLength(1);
      expect(needs[0].type).toBe('api_key');
      expect(needs[0].variable).toBe('GITHUB_TOKEN');
    });

    it('should detect multiple API keys', () => {
      const stderr = `
        Error: OPENAI_API_KEY is required
        Warning: ANTHROPIC_API_KEY must be set
      `;
      const needs = parser.parseError('test', stderr, 1);

      expect(needs).toHaveLength(2);
      expect(needs[0].variable).toBe('OPENAI_API_KEY');
      expect(needs[1].variable).toBe('ANTHROPIC_API_KEY');
    });
  });

  describe('Command Argument Detection', () => {
    it('should detect filesystem directory requirement', () => {
      const stderr = 'Usage: mcp-server-filesystem [allowed-directory]...';
      const needs = parser.parseError('filesystem', stderr, 1);

      expect(needs).toHaveLength(1);
      expect(needs[0].type).toBe('command_arg');
      expect(needs[0].variable).toBe('allowed-directory');
    });

    it('should detect required path from usage', () => {
      const stderr = 'Usage: mcp-server <path>';
      const needs = parser.parseError('test', stderr, 1);

      expect(needs).toHaveLength(1);
      expect(needs[0].type).toBe('command_arg');
      expect(needs[0].variable).toBe('path');
    });

    it('should detect "requires at least one" pattern', () => {
      const stderr = 'Error: requires at least one directory';
      const needs = parser.parseError('test', stderr, 1);

      expect(needs).toHaveLength(1);
      expect(needs[0].type).toBe('command_arg');
      expect(needs[0].variable).toBe('required-path');
    });

    it('should not duplicate path requirements from Usage and "requires at least one"', () => {
      const stderr = `Usage: mcp-server-filesystem [allowed-directory] [additional-directories...]
At least one directory must be provided by EITHER method for the server to operate.`;
      const needs = parser.parseError('filesystem', stderr, 1);

      // Should only detect ONE requirement (from Usage), not two
      expect(needs).toHaveLength(1);
      expect(needs[0].type).toBe('command_arg');
      expect(needs[0].variable).toBe('allowed-directory');
    });
  });

  describe('Environment Variable Detection', () => {
    it('should detect generic env var requirement', () => {
      const stderr = 'Error: DATABASE_URL environment variable is required';
      const needs = parser.parseError('test', stderr, 1);

      expect(needs).toHaveLength(1);
      expect(needs[0].type).toBe('env_var');
      expect(needs[0].variable).toBe('DATABASE_URL');
    });

    it('should skip common false positives', () => {
      const stderr = 'Error: HTTP request failed, ERROR code 500';
      const needs = parser.parseError('test', stderr, 1);

      expect(needs).toHaveLength(0);
    });

    it('should mark password-related vars as sensitive', () => {
      const stderr = 'Error: DATABASE_PASSWORD is required';
      const needs = parser.parseError('test', stderr, 1);

      expect(needs).toHaveLength(1);
      expect(needs[0].type).toBe('env_var');
      expect(needs[0].sensitive).toBe(true);
    });
  });

  describe('Package Missing Detection', () => {
    it('should detect npm 404 error', () => {
      const stderr = 'npm error 404 Not Found - GET https://registry.npmjs.org/@modelcontextprotocol/server-browserbase';
      const needs = parser.parseError('browserbase', stderr, 1);

      expect(needs).toHaveLength(1);
      expect(needs[0].type).toBe('package_missing');
    });

    it('should detect registry not found', () => {
      const stderr = 'Error: ENOTFOUND registry.npmjs.org';
      const needs = parser.parseError('test', stderr, 1);

      expect(needs).toHaveLength(1);
      expect(needs[0].type).toBe('package_missing');
    });

    it('should skip other patterns if package is missing', () => {
      const stderr = `
        npm error 404 Package not found
        Error: API_KEY is required
      `;
      const needs = parser.parseError('test', stderr, 1);

      // Should only return package_missing, skip API_KEY detection
      expect(needs).toHaveLength(1);
      expect(needs[0].type).toBe('package_missing');
    });
  });

  describe('Path Detection', () => {
    it('should detect missing config file', () => {
      const stderr = 'Error: cannot find config.json';
      const needs = parser.parseError('test', stderr, 1);

      expect(needs).toHaveLength(1);
      expect(needs[0].type).toBe('command_arg');
      expect(needs[0].variable).toBe('config.json');
    });

    it('should detect missing directory', () => {
      const stderr = 'Error: no such file or directory /path/to/dir';
      const needs = parser.parseError('test', stderr, 1);

      expect(needs.length).toBeGreaterThan(0);
      expect(needs[0].type).toBe('command_arg');
    });
  });

  describe('Summary Generation', () => {
    it('should generate summary for multiple needs', () => {
      const needs = [
        {
          type: 'api_key' as const,
          variable: 'OPENAI_API_KEY',
          description: 'test',
          prompt: 'test',
          sensitive: true,
          extractedFrom: 'test'
        },
        {
          type: 'env_var' as const,
          variable: 'DATABASE_URL',
          description: 'test',
          prompt: 'test',
          sensitive: false,
          extractedFrom: 'test'
        },
        {
          type: 'command_arg' as const,
          variable: 'path',
          description: 'test',
          prompt: 'test',
          sensitive: false,
          extractedFrom: 'test'
        }
      ];

      const summary = parser.generateSummary(needs);

      expect(summary).toContain('1 API key');
      expect(summary).toContain('1 env var');
      expect(summary).toContain('1 argument');
    });

    it('should handle no configuration needs', () => {
      const summary = parser.generateSummary([]);
      expect(summary).toBe('No configuration issues detected.');
    });

    it('should show package missing message', () => {
      const needs = [{
        type: 'package_missing' as const,
        variable: '',
        description: 'test',
        prompt: 'test',
        sensitive: false,
        extractedFrom: 'test'
      }];

      const summary = parser.generateSummary(needs);
      expect(summary).toContain('Package not found');
    });
  });
});
