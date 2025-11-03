/**
 * Shell MicroMCP - Command-Line Execution
 *
 * Provides basic shell command execution capabilities.
 * Enable with: NCP_ENABLE_SHELL=true
 *
 * Use with CLI discovery (NCP_CLI_AUTOSCAN=true) to get enhanced
 * tool suggestions based on available system commands.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default class ShellMCP {
  name = 'shell';
  description = 'Execute shell commands and scripts';

  /**
   * Check if this MCP should be loaded based on environment
   */
  async shouldLoad(): Promise<boolean> {
    return process.env.NCP_ENABLE_SHELL === 'true';
  }

  /**
   * Execute a shell command
   */
  async execute(params: {
    command: string;
    cwd?: string;
    timeout?: number;
    env?: Record<string, string>;
  }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const { command, cwd, timeout = 30000, env } = params;

    if (!command || command.trim().length === 0) {
      throw new Error('Command cannot be empty');
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: cwd || process.cwd(),
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        env: env ? { ...process.env, ...env } : process.env
      });

      return {
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: 0
      };
    } catch (error: any) {
      // Command failed but may have output
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code || 1
      };
    }
  }

  /**
   * Run a command and return only stdout (convenience method)
   */
  async run(params: {
    command: string;
    cwd?: string;
    timeout?: number;
  }): Promise<{ output: string }> {
    const result = await this.execute(params);
    return { output: result.stdout };
  }

  /**
   * Check if a command exists on the system
   */
  async which(params: {
    command: string;
  }): Promise<{ path: string | null; exists: boolean }> {
    const { command } = params;

    try {
      const result = await execAsync(`which ${command}`, { timeout: 2000 });
      return {
        path: result.stdout.trim(),
        exists: true
      };
    } catch {
      return {
        path: null,
        exists: false
      };
    }
  }

  /**
   * Get environment variable value
   */
  async getEnv(params: {
    variable: string;
  }): Promise<{ value: string | undefined }> {
    return {
      value: process.env[params.variable]
    };
  }

  /**
   * List files in a directory
   */
  async ls(params: {
    path?: string;
    all?: boolean;
    long?: boolean;
  }): Promise<{ output: string }> {
    const { path = '.', all = false, long = false } = params;

    let flags = '';
    if (all) flags += 'a';
    if (long) flags += 'l';

    const command = `ls ${flags ? '-' + flags : ''} ${path}`;
    const result = await this.execute({ command });

    return { output: result.stdout };
  }

  /**
   * Get current working directory
   */
  async pwd(): Promise<{ path: string }> {
    return { path: process.cwd() };
  }

  /**
   * Change directory and execute command
   */
  async cd(params: {
    path: string;
    command?: string;
  }): Promise<{ output: string; newPath: string }> {
    const { path, command } = params;

    if (command) {
      const result = await this.execute({ command, cwd: path });
      return {
        output: result.stdout,
        newPath: path
      };
    }

    return {
      output: '',
      newPath: path
    };
  }
}
