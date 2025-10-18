#!/usr/bin/env node

/**
 * Registry Security Test Suite
 * Tests quality scoring and security filtering features
 */

import { RegistryClient } from '../dist/services/registry-client.js';
import assert from 'assert';

console.log('========================================');
console.log('Registry Security Test Suite');
console.log('========================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${error.message}\n`);
    failed++;
  }
}

const client = new RegistryClient();

// Mock server data for testing
const mockServerTrusted = {
  server: {
    name: 'io.github.modelcontextprotocol/server-filesystem',
    description: 'File system access',
    version: '1.0.0',
    repository: { url: 'https://github.com/anthropics/mcp', source: 'github' }
  },
  _meta: {
    'io.modelcontextprotocol.registry/official': {
      status: 'active',
      publishedAt: '2024-09-01T00:00:00Z',
      updatedAt: '2024-10-15T00:00:00Z'
    }
  }
};

const mockServerNoRepo = {
  server: {
    name: 'random.company/server-test',
    description: 'Test server',
    version: '1.0.0',
    repository: { url: '', source: '' }
  },
  _meta: {
    'io.modelcontextprotocol.registry/official': {
      status: 'active',
      publishedAt: '2024-10-10T00:00:00Z'
    }
  }
};

const mockServerBrandNew = {
  server: {
    name: 'new.company/server-new',
    description: 'Brand new server',
    version: '1.0.0',
    repository: { url: 'https://github.com/example/new', source: 'github' }
  },
  _meta: {
    'io.modelcontextprotocol.registry/official': {
      status: 'active',
      publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days old
      updatedAt: new Date().toISOString()
    }
  }
};

const mockServerOld = {
  server: {
    name: 'old.company/server-abandoned',
    description: 'Old abandoned server',
    version: '1.0.0',
    repository: { url: 'https://github.com/example/old', source: 'github' }
  },
  _meta: {
    'io.modelcontextprotocol.registry/official': {
      status: 'active',
      publishedAt: '2022-01-01T00:00:00Z', // Very old
      updatedAt: '2022-01-01T00:00:00Z'    // No recent updates
    }
  }
};

// Test 1: Trusted server with repository scores high
test('Trusted server with GitHub repository should score > 300', () => {
  const score = client['calculateQualityScore'](mockServerTrusted, [
    'io.github.modelcontextprotocol'
  ]);

  // Should get: +100 (has repo) +20 (GitHub) +200 (trusted) +50 (good age) +30 (recently updated)
  assert(score >= 300, `Expected score >= 300, got ${score}`);
});

// Test 2: Server without repository scores low
test('Server without repository should score < 100', () => {
  const score = client['calculateQualityScore'](mockServerNoRepo, []);

  // Should get: 0 (no repo) + penalties
  assert(score < 100, `Expected score < 100, got ${score}`);
});

// Test 3: Brand new server gets penalized
test('Brand new server (< 7 days) should get age penalty', () => {
  const scoreNew = client['calculateQualityScore'](mockServerBrandNew, []);

  // Should get -50 for being too new
  // Has repo (+100) + GitHub (+20) - brand new (-50) = ~70
  assert(scoreNew < 150, `Expected score < 150 for brand new server, got ${scoreNew}`);
});

// Test 4: Old abandoned server gets penalized
test('Old abandoned server (> 1 year, no updates) should get penalties', () => {
  const scoreOld = client['calculateQualityScore'](mockServerOld, []);

  // Has repo (+100) + GitHub (+20) - old (-10) = ~110
  assert(scoreOld < 150, `Expected score < 150 for abandoned server, got ${scoreOld}`);
});

// Test 5: GitHub repository bonus
test('GitHub repository should get bonus points', () => {
  const mockGitHub = {
    server: {
      name: 'test/github',
      repository: { url: 'https://github.com/test/repo', source: 'github' }
    },
    _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active' } }
  };

  const mockOther = {
    server: {
      name: 'test/gitlab',
      repository: { url: 'https://gitlab.com/test/repo', source: 'gitlab' }
    },
    _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active' } }
  };

  const scoreGitHub = client['calculateQualityScore'](mockGitHub, []);
  const scoreOther = client['calculateQualityScore'](mockOther, []);

  // GitHub should score 20 points higher
  assert(scoreGitHub > scoreOther, 'GitHub should score higher than other sources');
});

