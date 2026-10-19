import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { McpAppsServerCatalog } from '../../src/server/mcp-apps-gateway.js';
import type { SkillsDownstreamSource } from '../../src/server/mcp-skills-gateway.js';

export const UI_EXTENSION = 'io.modelcontextprotocol/ui';
export const SKILLS_EXTENSION = 'io.modelcontextprotocol/skills';

export const dashboardUri = 'ui://dashboard/main';
export const appCatalog: McpAppsServerCatalog = {
  serverName: 'dashboard-backend',
  resources: [{ uri: dashboardUri, name: 'Dashboard', mimeType: 'text/html;profile=mcp-app' }],
  tools: [
    {
      name: 'show_dashboard',
      description: 'Show dashboard sections',
      inputSchema: { type: 'object', properties: { section: { type: 'string' } } },
      _meta: { ui: { resourceUri: dashboardUri } },
    },
    {
      name: 'refresh_dashboard',
      description: 'Refresh dashboard data',
      inputSchema: { type: 'object', properties: { force: { type: 'boolean' } } },
      _meta: { ui: { resourceUri: dashboardUri, visibility: ['app'] } },
    },
  ],
};

export const remoteSkillText = '---\nname: remote-guide\ndescription: Read a remote guide.\nlicense: MIT\n---\n\nRemote workflow.\n';
export const remoteSkillUri = 'skill://remote-guide/SKILL.md';
export const remoteSkillEntry = {
  uri: remoteSkillUri,
  frontmatter: { name: 'remote-guide', description: 'Read a remote guide.', license: 'MIT' },
  resources: [{
    uri: remoteSkillUri,
    digest: `sha256:${createHash('sha256').update(remoteSkillText).digest('hex')}`,
    size: Buffer.byteLength(remoteSkillText),
  }],
};

export const skillCatalog = {
  serverName: 'documentation-server',
  tools: [],
  capabilities: { extensions: { [SKILLS_EXTENSION]: {} } },
};

export function createExtensionOrchestrator() {
  const calls: Array<Record<string, any>> = [];
  const catalogs = [
    { ...appCatalog, originId: 'dashboard-origin-v1' },
    { ...skillCatalog, originId: 'documentation-origin-v1' },
  ];
  const remoteClient = {
    request: async ({ method, params }: { method: string; params: Record<string, unknown> }) => {
      calls.push({ serverName: 'documentation-server', method, params });
      if (method === 'skills/list') return { resultType: 'complete', skills: [remoteSkillEntry], ttlMs: 300000, cacheScope: 'private' };
      if (method === 'skills/get') return { resultType: 'complete', skill: remoteSkillEntry, ttlMs: 300000, cacheScope: 'private' };
      throw new Error(`Unexpected downstream request: ${method}`);
    },
  };

  return {
    calls,
    orchestrator: {
      getMCPServerCatalogs: () => catalogs,
      refreshMCPServerCatalogs: async () => catalogs,
      getVerifiedMCPServerCatalogs: async () => catalogs,
      setToolCatalogChangedHandler: () => {},
      getMCPClient: async (serverName: string) => {
        if (serverName !== 'documentation-server') throw new Error(`No downstream client: ${serverName}`);
        return remoteClient;
      },
      readMCPResource: async (serverName: string, uri: string) => {
        if (serverName !== 'documentation-server' || uri !== remoteSkillUri) throw new Error(`Unknown downstream resource: ${serverName}:${uri}`);
        return {
          resultType: 'complete',
          contents: [{ uri, mimeType: 'text/markdown', text: remoteSkillText }],
          ttlMs: 300000,
          cacheScope: 'private',
        };
      },
      setClientInfo: () => {},
      setUserInputProvider: () => {},
      getInternalMCPManager: () => ({ setUserInputProvider: () => {} }),
      cleanup: async () => {},
      waitForInitialization: async () => {},
      find: async () => [],
      getIndexingProgress: () => null,
      getMCPHealthStatus: () => ({ total: 0, healthy: 0, unhealthy: 0, mcps: [] }),
      run: async () => ({ content: [{ type: 'text', text: 'stubbed run' }] }),
    },
  };
}

export async function writeLocalSkill(baseDirectory: string): Promise<string> {
  const directory = path.join(baseDirectory, '.ncp', 'skills', 'local-guide');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'SKILL.md'), '---\nname: local-guide\ndescription: Read a local guide.\ntags: [ncp, local]\n---\n\nLocal workflow.\n');
  return 'skill://local/local-guide/SKILL.md';
}
