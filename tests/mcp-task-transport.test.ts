import {
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
  ProtocolErrorCode,
  type JSONRPCMessage,
  type Transport,
} from '@modelcontextprotocol/server';
import {
  CLIENT_CAPABILITIES_META_KEY_V2,
  TASKS_EXTENSION_ID_V2,
} from '@modelcontextprotocol/ext-tasks/core/v2';
import { mkdtemp, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { McpTaskGateway } from '../src/server/mcp-task-gateway.js';
import { wrapMcpTaskTransport } from '../src/server/mcp-task-transport.js';

class TestTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  readonly sent: JSONRPCMessage[] = [];

  async start(): Promise<void> {}
  async send(message: JSONRPCMessage): Promise<void> { this.sent.push(message); }
  async close(): Promise<void> { this.onclose?.(); }
  dispatch(message: JSONRPCMessage): void { this.onmessage?.(message); }
}

describe('MCP Tasks transport adapter', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'ncp-task-transport-'));
  });

  afterEach(async () => rm(directory, { recursive: true, force: true }));

  it('intercepts modern Tasks methods and replies with JSON-RPC errors for unknown handles', async () => {
    const inner = new TestTransport();
    const gateway = new McpTaskGateway('transport-profile', { directory });
    const wrapped = wrapMcpTaskTransport(inner, gateway, 'profile-owner', { name: 'ncp', version: '1.0.0' });
    wrapped.onmessage = () => { throw new Error('eligible Tasks request was not intercepted'); };
    inner.dispatch(request('tasks/get', 1, { taskId: '00000000-0000-4000-8000-000000000000' }));
    await waitForSend(inner);
    expect(inner.sent[0]).toMatchObject({
      id: 1,
      error: { code: ProtocolErrorCode.InvalidParams, message: 'Unknown task' },
    });
  });

  it('validates modern client metadata and task request parameters', async () => {
    const inner = new TestTransport();
    const gateway = new McpTaskGateway('transport-profile', { directory });
    const wrapped = wrapMcpTaskTransport(inner, gateway, 'profile-owner', { name: 'ncp', version: '1.0.0' });
    wrapped.onmessage = () => {};
    inner.dispatch(request('tasks/get', 1, {}, { omitClientInfo: true }));
    await waitForSend(inner);
    expect(inner.sent[0]).toMatchObject({ id: 1, error: { code: ProtocolErrorCode.InvalidRequest } });

    inner.dispatch(request('tasks/get', 2, { taskId: 12 }));
    await waitForSend(inner, 2);
    expect(inner.sent[1]).toMatchObject({ id: 2, error: { code: ProtocolErrorCode.InvalidParams } });
  });

  it('pins legacy on an initialize opening and forwards later modern-looking task methods', async () => {
    const inner = new TestTransport();
    const gateway = new McpTaskGateway('transport-profile', { directory });
    const wrapped = wrapMcpTaskTransport(inner, gateway, 'profile-owner', { name: 'ncp', version: '1.0.0' });
    const forwarded: JSONRPCMessage[] = [];
    wrapped.onmessage = (message) => forwarded.push(message);
    inner.dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} } as JSONRPCMessage);
    inner.dispatch(request('tasks/get', 2, { taskId: 'unknown' }));
    expect(forwarded).toHaveLength(2);
    expect(inner.sent).toHaveLength(0);
  });

  it('pins a claimless notification to legacy without intercepting following modern tasks', () => {
    const inner = new TestTransport();
    const gateway = new McpTaskGateway('transport-profile', { directory });
    const wrapped = wrapMcpTaskTransport(inner, gateway, 'profile-owner', { name: 'ncp', version: '1.0.0' });
    const forwarded: JSONRPCMessage[] = [];
    wrapped.onmessage = (message) => forwarded.push(message);
    inner.dispatch({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} } as JSONRPCMessage);
    inner.dispatch(request('tasks/get', 2, { taskId: 'unknown' }));
    expect(forwarded).toHaveLength(2);
    expect(inner.sent).toHaveLength(0);
  });
});

function request(
  method: string,
  id: number,
  params: Record<string, unknown>,
  options: { omitClientInfo?: boolean } = {},
): JSONRPCMessage {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params: {
      ...params,
      _meta: {
        [PROTOCOL_VERSION_META_KEY]: '2026-07-28',
        ...(!options.omitClientInfo && { [CLIENT_INFO_META_KEY]: { name: 'test-client', version: '1.0.0' } }),
        [CLIENT_CAPABILITIES_META_KEY_V2]: { extensions: { [TASKS_EXTENSION_ID_V2]: {} } },
      },
    },
  } as JSONRPCMessage;
}

async function waitForSend(transport: TestTransport, count = 1): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline && transport.sent.length < count) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  if (transport.sent.length < count) throw new Error('Transport did not send its response');
}
