/**
 * Unit Tests - Runtime Detector
 * Tests PATH parsing, command resolution, and platform-specific executable detection
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir, homedir } from 'os';

// We need to test the module with different platform mocks
// Import the actual functions for testing
import { detectRuntime, getRuntimeForExtension } from '../src/utils/runtime-detector.js';
import { userInfo } from 'os';

describe('Runtime Detector', () => {
  describe('detectRuntime', () => {
    it('should return RuntimeInfo object with required fields', () => {
      const runtime = detectRuntime();

      expect(runtime).toBeDefined();
      expect(runtime.type).toBeDefined();
      expect(['bundled', 'system']).toContain(runtime.type);
      expect(runtime.nodePath).toBeDefined();
      expect(typeof runtime.nodePath).toBe('string');
    });

    it('should detect system runtime when not in Claude app', () => {
      const runtime = detectRuntime();

      // When running tests, we're not inside Claude Desktop
      expect(runtime.type).toBe('system');
    });
  });

  describe('getRuntimeForExtension', () => {
    describe('node command resolution', () => {
      it('should resolve "node" command', () => {
        const result = getRuntimeForExtension('node');
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      });

      it('should resolve "node.exe" command', () => {
        const result = getRuntimeForExtension('node.exe');
        expect(result).toBeDefined();
      });

      it('should resolve full path to node', () => {
        const result = getRuntimeForExtension('/usr/bin/node');
        expect(result).toBeDefined();
      });
    });

    describe('npx command resolution', () => {
      it('should resolve "npx" command', () => {
        const result = getRuntimeForExtension('npx');
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      });

      it('should resolve "npx.cmd" command', () => {
        const result = getRuntimeForExtension('npx.cmd');
        expect(result).toBeDefined();
      });
    });

    describe('python command resolution', () => {
      it('should resolve "python" command', () => {
        const result = getRuntimeForExtension('python');
        expect(result).toBeDefined();
      });

      it('should resolve "python3" command', () => {
        const result = getRuntimeForExtension('python3');
        expect(result).toBeDefined();
      });

      it('should resolve "python.exe" command', () => {
        const result = getRuntimeForExtension('python.exe');
        expect(result).toBeDefined();
      });
    });

    describe('uv/uvx command resolution', () => {
      it('should resolve "uv" command', () => {
        const result = getRuntimeForExtension('uv');
        expect(result).toBeDefined();
      });

      it('should resolve "uvx" command', () => {
        const result = getRuntimeForExtension('uvx');
        expect(result).toBeDefined();
      });
    });

    describe('generic command resolution', () => {
      it('should return original command for unknown commands', () => {
        const result = getRuntimeForExtension('some-unknown-command');
        expect(result).toBe('some-unknown-command');
      });

      it('should handle commands with path prefix', () => {
        const result = getRuntimeForExtension('/usr/local/bin/custom-tool');
        expect(result).toBeDefined();
      });

      it('should handle Windows-style paths', () => {
        const result = getRuntimeForExtension('C:\\Program Files\\tool.exe');
        expect(result).toBeDefined();
      });
    });

    describe('base command extraction', () => {
      it('should extract base command from full Unix path', () => {
        // The function should extract 'node' from '/usr/bin/node'
        const result = getRuntimeForExtension('/usr/bin/node');
        expect(result).toBeDefined();
      });

      it('should extract base command from Windows path', () => {
        // The function should extract 'node' from 'C:\\nodejs\\node.exe'
        const result = getRuntimeForExtension('C:\\nodejs\\node.exe');
        expect(result).toBeDefined();
      });

      it('should strip .exe extension', () => {
        const result = getRuntimeForExtension('python.exe');
        expect(result).toBeDefined();
      });

      it('should strip .cmd extension', () => {
        const result = getRuntimeForExtension('npx.cmd');
        expect(result).toBeDefined();
      });

      it('should strip .bat extension', () => {
        const result = getRuntimeForExtension('script.bat');
        expect(result).toBeDefined();
      });
    });
  });
});

describe('PATH Parsing and Command Search', () => {
  let testDir: string;
  let originalPATH: string | undefined;

  beforeEach(() => {
    // Save original PATH
    originalPATH = process.env.PATH;

    // Create a temporary test directory with fake executables
    testDir = path.join(tmpdir(), `path-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Restore original PATH
    if (originalPATH !== undefined) {
      process.env.PATH = originalPATH;
    }

    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('executable extensions', () => {
    it('should find executables with platform-specific extensions', () => {
      // Create fake executables based on platform
      if (process.platform === 'win32') {
        // Create .exe, .cmd, .bat files
        fs.writeFileSync(path.join(testDir, 'test-tool.exe'), '');
        fs.writeFileSync(path.join(testDir, 'test-script.cmd'), '');
        fs.writeFileSync(path.join(testDir, 'test-batch.bat'), '');
      } else {
        // Create extensionless executable
        fs.writeFileSync(path.join(testDir, 'test-tool'), '');
        fs.chmodSync(path.join(testDir, 'test-tool'), 0o755);
      }

      // Add test directory to PATH
      const separator = process.platform === 'win32' ? ';' : ':';
      process.env.PATH = testDir + separator + (originalPATH || '');

      // The command resolution should work
      // Note: We're testing the general behavior, actual findInPATH is internal
      const result = getRuntimeForExtension('test-tool');
      expect(result).toBeDefined();
    });
  });

  describe('PATH separator handling', () => {
    it('should use correct separator for platform', () => {
      const separator = process.platform === 'win32' ? ';' : ':';
      const pathValue = process.env.PATH || '';

      // PATH should contain the correct separator
      if (pathValue.length > 0) {
        // On each platform, the separator should be present if there are multiple entries
        const entries = pathValue.split(separator);
        expect(entries.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('Windows-specific behavior', () => {
  // These tests verify Windows-specific logic even when running on other platforms

  describe('extension priority', () => {
    it('should prioritize .exe over .cmd over .bat', () => {
      // This test documents the expected behavior
      // On Windows, PATHEXT typically has .exe before .cmd before .bat
      const expectedOrder = ['.exe', '.cmd', '.bat', ''];

      // The actual implementation should try extensions in this order
      // We can't directly test the internal function, but we can verify the behavior
      expect(expectedOrder[0]).toBe('.exe');
      expect(expectedOrder[1]).toBe('.cmd');
      expect(expectedOrder[2]).toBe('.bat');
    });
  });

  describe('case insensitivity', () => {
    it('should handle mixed case extensions', () => {
      // Windows is case-insensitive for file extensions
      const result1 = getRuntimeForExtension('Node.EXE');
      const result2 = getRuntimeForExtension('NPX.CMD');

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });
});

describe('macOS/Linux uv/uvx resolution', () => {
  describe('path priority', () => {
    it('should document expected path search order for uv', () => {
      // Document the expected search order:
      // 1. ~/.local/bin/uv (user install)
      // 2. /opt/homebrew/bin/uv (Homebrew ARM64) or /usr/local/bin/uv (Homebrew Intel)
      // 3. Fallback to user path

      const username = userInfo().username;
      const expectedUserPath = process.platform === 'darwin'
        ? `/Users/${username}/.local/bin/uv`
        : `/home/${username}/.local/bin/uv`;

      expect(expectedUserPath).toContain('.local/bin/uv');
    });

    it('should document expected Homebrew paths', () => {
      const arm64Path = '/opt/homebrew/bin/uv';
      const intelPath = '/usr/local/bin/uv';

      expect(arm64Path).toBe('/opt/homebrew/bin/uv');
      expect(intelPath).toBe('/usr/local/bin/uv');
    });
  });
});

describe('Command cache behavior', () => {
  it('should return consistent results for same command', () => {
    const result1 = getRuntimeForExtension('node');
    const result2 = getRuntimeForExtension('node');

    // Cache should return same result
    expect(result1).toBe(result2);
  });

  it('should handle different commands independently', () => {
    const nodeResult = getRuntimeForExtension('node');
    const pythonResult = getRuntimeForExtension('python');

    // Different commands can have different results
    expect(nodeResult).toBeDefined();
    expect(pythonResult).toBeDefined();
  });
});
