import * as path from 'node:path';
import { access } from 'node:fs/promises';
import { MCPServer } from '../../src/server/mcp-server.js';
import { setOverrideWorkingDirectory } from '../../src/utils/ncp-paths.js';
import { createExtensionOrchestrator, remoteSkillText, remoteSkillUri, writeLocalSkill } from './ncp-extensions-server.js';

const mode = process.argv[2];
const workDir = process.argv[3];
if (!workDir || !['skills', 'tasks'].includes(mode)) throw new Error('Usage: <skills|tasks> <workDir>');

setOverrideWorkingDirectory(workDir);
if (mode === 'skills') await writeLocalSkill(workDir);
const ncpServer = new MCPServer(`extensions-${mode}`, false) as any;
const fixture = createExtensionOrchestrator();
ncpServer.orchestrator = fixture.orchestrator;
ncpServer.orchestrator.getVerifiedMCPServerCatalogs = async () => {
  let originChanged = false;
  try {
    await access(path.join(workDir, '.change-skill-origin'));
    originChanged = true;
  } catch {}
  return fixture.orchestrator.getMCPServerCatalogs().map((server: any) =>
    server.serverName === 'documentation-server' && originChanged
      ? { ...server, originId: 'documentation-origin-v2' }
      : server,
  );
};
ncpServer.getToolDefinitions = () => [
  { name: 'find', description: 'Find tools', inputSchema: { type: 'object' } },
  { name: 'run', description: 'Run a tool', inputSchema: { type: 'object' } },
  { name: 'code', description: 'Run code', inputSchema: { type: 'object' } },
];
ncpServer.handleRun = async (params: any) => {
  if (mode === 'tasks' && params?.parameters?.needInput) {
    const answer = await ncpServer.requestInput({
      message: 'Approve this fixture run?',
      requestedSchema: { type: 'object', properties: { approved: { type: 'boolean' } }, required: ['approved'] },
    });
    return { content: [{ type: 'text', text: `approved=${answer.content?.approved}` }] };
  }
  return { content: [{ type: 'text', text: 'fixture run' }] };
};
ncpServer.handleCode = async () => ({ content: [{ type: 'text', text: 'fixture code' }] });
ncpServer.orchestrator.readMCPResource = async (serverName: string, uri: string) => {
  if (serverName === 'documentation-server' && uri === remoteSkillUri) {
    return { contents: [{ uri, mimeType: 'text/markdown', text: remoteSkillText }] };
  }
  throw new Error(`Unknown fixture resource: ${serverName}:${uri}`);
};

// The orchestrator methods are stubbed, so no background index or MCP connections are started.
await ncpServer.connect();
