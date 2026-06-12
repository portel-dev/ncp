/**
 * Sandboxed File System tests
 * Covers path confinement, traversal and absolute path rejection,
 * symlink escape prevention, and normal file operations.
 */

import { describe, it, expect, beforeEach, afterAll, beforeAll } from '@jest/globals';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createSandboxedFS, SandboxEscapeError, getWorkspacePath, WORKSPACE_DIR_NAME } from '../../src/code-mode/sandboxed-fs.js';

let baseDir: string;
let sandboxRoot: string;
let outsideDir: string;

beforeAll(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'ncp-sandboxed-fs-test-'));
});

beforeEach(() => {
  rmSync(join(baseDir, 'sandbox'), { recursive: true, force: true });
  rmSync(join(baseDir, 'outside'), { recursive: true, force: true });
  sandboxRoot = join(baseDir, 'sandbox');
  outsideDir = join(baseDir, 'outside');
  mkdirSync(sandboxRoot, { recursive: true });
  mkdirSync(outsideDir, { recursive: true });
  writeFileSync(join(outsideDir, 'secret.txt'), 'outside-secret');
});

afterAll(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

describe('SandboxedFS normal operations', () => {
  it('reads and writes files inside the sandbox', async () => {
    const sfs = createSandboxedFS(sandboxRoot);
    await sfs.writeFile('hello.txt', 'world');
    expect(await sfs.readFile('hello.txt', 'utf-8')).toBe('world');
  });

  it('creates parent directories on write', async () => {
    const sfs = createSandboxedFS(sandboxRoot);
    await sfs.writeFile('deeply/nested/dir/file.txt', 'data');
    expect(await sfs.exists('deeply/nested/dir/file.txt')).toBe(true);
  });

  it('supports readdir, stat, append, rename, copy, unlink', async () => {
    const sfs = createSandboxedFS(sandboxRoot);
    await sfs.writeFile('a.txt', 'one');
    await sfs.appendFile('a.txt', '-two');
    expect(await sfs.readFile('a.txt', 'utf-8')).toBe('one-two');

    await sfs.copyFile('a.txt', 'b.txt');
    await sfs.rename('a.txt', 'sub/c.txt');
    expect((await sfs.readdir('.')).sort()).toEqual(['b.txt', 'sub']);

    const stats = await sfs.stat('b.txt');
    expect(stats.isFile()).toBe(true);

    await sfs.unlink('b.txt');
    expect(await sfs.exists('b.txt')).toBe(false);
  });

  it('accepts absolute paths that stay inside the sandbox', async () => {
    const sfs = createSandboxedFS(sandboxRoot);
    await sfs.writeFile(join(sandboxRoot, 'abs.txt'), 'ok');
    expect(await sfs.readFile('abs.txt', 'utf-8')).toBe('ok');
  });
});

describe('SandboxedFS escape prevention', () => {
  it('blocks relative path traversal', async () => {
    const sfs = createSandboxedFS(sandboxRoot);
    await expect(sfs.readFile('../outside/secret.txt')).rejects.toThrow(SandboxEscapeError);
    await expect(sfs.writeFile('../escape.txt', 'x')).rejects.toThrow(SandboxEscapeError);
  });

  it('blocks deep traversal hidden mid-path', async () => {
    const sfs = createSandboxedFS(sandboxRoot);
    await expect(sfs.readFile('sub/../../outside/secret.txt')).rejects.toThrow(SandboxEscapeError);
  });

  it('blocks absolute paths outside the sandbox', async () => {
    const sfs = createSandboxedFS(sandboxRoot);
    await expect(sfs.readFile(join(outsideDir, 'secret.txt'))).rejects.toThrow(SandboxEscapeError);
    await expect(sfs.readFile('/etc/passwd')).rejects.toThrow(SandboxEscapeError);
  });

  it('blocks deletion outside the sandbox', async () => {
    const sfs = createSandboxedFS(sandboxRoot);
    await expect(sfs.rm('../outside', { recursive: true, force: true })).rejects.toThrow(SandboxEscapeError);
    await expect(sfs.unlink(join(outsideDir, 'secret.txt'))).rejects.toThrow(SandboxEscapeError);
  });

  it('blocks rename targeting outside the sandbox', async () => {
    const sfs = createSandboxedFS(sandboxRoot);
    await sfs.writeFile('inside.txt', 'data');
    await expect(sfs.rename('inside.txt', '../outside/stolen.txt')).rejects.toThrow(SandboxEscapeError);
  });

  it('exists() returns false for escaping paths instead of throwing', async () => {
    const sfs = createSandboxedFS(sandboxRoot);
    expect(await sfs.exists('../outside/secret.txt')).toBe(false);
  });
});

describe('SandboxedFS symlink escape prevention', () => {
  it('blocks reading through a symlinked file pointing outside', async () => {
    symlinkSync(join(outsideDir, 'secret.txt'), join(sandboxRoot, 'link.txt'));
    const sfs = createSandboxedFS(sandboxRoot);
    await expect(sfs.readFile('link.txt')).rejects.toThrow(SandboxEscapeError);
  });

  it('blocks operations through a symlinked directory pointing outside', async () => {
    symlinkSync(outsideDir, join(sandboxRoot, 'linkdir'), 'dir');
    const sfs = createSandboxedFS(sandboxRoot);
    await expect(sfs.readFile('linkdir/secret.txt')).rejects.toThrow(SandboxEscapeError);
    await expect(sfs.writeFile('linkdir/planted.txt', 'x')).rejects.toThrow(SandboxEscapeError);
    await expect(sfs.readdir('linkdir')).rejects.toThrow(SandboxEscapeError);
  });

  it('blocks writing a new file under a symlinked directory (non-existing tail)', async () => {
    symlinkSync(outsideDir, join(sandboxRoot, 'linkdir'), 'dir');
    const sfs = createSandboxedFS(sandboxRoot);
    await expect(sfs.writeFile('linkdir/new/nested.txt', 'x')).rejects.toThrow(SandboxEscapeError);
  });

  it('allows symlinks that stay inside the sandbox', async () => {
    const sfs = createSandboxedFS(sandboxRoot);
    await sfs.writeFile('real.txt', 'inside');
    symlinkSync(join(sandboxRoot, 'real.txt'), join(sandboxRoot, 'alias.txt'));
    expect(await sfs.readFile('alias.txt', 'utf-8')).toBe('inside');
  });

  it('blocks stream creation through escaping symlinks', async () => {
    symlinkSync(join(outsideDir, 'secret.txt'), join(sandboxRoot, 'link.txt'));
    const sfs = createSandboxedFS(sandboxRoot);
    expect(() => sfs.createReadStream('link.txt')).toThrow(SandboxEscapeError);
    expect(() => sfs.createWriteStream('link.txt')).toThrow(SandboxEscapeError);
  });
});

describe('SandboxedFS utilities', () => {
  it('getWorkspacePath helper appends the workspace dir name', () => {
    expect(getWorkspacePath('/home/user/.ncp')).toBe(join('/home/user/.ncp', WORKSPACE_DIR_NAME));
  });

  it('resolvePath returns resolved in-sandbox paths and rejects escapes', () => {
    const sfs = createSandboxedFS(sandboxRoot);
    expect(sfs.resolvePath('sub/file.txt').startsWith(sandboxRoot)).toBe(true);
    expect(() => sfs.resolvePath('../outside')).toThrow(SandboxEscapeError);
  });

  it('empty path resolves to the sandbox root', () => {
    const sfs = createSandboxedFS(sandboxRoot);
    expect(sfs.getWorkspacePath()).toBe(sandboxRoot);
    expect(sfs.resolvePath('')).toBe(sandboxRoot);
  });
});
