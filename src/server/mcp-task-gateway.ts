import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { ProtocolError, ProtocolErrorCode, type Server, type StandardSchemaV1Sync } from '@modelcontextprotocol/server';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';
import { logger } from '../utils/logger.js';
import {
  CallToolResultV2Schema,
  CancelTaskRequestV2Schema,
  CancelTaskResultV2Schema,
  CreateTaskResultV2Schema,
  ElicitResultV2Schema,
  GetTaskRequestV2Schema,
  GetTaskResultV2Schema,
  TASKS_EXTENSION_ID_V2,
  UpdateTaskRequestV2Schema,
  UpdateTaskResultV2Schema,
  hasTaskClientCapabilityV2,
  type CreateTaskResultV2,
  type CallToolResultV2,
  type DetailedTaskV2,
  type InputRequiredTaskV2,
  type InputResponsesV2,
  type InputResponseV2,
  type TaskV2,
} from '@modelcontextprotocol/ext-tasks/core/v2';
import type { CallToolResult } from '@modelcontextprotocol/client';
import type { UserInputProvider, UserInputRequest } from '../utils/elicitation-helper.js';
import { McpTaskStore, type PersistedMcpTask } from './mcp-task-store.js';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const INTERRUPTED_ERROR_CODE = -32000;
const PROCESS_START_TOKEN = randomUUID();

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface PendingTaskInput {
  request: UserInputRequest;
  response: Deferred<Awaited<ReturnType<UserInputProvider['requestInput']>>>;
}

interface LiveTask {
  record: PersistedMcpTask;
  pending: Map<string, PendingTaskInput>;
  abortController: AbortController;
  canCancel: boolean;
  expired?: boolean;
  writes: Promise<void>;
  expiryTimer?: NodeJS.Timeout;
}

export interface McpTaskExecutionContext {
  taskId: string;
  signal: AbortSignal;
  userInputProvider: UserInputProvider;
}

export interface McpTaskCallOptions {
  ownerIdentity: string;
  /** Set from this request's client capability envelope before the SDK strips metadata. */
  clientSupportsTasks?: boolean;
  /** Optional original tools/call params for callers that still have the envelope. */
  requestParams?: unknown;
  execute(context: McpTaskExecutionContext): Promise<CallToolResult>;
  /** Set only when aborting the signal is known to stop the underlying work. */
  canCancel?: boolean;
  statusMessage?: string;
}

/**
 * Adapter for the MCP Tasks extension 2026-07-28 (V2) wire format.
 * The extension package's receiver helper handles the 2025 flow; V2 exposes
 * authoritative schemas and types, which this gateway binds as custom methods.
 * Executable code is never persisted or replayed after a process restart.
 */
export class McpTaskGateway implements UserInputProvider {
  private readonly store: McpTaskStore;
  private readonly validator = new AjvJsonSchemaValidator();
  private readonly taskContext = new AsyncLocalStorage<{ taskId: string; ownerHash: string }>();
  private readonly liveTasks = new Map<string, LiveTask>();
  private fallbackInputProvider?: UserInputProvider;
  private initialized = false;
  private initializationPromise?: Promise<void>;
  private shuttingDown = false;
  private readonly ttlMs: number;
  private readonly pollIntervalMs: number;
  private readonly workerProcessAlive: (pid: number) => boolean;

  constructor(
    profileName: string,
    options: {
      directory?: string;
      ttlMs?: number;
      pollIntervalMs?: number;
      workerProcessAlive?: (pid: number) => boolean;
    } = {},
  ) {
    this.store = new McpTaskStore(profileName, options.directory);
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.workerProcessAlive = options.workerProcessAlive ?? isProcessAlive;
  }

  /** Route inline calls through NCP's established input coordinator. */
  setFallbackInputProvider(provider: UserInputProvider): void {
    this.fallbackInputProvider = provider;
  }

  /** Schema to use for the shared low-level tools/call handler. */
  get toolCallResultSchema(): StandardSchemaV1Sync<unknown, CallToolResultV2 | CreateTaskResultV2> {
    // The extension currently bundles a newer patch of Zod than server@2.0;
    // both implement Standard Schema V1, though TypeScript sees separate copies.
    return CallToolResultV2Schema.or(CreateTaskResultV2Schema) as unknown as StandardSchemaV1Sync<
      unknown,
      CallToolResultV2 | CreateTaskResultV2
    >;
  }

