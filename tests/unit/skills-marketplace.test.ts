/**
 * Unit tests for SkillsMarketplaceClient
 * Tests marketplace management, skill discovery, and installation
 */

import { SkillsMarketplaceClient } from '../../src/services/skills-marketplace-client';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';

describe('SkillsMarketplaceClient', () => {
  let client: SkillsMarketplaceClient;
  let testConfigDir: string;

  beforeEach(async () => {
    // Create isolated test environment
    testConfigDir = path.join(os.tmpdir(), `ncp-skills-test-${Date.now()}`);
    await fs.mkdir(testConfigDir, { recursive: true });

    // Mock the home directory for testing
    process.env.HOME = testConfigDir;

    client = new SkillsMarketplaceClient();
  });

  afterEach(async () => {
    // Cleanup test directory
    if (existsSync(testConfigDir)) {
      await fs.rm(testConfigDir, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    test('should initialize with default marketplace', async () => {
      await client.initialize();
      const marketplaces = client.getAll();

      expect(marketplaces).toHaveLength(1);
      expect(marketplaces[0].name).toBe('anthropic-skills');
      expect(marketplaces[0].source).toBe('anthropics/skills');
    });

    test('should create config directory structure', async () => {
      await client.initialize();

      const configDir = path.join(testConfigDir, '.ncp');
      const cacheDir = path.join(configDir, '.cache', 'skills-marketplaces');
      const skillsDir = path.join(configDir, 'skills');

      expect(existsSync(configDir)).toBe(true);
      expect(existsSync(cacheDir)).toBe(true);
      expect(existsSync(skillsDir)).toBe(true);
    });
  });

  describe('marketplace management', () => {
    beforeEach(async () => {
      await client.initialize();
    });

    test('should add new GitHub marketplace', async () => {
      const marketplace = await client.addMarketplace('anthropic-ai/test-skills');

      expect(marketplace.name).toBe('test-skills');
      expect(marketplace.sourceType).toBe('github');
      expect(marketplace.source).toBe('anthropic-ai/test-skills');
      expect(marketplace.enabled).toBe(true);
    });

    test('should add marketplace from URL', async () => {
      const marketplace = await client.addMarketplace('https://example.com/skills');

      expect(marketplace.name).toBe('skills');
      expect(marketplace.sourceType).toBe('url');
      expect(marketplace.url).toBe('https://example.com/skills');
    });

    test('should add marketplace from local path', async () => {
      const marketplace = await client.addMarketplace('/local/skills');

      expect(marketplace.name).toBe('skills');
      expect(marketplace.sourceType).toBe('local');
      expect(marketplace.source).toBe('/local/skills');
    });

    test('should not add duplicate marketplace', async () => {
      await client.addMarketplace('test-org/test-skills');
      const existing = client.getAll();
      expect(existing.filter(m => m.name === 'test-skills')).toHaveLength(1);

      await client.addMarketplace('test-org/test-skills');
      const after = client.getAll();
      expect(after.filter(m => m.name === 'test-skills')).toHaveLength(1);
    });

    test('should remove marketplace by name', async () => {
      await client.addMarketplace('test-org/test-skills');
      let marketplaces = client.getAll();
      expect(marketplaces.filter(m => m.name === 'test-skills')).toHaveLength(1);

      const removed = await client.removeMarketplace('test-skills');
      expect(removed).toBe(true);

      marketplaces = client.getAll();
      expect(marketplaces.filter(m => m.name === 'test-skills')).toHaveLength(0);
    });

    test('should return false when removing non-existent marketplace', async () => {
      const removed = await client.removeMarketplace('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('marketplace retrieval', () => {
    beforeEach(async () => {
      await client.initialize();
    });

    test('should get all marketplaces', async () => {
      await client.addMarketplace('test1-org/test1');
      await client.addMarketplace('test2-org/test2');

      const all = client.getAll();
      expect(all.length).toBeGreaterThanOrEqual(3);
      expect(all.some(m => m.name === 'anthropic-skills')).toBe(true);
    });

    test('should get only enabled marketplaces', async () => {
      await client.addMarketplace('test-org/test');
      const enabled = client.getEnabled();

      expect(enabled.length).toBeGreaterThan(0);
      expect(enabled.every(m => m.enabled)).toBe(true);
    });
  });

  describe('skill metadata parsing', () => {
    test('should parse YAML frontmatter correctly', () => {
      const skillContent = `---
name: test-skill
description: A test skill for unit testing
author: Test Author
version: 1.0.0
tags: test, example
---

# Test Skill

This is a test skill.`;

      const metadata = client.parseSkillMetadata(skillContent, 'test-skill');

      expect(metadata).not.toBeNull();
      expect(metadata!.name).toBe('test-skill');
      expect(metadata!.description).toBe('A test skill for unit testing');
      expect(metadata!.author).toBe('Test Author');
      expect(metadata!.version).toBe('1.0.0');
    });

    test('should return null for missing frontmatter', () => {
      const skillContent = 'No frontmatter here';
      const metadata = client.parseSkillMetadata(skillContent, 'test-skill');

      expect(metadata).toBeNull();
    });

    test('should return null for missing name field', () => {
      const skillContent = `---
description: Missing name field
---

Content here`;

      const metadata = client.parseSkillMetadata(skillContent, 'test-skill');
      expect(metadata).toBeNull();
    });
  });

  describe('skill persistence', () => {
    test('should save and load marketplace configuration', async () => {
      await client.initialize();
      await client.addMarketplace('test-org/test-skills');

      const client2 = new SkillsMarketplaceClient();
      await client2.initialize();

      const marketplaces = client2.getAll();
      expect(marketplaces.some(m => m.name === 'test-skills')).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('should handle marketplace sources with .git suffix', async () => {
      await client.initialize();
      const marketplace = await client.addMarketplace('test-org/test-skills.git');

      expect(marketplace.name).toBe('test-skills');
    });

    test('should handle marketplace sources with trailing slash', async () => {
      await client.initialize();
      const marketplace = await client.addMarketplace('https://example.com/skills/');

      expect(marketplace.url).toBe('https://example.com/skills');
    });

    test('should handle mixed case marketplace names', async () => {
      await client.initialize();
      const marketplace = await client.addMarketplace('TestOrg/TestSkills');

      expect(marketplace.name).toBe('testskills');
    });
  });
});