// Test 6: Trusted namespace priority
test('Trusted namespace should get highest priority (+200)', () => {
  const scoreTrusted = client['calculateQualityScore'](mockServerTrusted, [
    'io.github.modelcontextprotocol'
  ]);

  const scoreUntrusted = client['calculateQualityScore'](
    { ...mockServerTrusted, server: { ...mockServerTrusted.server, name: 'random/server' } },
    ['io.github.modelcontextprotocol']
  );

  // Trusted should be 200 points higher
  assert(scoreTrusted >= scoreUntrusted + 200, 'Trusted namespace should get +200 boost');
});

// Test 7: Security filter - require repository
test('Security filter should remove servers without repositories', () => {
  const mockServers = [mockServerTrusted, mockServerNoRepo, mockServerBrandNew];
  const filtered = client['applySecurityFilters'](mockServers, { requireRepository: true });

  assert.strictEqual(filtered.length, 2, 'Should filter out server without repository');
  assert(filtered.every(s => s.server.repository?.url), 'All filtered servers should have repository');
});

// Test 8: Security filter - minimum age
test('Security filter should enforce minimum age requirement', () => {
  const mockServers = [mockServerTrusted, mockServerBrandNew];
  const filtered = client['applySecurityFilters'](mockServers, { minAgeDays: 7 });

  // Brand new server (2 days) should be filtered out
  assert.strictEqual(filtered.length, 1, 'Should filter out servers younger than 7 days');
  assert.strictEqual(filtered[0].server.name, mockServerTrusted.server.name);
});

// Test 9: Security filter - combined filters
test('Security filter should apply multiple filters together', () => {
  const mockServers = [mockServerTrusted, mockServerNoRepo, mockServerBrandNew];
  const filtered = client['applySecurityFilters'](mockServers, {
    requireRepository: true,
    minAgeDays: 7
  });

  // Only trusted server should pass both filters
  assert.strictEqual(filtered.length, 1, 'Only 1 server should pass both filters');
  assert.strictEqual(filtered[0].server.name, mockServerTrusted.server.name);
});

// Test 10: Cache TTL is 30 minutes
test('Cache TTL should be 30 minutes (1800000ms)', () => {
  const ttl = client['CACHE_TTL'];
  assert.strictEqual(ttl, 30 * 60 * 1000, 'Cache TTL should be 30 minutes');
});

// Test 11: Quality score components - repository presence
test('Repository presence should add 100 points', () => {
  const withRepo = {
    server: {
      name: 'test/with-repo',
      repository: { url: 'https://github.com/test/repo' }
    },
    _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active' } }
  };

  const withoutRepo = {
    server: {
      name: 'test/without-repo',
      repository: { url: '' }
    },
    _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active' } }
  };

  const scoreWith = client['calculateQualityScore'](withRepo, []);
  const scoreWithout = client['calculateQualityScore'](withoutRepo, []);

  assert(scoreWith >= scoreWithout + 100, 'Repository should add at least 100 points');
});

// Test 12: Quality score components - recent updates
test('Recent updates should add bonus points', () => {
  const recentlyUpdated = {
    server: {
      name: 'test/recent',
      repository: { url: 'https://github.com/test/repo' }
    },
    _meta: {
      'io.modelcontextprotocol.registry/official': {
        status: 'active',
        publishedAt: '2024-09-01T00:00:00Z',
        updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() // 10 days ago
      }
    }
  };

  const notUpdated = {
    server: {
      name: 'test/stale',
      repository: { url: 'https://github.com/test/repo' }
    },
    _meta: {
      'io.modelcontextprotocol.registry/official': {
        status: 'active',
        publishedAt: '2024-09-01T00:00:00Z',
        updatedAt: '2024-09-01T00:00:00Z' // Same as published
      }
    }
  };

  const scoreRecent = client['calculateQualityScore'](recentlyUpdated, []);
  const scoreStale = client['calculateQualityScore'](notUpdated, []);

  assert(scoreRecent > scoreStale, 'Recently updated server should score higher');
});

// Summary
console.log('\n========================================');
console.log('Test Summary');
console.log('========================================');
console.log(`Total: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('========================================\n');

if (failed > 0) {
  process.exit(1);
}

console.log('✅ All Registry Security Tests Passed!\n');
