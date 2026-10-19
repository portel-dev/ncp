import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  CLIENT_INFO_META_KEY,
  createRequestStateCodec,
  inputRequired,
  inputResponse,
  ProtocolError,
  ProtocolErrorCode,
  type ElicitResult,
  type InputRequiredResult,
  type ServerContext,
} from '@modelcontextprotocol/server';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';
import type { UserInputProvider, UserInputRequest } from '../utils/elicitation-helper.js';

const WORKFLOW_TTL_MS = 15 * 60 * 1000;

interface RequestStatePayload {
  workflowId: string;
  round: number;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

interface PendingInput {
  id: string;
  request: UserInputRequest;
  response: Deferred<ElicitResult>;
}

type WorkflowOutcome<T> =
  | { status: 'completed'; value: T }
  | { status: 'failed'; error: unknown };

interface PendingWorkflow<T> {
  id: string;
  round: number;
  method: string;
  pending?: PendingInput;
  outcome?: WorkflowOutcome<T>;
  terminalError?: Error;
  wake: Deferred<void>;
  task: Promise<void>;
  expiryTimer: NodeJS.Timeout;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

/**
 * Bridges NCP's deeply nested user-input calls to MCP 2026 multi-round-trip
 * input_required results. The original async workflow remains suspended in
 * memory, so generators and code execution are resumed rather than replayed.
 */
export class InputRequiredCoordinator implements UserInputProvider {
  private readonly activeWorkflow = new AsyncLocalStorage<PendingWorkflow<unknown>>();
  private readonly workflows = new Map<string, PendingWorkflow<unknown>>();
  private readonly validator = new AjvJsonSchemaValidator();
  private readonly codec;

  constructor(
    private readonly clientIdentity: () => string = () => '',
    private readonly workflowTtlMs: number = WORKFLOW_TTL_MS,
  ) {
    this.codec = createRequestStateCodec<RequestStatePayload>({
      key: randomBytes(32),
      ttlSeconds: workflowTtlMs / 1000,
      bind: (ctx) => {
        // Modern state is verified before the request handler refreshes the
        // legacy server fields. Bind to this request's validated identity so
        // another stateless request cannot invalidate a pending interaction.
        const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
        const client = envelope?.[CLIENT_INFO_META_KEY] as { name?: string; version?: string } | undefined;
        const identity = envelope
          ? `${client?.name ?? 'unknown'}@${client?.version ?? 'unknown'}`
          : this.clientIdentity();
        return `${ctx.mcpReq.method}\0${ctx.sessionId ?? ''}\0${identity}`;
      },
    });
  }

  /** Install this verifier as ServerOptions.requestState.verify. */
  readonly verifyRequestState = (state: string, ctx: ServerContext): Promise<RequestStatePayload> =>
    this.codec.verify(state, ctx);

  async requestInput(request: UserInputRequest): Promise<ElicitResult> {
    const workflow = this.activeWorkflow.getStore();
    if (!workflow) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidRequest,
        'User input can only be requested while handling an MCP multi-round-trip request',
      );
    }
    if (workflow.terminalError) {
      throw workflow.terminalError;
    }

    if (workflow.pending) {
      throw new ProtocolError(
        ProtocolErrorCode.InternalError,
        'A workflow attempted to open more than one user-input request at the same time',
      );
    }

    const response = deferred<ElicitResult>();
    workflow.pending = {
      id: `input_${workflow.round}`,
      request,
      response,
    };
    workflow.wake.resolve();
    return response.promise;
  }

