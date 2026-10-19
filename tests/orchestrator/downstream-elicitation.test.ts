import { afterEach, describe, expect, it } from '@jest/globals';
import { InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { Server, inputRequired } from '@modelcontextprotocol/server';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NCPOrchestrator } from '../../src/orchestrator/ncp-orchestrator.js';

describe('downstream elicitation bridge', () => {
  const orchestrators: NCPOrchestrator[] = [];
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(orchestrators.splice(0).map((orchestrator) => orchestrator.cleanup()));
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  for (const protocol of ['legacy', 'modern'] as const) {
    it(`${protocol}: accepts user input and executes the protected effect once`, async () => {
    const { orchestrator, effects, preInputEffects, calls, providerRequests } = await makeFixture(protocol, 'accept');
      const result = await orchestrator.run('eliciting:confirm', {});

      expect((orchestrator as any).connections.get('eliciting').client.getProtocolEra()).toBe(protocol);
      expect(result.success).toBe(true);
      expect(result.mcpResult?.structuredContent).toEqual({ accepted: true });
      expect(await calls()).toBe(2);
      expect(await preInputEffects()).toBe(1);
      expect(await effects()).toBe(1);
      expect(providerRequests()).toBe(1);
    });

    it(`${protocol}: propagates cancellation without performing the protected effect`, async () => {
      const { orchestrator, effects, preInputEffects, providerRequests } = await makeFixture(protocol, 'cancel');
      const result = await orchestrator.run('eliciting:confirm', {});

      expect((orchestrator as any).connections.get('eliciting').client.getProtocolEra()).toBe(protocol);
      expect(providerRequests()).toBe(1);
      expect(await preInputEffects()).toBe(1);
      expect(await effects()).toBe(0);
      expect(result.success).toBe(false);
    });
  }

  async function makeFixture(protocol: 'legacy' | 'modern', action: 'accept' | 'cancel') {
    const orchestrator = new NCPOrchestrator('test');
    orchestrators.push(orchestrator);
    let toolCalls = 0;
    let effectsBeforeInput = 0;
    let protectedEffects = 0;
    let requests = 0;

    orchestrator.setUserInputProvider({
      async requestInput() {
        requests += 1;
        return action === 'accept'
          ? { action: 'accept' as const, content: { confirm: true } }
          : { action: 'cancel' as const };
      }
    });

    (orchestrator as any).definitions.set('eliciting', {
      name: 'eliciting',
      config: { name: 'eliciting', command: 'in-memory-fixture' },
      tools: [{
        name: 'confirm',
        description: 'Ask the user to confirm',
        inputSchema: { type: 'object', properties: {} },
      }],
    });
    (orchestrator as any).toolToMCP.set('confirm', 'eliciting');

    (orchestrator as any).transportFactory.createTransport = async () => {
      if (protocol === 'modern') {
        const directory = await mkdtemp(join(tmpdir(), 'ncp-elicitation-'));
        temporaryDirectories.push(directory);
        const statePath = join(directory, 'state.json');
        await writeFile(statePath, JSON.stringify({ toolCalls: 0, effectsBeforeInput: 0, protectedEffects: 0 }));
        const fixturePath = join(process.cwd(), 'tests/fixtures/downstream-elicitation-modern.mjs');
        return new StdioClientTransport({ command: process.execPath, args: [fixturePath, statePath] });
      }

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const server = new Server(
        { name: `eliciting-${protocol}`, version: '1.0.0' },
        {
          capabilities: { tools: {} },
          versionNegotiation: { mode: 'legacy' },
        } as any,
      );
      server.setRequestHandler('tools/list', async () => ({
        tools: [{
          name: 'confirm',
          description: 'Ask the user to confirm',
          inputSchema: { type: 'object', properties: {} },
        }],
      }));
      server.setRequestHandler('tools/call', async (request: any, context: any) => {
        toolCalls += 1;
        const requestState = context.mcpReq?.requestState?.();
        const response = context.mcpReq?.inputResponses?.confirm ?? request.params.inputResponses?.confirm;
        if (requestState === undefined) {
          effectsBeforeInput += 1;
          return inputRequired({
            requestState: 'completed-pre-input-effect',
            inputRequests: {
              confirm: inputRequired.elicit({
                message: 'Confirm this operation?',
                requestedSchema: {
                  type: 'object',
                  properties: { confirm: { type: 'boolean', description: 'Confirm the operation' } },
                  required: ['confirm'],
                },
              }),
            },
          });
        }
        if (response.action !== 'accept' || response.content?.confirm !== true) {
          return { content: [{ type: 'text', text: 'cancelled' }], isError: true };
        }
        protectedEffects += 1;
        return {
          content: [{ type: 'text', text: 'confirmed' }],
          structuredContent: { accepted: true },
        };
      });
      await server.connect(serverTransport);
      return clientTransport;
    };

    return {
      orchestrator,
      effects: async () => protocol === 'modern' ? readState('protectedEffects') : protectedEffects,
      preInputEffects: async () => protocol === 'modern' ? readState('effectsBeforeInput') : effectsBeforeInput,
      calls: async () => protocol === 'modern' ? readState('toolCalls') : toolCalls,
      providerRequests: () => requests,
    };

    async function readState(key: 'toolCalls' | 'effectsBeforeInput' | 'protectedEffects') {
      const directory = temporaryDirectories[temporaryDirectories.length - 1];
      const state = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8'));
      return state[key];
    }
  }
});
