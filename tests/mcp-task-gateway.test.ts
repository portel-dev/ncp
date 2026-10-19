import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/client';
import { jest } from '@jest/globals';
import { InMemoryTransport, ProtocolErrorCode, Server } from '@modelcontextprotocol/server';
import {
  GetTaskResultV2Schema,
  TASKS_EXTENSION_ID_V2,
} from '@modelcontextprotocol/ext-tasks/core/v2';
import { McpTaskGateway } from '../src/server/mcp-task-gateway.js';
import { McpTaskStore } from '../src/server/mcp-task-store.js';

const ACCEPT_ANY = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value: unknown) => ({ value }),
  },
};

describe('McpTaskGateway', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'ncp-mcp-tasks-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates a durable task handle through the real SDK wire handlers and returns terminal results', async () => {
    const gateway = new McpTaskGateway('profile-a', { directory: tempDir });
    const server = new Server(
      { name: 'ncp-test', version: '1.0.0' },
      { capabilities: { tools: {}, extensions: { [TASKS_EXTENSION_ID_V2]: {} } } },
    );
    const client = new Client({ name: 'tasks-test', version: '1.0.0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverWireResponses: any[] = [];
    const sendServerMessage = serverTransport.send.bind(serverTransport);
    (serverTransport as any).send = async (message: unknown, options?: unknown) => {
      serverWireResponses.push(structuredClone(message));
      return sendServerMessage(message as any, options as any);
    };
    gateway.registerHandlers(server, () => 'tasks-test@1.0.0');
    server.setRequestHandler(
      'tools/call',
      { params: ACCEPT_ANY as any, result: gateway.toolCallResultSchema as any },
      async (params: any) => gateway.call({
        ownerIdentity: 'tasks-test@1.0.0',
        clientSupportsTasks: true,
        execute: async () => ({ content: [{ type: 'text', text: 'finished' }] } as any),
      }),
    );

    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      const taskResponse = await client.request(
        {
          method: 'tools/call',
          params: { name: 'long-running', arguments: {} },
        } as any,
        ACCEPT_ANY as any,
      ) as any;
      expect(taskResponse).toMatchObject({ status: 'working' });
      expect(serverWireResponses.some((message) =>
        message.result?.taskId === taskResponse.taskId && message.result?.resultType === 'task',
      )).toBe(true);

      const persisted = await gateway.getTask(taskResponse.taskId, 'tasks-test@1.0.0');
      expect(GetTaskResultV2Schema.safeParse({ ...persisted, resultType: 'complete' }).success).toBe(true);
      const terminal = await waitForTask(gateway, taskResponse.taskId, 'tasks-test@1.0.0');
      expect(terminal).toMatchObject({
        status: 'completed',
        result: { resultType: 'complete', content: [{ type: 'text', text: 'finished' }] },
      });
      await expect(gateway.getTask(taskResponse.taskId, 'another-client@1.0.0')).rejects.toThrow('Unknown task');

      const restarted = new McpTaskGateway('profile-a', { directory: tempDir });
      expect(await restarted.getTask(taskResponse.taskId, 'tasks-test@1.0.0')).toMatchObject({
        status: 'completed',
        result: { content: [{ text: 'finished' }] },
      });
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }
  });

  it('persists input_required, validates input responses, and resumes the suspended operation', async () => {
    const gateway = new McpTaskGateway('profile-a', { directory: tempDir });
    let resumed = false;
    const created = await gateway.call({
      ownerIdentity: 'input-client@1',
      clientSupportsTasks: true,
      execute: async ({ userInputProvider }) => {
        const answer = await userInputProvider.requestInput({
          message: 'Continue?',
          requestedSchema: {
            type: 'object',
            properties: { approved: { type: 'boolean' } },
            required: ['approved'],
          },
        });
        resumed = answer.action === 'accept' && answer.content?.approved === true;
        return { content: [{ type: 'text', text: String(resumed) }] } as any;
      },
    }) as any;
    const waiting = await waitForStatus(gateway, created.taskId, 'input-client@1', 'input_required');
    expect(Object.keys(waiting.inputRequests!)).toEqual([expect.stringMatching(/^input_[a-f0-9-]+$/)]);
    const inputId = Object.keys(waiting.inputRequests!)[0];
    const live = gateway as any;
    await expect(live.updateTask(created.taskId, 'input-client@1', {
      [inputId]: { action: 'accept', content: { approved: 'yes' } },
    })).rejects.toThrow('does not match the requested schema');

    await gateway.updateTask(created.taskId, 'input-client@1', {
      [inputId]: { action: 'accept', content: { approved: true } },
    });
    const terminal = await waitForTask(gateway, created.taskId, 'input-client@1');
    expect(resumed).toBe(true);
    expect(terminal).toMatchObject({
      status: 'completed',
      result: { content: [{ text: 'true' }] },
    });
  });

  it('records cooperative cancellation intent without claiming an uncooperative worker stopped', async () => {
    const gateway = new McpTaskGateway('profile-a', { directory: tempDir });
    let finish!: () => void;
    const running = new Promise<void>((resolve) => { finish = resolve; });
    const created = await gateway.call({
      ownerIdentity: 'cancel-client@1',
      clientSupportsTasks: true,
      execute: async () => {
        await running;
        return { content: [{ type: 'text', text: 'eventual result' }] } as any;
      },
    }) as any;

    await gateway.cancelTask(created.taskId, 'cancel-client@1');
    expect(await gateway.getTask(created.taskId, 'cancel-client@1')).toMatchObject({
      status: 'working',
      statusMessage: 'Cancellation requested; waiting for the worker to finish.',
    });
    finish();
    expect(await waitForTask(gateway, created.taskId, 'cancel-client@1')).toMatchObject({
      status: 'completed',
      result: { content: [{ text: 'eventual result' }] },
    });
  });

  it('converts in-progress work to an explicit restart failure without replaying it', async () => {
    const gateway = new McpTaskGateway('profile-a', { directory: tempDir });
    let invoked = 0;
    let leaveRunning!: () => void;
    const held = new Promise<void>((resolve) => { leaveRunning = resolve; });
    const created = await gateway.call({
      ownerIdentity: 'restart-client@1',
      clientSupportsTasks: true,
      execute: async () => {
        invoked += 1;
        await held;
        return { content: [{ type: 'text', text: 'late' }] } as any;
      },
    }) as any;

    const restarted = new McpTaskGateway('profile-a', {
      directory: tempDir,
      workerProcessAlive: () => false,
    });
    const recovered = await restarted.getTask(created.taskId, 'restart-client@1');
    expect(recovered).toMatchObject({
      status: 'failed',
      error: { code: -32000, message: expect.stringContaining('server restart') },
    });
    expect(invoked).toBe(1);
    leaveRunning();
    await waitForTask(gateway, created.taskId, 'restart-client@1');
  });

  it('serializes concurrent startup recovery through one initialization pass', async () => {
    const gateway = new McpTaskGateway('profile-a', { directory: tempDir });
    const initialize = jest.spyOn(McpTaskStore.prototype, 'initialize');
    try {
      await Promise.all([gateway.initialize(), gateway.initialize(), gateway.initialize()]);
      expect(initialize).toHaveBeenCalledTimes(1);
    } finally {
      initialize.mockRestore();
    }
  });

  it('rejects suspended inputs on shutdown and leaves recovery to mark work interrupted', async () => {
    const gateway = new McpTaskGateway('profile-a', { directory: tempDir });
    let inputRejected!: Promise<boolean>;
    let finishExecution!: () => void;
    const executionFinished = new Promise<void>((resolve) => { finishExecution = resolve; });
    const created = await gateway.call({
      ownerIdentity: 'shutdown-client@1',
      clientSupportsTasks: true,
      execute: async ({ userInputProvider }) => {
        try {
          await userInputProvider.requestInput({
            message: 'Continue?',
            requestedSchema: { type: 'object', properties: {} },
          });
          inputRejected = Promise.resolve(false);
        } catch {
          inputRejected = Promise.resolve(true);
        } finally {
          finishExecution();
        }
        return { content: [{ type: 'text', text: 'late' }] } as any;
      },
    }) as any;
    await waitForStatus(gateway, created.taskId, 'shutdown-client@1', 'input_required');

    await gateway.shutdown();
    await executionFinished;
    expect(await inputRejected).toBe(true);
    const persisted = await new McpTaskStore('profile-a', tempDir).read(created.taskId);
    expect(persisted?.task.status).toBe('input_required');

    const restarted = new McpTaskGateway('profile-a', {
      directory: tempDir,
      workerProcessAlive: () => false,
    });
    expect(await restarted.getTask(created.taskId, 'shutdown-client@1')).toMatchObject({
      status: 'failed',
      error: { message: expect.stringContaining('server restart') },
    });
  });

  it('expires suspended tasks, rejects pending input, and cannot recreate the expired record', async () => {
    // Storage flushes on a busy runner may exceed a short TTL. Freeze the
    // clock during setup, then advance it only once input is durably suspended.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'performance'] });
    const gateway = new McpTaskGateway('profile-a', { directory: tempDir, ttlMs: 200 });
    try {
      let executionFinished!: () => void;
      const finished = new Promise<void>((resolve) => { executionFinished = resolve; });
      const created = await gateway.call({
        ownerIdentity: 'expiry-client@1',
        clientSupportsTasks: true,
        execute: async ({ userInputProvider }) => {
          try {
            await userInputProvider.requestInput({ message: 'Continue?', requestedSchema: { type: 'object', properties: {} } });
          } catch {
            executionFinished();
          }
          return { content: [{ type: 'text', text: 'late' }] } as any;
        },
      }) as any;
      await waitForStatus(gateway, created.taskId, 'expiry-client@1', 'input_required');
      await jest.advanceTimersByTimeAsync(250);
      await finished;
      await expect(gateway.getTask(created.taskId, 'expiry-client@1')).rejects.toMatchObject({
        code: ProtocolErrorCode.InvalidParams,
      });
      await delay(20);
      expect(await new McpTaskStore('profile-a', tempDir).read(created.taskId)).toBeUndefined();
    } finally {
      await gateway.shutdown();
      jest.useRealTimers();
    }
  });

  it('discards malformed records and keeps punctuation-distinct profiles separate', async () => {
    const id = 'e95c5b20-c6d0-4f6d-95cf-0f6c3fdab815';
    await writeFile(path.join(tempDir, id + '.json'), JSON.stringify({
      task: { taskId: id, status: 'working' },
      ownerHash: 'not-a-hash',
      inputSchemas: {},
      usedInputIds: [],
    }));
    await writeFile(path.join(tempDir, 'notes.json'), '{}');
    const store = new McpTaskStore('profile', tempDir);
    await store.initialize();
    expect(await readdir(tempDir)).toEqual(['notes.json']);

    const colonProfile = new McpTaskStore('team:alpha').directory;
    const underscoreProfile = new McpTaskStore('team_alpha').directory;
    expect(colonProfile).not.toBe(underscoreProfile);
  });
});

async function waitForStatus(
  gateway: McpTaskGateway,
  taskId: string,
  owner: string,
  status: string,
): Promise<any> {
  const deadline = performance.now() + 2_000;
  while (performance.now() < deadline) {
    const task = await gateway.getTask(taskId, owner) as any;
    if (task.status === status) return task;
    await delay(5);
  }
  throw new Error('Task did not reach status ' + status);
}

async function waitForTask(gateway: McpTaskGateway, taskId: string, owner: string): Promise<any> {
  const deadline = performance.now() + 2_000;
  while (performance.now() < deadline) {
    const task = await gateway.getTask(taskId, owner) as any;
    if (['completed', 'failed', 'cancelled'].includes(task.status)) return task;
    await delay(5);
  }
  throw new Error('Task did not complete');
}
