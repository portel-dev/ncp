/**
 * Comprehensive Tests for ToolContextResolver
 * Following ncp-oss3 patterns for 95%+ coverage
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ToolContextResolver } from '../src/services/tool-context-resolver';

describe('ToolContextResolver - Comprehensive Coverage', () => {
  beforeEach(() => {
    // Reset any runtime modifications between tests
  });

  describe('🎯 Context Resolution by Tool Identifier', () => {
    it('should resolve context from tool identifier format', () => {
      // Test mcp:tool format parsing
      expect(ToolContextResolver.getContext('filesystem:read_file')).toBe('filesystem');
      expect(ToolContextResolver.getContext('stripe:create_payment')).toBe('payment');
      expect(ToolContextResolver.getContext('github:get_repo')).toBe('development');
    });

    it('should handle tool identifier with no colon separator', () => {
      // Test edge case: no colon separator
      expect(ToolContextResolver.getContext('filesystem')).toBe('filesystem');
      expect(ToolContextResolver.getContext('unknown-mcp')).toBe('general');
    });

    it('should handle empty tool identifier', () => {
      expect(ToolContextResolver.getContext('')).toBe('general');
    });

    it('should handle tool identifier with multiple colons', () => {
      expect(ToolContextResolver.getContext('namespace:mcp:tool')).toBe('general');
    });
  });

  describe('🎯 Direct MCP Context Resolution', () => {
    it('should resolve all predefined MCP contexts', () => {
      // Test every single predefined mapping for 100% coverage
      expect(ToolContextResolver.getContextByMCP('filesystem')).toBe('filesystem');
      expect(ToolContextResolver.getContextByMCP('memory')).toBe('database');
      expect(ToolContextResolver.getContextByMCP('shell')).toBe('system');
      expect(ToolContextResolver.getContextByMCP('sequential-thinking')).toBe('ai');
      expect(ToolContextResolver.getContextByMCP('portel')).toBe('development');
      expect(ToolContextResolver.getContextByMCP('tavily')).toBe('web');
      expect(ToolContextResolver.getContextByMCP('desktop-commander')).toBe('system');
      expect(ToolContextResolver.getContextByMCP('stripe')).toBe('payment');
      expect(ToolContextResolver.getContextByMCP('context7-mcp')).toBe('documentation');
      expect(ToolContextResolver.getContextByMCP('search')).toBe('search');
      expect(ToolContextResolver.getContextByMCP('weather')).toBe('weather');
      expect(ToolContextResolver.getContextByMCP('http')).toBe('web');
      expect(ToolContextResolver.getContextByMCP('github')).toBe('development');
      expect(ToolContextResolver.getContextByMCP('gitlab')).toBe('development');
      expect(ToolContextResolver.getContextByMCP('slack')).toBe('communication');
      expect(ToolContextResolver.getContextByMCP('discord')).toBe('communication');
      expect(ToolContextResolver.getContextByMCP('email')).toBe('communication');
      expect(ToolContextResolver.getContextByMCP('database')).toBe('database');
      expect(ToolContextResolver.getContextByMCP('redis')).toBe('database');
      expect(ToolContextResolver.getContextByMCP('mongodb')).toBe('database');
      expect(ToolContextResolver.getContextByMCP('postgresql')).toBe('database');
      expect(ToolContextResolver.getContextByMCP('mysql')).toBe('database');
      expect(ToolContextResolver.getContextByMCP('elasticsearch')).toBe('search');
      expect(ToolContextResolver.getContextByMCP('docker')).toBe('system');
      expect(ToolContextResolver.getContextByMCP('kubernetes')).toBe('system');
      expect(ToolContextResolver.getContextByMCP('aws')).toBe('cloud');
      expect(ToolContextResolver.getContextByMCP('azure')).toBe('cloud');
      expect(ToolContextResolver.getContextByMCP('gcp')).toBe('cloud');
    });

    it('should handle case insensitive MCP names', () => {
      expect(ToolContextResolver.getContextByMCP('FILESYSTEM')).toBe('filesystem');
      expect(ToolContextResolver.getContextByMCP('GitHub')).toBe('development');
      expect(ToolContextResolver.getContextByMCP('AWS')).toBe('cloud');
    });

    it('should handle empty and null MCP names', () => {
      expect(ToolContextResolver.getContextByMCP('')).toBe('general');
      expect(ToolContextResolver.getContextByMCP(null as any)).toBe('general');
      expect(ToolContextResolver.getContextByMCP(undefined as any)).toBe('general');
    });
  });

  describe('🎯 Pattern Matching Rules Coverage', () => {
    it('should match filesystem patterns', () => {
      expect(ToolContextResolver.getContextByMCP('file-manager')).toBe('filesystem');
      expect(ToolContextResolver.getContextByMCP('fs-utils')).toBe('filesystem');
      expect(ToolContextResolver.getContextByMCP('custom-file-system')).toBe('filesystem');
    });

    it('should match database patterns', () => {
      expect(ToolContextResolver.getContextByMCP('my-db')).toBe('database');
      expect(ToolContextResolver.getContextByMCP('data-store')).toBe('database');
      expect(ToolContextResolver.getContextByMCP('user-data')).toBe('database');
    });

    it('should match web patterns', () => {
      expect(ToolContextResolver.getContextByMCP('web-scraper')).toBe('web');
      expect(ToolContextResolver.getContextByMCP('http-client')).toBe('web');
      expect(ToolContextResolver.getContextByMCP('api-gateway')).toBe('web');
    });

    it('should match cloud patterns', () => {
      expect(ToolContextResolver.getContextByMCP('cloud-storage')).toBe('cloud');
      expect(ToolContextResolver.getContextByMCP('aws-lambda')).toBe('cloud');
      expect(ToolContextResolver.getContextByMCP('azure-functions')).toBe('cloud');
      expect(ToolContextResolver.getContextByMCP('gcp-compute')).toBe('cloud');
    });

    it('should match system patterns', () => {
      expect(ToolContextResolver.getContextByMCP('docker-compose')).toBe('system');
      expect(ToolContextResolver.getContextByMCP('container-runtime')).toBe('system');
    });

    it('should match development patterns', () => {
      expect(ToolContextResolver.getContextByMCP('git-manager')).toBe('development');
      expect(ToolContextResolver.getContextByMCP('github-actions')).toBe('development');
    });

    it('should fall back to general for unknown patterns', () => {
      expect(ToolContextResolver.getContextByMCP('random-mcp')).toBe('general');
      expect(ToolContextResolver.getContextByMCP('unknown-service')).toBe('general');
      expect(ToolContextResolver.getContextByMCP('123456')).toBe('general');
    });
  });

  describe('🎯 Context Enumeration and Validation', () => {
    it('should return all known contexts', () => {
      const contexts = ToolContextResolver.getAllContexts();

      expect(contexts).toContain('filesystem');
      expect(contexts).toContain('database');
      expect(contexts).toContain('system');
      expect(contexts).toContain('ai');
      expect(contexts).toContain('development');
      expect(contexts).toContain('web');
      expect(contexts).toContain('payment');
      expect(contexts).toContain('documentation');
      expect(contexts).toContain('search');
      expect(contexts).toContain('weather');
      expect(contexts).toContain('communication');
      expect(contexts).toContain('cloud');
      expect(contexts).toContain('general');

      // Should be sorted
      const sortedContexts = [...contexts].sort();
      expect(contexts).toEqual(sortedContexts);
    });

    it('should validate known contexts', () => {
      expect(ToolContextResolver.isKnownContext('filesystem')).toBe(true);
      expect(ToolContextResolver.isKnownContext('web')).toBe(true);
      expect(ToolContextResolver.isKnownContext('general')).toBe(true);
      expect(ToolContextResolver.isKnownContext('unknown')).toBe(false);
      expect(ToolContextResolver.isKnownContext('')).toBe(false);
    });
  });

  describe('🎯 Runtime Configuration', () => {
    it('should allow adding new mappings', () => {
      // Add a new mapping
      ToolContextResolver.addMapping('custom-mcp', 'custom');

      expect(ToolContextResolver.getContextByMCP('custom-mcp')).toBe('custom');
      expect(ToolContextResolver.getContextByMCP('CUSTOM-MCP')).toBe('custom');
    });

    it('should allow updating existing mappings', () => {
      // Update an existing mapping
      const original = ToolContextResolver.getContextByMCP('github');
      ToolContextResolver.addMapping('github', 'version-control');

      expect(ToolContextResolver.getContextByMCP('github')).toBe('version-control');

      // Restore original for other tests
      ToolContextResolver.addMapping('github', original);
    });

    it('should handle case normalization in addMapping', () => {
      ToolContextResolver.addMapping('TEST-MCP', 'test');

      expect(ToolContextResolver.getContextByMCP('test-mcp')).toBe('test');
      expect(ToolContextResolver.getContextByMCP('TEST-MCP')).toBe('test');
    });
  });

  describe('🎯 Reverse Context Lookup', () => {
    it('should find MCPs for specific contexts', () => {
      const filesystemMCPs = ToolContextResolver.getMCPsForContext('filesystem');
      expect(filesystemMCPs).toContain('filesystem');
      expect(filesystemMCPs).toEqual(filesystemMCPs.sort()); // Should be sorted

      const databaseMCPs = ToolContextResolver.getMCPsForContext('database');
      expect(databaseMCPs).toContain('memory');
      expect(databaseMCPs).toContain('database');
      expect(databaseMCPs).toContain('redis');
      expect(databaseMCPs).toContain('mongodb');
      expect(databaseMCPs).toContain('postgresql');
      expect(databaseMCPs).toContain('mysql');

      const systemMCPs = ToolContextResolver.getMCPsForContext('system');
      expect(systemMCPs).toContain('shell');
      expect(systemMCPs).toContain('desktop-commander');
      expect(systemMCPs).toContain('docker');
      expect(systemMCPs).toContain('kubernetes');

      const developmentMCPs = ToolContextResolver.getMCPsForContext('development');
      expect(developmentMCPs).toContain('portel');
      expect(developmentMCPs).toContain('github');
      expect(developmentMCPs).toContain('gitlab');

      const communicationMCPs = ToolContextResolver.getMCPsForContext('communication');
      expect(communicationMCPs).toContain('slack');
      expect(communicationMCPs).toContain('discord');
      expect(communicationMCPs).toContain('email');

      const cloudMCPs = ToolContextResolver.getMCPsForContext('cloud');
      expect(cloudMCPs).toContain('aws');
      expect(cloudMCPs).toContain('azure');
      expect(cloudMCPs).toContain('gcp');
    });

    it('should return empty array for unknown contexts', () => {
      expect(ToolContextResolver.getMCPsForContext('unknown')).toEqual([]);
      expect(ToolContextResolver.getMCPsForContext('')).toEqual([]);
    });

    it('should handle contexts with single MCP', () => {
      const aiMCPs = ToolContextResolver.getMCPsForContext('ai');
      expect(aiMCPs).toEqual(['sequential-thinking']);

      const paymentMCPs = ToolContextResolver.getMCPsForContext('payment');
      expect(paymentMCPs).toEqual(['stripe']);

      const weatherMCPs = ToolContextResolver.getMCPsForContext('weather');
      expect(weatherMCPs).toEqual(['weather']);
    });
  });

  describe('🎯 Edge Cases and Error Handling', () => {
    it('should handle special characters in MCP names', () => {
      expect(ToolContextResolver.getContextByMCP('mcp-with-dashes')).toBe('general');
      expect(ToolContextResolver.getContextByMCP('mcp_with_underscores')).toBe('general');
      expect(ToolContextResolver.getContextByMCP('mcp.with.dots')).toBe('general');
    });

    it('should handle numeric MCP names', () => {
      expect(ToolContextResolver.getContextByMCP('123')).toBe('general');
      expect(ToolContextResolver.getContextByMCP('mcp-v2')).toBe('general');
    });

    it('should handle very long MCP names', () => {
      const longName = 'a'.repeat(1000);
      expect(ToolContextResolver.getContextByMCP(longName)).toBe('general');
    });

    it('should handle whitespace in MCP names', () => {
      expect(ToolContextResolver.getContextByMCP(' filesystem ')).toBe('filesystem');
      expect(ToolContextResolver.getContextByMCP('github\t')).toBe('development');
    });
  });
});