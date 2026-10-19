import {
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
  SERVER_INFO_META_KEY,
  ProtocolError,
  ProtocolErrorCode,
  type JSONRPCMessage,
  type Transport,
} from '@modelcontextprotocol/server';
import {
  CLIENT_CAPABILITIES_META_KEY_V2,
  TASKS_EXTENSION_ID_V2,
  GetTaskRequestV2Schema,
  GetTaskResultV2Schema,
  UpdateTaskRequestV2Schema,
  UpdateTaskResultV2Schema,
  CancelTaskRequestV2Schema,
  CancelTaskResultV2Schema,
} from '@modelcontextprotocol/ext-tasks/core/v2';
import type { McpTaskGateway } from './mcp-task-gateway.js';

const MODERN_TASKS_PROTOCOL = '2026-07-28';
const TASK_METHODS = new Set(['tasks/get', 'tasks/update', 'tasks/cancel']);

/**
 * Public Transport adapter for SDK revisions that classify extension methods
 * before consulting custom handlers. It only handles the three Tasks V2
 * methods after the transport is pinned to the modern protocol era.
 */
export function wrapMcpTaskTransport(
  transport: Transport,
  gateway: McpTaskGateway,
  ownerIdentity: string,
  serverInfo: { name: string; version: string },
): Transport {
  return new McpTaskTransport(transport, gateway, ownerIdentity, serverInfo);
}

class McpTaskTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  private era: 'modern' | 'legacy' | undefined;

  constructor(
    private readonly inner: Transport,
    private readonly gateway: McpTaskGateway,
    private readonly ownerIdentity: string,
    private readonly serverInfo: { name: string; version: string },
  ) {
    const previousClose = inner.onclose;
    const previousError = inner.onerror;
    inner.onclose = () => {
      previousClose?.();
      this.onclose?.();
    };
    inner.onerror = (error) => {
      previousError?.(error);
      this.onerror?.(error);
    };
    inner.onmessage = (message) => {
      if (this.shouldIntercept(message)) {
        void this.handleTaskRequest(message).catch((error) => {
          this.onerror?.(error instanceof Error ? error : new Error(String(error)));
        });
        return;
      }
      this.pinEra(message);
      this.onmessage?.(message);
    };
  }

  start(): Promise<void> {
    return this.inner.start();
  }

  send(message: JSONRPCMessage): Promise<void> {
    return this.inner.send(message);
  }

  close(): Promise<void> {
    return this.inner.close();
  }

  private shouldIntercept(message: JSONRPCMessage): boolean {
    const candidate: unknown = message;
    if (!isRecord(candidate) || typeof candidate.method !== 'string' || !hasRequestId(candidate)) return false;
    this.pinEra(candidate);
    if (this.era !== 'modern' || !TASK_METHODS.has(candidate.method)) return false;
    const envelope = requestEnvelope(candidate);
    if (envelope?.[PROTOCOL_VERSION_META_KEY] !== MODERN_TASKS_PROTOCOL) return false;
    const capabilities = envelope[CLIENT_CAPABILITIES_META_KEY_V2];
    return isRecord(capabilities) && isRecord(capabilities.extensions) &&
      isRecord(capabilities.extensions[TASKS_EXTENSION_ID_V2]);
  }

  private pinEra(message: unknown): void {
    if (this.era || !isRecord(message) || typeof message.method !== 'string') return;
    if (message.method === 'initialize') {
      this.era = 'legacy';
      return;
    }
    const version = requestEnvelope(message)?.[PROTOCOL_VERSION_META_KEY];
    if (version === MODERN_TASKS_PROTOCOL) this.era = 'modern';
    else if (typeof version !== 'string' || version.startsWith('2025-') || version.startsWith('2024-')) this.era = 'legacy';
  }

  private async handleTaskRequest(message: Record<string, unknown>): Promise<void> {
    const id = message.id as string | number;
    const envelope = requestEnvelope(message);
    if (!validClientInfo(envelope?.[CLIENT_INFO_META_KEY])) {
      await this.sendError(id, ProtocolErrorCode.InvalidRequest, 'Modern task requests require client name and version metadata');
      return;
    }
    if (!isRecord(envelope?.[CLIENT_CAPABILITIES_META_KEY_V2]) ||
        !isRecord(envelope[CLIENT_CAPABILITIES_META_KEY_V2]?.extensions)) {
      await this.sendError(id, ProtocolErrorCode.InvalidRequest, 'Modern task requests require a client capabilities object');
      return;
    }

    let result: unknown;
    let resultSchema: { safeParse(value: unknown): any };
    try {
      if (message.method === 'tasks/get') {
        const parsed = GetTaskRequestV2Schema.safeParse(message);
        if (!parsed.success) {
          await this.sendError(id, ProtocolErrorCode.InvalidParams, 'Invalid tasks/get parameters', parsed.error.issues);
          return;
        }
        result = await this.gateway.getTask(parsed.data.params.taskId, this.ownerIdentity);
        resultSchema = GetTaskResultV2Schema as unknown as { safeParse(value: unknown): any };
      } else if (message.method === 'tasks/update') {
        const parsed = UpdateTaskRequestV2Schema.safeParse(message);
        if (!parsed.success) {
          await this.sendError(id, ProtocolErrorCode.InvalidParams, 'Invalid tasks/update parameters', parsed.error.issues);
          return;
        }
        await this.gateway.updateTask(parsed.data.params.taskId, this.ownerIdentity, parsed.data.params.inputResponses);
        result = { resultType: 'complete' };
        resultSchema = UpdateTaskResultV2Schema as unknown as { safeParse(value: unknown): any };
      } else {
        const parsed = CancelTaskRequestV2Schema.safeParse(message);
        if (!parsed.success) {
          await this.sendError(id, ProtocolErrorCode.InvalidParams, 'Invalid tasks/cancel parameters', parsed.error.issues);
          return;
        }
        await this.gateway.cancelTask(parsed.data.params.taskId, this.ownerIdentity);
        result = { resultType: 'complete' };
        resultSchema = CancelTaskResultV2Schema as unknown as { safeParse(value: unknown): any };
      }
    } catch (error) {
      const candidate = error as { code?: unknown; message?: unknown; data?: unknown };
      await this.sendError(
        id,
        typeof candidate?.code === 'number' ? candidate.code : ProtocolErrorCode.InternalError,
        typeof candidate?.message === 'string' ? candidate.message : 'Task request failed',
        candidate?.data,
      );
      return;
    }

    const validated = resultSchema.safeParse(result);
    if (!validated.success) {
      await this.sendError(id, ProtocolErrorCode.InternalError, 'Invalid Tasks result produced by the gateway', validated.error.issues);
      return;
    }

    await this.inner.send({
      jsonrpc: '2.0',
      id,
      result: {
        ...(validated.data as Record<string, unknown>),
        _meta: {
          ...((isRecord((validated.data as Record<string, unknown>)._meta) &&
            (validated.data as Record<string, any>)._meta) || {}),
          [SERVER_INFO_META_KEY]: this.serverInfo,
        },
      },
    } as JSONRPCMessage);
  }

  private async sendError(id: string | number, code: number, message: string, data?: unknown): Promise<void> {
    await this.inner.send({
      jsonrpc: '2.0',
      id,
      error: { code, message, ...(data !== undefined && { data }) },
    } as JSONRPCMessage);
  }
}

function requestEnvelope(message: Record<string, unknown>): Record<string, unknown> | undefined {
  const params = isRecord(message.params) ? message.params : undefined;
  return isRecord(params?._meta) ? params._meta : undefined;
}

function hasRequestId(message: Record<string, unknown>): boolean {
  return (typeof message.id === 'string') ||
    (typeof message.id === 'number' && Number.isSafeInteger(message.id));
}

function validClientInfo(value: unknown): value is { name: string; version: string } {
  return isRecord(value) && typeof value.name === 'string' && value.name.length > 0 &&
    typeof value.version === 'string' && value.version.length > 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
