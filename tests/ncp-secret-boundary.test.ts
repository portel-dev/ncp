import { afterEach, describe, expect, it, jest } from '@jest/globals';
import clipboardy from 'clipboardy';
import { NCPManagementMCP } from '../src/internal-mcps/ncp-management.js';
import { SECURE_STORAGE_REFERENCE } from '../src/profiles/profile-manager.js';

function managementWithProfiles() {
  const tool = new NCPManagementMCP();
  tool.setProfileManager({
    getProfile: async () => ({
      name: 'all',
      description: 'test',
      mcpServers: {
        github: {
          command: 'github-mcp',
          env: { GITHUB_TOKEN: SECURE_STORAGE_REFERENCE },
        },
      },
      metadata: { created: '', modified: '' },
    }),
    getProfileMCPs: async () => ({
      github: {
        command: 'github-mcp',
        env: { GITHUB_TOKEN: 'materialized-secret' },
      },
    }),
  } as any);
  return tool;
}

describe('NCP management secret boundary', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses stored references for model-visible exports', async () => {
    const result = await managementWithProfiles().executeTool('export', {
      to: 'response',
      profile: 'all',
    });

    expect(result.success).toBe(true);
    expect(JSON.stringify(result)).toContain(SECURE_STORAGE_REFERENCE);
    expect(JSON.stringify(result)).not.toContain('materialized-secret');
  });

  it('fails closed instead of returning secrets when clipboard export fails', async () => {
    jest.spyOn(clipboardy, 'write').mockRejectedValue(new Error('clipboard unavailable'));

    const result = await managementWithProfiles().executeTool('export', {
      to: 'clipboard',
      profile: 'all',
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain('materialized-secret');
    expect(result.error).toContain('did not return the configuration');
  });
});
