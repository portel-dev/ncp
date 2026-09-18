import { describe, expect, it, jest } from '@jest/globals';
import { NCPManagementMCP } from '../src/internal-mcps/ncp-management.js';
import ProfileManager from '../src/profiles/profile-manager.js';
import { SessionNotificationManager } from '../src/utils/session-notifications.js';
import type { UserInputProvider } from '../src/utils/elicitation-helper.js';

function createTool() {
  const tool = new NCPManagementMCP();
  const optimizeClientConfig = jest.fn<ProfileManager['optimizeClientConfig']>().mockResolvedValue('/tmp/client.json');
  tool.setProfileManager({ optimizeClientConfig } as unknown as ProfileManager);
  return { tool, optimizeClientConfig };
}

describe('mcp:optimize_client', () => {
  it('queues an actionable notice after background import', async () => {
    const profileManager = Object.create(ProfileManager.prototype) as ProfileManager;
    const notifications = new SessionNotificationManager();

    await (profileManager as any).maybeReplaceClientConfig(
      'Cursor',
      { mcpServers: { github: {}, filesystem: {} } },
      notifications,
    );

    expect(notifications.getAll()).toEqual([
      expect.objectContaining({
        type: 'action',
        message: expect.stringContaining('mcp:optimize_client'),
        relatedId: 'Cursor',
      }),
    ]);
  });

  it('does not touch client configuration when confirmation is declined', async () => {
    const { tool, optimizeClientConfig } = createTool();
    const requestInput = jest.fn<UserInputProvider['requestInput']>().mockResolvedValue({ action: 'decline' });
    tool.setUserInputProvider({ requestInput });

    const result = await tool.executeTool('optimize_client', { client_name: 'Cursor' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cancelled/i);
    expect(optimizeClientConfig).not.toHaveBeenCalled();
  });

  it('backs up and replaces configuration only after explicit approval', async () => {
    const { tool, optimizeClientConfig } = createTool();
    const requestInput = jest.fn<UserInputProvider['requestInput']>().mockResolvedValue({
      action: 'accept',
      content: { action: 'approve' },
    });
    tool.setUserInputProvider({ requestInput });

    const result = await tool.executeTool('optimize_client', { client_name: 'Cursor' });

    expect(requestInput).toHaveBeenCalledTimes(1);
    expect(optimizeClientConfig).toHaveBeenCalledWith('Cursor');
    expect(result.success).toBe(true);
  });

  it('fails closed when no request-scoped input provider is available', async () => {
    const { tool, optimizeClientConfig } = createTool();

    const result = await tool.executeTool('optimize_client', { client_name: 'Cursor' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/interactive confirmation/i);
    expect(optimizeClientConfig).not.toHaveBeenCalled();
  });

  it('does not mutate profiles when add or remove approval is declined', async () => {
    const tool = new NCPManagementMCP();
    const addMCPToProfile = jest.fn<ProfileManager['addMCPToProfile']>();
    const removeMCPFromProfile = jest.fn<ProfileManager['removeMCPFromProfile']>();
    tool.setProfileManager({ addMCPToProfile, removeMCPFromProfile } as unknown as ProfileManager);
    tool.setUserInputProvider({ requestInput: async () => ({ action: 'decline' }) });

    const addResult = await tool.executeTool('add', {
      mcp_name: 'test-server',
      command: 'npx',
      args: ['-y', '@example/mcp-server'],
    });
    const removeResult = await tool.executeTool('remove', { mcp_name: 'test-server' });

    expect(addResult.success).toBe(false);
    expect(removeResult.success).toBe(false);
    expect(addMCPToProfile).not.toHaveBeenCalled();
    expect(removeMCPFromProfile).not.toHaveBeenCalled();
  });
});
