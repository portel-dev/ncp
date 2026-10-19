import { readFileSync, writeFileSync } from 'node:fs';
import { McpServer, acceptedContent, inputRequired } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

const statePath = process.argv[2];

function updateState(update) {
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  update(state);
  writeFileSync(statePath, JSON.stringify(state));
}

serveStdio(() => {
  const server = new McpServer({ name: 'downstream-elicitation-modern', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.registerTool('confirm', { description: 'Ask the user to confirm' }, async (context) => {
    updateState((state) => { state.toolCalls += 1; });
    const requestState = context.mcpReq?.requestState?.();
    if (requestState === undefined) {
      updateState((state) => { state.effectsBeforeInput += 1; });
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

    const accepted = acceptedContent(context.mcpReq?.inputResponses, 'confirm');
    if (accepted?.confirm !== true) {
      return { content: [{ type: 'text', text: 'cancelled' }], isError: true };
    }
    updateState((state) => { state.protectedEffects += 1; });
    return {
      content: [{ type: 'text', text: 'confirmed' }],
      structuredContent: { accepted: true },
    };
  });
  return server;
});
