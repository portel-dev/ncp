import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DetailedTaskV2Schema,
  type DetailedTaskV2,
} from '@modelcontextprotocol/ext-tasks/core/v2';
import { getNcpBaseDirectory } from '../utils/ncp-paths.js';

export interface PersistedMcpTask {
  task: DetailedTaskV2;
  ownerHash: string;
  workerPid?: number;
  workerProcessToken?: string;
  inputSchemas: Record<string, Record<string, unknown>>;
  usedInputIds: string[];
  cancelRequested?: boolean;
}

/**
 * Profile-scoped durable storage for MCP Tasks handles and terminal results.
 * Each record is replaced atomically, so tasks/get never observes partial JSON.
 */
export class McpTaskStore {
  readonly directory: string;

  constructor(profileName: string, directory?: string) {
    const safeProfile = profileName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'default';
    const profileHash = createHash('sha256').update(profileName).digest('hex').slice(0, 16);
    this.directory = directory ?? join(getNcpBaseDirectory(), 'tasks', safeProfile + '-' + profileHash);
  }

  async initialize(): Promise<PersistedMcpTask[]> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    // POSIX modes do not configure Windows ACLs. On Windows the state directory
    // inherits the user's filesystem permissions, and directory handles cannot
    // be used for chmod/fsync through Node's ordinary file API.
    if (process.platform !== 'win32') await chmod(this.directory, 0o700);
    const records: PersistedMcpTask[] = [];
    for (const name of await readdir(this.directory)) {
      if (!name.endsWith('.json')) continue;
      const taskId = name.slice(0, -5);
      if (!/^[a-f0-9-]{36}$/i.test(taskId)) continue;
      try {
        const record = await this.read(taskId);
        if (record) records.push(record);
      } catch {
        // A malformed local file is not a recoverable task record.
        await this.remove(taskId);
      }
    }
    return records;
  }

  async read(taskId: string): Promise<PersistedMcpTask | undefined> {
    try {
      const contents = await readFile(this.filePath(taskId), 'utf8');
      const value: unknown = JSON.parse(contents);
      if (!isPersistedMcpTask(value) || value.task.taskId !== taskId) {
        throw new Error('Malformed persisted MCP task record');
      }
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  async create(record: PersistedMcpTask): Promise<void> {
    await this.write(record);
  }

  async write(record: PersistedMcpTask): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const target = this.filePath(record.task.taskId);
    const temporary = join(this.directory, `.${record.task.taskId}.${randomUUID()}.tmp`);
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify(record), 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, target);
      if (process.platform !== 'win32') {
        const directoryHandle = await open(this.directory, 'r');
        try {
          await directoryHandle.sync();
        } finally {
          await directoryHandle.close();
        }
      }
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
  }

  async remove(taskId: string): Promise<void> {
    await rm(this.filePath(taskId), { force: true });
  }

  private filePath(taskId: string): string {
    // IDs are random UUIDs internally, but still reject traversal at the store boundary.
    if (!/^[a-f0-9-]{36}$/i.test(taskId)) throw new Error('Invalid task ID');
    return join(this.directory, `${taskId}.json`);
  }
}

function isPersistedMcpTask(value: unknown): value is PersistedMcpTask {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (!DetailedTaskV2Schema.safeParse(record.task).success) return false;
  if (typeof record.ownerHash !== 'string' || !/^[a-f0-9]{64}$/.test(record.ownerHash)) return false;
  if (record.workerPid !== undefined && (!Number.isInteger(record.workerPid) || (record.workerPid as number) < 1)) return false;
  if (record.workerProcessToken !== undefined && typeof record.workerProcessToken !== 'string') return false;
  if (!record.inputSchemas || typeof record.inputSchemas !== 'object' || Array.isArray(record.inputSchemas)) return false;
  if (!record.usedInputIds || !Array.isArray(record.usedInputIds) || !record.usedInputIds.every((id) => typeof id === 'string')) return false;
  if (record.cancelRequested !== undefined && typeof record.cancelRequested !== 'boolean') return false;
  return true;
}