  isTaskInputActive(): boolean {
    return this.taskContext.getStore() !== undefined;
  }

  /** Restore durable records and mark work lost with the process as failed. */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializationPromise) return this.initializationPromise;
    this.initializationPromise = this.restoreRecords().catch((error) => {
      this.initializationPromise = undefined;
      throw error;
    });
    return this.initializationPromise;
  }

  private async restoreRecords(): Promise<void> {
    const records = await this.store.initialize();
    const now = Date.now();
    for (const record of records) {
      if (this.isExpired(record.task, now)) {
        await this.store.remove(record.task.taskId);
        continue;
      }
      if (record.task.status === 'working' || record.task.status === 'input_required') {
        // Another NCP process may be using the same profile directory. Keep its
        // live task readable and let its worker finish; never mislabel it as a
        // restart merely because this process opened the profile.
        if (
          record.workerPid !== undefined &&
          this.workerProcessAlive(record.workerPid) &&
          !(record.workerPid === process.pid && record.workerProcessToken !== PROCESS_START_TOKEN)
        ) continue;
        record.task = {
          ...this.baseTask(record.task),
          status: 'failed',
          error: {
            code: INTERRUPTED_ERROR_CODE,
            message: 'Task execution was interrupted by a server restart and was not replayed.',
          },
        };
        record.inputSchemas = {};
        await this.store.write(record);
      }
    }
    this.initialized = true;
  }

  /**
   * Keep pending records durable for startup recovery. A process shutdown does
   * not imply that arbitrary workers honored an abort signal; the next process
   * marks any surviving working/input_required record failed as interrupted.
   */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    this.fallbackInputProvider = undefined;
    await this.initializationPromise?.catch(() => undefined);
    const liveTasks = [...this.liveTasks.values()];
    for (const live of liveTasks) {
      if (live.expiryTimer) clearTimeout(live.expiryTimer);
      if (live.canCancel) live.abortController.abort(new Error('MCP server is shutting down'));
      for (const pending of live.pending.values()) {
        pending.response.reject(new Error('MCP server shut down before task input was received'));
      }
      live.pending.clear();
    }
    await Promise.all(liveTasks.map((live) => live.writes.catch(() => undefined)));
    this.liveTasks.clear();
  }

  /** Bind the Tasks V2 lifecycle methods with the official extension schemas. */
  registerHandlers(
    server: Pick<Server, 'setRequestHandler'>,
    ownerForRequest: (ctx: unknown) => string,
  ): void {
    server.setRequestHandler(
      'tasks/get',
      { params: GetTaskRequestV2Schema.shape.params, result: GetTaskResultV2Schema },
      async ({ taskId }, ctx) => this.getTask(taskId, ownerForRequest(ctx)),
    );
    server.setRequestHandler(
      'tasks/update',
      { params: UpdateTaskRequestV2Schema.shape.params, result: UpdateTaskResultV2Schema },
      async ({ taskId, inputResponses }, ctx) => {
        await this.updateTask(taskId, ownerForRequest(ctx), inputResponses);
        return { resultType: 'complete' as const };
      },
    );
    server.setRequestHandler(
      'tasks/cancel',
      { params: CancelTaskRequestV2Schema.shape.params, result: CancelTaskResultV2Schema },
      async ({ taskId }, ctx) => {
        await this.cancelTask(taskId, ownerForRequest(ctx));
        return { resultType: 'complete' as const };
      },
    );
  }

  /**
   * Wrap an eligible tools/call. Calls without declared Tasks support stay
   * synchronous and retain their ordinary result shape.
   */
  async call(options: McpTaskCallOptions): Promise<CallToolResult | CreateTaskResultV2> {
    await this.initialize();
    if (this.shuttingDown) {
      throw new ProtocolError(ProtocolErrorCode.InvalidRequest, 'MCP task gateway is shutting down');
    }
    if (!options.ownerIdentity.trim()) {
      throw new ProtocolError(ProtocolErrorCode.InvalidRequest, 'Client identity is required for task-backed calls');
    }
    if (!(options.clientSupportsTasks ?? hasTaskClientCapabilityV2(options.requestParams))) {
      return options.execute({
        taskId: '',
        signal: new AbortController().signal,
        userInputProvider: this,
      });
    }

    const ownerHash = this.ownerHash(options.ownerIdentity);
    const taskId = randomUUID();
    const now = new Date().toISOString();
    const task: TaskV2 = {
      taskId,
      status: 'working',
      statusMessage: options.statusMessage ?? 'The operation is now in progress.',
      createdAt: now,
      lastUpdatedAt: now,
      ttlMs: this.ttlMs,
      pollIntervalMs: this.pollIntervalMs,
    };
    const record: PersistedMcpTask = {
      task: task as DetailedTaskV2,
      ownerHash,
      workerPid: process.pid,
      workerProcessToken: PROCESS_START_TOKEN,
      inputSchemas: {},
      usedInputIds: [],
    };
    // The handle is returned only after a durable record is available to getTask.
    await this.store.create(record);
    const live: LiveTask = {
      record,
      pending: new Map(),
      abortController: new AbortController(),
      canCancel: options.canCancel === true,
      writes: Promise.resolve(),
    };
    this.liveTasks.set(taskId, live);
    this.scheduleExpiry(live);
    void this.run(live, options.execute).catch((error) => {
      logger.error('Unexpected MCP task worker failure', error);
    });
    return CreateTaskResultV2Schema.parse({ ...task, resultType: 'task' });
  }

  async getTask(taskId: string, ownerIdentity: string): Promise<DetailedTaskV2 & { resultType: 'complete' }> {
    await this.initialize();
    const record = await this.readOwned(taskId, ownerIdentity);
    if (this.isExpired(record.task)) {
      const live = this.liveTasks.get(taskId);
      await this.expireTask(taskId, live);
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Unknown or expired task');
    }
    return GetTaskResultV2Schema.parse({ ...record.task, resultType: 'complete' });
  }

  async updateTask(taskId: string, ownerIdentity: string, inputResponses: InputResponsesV2): Promise<void> {
    await this.initialize();
    const live = this.liveTasks.get(taskId);
    const record = await this.readOwned(taskId, ownerIdentity);
    if (this.isExpired(record.task)) {
      await this.expireTask(taskId, live);
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Unknown or expired task');
    }
    if (!live) {
      if (record.task.status === 'working' || record.task.status === 'input_required') {
        throw new ProtocolError(ProtocolErrorCode.InvalidRequest, 'Task worker is active in another NCP process');
      }
      return;
    }
    if (record.task.status !== 'input_required') return;

    const accepted = new Map<string, Awaited<ReturnType<UserInputProvider['requestInput']>>>();
    for (const [inputId, rawResponse] of Object.entries(inputResponses)) {
      const pending = live.pending.get(inputId);
      if (!pending) continue;
      accepted.set(inputId, this.validateInputResponse(rawResponse, pending.request));
    }
    for (const [inputId, response] of accepted) {
      const pending = live.pending.get(inputId)!;
      live.pending.delete(inputId);
      delete live.record.inputSchemas[inputId];
      pending.response.resolve(response);
    }
    if (live.pending.size === 0) {
      live.record.task = {
        ...this.baseTask(live.record.task),
        status: 'working',
        statusMessage: 'Input received; work resumed.',
      };
    } else {
      live.record.task = {
        ...live.record.task,
        inputRequests: Object.fromEntries(
          [...live.pending.entries()].map(([id, input]) => [id, this.inputRequest(input.request)]),
        ),
        lastUpdatedAt: new Date().toISOString(),
      } as InputRequiredTaskV2;
    }
    await this.persist(live);
  }

  async cancelTask(taskId: string, ownerIdentity: string): Promise<void> {
    await this.initialize();
    const record = await this.readOwned(taskId, ownerIdentity);
    const live = this.liveTasks.get(taskId);
    if (this.isExpired(record.task)) {
      await this.expireTask(taskId, live);
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Unknown or expired task');
    }
    if (['completed', 'failed', 'cancelled'].includes(record.task.status)) return;
    if (!live) {
      if (record.task.status === 'working' || record.task.status === 'input_required') {
        throw new ProtocolError(ProtocolErrorCode.InvalidRequest, 'Task worker is active in another NCP process');
      }
      return;
    }
    live.record.cancelRequested = true;
    live.record.task = {
      ...live.record.task,
      statusMessage: live.canCancel
        ? 'Cancellation requested; the worker is stopping cooperatively.'
        : 'Cancellation requested; waiting for the worker to finish.',
      lastUpdatedAt: new Date().toISOString(),
    } as DetailedTaskV2;
    if (live.canCancel) {
      live.abortController.abort(new Error('MCP task cancellation requested'));
      for (const pending of live.pending.values()) pending.response.reject(new Error('MCP task cancellation requested'));
      live.pending.clear();
    }
    await this.persist(live);
  }

  /** UserInputProvider entrypoint for deeply nested orchestrator calls. */
  async requestInput(request: UserInputRequest): Promise<Awaited<ReturnType<UserInputProvider['requestInput']>>> {
    if (this.shuttingDown) {
      throw new ProtocolError(ProtocolErrorCode.InvalidRequest, 'MCP task gateway is shutting down');
    }
    const context = this.taskContext.getStore();
    if (!context) {
      if (this.fallbackInputProvider) return this.fallbackInputProvider.requestInput(request);
      throw new ProtocolError(
        ProtocolErrorCode.InvalidRequest,
        'Task input can only be requested while running a task-backed tools/call',
      );
    }
    const live = this.liveTasks.get(context.taskId);
    if (!live || live.record.ownerHash !== context.ownerHash) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Task is no longer active');
    }
    if (live.abortController.signal.aborted) {
      throw live.abortController.signal.reason instanceof Error ? live.abortController.signal.reason : new Error('Task cancelled');
    }
    const inputId = 'input_' + randomUUID();
    const response = deferred<Awaited<ReturnType<UserInputProvider['requestInput']>>>();
    // Shutdown/cancel can race the requestInput continuation after persistence;
    // attach a handler now so early rejection is never reported as unhandled.
    void response.promise.catch(() => undefined);
    live.pending.set(inputId, { request, response });
    live.record.usedInputIds.push(inputId);
    live.record.inputSchemas[inputId] = request.requestedSchema;
    live.record.task = {
      ...this.baseTask(live.record.task),
      status: 'input_required',
      inputRequests: Object.fromEntries(
        [...live.pending.entries()].map(([id, input]) => [id, this.inputRequest(input.request)]),
      ),
    } as InputRequiredTaskV2;
    await this.persist(live);
    return response.promise;
  }

  async owns(taskId: string, ownerIdentity: string): Promise<boolean> {
    try {
      await this.readOwned(taskId, ownerIdentity);
      return true;
    } catch {
      return false;
    }
  }

  private async run(live: LiveTask, execute: McpTaskCallOptions['execute']): Promise<void> {
    const taskId = live.record.task.taskId;
    const context = {
      taskId,
      signal: live.abortController.signal,
      userInputProvider: { requestInput: (request: UserInputRequest) => this.requestInputForTask(live, request) },
    };
    try {
      const result = await this.taskContext.run(
        { taskId, ownerHash: live.record.ownerHash },
        () => execute(context),
      );
      const completeResult = CallToolResultV2Schema.parse({
        ...result,
        resultType: (result as Record<string, unknown>).resultType ?? 'complete',
      });
      live.record.task = {
        ...this.baseTask(live.record.task),
        status: 'completed',
        result: completeResult,
      } as DetailedTaskV2;
    } catch (error) {
      if (live.canCancel && live.abortController.signal.aborted) {
        live.record.task = { ...this.baseTask(live.record.task), status: 'cancelled' };
      } else {
        live.record.task = {
          ...this.baseTask(live.record.task),
          status: 'failed',
          error: this.toJsonRpcError(error),
        } as DetailedTaskV2;
      }
    } finally {
      for (const pending of live.pending.values()) {
        pending.response.reject(new Error('Task execution finished before input was received'));
      }
      live.pending.clear();
      live.record.inputSchemas = {};
      if (live.expiryTimer) clearTimeout(live.expiryTimer);
      if (live.expired) await this.store.remove(taskId);
      else if (!this.shuttingDown) await this.persist(live);
      this.liveTasks.delete(taskId);
    }
  }

  private requestInputForTask(
    live: LiveTask,
    request: UserInputRequest,
  ): Promise<Awaited<ReturnType<UserInputProvider['requestInput']>>> {
    const taskId = live.record.task.taskId;
    return this.taskContext.run(
      { taskId, ownerHash: live.record.ownerHash },
      () => this.requestInput(request),
    );
  }

  private inputRequest(request: UserInputRequest): Record<string, unknown> {
    return {
      method: 'elicitation/create',
      params: { mode: 'form', message: request.message, requestedSchema: request.requestedSchema },
    };
  }

  private validateInputResponse(
    rawResponse: InputResponseV2,
    request: UserInputRequest,
  ): Awaited<ReturnType<UserInputProvider['requestInput']>> {
    const parsed = ElicitResultV2Schema.safeParse(rawResponse);
    if (!parsed.success) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Task input response is not a valid elicitation response');
    }
    if (parsed.data.action === 'accept') {
      const result = this.validator.getValidator<Record<string, unknown>>(request.requestedSchema)(parsed.data.content ?? {});
      if (!result.valid) {
        throw new ProtocolError(
          ProtocolErrorCode.InvalidParams,
          'Task input does not match the requested schema: ' + result.errorMessage,
        );
      }
      return { action: 'accept', content: result.data };
    }
    return { action: parsed.data.action, ...(parsed.data.content && { content: parsed.data.content }) };
  }

  private async readOwned(taskId: string, ownerIdentity: string): Promise<PersistedMcpTask> {
    const record = await this.store.read(taskId);
    if (!record || record.ownerHash !== this.ownerHash(ownerIdentity)) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Unknown task');
    }
    return record;
  }

  private scheduleExpiry(live: LiveTask): void {
    const task = live.record.task;
    if (task.ttlMs === null) return;
    const expiresAt = Date.parse(task.createdAt) + task.ttlMs;
    const schedule = (): void => {
      if (this.shuttingDown || live.expired || this.liveTasks.get(task.taskId) !== live) return;
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        void this.expireTask(task.taskId, live).catch((error) => {
          logger.error('Failed to expire MCP task', error);
        });
        return;
      }
      live.expiryTimer = setTimeout(schedule, Math.min(remaining, 2_147_483_647));
      live.expiryTimer.unref();
    };
    schedule();
  }

  private async expireTask(taskId: string, live?: LiveTask): Promise<void> {
    if (live) {
      live.expired = true;
      if (live.expiryTimer) clearTimeout(live.expiryTimer);
      if (live.canCancel) live.abortController.abort(new Error('MCP task expired'));
      for (const pending of live.pending.values()) pending.response.reject(new Error('MCP task expired'));
      live.pending.clear();
      live.record.inputSchemas = {};
      await live.writes.catch(() => undefined);
    }
    await this.store.remove(taskId);
    if (live && this.liveTasks.get(taskId) === live) this.liveTasks.delete(taskId);
  }

  private ownerHash(ownerIdentity: string): string {
    return createHash('sha256').update(ownerIdentity).digest('hex');
  }

  private async persist(live: LiveTask): Promise<void> {
    if (this.shuttingDown || live.expired) return live.writes;
    live.record.task = { ...live.record.task, lastUpdatedAt: new Date().toISOString() } as DetailedTaskV2;
    live.writes = live.writes.catch(() => undefined).then(() => this.store.write(live.record));
    return live.writes;
  }

  private baseTask(task: DetailedTaskV2): TaskV2 {
    return {
      taskId: task.taskId,
      status: task.status,
      createdAt: task.createdAt,
      lastUpdatedAt: new Date().toISOString(),
      ttlMs: task.ttlMs,
      ...(task.pollIntervalMs !== undefined && { pollIntervalMs: task.pollIntervalMs }),
    };
  }

  private isExpired(task: TaskV2, now = Date.now()): boolean {
    return task.ttlMs !== null && now >= Date.parse(task.createdAt) + task.ttlMs;
  }

  private toJsonRpcError(error: unknown): { code: number; message: string; data?: unknown } {
    const candidate = error as { code?: unknown; message?: unknown; data?: unknown } | null;
    return {
      code: typeof candidate?.code === 'number' ? candidate.code : -32603,
      message: typeof candidate?.message === 'string' ? candidate.message : String(error),
      ...(candidate?.data !== undefined && { data: candidate.data }),
    };
  }
}

export { TASKS_EXTENSION_ID_V2, hasTaskClientCapabilityV2 };

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}
