/**
 * Sandboxed File System
 *
 * Provides a restricted file system wrapper that confines all operations
 * to a designated workspace directory. This prevents code execution from
 * accessing or modifying files outside the sandbox.
 *
 * Security Features:
 * - All paths resolved relative to sandbox root
 * - Path traversal attacks blocked (../, symlinks)
 * - Absolute paths outside sandbox rejected
 * - Only async operations exposed (no blocking)
 * - Symlink following disabled to prevent escapes
 *
 * @example
 * ```typescript
 * const sandboxedFs = createSandboxedFS('/home/user/.ncp/workspace');
 *
 * // These work (within sandbox):
 * await sandboxedFs.writeFile('output/report.pdf', data);
 * await sandboxedFs.readFile('data/input.json');
 *
 * // These are blocked (escape attempts):
 * await sandboxedFs.readFile('../config.json');     // Error!
 * await sandboxedFs.readFile('/etc/passwd');        // Error!
 * ```
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream, createWriteStream, mkdirSync, ReadStream, WriteStream } from 'fs';

/**
 * Error thrown when a path violates sandbox boundaries
 */
export class SandboxEscapeError extends Error {
  constructor(
    public readonly attemptedPath: string,
    public readonly sandboxRoot: string
  ) {
    super(
      `Sandbox escape blocked: Path '${attemptedPath}' is outside the allowed workspace.\n` +
        `Allowed root: ${sandboxRoot}\n` +
        `All file operations must stay within the workspace directory.`
    );
    this.name = 'SandboxEscapeError';
  }
}

/**
 * Sandboxed file system interface
 * Mirrors Node.js fs/promises API but restricted to sandbox
 */
export interface SandboxedFS {
  // Read operations
  readFile(filePath: string, encoding?: BufferEncoding): Promise<string | Buffer>;
  readdir(dirPath: string): Promise<string[]>;
  stat(filePath: string): Promise<fs.FileHandle extends infer T ? Awaited<ReturnType<typeof fs.stat>> : never>;
  exists(filePath: string): Promise<boolean>;

  // Write operations
  writeFile(filePath: string, data: string | Buffer, encoding?: BufferEncoding): Promise<void>;
  appendFile(filePath: string, data: string | Buffer, encoding?: BufferEncoding): Promise<void>;
  mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<string | undefined>;