  async handle<T>(ctx: ServerContext, operation: () => Promise<T>): Promise<T | InputRequiredResult> {
    const state = ctx.mcpReq.requestState<RequestStatePayload>();
    let workflow: PendingWorkflow<T>;

    if (state) {
      const existing = this.workflows.get(state.workflowId) as PendingWorkflow<T> | undefined;
      if (!existing || existing.method !== ctx.mcpReq.method || existing.round !== state.round) {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Invalid or expired interaction state');
      }
      workflow = existing;
      this.consumeResponse(workflow, ctx);
    } else {
      if (ctx.mcpReq.inputResponses && Object.keys(ctx.mcpReq.inputResponses).length > 0) {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Input responses require requestState');
      }
      workflow = this.startWorkflow(ctx.mcpReq.method, operation);
    }

    await this.waitForWake(workflow, ctx.mcpReq.signal);

    if (workflow.outcome) {
      await workflow.task;
      this.removeWorkflow(workflow.id);
      if (workflow.outcome.status === 'failed') {
        throw workflow.outcome.error;
      }
      return workflow.outcome.value;
    }

    if (!workflow.pending) {
      this.removeWorkflow(workflow.id);
      throw new ProtocolError(ProtocolErrorCode.InternalError, 'Interactive workflow stalled without input or a result');
    }

    const requestState = await this.codec.mint(
      { workflowId: workflow.id, round: workflow.round },
      ctx,
    );

    return inputRequired({
      inputRequests: {
        [workflow.pending.id]: inputRequired.elicit(workflow.pending.request),
      },
      requestState,
    });
  }

  shutdown(): void {
    for (const workflow of this.workflows.values()) {
      const error = new Error('NCP is shutting down');
      workflow.terminalError = error;
      workflow.pending?.response.reject(error);
      clearTimeout(workflow.expiryTimer);
    }
    this.workflows.clear();
    this.activeWorkflow.disable();
  }

  private startWorkflow<T>(method: string, operation: () => Promise<T>): PendingWorkflow<T> {
    const id = randomUUID();
    const wake = deferred<void>();
    const workflow = {
      id,
      round: 1,
      method,
      wake,
      task: undefined as unknown as Promise<void>,
      expiryTimer: undefined as unknown as NodeJS.Timeout,
    } as PendingWorkflow<T>;

    workflow.expiryTimer = setTimeout(() => {
      const error = new Error('User-input workflow expired');
      workflow.terminalError = error;
      workflow.pending?.response.reject(error);
      this.workflows.delete(id);
    }, this.workflowTtlMs);
    workflow.expiryTimer.unref?.();

    this.workflows.set(id, workflow as PendingWorkflow<unknown>);

    workflow.task = this.activeWorkflow.run(workflow as PendingWorkflow<unknown>, async () => {
      try {
        workflow.outcome = { status: 'completed', value: await operation() };
      } catch (error) {
        workflow.outcome = { status: 'failed', error };
      } finally {
        workflow.wake.resolve();
      }
    });

    return workflow;
  }

  private consumeResponse<T>(workflow: PendingWorkflow<T>, ctx: ServerContext): void {
    const pending = workflow.pending;
    if (!pending) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Interaction has no pending input request');
    }

    const response = inputResponse(ctx.mcpReq.inputResponses, pending.id);
    if (response.kind === 'missing') {
      // A malformed or dropped response is re-issued without consuming a round.
      workflow.wake = deferred<void>();
      workflow.wake.resolve();
      return;
    }
    if (response.kind !== 'elicit') {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Unexpected input response type');
    }

    let content = response.content;
    if (response.action === 'accept') {
      const validation = this.validator
        .getValidator<Record<string, unknown>>(pending.request.requestedSchema)(content ?? {});
      if (!validation.valid) {
        throw new ProtocolError(
          ProtocolErrorCode.InvalidParams,
          `Elicitation response content does not match requested schema: ${validation.errorMessage}`,
        );
      }
      content = validation.data;
    }

    workflow.pending = undefined;
    workflow.round += 1;
    workflow.wake = deferred<void>();
    pending.response.resolve({
      action: response.action,
      ...(content !== undefined && { content: content as ElicitResult['content'] }),
    } as ElicitResult);
  }

  private removeWorkflow(id: string): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      clearTimeout(workflow.expiryTimer);
      this.workflows.delete(id);
    }
  }

  private async waitForWake<T>(workflow: PendingWorkflow<T>, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      this.cancelWorkflow(workflow, new Error('MCP request was cancelled'));
      throw signal.reason ?? new Error('MCP request was cancelled');
    }

    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        const error = signal.reason instanceof Error ? signal.reason : new Error('MCP request was cancelled');
        this.cancelWorkflow(workflow, error);
        reject(error);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      workflow.wake.promise.then(
        () => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        },
        (error) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    });
  }

  private cancelWorkflow<T>(workflow: PendingWorkflow<T>, error: Error): void {
    workflow.terminalError = error;
    workflow.pending?.response.reject(error);
    this.removeWorkflow(workflow.id);
  }
}
