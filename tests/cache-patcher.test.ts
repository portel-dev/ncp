/**
 * Cache Patcher tests
 * Covers incremental add/update/remove patching, profile hash validation,
 * corruption handling, and cache statistics.
 */

import { describe, it, expect, beforeEach, afterAll, beforeAll } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CachePatcher } from '../src/cache/cache-patcher.js';
import { setOverrideWorkingDirectory, resetPathsCache } from '../src/utils/ncp-paths.js';

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'ncp-cache-patcher-test-'));
});

beforeEach(() => {
  // Fresh isolated cache directory per test
  rmSync(join(tempDir, '.ncp'), { recursive: true, force: true });
  setOverrideWorkingDirectory(tempDir);
});

afterAll(() => {
  setOverrideWorkingDirectory(null);
  resetPathsCache();
  rmSync(tempDir, { recursive: true, force: true });
});

const sampleConfig = { command: 'npx', args: ['@example/mcp'], env: {} };
const sampleTools = [
  { name: 'read_file', description: 'Read a file', inputSchema: { type: 'object' } },
  { name: 'write_file', description: 'Write a file', inputSchema: { type: 'object' } }
];
const sampleServerInfo = { name: 'example', version: '1.2.3' };

describe('CachePatcher tool metadata', () => {
  it('returns default cache when no file exists', async () => {
    const patcher = new CachePatcher();
    const cache = await patcher.loadToolMetadataCache();
    expect(cache.mcps).toEqual({});
    expect(cache.profileHash).toBe('');
  });

  it('patchAddMCP persists tools and schemas, surviving reload', async () => {
    const patcher = new CachePatcher();
    await patcher.patchAddMCP('example', sampleConfig, sampleTools, sampleServerInfo);

    const reloaded = await new CachePatcher().loadToolMetadataCache();
    expect(reloaded.mcps['example']).toBeDefined();
    expect(reloaded.mcps['example'].tools).toHaveLength(2);
    expect(reloaded.mcps['example'].tools[0].inputSchema).toEqual({ type: 'object' });
    expect(reloaded.mcps['example'].serverInfo.version).toBe('1.2.3');
  });

  it('patchRemoveMCP removes only the named MCP', async () => {
    const patcher = new CachePatcher();
    await patcher.patchAddMCP('keep', sampleConfig, sampleTools, sampleServerInfo);
    await patcher.patchAddMCP('remove', sampleConfig, sampleTools, sampleServerInfo);

    await patcher.patchRemoveMCP('remove');

    const cache = await patcher.loadToolMetadataCache();
    expect(cache.mcps['keep']).toBeDefined();
    expect(cache.mcps['remove']).toBeUndefined();
  });

  it('patchUpdateMCP replaces tool data', async () => {
    const patcher = new CachePatcher();
    await patcher.patchAddMCP('example', sampleConfig, sampleTools, sampleServerInfo);

    const newTools = [{ name: 'only_tool', description: 'New tool', inputSchema: {} }];
    await patcher.patchUpdateMCP('example', sampleConfig, newTools, sampleServerInfo);

    const cache = await patcher.loadToolMetadataCache();
    expect(cache.mcps['example'].tools).toHaveLength(1);
    expect(cache.mcps['example'].tools[0].name).toBe('only_tool');
  });

  it('recovers with default cache when the cache file is corrupt', async () => {
    const cacheDir = join(tempDir, '.ncp', 'cache');
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, 'all-tools.json'), '{not valid json', 'utf-8');

    const cache = await new CachePatcher().loadToolMetadataCache();
    expect(cache.mcps).toEqual({});
  });
});

describe('CachePatcher profile hash validation', () => {
  it('validates matching profile hashes', async () => {
    const patcher = new CachePatcher();
    const hash = patcher.generateProfileHash({ mcpServers: { a: sampleConfig } });

    await patcher.updateProfileHash(hash);
    expect(await patcher.validateCacheWithProfile(hash)).toBe(true);
  });

  it('rejects changed profile hashes', async () => {
    const patcher = new CachePatcher();
    const hash = patcher.generateProfileHash({ mcpServers: { a: sampleConfig } });
    const otherHash = patcher.generateProfileHash({ mcpServers: { b: sampleConfig } });

    await patcher.updateProfileHash(hash);
    expect(await patcher.validateCacheWithProfile(otherHash)).toBe(false);
  });

  it('config hash changes when command or args change', () => {
    const patcher = new CachePatcher();
    const base = patcher.generateConfigHash(sampleConfig);
    expect(patcher.generateConfigHash({ ...sampleConfig, command: 'node' })).not.toBe(base);
    expect(patcher.generateConfigHash({ ...sampleConfig, args: ['other'] })).not.toBe(base);
    expect(patcher.generateConfigHash({ ...sampleConfig })).toBe(base);
  });
});

describe('CachePatcher embeddings', () => {
  it('adds and removes embeddings per MCP', async () => {
    const patcher = new CachePatcher();
    const embeddings = new Map<string, any>([
      ['example:read_file', { embedding: new Float32Array([0.1, 0.2]), enhancedDescription: 'reads' }],
      ['example:write_file', { embedding: new Float32Array([0.3, 0.4]), enhancedDescription: 'writes' }]
    ]);

    await patcher.patchAddEmbeddings('example', embeddings);

    let cache = await patcher.loadEmbeddingsCache();
    expect(Object.keys(cache.vectors)).toHaveLength(2);
    expect(cache.vectors['example:read_file']).toHaveLength(2);
    expect(cache.metadata['example:read_file'].mcpName).toBe('example');

    await patcher.patchRemoveEmbeddings('example');
    cache = await patcher.loadEmbeddingsCache();
    expect(Object.keys(cache.vectors)).toHaveLength(0);
    expect(Object.keys(cache.metadata)).toHaveLength(0);
  });
});

describe('CachePatcher stats and integrity', () => {
  it('reports missing caches in stats', async () => {
    const stats = await new CachePatcher().getCacheStats();
    expect(stats.toolMetadataExists).toBe(false);
    expect(stats.embeddingsExists).toBe(false);
    expect(stats.mcpCount).toBe(0);
  });

  it('reports counts after patching', async () => {
    const patcher = new CachePatcher();
    await patcher.patchAddMCP('example', sampleConfig, sampleTools, sampleServerInfo);

    const stats = await patcher.getCacheStats();
    expect(stats.toolMetadataExists).toBe(true);
    expect(stats.mcpCount).toBe(1);
    expect(stats.toolCount).toBe(2);
  });

  it('validateAndRepairCache flags missing cache', async () => {
    const result = await new CachePatcher().validateAndRepairCache();
    expect(result.valid).toBe(false);
  });

  it('validateAndRepairCache passes for healthy cache', async () => {
    const patcher = new CachePatcher();
    await patcher.patchAddMCP('example', sampleConfig, sampleTools, sampleServerInfo);

    const result = await patcher.validateAndRepairCache();
    expect(result.valid).toBe(true);
  });
});