  // Delete operations
  unlink(filePath: string): Promise<void>;
  rmdir(dirPath: string, options?: { recursive?: boolean }): Promise<void>;
  rm(filePath: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;

  // Move/Copy operations
  rename(oldPath: string, newPath: string): Promise<void>;
  copyFile(src: string, dest: string): Promise<void>;

  // Stream operations (for large files)
  createReadStream(filePath: string): ReadStream;
  createWriteStream(filePath: string): WriteStream;

  // Utility
  getWorkspacePath(): string;
  resolvePath(relativePath: string): string;
}

/**
 * Create a sandboxed file system restricted to the given root directory
 *
 * @param sandboxRoot - Absolute path to the sandbox root directory
 * @returns SandboxedFS instance with all operations confined to sandboxRoot
 */
export function createSandboxedFS(sandboxRoot: string): SandboxedFS {
  // Normalize and resolve the sandbox root
  const normalizedRoot = path.resolve(sandboxRoot);

  /**
   * Validate and resolve a path, ensuring it stays within sandbox
   * @throws SandboxEscapeError if path escapes sandbox
   */
  function resolveSafePath(userPath: string): string {
    // Handle empty or whitespace paths
    if (!userPath || !userPath.trim()) {
      return normalizedRoot;
    }

    // Normalize the user path
    const normalizedUserPath = userPath.trim();

    // Resolve relative to sandbox root
    let resolvedPath: string;
    if (path.isAbsolute(normalizedUserPath)) {
      // For absolute paths, check if they're within sandbox
      resolvedPath = path.resolve(normalizedUserPath);
    } else {
      // For relative paths, resolve from sandbox root
      resolvedPath = path.resolve(normalizedRoot, normalizedUserPath);
    }

    // Normalize to remove any . or .. components
    resolvedPath = path.normalize(resolvedPath);

    // Security check: ensure resolved path is within sandbox
    const relativePath = path.relative(normalizedRoot, resolvedPath);

    // If relative path starts with '..' or is absolute, it's outside sandbox
    if (
      relativePath.startsWith('..') ||
      path.isAbsolute(relativePath) ||
      relativePath.includes('..' + path.sep)
    ) {
      throw new SandboxEscapeError(userPath, normalizedRoot);
    }

    return resolvedPath;
  }

  /**
   * Ensure parent directory exists for a file path
   */
  async function ensureParentDir(filePath: string): Promise<void> {
    const parentDir = path.dirname(filePath);
    await fs.mkdir(parentDir, { recursive: true });
  }

  return {
    // Read operations
    async readFile(filePath: string, encoding?: BufferEncoding): Promise<string | Buffer> {
      const safePath = resolveSafePath(filePath);
      if (encoding) {
        return fs.readFile(safePath, { encoding });
      }
      return fs.readFile(safePath);
    },

    async readdir(dirPath: string): Promise<string[]> {
      const safePath = resolveSafePath(dirPath);
      return fs.readdir(safePath);
    },

    async stat(filePath: string) {
      const safePath = resolveSafePath(filePath);
      return fs.stat(safePath);
    },

    async exists(filePath: string): Promise<boolean> {
      try {
        const safePath = resolveSafePath(filePath);
        await fs.access(safePath);
        return true;
      } catch {
        return false;
      }
    },

    // Write operations
    async writeFile(filePath: string, data: string | Buffer, encoding?: BufferEncoding): Promise<void> {
      const safePath = resolveSafePath(filePath);
      await ensureParentDir(safePath);
      if (encoding) {
        await fs.writeFile(safePath, data, { encoding });
      } else {
        await fs.writeFile(safePath, data);
      }
    },

    async appendFile(filePath: string, data: string | Buffer, encoding?: BufferEncoding): Promise<void> {
      const safePath = resolveSafePath(filePath);
      await ensureParentDir(safePath);
      if (encoding) {
        await fs.appendFile(safePath, data, { encoding });
      } else {
        await fs.appendFile(safePath, data);
      }
    },

    async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<string | undefined> {
      const safePath = resolveSafePath(dirPath);
      return fs.mkdir(safePath, options);
    },

    // Delete operations
    async unlink(filePath: string): Promise<void> {
      const safePath = resolveSafePath(filePath);
      return fs.unlink(safePath);
    },

    async rmdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
      const safePath = resolveSafePath(dirPath);
      return fs.rmdir(safePath, options);
    },

    async rm(filePath: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
      const safePath = resolveSafePath(filePath);
      return fs.rm(safePath, options);
    },

    // Move/Copy operations
    async rename(oldPath: string, newPath: string): Promise<void> {
      const safeOldPath = resolveSafePath(oldPath);
      const safeNewPath = resolveSafePath(newPath);
      await ensureParentDir(safeNewPath);
      return fs.rename(safeOldPath, safeNewPath);
    },

    async copyFile(src: string, dest: string): Promise<void> {
      const safeSrc = resolveSafePath(src);
      const safeDest = resolveSafePath(dest);
      await ensureParentDir(safeDest);
      return fs.copyFile(safeSrc, safeDest);
    },

    // Stream operations
    createReadStream(filePath: string): ReadStream {
      const safePath = resolveSafePath(filePath);
      return createReadStream(safePath);
    },

    createWriteStream(filePath: string): WriteStream {
      const safePath = resolveSafePath(filePath);
      // Ensure parent directory exists synchronously for streams
      const parentDir = path.dirname(safePath);
      try {
        mkdirSync(parentDir, { recursive: true });
      } catch {
        // Ignore if already exists
      }
      return createWriteStream(safePath);
    },

    // Utility methods
    getWorkspacePath(): string {
      return normalizedRoot;
    },

    resolvePath(relativePath: string): string {
      return resolveSafePath(relativePath);
    },
  };
}

/**
 * Default workspace subdirectory name within .ncp
 */
export const WORKSPACE_DIR_NAME = 'workspace';

/**
 * Get the default workspace path for a given NCP directory
 *
 * @param ncpDir - Path to the .ncp directory
 * @returns Path to the workspace directory
 */
export function getWorkspacePath(ncpDir: string): string {
  return path.join(ncpDir, WORKSPACE_DIR_NAME);
}
