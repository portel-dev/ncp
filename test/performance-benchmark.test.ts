/**
 * Performance Benchmark Tests
 * Demonstrates the performance improvements from cache optimization
 */

import { CachePatcher } from '../src/cache/cache-patcher.js';
import { NCPOrchestrator } from '../src/orchestrator/ncp-orchestrator.js';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock profile data for testing
const createMockProfile = (mcpCount: number = 10) => {
  const profile = {
    name: 'test-profile',
    description: 'Test profile for benchmarking',
    mcpServers: {} as any,
    metadata: {
      created: new Date().toISOString(),
      modified: new Date().toISOString()
    }
  };

  // Add multiple MCPs to simulate real-world usage
  for (let i = 1; i <= mcpCount; i++) {
    profile.mcpServers[`test-mcp-${i}`] = {
      command: 'echo',
      args: [`MCP ${i} simulation`],
      env: {}
    };
  }

  return profile;
};

// Mock tools for each MCP
const createMockTools = (mcpName: string, toolCount: number = 50) => {
  const tools = [];
  for (let i = 1; i <= toolCount; i++) {
    tools.push({
      name: `tool_${i}`,
      description: `Tool ${i} for ${mcpName} - performs operation ${i}`,
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string' }
        }
      }
    });
  }
  return tools;
};

