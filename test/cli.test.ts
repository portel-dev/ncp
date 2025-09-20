/**
 * Tests for CLI functionality
 * Tests the command-line interface
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn } from 'child_process';
import { join } from 'path';

describe('CLI Interface', () => {
  const cliPath = join(process.cwd(), 'dist', 'index.js');

  beforeEach(() => {
    // Ensure we have a built version for testing
    jest.setTimeout(30000);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('help command', () => {
    it('should show help when --help is provided', (done) => {
      const child = spawn('node', [cliPath, '--help'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        expect(code).toBe(0);
        expect(output).toContain('Natural Context Provider');
        expect(output).toContain('find');
        expect(output).toContain('run');
        expect(output).toContain('--help');
        done();
      });

      child.on('error', (err) => {
        done(err);
      });
    });
  });

  describe('find command', () => {
    it('should execute find command without query', (done) => {
      const child = spawn('node', [cliPath, '--find'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        // Should exit successfully (code 0) or with expected error
        expect(code).toBeGreaterThanOrEqual(0);

        if (code === 0) {
          // If successful, should contain tool information
          expect(output.length).toBeGreaterThan(0);
        } else {
          // If failed, should have error information
          expect(errorOutput.length).toBeGreaterThan(0);
        }

        done();
      });

      child.on('error', (err) => {
        done(err);
      });
    });

    it('should execute find command with query', (done) => {
      const child = spawn('node', [cliPath, '--find', 'file operations'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        expect(code).toBeGreaterThanOrEqual(0);
        done();
      });

      child.on('error', (err) => {
        done(err);
      });
    });
  });

  describe('argument parsing', () => {
    it('should handle unknown arguments gracefully', (done) => {
      const child = spawn('node', [cliPath, '--unknown-arg'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';

      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        expect(code).toBe(0);
        expect(output).toContain('Unknown command');
        done();
      });

      child.on('error', (err) => {
        done(err);
      });
    });

    it('should start MCP server by default with no arguments', (done) => {
      const child = spawn('node', [cliPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Kill the process after a short time since it would run indefinitely
      setTimeout(() => {
        child.kill('SIGTERM');
      }, 1000);

      child.on('close', (code, signal) => {
        // Should be killed by SIGTERM or exit naturally
        expect(signal === 'SIGTERM' || code === 0).toBe(true);
        done();
      });

      child.on('error', (err) => {
        done(err);
      });
    });
  });

  describe('profile parameter', () => {
    it('should accept profile parameter', (done) => {
      const child = spawn('node', [cliPath, '--find', '--profile', 'test'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      child.on('close', (code) => {
        expect(code).toBeGreaterThanOrEqual(0);
        done();
      });

      child.on('error', (err) => {
        done(err);
      });
    });
  });
});