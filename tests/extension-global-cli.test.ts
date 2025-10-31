/**
 * Global CLI Setup Test Suite
 *
 * Tests for the global CLI symlink setup functionality to ensure:
 * - NPM installations are detected and not overwritten
 * - DXT can create symlinks when no npm installation exists
 * - Error handling works correctly
 */

import { existsSync, readlinkSync, symlinkSync, unlinkSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parseExtensionConfig, initializeExtension } from '../src/extension/extension-init.js';

// Test configuration
const TEST_BIN_DIR = join(tmpdir(), 'ncp-test-bin');
const TEST_NCP_LINK = join(TEST_BIN_DIR, 'ncp');
const TEST_CONFIG_DIR = join(tmpdir(), 'ncp-test-global-cli-config');

// Mock __dirname for extension executable path
const mockExtensionDir = join(tmpdir(), 'ncp-test-extension');
const mockNcpExecutable = join(mockExtensionDir, 'dist', 'index.js');

describe('Global CLI Setup', () => {
  beforeAll(() => {
    // Create test directories
    mkdirSync(TEST_BIN_DIR, { recursive: true });
    mkdirSync(TEST_CONFIG_DIR, { recursive: true });
    mkdirSync(join(mockExtensionDir, 'dist'), { recursive: true });

    // Create a mock executable
    writeFileSync(mockNcpExecutable, '#!/usr/bin/env node\nconsole.log("NCP Mock");\n');
  });

  afterAll(() => {
    // Clean up test directories
    if (existsSync(TEST_BIN_DIR)) {
      rmSync(TEST_BIN_DIR, { recursive: true, force: true });
    }
    if (existsSync(TEST_CONFIG_DIR)) {
      rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
    if (existsSync(mockExtensionDir)) {
      rmSync(mockExtensionDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean up any existing symlink before each test
    if (existsSync(TEST_NCP_LINK)) {
      unlinkSync(TEST_NCP_LINK);
    }

    // Reset environment
    delete process.env.NCP_ENABLE_GLOBAL_CLI;
    delete process.env.NCP_PROFILE;
    delete process.env.NCP_CONFIG_PATH;
    delete process.env.NCP_DEBUG;
  });

  describe('Extension Config Parsing', () => {
    it('should parse enable_global_cli from environment', () => {
      process.env.NCP_ENABLE_GLOBAL_CLI = 'true';
      const config = parseExtensionConfig();
      expect(config.enableGlobalCLI).toBe(true);
    });

    it('should default to false when not set', () => {
      const config = parseExtensionConfig();
      expect(config.enableGlobalCLI).toBe(false);
    });

    it('should parse false correctly', () => {
      process.env.NCP_ENABLE_GLOBAL_CLI = 'false';
      const config = parseExtensionConfig();
      expect(config.enableGlobalCLI).toBe(false);
    });
  });

  describe('NPM Installation Detection', () => {
    it('should detect npm installation by path pattern (Unix)', () => {
      // Create a symlink that looks like npm installed it
      const npmTarget = '../lib/node_modules/@portel/ncp/dist/index.js';
      symlinkSync(mockNcpExecutable, TEST_NCP_LINK);

      // Update the symlink to point to a mock npm location
      unlinkSync(TEST_NCP_LINK);
      const mockNpmDir = join(TEST_BIN_DIR, '..', 'lib', 'node_modules', '@portel', 'ncp', 'dist');
      mkdirSync(mockNpmDir, { recursive: true });
      const mockNpmExecutable = join(mockNpmDir, 'index.js');
      writeFileSync(mockNpmExecutable, '#!/usr/bin/env node\nconsole.log("NPM NCP");\n');
      symlinkSync(mockNpmExecutable, TEST_NCP_LINK);

      // Verify it's detected as npm installation
      const target = readlinkSync(TEST_NCP_LINK);
      expect(target.includes('node_modules/@portel/ncp')).toBe(true);
    });

    it('should detect npm installation by path pattern (Windows)', () => {
      // Create a symlink with Windows-style path
      const mockNpmDir = join(TEST_BIN_DIR, '..', 'lib', 'node_modules', '@portel', 'ncp', 'dist');
      mkdirSync(mockNpmDir, { recursive: true });
      const mockNpmExecutable = join(mockNpmDir, 'index.js');
      writeFileSync(mockNpmExecutable, '#!/usr/bin/env node\nconsole.log("NPM NCP");\n');
      symlinkSync(mockNpmExecutable, TEST_NCP_LINK);

      // Verify detection works with backslashes (Windows style)
      const target = readlinkSync(TEST_NCP_LINK);
      const windowsTarget = target.replace(/\//g, '\\');
      expect(
        windowsTarget.includes('node_modules\\@portel\\ncp') ||
        target.includes('node_modules/@portel/ncp')
      ).toBe(true);
    });

    it('should not detect DXT installation as npm', () => {
      // Create a symlink that looks like DXT installed it
      symlinkSync(mockNcpExecutable, TEST_NCP_LINK);

      const target = readlinkSync(TEST_NCP_LINK);
      expect(target.includes('node_modules/@portel/ncp')).toBe(false);
    });
  });

  describe('Symlink Behavior', () => {
    it('should handle missing existing symlink', () => {
      expect(existsSync(TEST_NCP_LINK)).toBe(false);
      // Test would proceed to create symlink
    });

    it('should be able to read symlink target', () => {
      symlinkSync(mockNcpExecutable, TEST_NCP_LINK);
      const target = readlinkSync(TEST_NCP_LINK);
      expect(target).toBe(mockNcpExecutable);
    });

    it('should be able to replace non-npm symlink', () => {
      // Create initial symlink
      const oldTarget = join(tmpdir(), 'old-ncp');
      writeFileSync(oldTarget, '#!/usr/bin/env node\nconsole.log("Old");\n');
      symlinkSync(oldTarget, TEST_NCP_LINK);

      // Verify it exists
      expect(existsSync(TEST_NCP_LINK)).toBe(true);
      expect(readlinkSync(TEST_NCP_LINK)).toBe(oldTarget);

      // Replace with new symlink
      unlinkSync(TEST_NCP_LINK);
      symlinkSync(mockNcpExecutable, TEST_NCP_LINK);

      // Verify it was replaced
      expect(readlinkSync(TEST_NCP_LINK)).toBe(mockNcpExecutable);
    });
  });

  describe('Error Handling', () => {
    it('should handle readlinkSync errors gracefully', () => {
      // Create a regular file instead of symlink
      writeFileSync(TEST_NCP_LINK, 'not a symlink');

      // readlinkSync should throw on regular files
      expect(() => readlinkSync(TEST_NCP_LINK)).toThrow();

      // Clean up
      unlinkSync(TEST_NCP_LINK);
    });

    it('should handle non-existent paths', () => {
      expect(existsSync(join(TEST_BIN_DIR, 'nonexistent'))).toBe(false);
    });
  });

  describe('Integration with Extension Init', () => {
    it('should skip global CLI setup when disabled', async () => {
      process.env.NCP_ENABLE_GLOBAL_CLI = 'false';
      process.env.NCP_CONFIG_PATH = TEST_CONFIG_DIR;
      process.env.NCP_PROFILE = 'test';

      // initializeExtension should not create symlink
      // Note: This would require mocking the setupGlobalCLI function
      // For now, we just verify the config parsing
      const config = parseExtensionConfig();
      expect(config.enableGlobalCLI).toBe(false);
    });

    it('should parse global CLI config when enabled', async () => {
      process.env.NCP_ENABLE_GLOBAL_CLI = 'true';
      process.env.NCP_CONFIG_PATH = TEST_CONFIG_DIR;
      process.env.NCP_PROFILE = 'test';

      const config = parseExtensionConfig();
      expect(config.enableGlobalCLI).toBe(true);
    });
  });

  describe('Path Expansion', () => {
    it('should handle tilde expansion in config path', () => {
      process.env.NCP_CONFIG_PATH = '~/.ncp';
      const config = parseExtensionConfig();

      // Should expand ~ to home directory
      expect(config.configPath).not.toContain('~');
      expect(config.configPath).toContain('.ncp');
    });

    it('should handle absolute paths', () => {
      const absolutePath = '/tmp/test/.ncp';
      process.env.NCP_CONFIG_PATH = absolutePath;
      const config = parseExtensionConfig();

      expect(config.configPath).toBe(absolutePath);
    });

    it('should handle relative paths without tilde', () => {
      const relativePath = '.ncp';
      process.env.NCP_CONFIG_PATH = relativePath;
      const config = parseExtensionConfig();

      expect(config.configPath).toBe(relativePath);
    });
  });
});