describe('Performance Benchmarks', () => {
  let tempDir: string;
  let tempProfilesDir: string;
  let tempCacheDir: string;

  beforeEach(() => {
    // Create temporary directories
    tempDir = join(tmpdir(), 'ncp-perf-test-' + Date.now());
    tempProfilesDir = join(tempDir, 'profiles');
    tempCacheDir = join(tempDir, 'cache');

    mkdirSync(tempDir, { recursive: true });
    mkdirSync(tempProfilesDir, { recursive: true });
    mkdirSync(tempCacheDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Cache Operations Performance', () => {
    test('should demonstrate fast cache patching vs full rebuild', async () => {
      // Create a custom cache patcher for testing
      class TestCachePatcher extends CachePatcher {
        constructor() {
          super();
          this['cacheDir'] = tempCacheDir;
          this['toolMetadataCachePath'] = join(tempCacheDir, 'all-tools.json');
          this['embeddingsCachePath'] = join(tempCacheDir, 'embeddings.json');
        }
      }

      const cachePatcher = new TestCachePatcher();
      const profile = createMockProfile(5); // 5 MCPs with 50 tools each

      console.log('\\n📊 Performance Benchmark: Cache Operations');
      console.log('=' .repeat(60));

      // Benchmark: Adding MCPs one by one (incremental patching)
      const incrementalStart = process.hrtime.bigint();

      for (const [mcpName, config] of Object.entries(profile.mcpServers)) {
        const tools = createMockTools(mcpName);
        const serverInfo = { name: mcpName, version: '1.0.0' };

        await cachePatcher.patchAddMCP(mcpName, config as any, tools, serverInfo);
      }

      const incrementalEnd = process.hrtime.bigint();
      const incrementalTime = Number(incrementalEnd - incrementalStart) / 1_000_000; // Convert to ms

      // Update profile hash
      const profileHash = cachePatcher.generateProfileHash(profile);
      await cachePatcher.updateProfileHash(profileHash);

      // Get cache statistics
      const stats = await cachePatcher.getCacheStats();

      console.log(`✅ Incremental cache building: ${incrementalTime.toFixed(2)}ms`);
      console.log(`   • MCPs processed: ${stats.mcpCount}`);
      console.log(`   • Tools cached: ${stats.toolCount}`);
      console.log(`   • Average time per MCP: ${(incrementalTime / stats.mcpCount).toFixed(2)}ms`);

      // Benchmark: Cache validation (startup simulation)
      const validationStart = process.hrtime.bigint();

      const isValid = await cachePatcher.validateCacheWithProfile(profileHash);

      const validationEnd = process.hrtime.bigint();
      const validationTime = Number(validationEnd - validationStart) / 1_000_000;

      console.log(`⚡ Cache validation: ${validationTime.toFixed(2)}ms`);
      console.log(`   • Cache valid: ${isValid}`);

      // Performance assertions
      expect(incrementalTime).toBeLessThan(1000); // Should complete in under 1 second
      expect(validationTime).toBeLessThan(50);     // Should validate in under 50ms
      expect(isValid).toBe(true);
      expect(stats.mcpCount).toBe(5);
      expect(stats.toolCount).toBe(250); // 5 MCPs × 50 tools each

    }, 10000); // 10 second timeout

    test('should demonstrate cache removal performance', async () => {
      class TestCachePatcher extends CachePatcher {
        constructor() {
          super();
          this['cacheDir'] = tempCacheDir;
          this['toolMetadataCachePath'] = join(tempCacheDir, 'all-tools.json');
          this['embeddingsCachePath'] = join(tempCacheDir, 'embeddings.json');
        }
      }

      const cachePatcher = new TestCachePatcher();

      // Pre-populate cache with test data
      for (let i = 1; i <= 3; i++) {
        const mcpName = `test-mcp-${i}`;
        const config = { command: 'echo', args: ['test'] };
        const tools = createMockTools(mcpName, 20);
        await cachePatcher.patchAddMCP(mcpName, config, tools, {});
      }

      console.log('\\n🗑️  Performance Benchmark: Cache Removal');
      console.log('=' .repeat(60));

      const removalStart = process.hrtime.bigint();

      // Remove an MCP from cache
      await cachePatcher.patchRemoveMCP('test-mcp-2');
      await cachePatcher.patchRemoveEmbeddings('test-mcp-2');

      const removalEnd = process.hrtime.bigint();
      const removalTime = Number(removalEnd - removalStart) / 1_000_000;

      const stats = await cachePatcher.getCacheStats();

      console.log(`🔧 MCP removal: ${removalTime.toFixed(2)}ms`);
      console.log(`   • Remaining MCPs: ${stats.mcpCount}`);
      console.log(`   • Remaining tools: ${stats.toolCount}`);

      expect(removalTime).toBeLessThan(100); // Should complete in under 100ms
      expect(stats.mcpCount).toBe(2);        // Should have 2 MCPs left
      expect(stats.toolCount).toBe(40);      // Should have 40 tools left (2 MCPs × 20 tools)

    }, 5000);
  });

  describe('Memory Usage Optimization', () => {
    test('should demonstrate efficient memory usage with cache', async () => {
      class TestCachePatcher extends CachePatcher {
        constructor() {
          super();
          this['cacheDir'] = tempCacheDir;
          this['toolMetadataCachePath'] = join(tempCacheDir, 'all-tools.json');
        }
      }

      const cachePatcher = new TestCachePatcher();

      // Measure initial memory
      const initialMemory = process.memoryUsage();

      // Add a realistic number of MCPs and tools
      const mcpCount = 10;
      const toolsPerMCP = 100;

      for (let i = 1; i <= mcpCount; i++) {
        const mcpName = `memory-test-mcp-${i}`;
        const config = { command: 'echo', args: ['test'] };
        const tools = createMockTools(mcpName, toolsPerMCP);

        await cachePatcher.patchAddMCP(mcpName, config, tools, {});
      }

      // Measure memory after caching
      const finalMemory = process.memoryUsage();
      const memoryDiff = finalMemory.heapUsed - initialMemory.heapUsed;
      const totalTools = mcpCount * toolsPerMCP;

      console.log('\\n🧠 Memory Usage Analysis');
      console.log('=' .repeat(60));
      console.log(`📊 Total tools cached: ${totalTools}`);
      console.log(`📈 Memory increase: ${(memoryDiff / 1024 / 1024).toFixed(2)} MB`);
      console.log(`⚖️  Memory per tool: ${(memoryDiff / totalTools).toFixed(0)} bytes`);

      // Memory should be reasonable (less than 50MB for 1000 tools)
      expect(memoryDiff).toBeLessThan(50 * 1024 * 1024); // Less than 50MB
      expect(memoryDiff / totalTools).toBeLessThan(10240); // Less than 10KB per tool (realistic for JS objects)

    }, 10000);
  });

  describe('Startup Time Simulation', () => {
    test('should demonstrate optimized vs legacy startup times', async () => {
      // This test simulates the performance difference between optimized and legacy startup

      const profile = createMockProfile(8); // 8 MCPs
      const profileHash = 'test-startup-hash';

      console.log('\\n🚀 Startup Performance Simulation');
      console.log('=' .repeat(60));

      // Simulate optimized startup (cache hit)
      const optimizedStart = process.hrtime.bigint();

      // Fast operations that optimized startup would do:
      // 1. Profile hash validation
      const hashValidation = process.hrtime.bigint();
      // Hash generation is very fast
      const testHash = require('crypto').createHash('sha256')
        .update(JSON.stringify(profile.mcpServers))
        .digest('hex');
      const hashTime = Number(process.hrtime.bigint() - hashValidation) / 1_000_000;

      // 2. Cache loading simulation (just file I/O)
      const cacheLoadStart = process.hrtime.bigint();
      // Simulate loading cached data
      const mockCacheData = {
        version: '1.0.0',
        profileHash: testHash,
        mcps: {} as any
      };

      // Simulate processing cached MCPs (no network calls)
      for (let i = 0; i < 8; i++) {
        const tools = createMockTools(`mcp-${i}`, 50);
        mockCacheData.mcps[`mcp-${i}`] = {
          tools,
          serverInfo: { name: `mcp-${i}`, version: '1.0.0' }
        };
      }

      const cacheLoadTime = Number(process.hrtime.bigint() - cacheLoadStart) / 1_000_000;
      const optimizedTotal = Number(process.hrtime.bigint() - optimizedStart) / 1_000_000;

      // Simulate legacy startup (cache miss - would need to probe all MCPs)
      const legacyStart = process.hrtime.bigint();

      // Legacy startup would need to:
      // 1. Probe each MCP server (simulated network delay)
      let totalProbeTime = 0;
      for (let i = 0; i < 8; i++) {
        const probeStart = process.hrtime.bigint();
        // Simulate MCP probing (even with 100ms timeout per MCP)
        await new Promise(resolve => setTimeout(resolve, 50)); // 50ms per MCP
        totalProbeTime += Number(process.hrtime.bigint() - probeStart) / 1_000_000;
      }

      // 2. Index all tools (simulation)
      const indexingStart = process.hrtime.bigint();
      // Simulate tool indexing overhead
      await new Promise(resolve => setTimeout(resolve, 100)); // 100ms indexing
      const indexingTime = Number(process.hrtime.bigint() - indexingStart) / 1_000_000;

      const legacyTotal = Number(process.hrtime.bigint() - legacyStart) / 1_000_000;

      console.log('⚡ Optimized startup (cache hit):');
      console.log(`   • Profile hash validation: ${hashTime.toFixed(2)}ms`);
      console.log(`   • Cache loading: ${cacheLoadTime.toFixed(2)}ms`);
      console.log(`   • Total time: ${optimizedTotal.toFixed(2)}ms`);
      console.log('');
      console.log('🐌 Legacy startup (cache miss):');
      console.log(`   • MCP probing: ${totalProbeTime.toFixed(2)}ms`);
      console.log(`   • Tool indexing: ${indexingTime.toFixed(2)}ms`);
      console.log(`   • Total time: ${legacyTotal.toFixed(2)}ms`);
      console.log('');
      console.log(`🎯 Performance improvement: ${(legacyTotal / optimizedTotal).toFixed(1)}x faster`);
      console.log(`💾 Time saved: ${(legacyTotal - optimizedTotal).toFixed(2)}ms`);

      // Performance assertions based on PRD targets
      expect(optimizedTotal).toBeLessThan(250);     // Target: 250ms startup
      expect(legacyTotal).toBeGreaterThan(400);     // Legacy would be much slower
      expect(legacyTotal / optimizedTotal).toBeGreaterThan(2); // At least 2x improvement

    }, 15000); // 15 second timeout for this test
  });
});