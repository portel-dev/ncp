import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
let directory: string;
let failFileSync = false;
let rejectDirectoryOpen = false;
const open = jest.fn(async (...args: Parameters<typeof fs.open>) => {
  if (args[0] === directory && rejectDirectoryOpen) {
    throw Object.assign(new Error('Directory handles unsupported'), { code: 'EPERM' });
  }
  const handle = await fs.open(...args);
  if (failFileSync && args[0] !== directory) {
    handle.sync = async () => { throw Object.assign(new Error('Disk sync failed'), { code: 'EIO' }); };
  }
  return handle;
});

jest.unstable_mockModule('node:fs/promises', () => ({ ...fs, open }));
const { McpTaskStore } = await import('../src/server/mcp-task-store.js');

describe('MCP task storage portability and durability', () => {
  beforeEach(async () => {
    directory = await fs.mkdtemp(join(tmpdir(), 'ncp-task-store-'));
    failFileSync = false;
    rejectDirectoryOpen = false;
    open.mockClear();
  });

  afterEach(async () => {
    Object.defineProperty(process, 'platform', originalPlatform);
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('persists and recovers a task when Windows rejects directory handles', async () => {
    Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'win32' });
    rejectDirectoryOpen = true;
    const store = new McpTaskStore('windows', directory);
    await store.initialize();
    await store.create(record());
    expect(await store.initialize()).toEqual([record()]);
    expect(open.mock.calls.every(([path]) => path !== directory)).toBe(true);
  });

  it('never exposes a new task or leaves temporary files when file sync fails', async () => {
    const store = new McpTaskStore('sync-failure', directory);
    await store.initialize();
    failFileSync = true;
    await expect(store.create(record())).rejects.toThrow('Disk sync failed');
    expect(await store.read(record().task.taskId)).toBeUndefined();
    expect(await fs.readdir(directory)).toEqual([]);
  });
});

function record() {
  return {
    task: {
      taskId: '12345678-1234-4234-8234-123456789abc',
      status: 'working' as const,
      createdAt: '2026-10-19T00:00:00.000Z',
      lastUpdatedAt: '2026-10-19T00:00:00.000Z',
      ttlMs: 60_000,
    },
    ownerHash: 'a'.repeat(64),
    inputSchemas: {},
    usedInputIds: [],
  };
}
