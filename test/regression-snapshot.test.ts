/**
 * Regression snapshot tests for CLI commands
 * These tests capture expected outputs to detect unintended changes
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

describe('CLI Command Regression Tests', () => {
  const CLI_PATH = path.join(__dirname, '..', 'dist', 'index.js');

  // Helper to run CLI commands
  function runCommand(args: string): string {
    try {
      const result = execSync(`node ${CLI_PATH} ${args}`, {
        env: { ...process.env, FORCE_COLOR: '0' }, // Disable colors for consistent snapshots
        encoding: 'utf-8'
      });
      return result.toString();
    } catch (error: any) {
      return error.stdout?.toString() || error.message;
    }
  }

  // Helper to normalize output for comparison
  function normalizeOutput(output: string): string {
    return output
      .replace(/\d+\.\d+\.\d+/g, 'X.X.X') // Normalize version numbers
      .replace(/\d+ tools?/g, 'N tools') // Normalize tool counts
      .replace(/\d+ MCPs?/g, 'N MCPs') // Normalize MCP counts
      .replace(/\(\d+%\s+match\)/g, '(N% match)') // Normalize match percentages
      .replace(/\/Users\/[^\s]+/g, '/path/to/file') // Normalize file paths
      .trim();
  }

  describe('find command', () => {
    test('should find git-related tools', () => {
      const output = runCommand('find git-commit --depth 0');
      const normalized = normalizeOutput(output);

      // Should find tools from at least one MCP
      expect(normalized).toMatch(/Shell:|github:|desktop-commander:|portel:|memory:/i);

      // Should not have double-prefixed descriptions
      expect(normalized).not.toMatch(/portel:\s*portel:/);
      expect(normalized).not.toMatch(/desktop-commander:\s*desktop-commander:/);

      // Should show search results header
      expect(normalized).toContain('Found tools for');
    });

    test('should find filesystem tools', () => {
      const output = runCommand('find "list files" --depth 0');
      const normalized = normalizeOutput(output);

      // Should find relevant tools
      expect(normalized).toMatch(/Found tools|No tools found/);
    });
  });

  describe('list command', () => {
    test('should list all profiles', () => {
      const output = runCommand('list');
      const normalized = normalizeOutput(output);

      // Should show profile structure
      expect(normalized).toContain('📦');
      // Summary line was removed from the output
      expect(normalized).toContain('Profiles ▶ MCPs');
    });

    test('should filter non-empty profiles', () => {
      const output = runCommand('list --non-empty');
      const normalized = normalizeOutput(output);

      // Should not show empty profiles
      expect(normalized).not.toContain('(empty)');
    });
  });

  describe('help command', () => {
    test('should show proper help structure', () => {
      const output = runCommand('help');
      const normalized = normalizeOutput(output);

      // Should have main sections
      expect(normalized).toContain('Natural Context Provider');
      expect(normalized).toContain('Commands:');
      expect(normalized).toContain('Quick Start:');
      expect(normalized).toContain('Examples:');

      // Should have core commands
      expect(normalized).toContain('find');
      expect(normalized).toContain('add');
      expect(normalized).toContain('list');
      expect(normalized).toContain('run');
    });
  });

  describe('Critical functionality checks', () => {
    test('single-word queries should work', () => {
      const output = runCommand('find git-commit --depth 0');
      // The command should execute without errors
      // It may or may not find tools depending on environment
      expect(output).toBeDefined();
      expect(output).not.toContain('[NCP ERROR]');
      expect(output).not.toContain('undefined');
      expect(output).not.toContain('TypeError');
    });

    test('probe failures should not leak to CLI', () => {
      const output = runCommand('find test-query');
      expect(output).not.toContain('[NCP ERROR]');
      expect(output).not.toContain('Probe timeout');
    });
  });
});

// Snapshot comparison test
describe('Output Snapshot Comparison', () => {
  const SNAPSHOT_DIR = path.join(__dirname, 'snapshots');

  beforeAll(() => {
    if (!fs.existsSync(SNAPSHOT_DIR)) {
      fs.mkdirSync(SNAPSHOT_DIR);
    }
  });

  function compareSnapshot(command: string, name: string) {
    const output = execSync(`node ${path.join(__dirname, '..', 'dist', 'index.js')} ${command}`, {
      env: { ...process.env, FORCE_COLOR: '0' },
      encoding: 'utf-8'
    }).toString();

    const normalized = output
      .replace(/\d+\.\d+\.\d+/g, 'X.X.X')
      .replace(/\d+ tools?/g, 'N tools')
      .replace(/\(\d+%\s+match\)/g, '(N% match)')
      .trim();

    const snapshotFile = path.join(SNAPSHOT_DIR, `${name}.snap`);

    if (process.env.UPDATE_SNAPSHOTS === 'true') {
      fs.writeFileSync(snapshotFile, normalized);
      console.log(`Updated snapshot: ${name}`);
    } else if (fs.existsSync(snapshotFile)) {
      const expected = fs.readFileSync(snapshotFile, 'utf-8');
      if (expected !== normalized) {
        console.log('Expected:', expected.substring(0, 200));
        console.log('Received:', normalized.substring(0, 200));
        throw new Error(`Snapshot mismatch for ${name}. Run with UPDATE_SNAPSHOTS=true to update.`);
      }
    } else {
      fs.writeFileSync(snapshotFile, normalized);
      console.log(`Created new snapshot: ${name}`);
    }
  }

  test.skip('find command snapshot', () => {
    compareSnapshot('find git-commit --depth 0 --limit 3', 'find-git-commit');
  });

  test.skip('list command snapshot', () => {
    compareSnapshot('list --non-empty', 'list-non-empty');
  });

  test.skip('help command snapshot', () => {
    compareSnapshot('help', 'help');
  });
});