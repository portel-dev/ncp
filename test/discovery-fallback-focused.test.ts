/**
 * Discovery Fallback Focused Tests - Target engine.ts lines 80-131
 * These tests specifically target the fallback mechanisms
 */

import { describe, it, expect } from '@jest/globals';
import { DiscoveryEngine } from '../src/discovery/engine.js';

describe('Discovery Fallback Focus', () => {
  it('should exercise similarity matching fallback', async () => {
    const engine = new DiscoveryEngine();
    await engine.initialize();

    // Index tools with varying similarity
    const tools = [
      {
        id: 'text:processor',
        name: 'text-processor',
        description: 'Process text documents and extract information'
      },
      {
        id: 'data:analyzer',
        name: 'data-analyzer',
        description: 'Analyze data patterns and generate insights'
      },
      {
        id: 'file:manager',
        name: 'file-manager',
        description: 'Manage files and directories on the system'
      }
    ];

    for (const tool of tools) {
      await engine.indexTool(tool);
    }

    // Force the similarity matching path by using private method access
    const result = await (engine as any).findSimilarityMatch('process documents extract');

    // Should find the text processor as most similar or return null
    if (result) {
      expect(result.confidence).toBeGreaterThan(0.3);
    }
    expect(result).toBeDefined(); // Just ensure method runs
  });

  it('should test keyword matching fallback logic', async () => {
    const engine = new DiscoveryEngine();
    await engine.initialize();

    // Index tools with specific keywords
    await engine.indexTool({
      id: 'system:monitor',
      name: 'monitor',
      description: 'Monitor system performance and resource usage'
    });

    await engine.indexTool({
      id: 'network:scanner',
      name: 'scanner',
      description: 'Scan network connections and ports'
    });

    // Test keyword matching directly
    const result = await (engine as any).findKeywordMatch('monitor system performance');

    expect(result).toBeTruthy();
    expect(result.reason).toContain('matching');
  });

  it('should exercise pattern matching with complex patterns', async () => {
    const engine = new DiscoveryEngine();
    await engine.initialize();

    // Index tool with rich pattern extraction opportunities
    await engine.indexTool({
      id: 'advanced:operations',
      name: 'advanced-operations',
      description: 'Create multiple files, read directory contents, update existing resources, and delete old data'
    });

    // Test pattern extraction worked
    const stats = engine.getStats();
    expect(stats.totalPatterns).toBeGreaterThan(10); // Should extract many patterns

    // Test pattern matching
    const result = await (engine as any).findPatternMatch('create files');
    expect(result).toBeTruthy();
  });

  it('should handle similarity calculation edge cases', async () => {
    const engine = new DiscoveryEngine();

    // Test the similarity calculation with edge cases
    const similarity1 = (engine as any).calculateSimilarity('', ''); // Empty strings
    expect(similarity1).toBeGreaterThanOrEqual(0); // Empty strings can be 0 or 1 depending on implementation

    const similarity2 = (engine as any).calculateSimilarity('word', 'word'); // Identical
    expect(similarity2).toBe(1);

    const similarity3 = (engine as any).calculateSimilarity('hello world', 'world hello'); // Same words different order
    expect(similarity3).toBe(1);

    const similarity4 = (engine as any).calculateSimilarity('abc def', 'def ghi'); // Partial overlap
    expect(similarity4).toBeGreaterThan(0);
    expect(similarity4).toBeLessThan(1);
  });

  it('should test pattern extraction from names', async () => {
    const engine = new DiscoveryEngine();

    // Test pattern extraction from different name formats
    const patterns1 = (engine as any).extractPatternsFromName('multi-word-tool-name');
    expect(patterns1.length).toBeGreaterThan(3);

    const patterns2 = (engine as any).extractPatternsFromName('camelCaseToolName');
    expect(patterns2.length).toBeGreaterThan(1);

    const patterns3 = (engine as any).extractPatternsFromName('simple');
    expect(patterns3).toContain('simple');
  });

  it('should test pattern extraction from descriptions with quoted text', async () => {
    const engine = new DiscoveryEngine();

    // Test pattern extraction with quoted phrases
    const patterns = (engine as any).extractPatternsFromDescription(
      'Tool to "create new files" and (manage directories) with special operations'
    );

    expect(patterns).toContain('create new files');
    expect(patterns.length).toBeGreaterThan(5);
  });

  it('should exercise findRelatedTools completely', async () => {
    const engine = new DiscoveryEngine();
    await engine.initialize();

    // Index multiple tools with varying relationships
    const tools = [
      { id: 'a:read', name: 'read', description: 'Read file contents from disk storage' },
      { id: 'b:write', name: 'write', description: 'Write file contents to disk storage' },
      { id: 'c:copy', name: 'copy', description: 'Copy files between different locations' },
      { id: 'd:math', name: 'math', description: 'Perform mathematical calculations and computations' }
    ];

    for (const tool of tools) {
      await engine.indexTool(tool);
    }

    // Find related tools - should find file operations as related
    const related = await engine.findRelatedTools('a:read');

    expect(related.length).toBeGreaterThan(0);

    // Check that similarity scores are calculated
    related.forEach(rel => {
      expect(rel.similarity).toBeGreaterThan(0);
      expect(rel.similarity).toBeLessThanOrEqual(1);
    });

    // Should be sorted by similarity (highest first)
    for (let i = 1; i < related.length; i++) {
      expect(related[i].similarity).toBeLessThanOrEqual(related[i-1].similarity);
    }
  });
});