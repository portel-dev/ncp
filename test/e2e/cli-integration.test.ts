/**
 * CLI Integration Tests
 *
 * Tests the actual CLI commands end-to-end without user interaction.
 * Can be run in CI/CD pipelines.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('CLI Integration Tests', () => {
  let testConfigPath: string;
  const CLI_PATH = path.join(__dirname, '../../dist/index.js');

  beforeEach(() => {
    // Create isolated test environment
    testConfigPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ncp-cli-test-'));
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(testConfigPath)) {
      fs.rmSync(testConfigPath, { recursive: true, force: true });
    }
  });

  const runCLI = (args: string, opts: { env?: Record<string, string> } = {}) => {
    try {
      const result = execSync(`node ${CLI_PATH} ${args}`, {
        encoding: 'utf-8',
        env: {
          ...process.env,
          NCP_CONFIG_PATH: testConfigPath,
          NCP_CONFIRM_BEFORE_RUN: 'false', // Disable confirmation dialogs for automated tests
          ...opts.env
        },
        timeout: 30000 // 30 second timeout
      });
      return { stdout: result, exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.status || 1
      };
    }
  };

  describe('Discovery (find command)', () => {
    test('should find scheduler tools', () => {
      const result = runCLI('find scheduler --depth 0 --limit 5');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('scheduler');
      expect(result.stdout).toContain('Found tools');
    }, 60000);

    test('should find with custom confidence threshold', () => {
      const result = runCLI('find scheduler --confidence_threshold 0.5 --depth 0');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Found tools');
    }, 60000);

    test('should handle pagination', () => {
      const result = runCLI('find scheduler --page 1 --limit 3 --depth 0');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/Page \d+ of \d+/);
    }, 60000);
  });

  describe('Tool Validation', () => {
    test('should validate scheduler tool', () => {
      const result = runCLI('run scheduler:validate --params \'{"tool":"schedule","arguments":{"name":"test","schedule":"every 5 minutes","tool":"example:tool","parameters":{}}}\'');

      expect(result.exitCode).toBe(0);
      // Should complete without errors
    }, 60000);
  });

  describe('Error Handling', () => {
    test('should handle unknown tool gracefully', () => {
      const result = runCLI('run unknown:tool');

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout + result.stderr).toMatch(/not found|error/i);
    }, 30000);

    test('should handle invalid parameters gracefully', () => {
      const result = runCLI('run scheduler:validate --params \'invalid json\'');

      expect(result.exitCode).not.toBe(0);
    }, 30000);
  });

  describe('Help and Version', () => {
    test('should display version', () => {
      const result = runCLI('--version');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/); // Version format
    }, 10000);

    test('should display help', () => {
      const result = runCLI('--help');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage');
    }, 10000);

    test('should display find command help', () => {
      const result = runCLI('find --help');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('find');
    }, 10000);
  });

  describe('Profile Management', () => {
    test('should work with custom profile', () => {
      const result = runCLI('find scheduler --profile test --depth 0 --limit 3');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Found tools');
    }, 60000);
  });

  describe('Environment Variable Handling', () => {
    test('should respect NCP_DEBUG environment variable', () => {
      const result = runCLI('find scheduler --depth 0 --limit 1', {
        env: { NCP_DEBUG: 'true' }
      });

      // Debug mode should still work
      expect(result.exitCode).toBe(0);
    }, 60000);

    test('should disable confirmation prompts in CI', () => {
      const result = runCLI('run scheduler:list_schedules', {
        env: { NCP_CONFIRM_BEFORE_RUN: 'false' }
      });

      // Should execute without waiting for user input
      expect(result.exitCode).toBe(0);
    }, 60000);
  });
});
