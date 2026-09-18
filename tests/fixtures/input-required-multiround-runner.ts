import assert from 'node:assert/strict';
import { isInputRequiredResult, type ServerContext } from '@modelcontextprotocol/server';
import { InputRequiredCoordinator } from '../../src/server/input-required-coordinator.js';

function context(
  state?: unknown,
  responses?: Record<string, unknown>,
  signal: AbortSignal = new AbortController().signal,
): ServerContext {
  return {
    sessionId: 'session-a',
    mcpReq: {
      id: 'request-1',
      method: 'tools/call',
      signal,
      inputResponses: responses,
      requestState: () => state,
      send: async () => { throw new Error('unused'); },
      notify: async () => undefined,
      log: async () => undefined,
      elicitInput: async () => { throw new Error('legacy request must not be used'); },
      requestSampling: async () => { throw new Error('unused'); },
    },
  } as unknown as ServerContext;
}

const coordinator = new InputRequiredCoordinator(() => 'test-client');
let starts = 0;
const operation = async () => {
  starts += 1;
  const first = await coordinator.requestInput({
    message: 'First value',
    requestedSchema: {
      type: 'object',
      properties: { value: { type: 'string', minLength: 1 } },
      required: ['value'],
    },
  });
  const second = await coordinator.requestInput({
    message: 'Second value',
    requestedSchema: {
      type: 'object',
      properties: { confirmed: { type: 'boolean' } },
      required: ['confirmed'],
    },
  });
  return `${first.content?.value}:${second.content?.confirmed}`;
};

const first = await coordinator.handle(context(), operation);
assert.equal(isInputRequiredResult(first), true);
if (!isInputRequiredResult(first)) throw new Error('expected input_required');
assert.equal(first.requestState?.includes('first-value'), false);

const firstState = await coordinator.verifyRequestState(first.requestState!, context());
const second = await coordinator.handle(
  context(firstState, { input_1: { action: 'accept', content: { value: 'first-value' } } }),
  async () => { throw new Error('workflow was replayed'); },
);
assert.equal(isInputRequiredResult(second), true);
if (!isInputRequiredResult(second)) throw new Error('expected second input_required');

const secondState = await coordinator.verifyRequestState(second.requestState!, context());
const final = await coordinator.handle(
  context(secondState, { input_2: { action: 'accept', content: { confirmed: true } } }),
  operation,
);
assert.equal(final, 'first-value:true');
assert.equal(starts, 1);
await assert.rejects(
  coordinator.handle(context(secondState, { input_2: { action: 'accept', content: { confirmed: true } } }), operation),
  /Invalid or expired interaction state/,
);
await assert.rejects(
  coordinator.handle(context({ workflowId: 'unknown', round: 1 }), operation),
  /Invalid or expired interaction state/,
);
await assert.rejects(
  coordinator.handle(
    context(undefined, { input_1: { action: 'accept', content: { value: 'orphaned' } } }),
    operation,
  ),
  /Input responses require requestState/,
);
coordinator.shutdown();

for (const action of ['decline', 'cancel'] as const) {
  const current = new InputRequiredCoordinator(() => 'test-client');
  const pending = await current.handle(context(), async () => {
    const result = await current.requestInput({
      message: 'Confirm',
      requestedSchema: { type: 'object', properties: {} },
    });
    return result.action;
  });
  assert.equal(isInputRequiredResult(pending), true);
  if (!isInputRequiredResult(pending)) throw new Error('expected input_required');
  const state = await current.verifyRequestState(pending.requestState!, context());
  const result = await current.handle(context(state, { input_1: { action } }), async () => 'replayed');
  assert.equal(result, action);
  current.shutdown();
}

const validating = new InputRequiredCoordinator(() => 'test-client');
const validationPending = await validating.handle(context(), async () => {
  await validating.requestInput({
    message: 'Number',
    requestedSchema: {
      type: 'object',
      properties: { value: { type: 'number' } },
      required: ['value'],
    },
  });
  return 'done';
});
assert.equal(isInputRequiredResult(validationPending), true);
if (!isInputRequiredResult(validationPending)) throw new Error('expected input_required');
const validationToken = validationPending.requestState!;
await assert.rejects(validating.verifyRequestState(`${validationToken}x`, context()));
await assert.rejects(validating.verifyRequestState(validationToken, { ...context(), sessionId: 'session-b' }));
const validationState = await validating.verifyRequestState(validationToken, context());
await assert.rejects(
  validating.handle(
    context(validationState, { input_1: { action: 'accept', content: { value: 'wrong' } } }),
    async () => 'replayed',
  ),
  /does not match requested schema/,
);
validating.shutdown();

const aborting = new InputRequiredCoordinator(() => 'test-client');
let abortedWorkflowFinished = false;
const abortPending = await aborting.handle(context(), async () => {
  try {
    await aborting.requestInput({
      message: 'First',
      requestedSchema: { type: 'object', properties: {} },
    });
    await aborting.requestInput({
      message: 'Second',
      requestedSchema: { type: 'object', properties: {} },
    });
    return 'unexpected';
  } finally {
    abortedWorkflowFinished = true;
  }
});
assert.equal(isInputRequiredResult(abortPending), true);
if (!isInputRequiredResult(abortPending)) throw new Error('expected input_required');
const abortState = await aborting.verifyRequestState(abortPending.requestState!, context());
const abortController = new AbortController();
abortController.abort(new Error('cancel between rounds'));
await assert.rejects(
  aborting.handle(
    context(abortState, { input_1: { action: 'accept', content: {} } }, abortController.signal),
    async () => 'replayed',
  ),
  /cancel between rounds/,
);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(abortedWorkflowFinished, true);
aborting.shutdown();

const expiring = new InputRequiredCoordinator(() => 'test-client', 1);
const expiringPending = await expiring.handle(context(), async () => {
  await expiring.requestInput({
    message: 'Expires',
    requestedSchema: { type: 'object', properties: {} },
  });
  return 'unexpected';
});
assert.equal(isInputRequiredResult(expiringPending), true);
if (!isInputRequiredResult(expiringPending)) throw new Error('expected input_required');
const expiringState = await expiring.verifyRequestState(expiringPending.requestState!, context());
await new Promise((resolve) => setTimeout(resolve, 1_100));
await assert.rejects(expiring.verifyRequestState(expiringPending.requestState!, context()), /expired/);
await assert.rejects(
  expiring.handle(context(expiringState), async () => 'replayed'),
  /Invalid or expired interaction state/,
);
expiring.shutdown();
process.stdout.write('ok\n');
