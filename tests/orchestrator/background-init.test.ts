import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { NCPOrchestrator } from '../../src/orchestrator/ncp-orchestrator.js';

describe('NCPOrchestrator background init guard', () => {
  const originalEnv = process.env.NCP_DISABLE_BACKGROUND_INIT;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NCP_DISABLE_BACKGROUND_INIT;
    } else {
      process.env.NCP_DISABLE_BACKGROUND_INIT = originalEnv;
    }
  });

  it('skips heavy discovery initialization when NCP_DISABLE_BACKGROUND_INIT is true', async () => {
    process.env.NCP_DISABLE_BACKGROUND_INIT = 'true';

    const orchestrator = new NCPOrchestrator('test', false);

    // Stub discovery + helpers to avoid hitting actual subsystems
    const discoveryInitialize = jest.fn(async () => {});
    const mockDiscovery = {
      initialize: discoveryInitialize
    } as any;
    (orchestrator as any).discovery = mockDiscovery;

    const addInternalSpy = jest
      .spyOn(orchestrator as any, 'addInternalMCPsToDiscovery')
      .mockResolvedValue(undefined);

    const profile = { mcpServers: {} } as any;

    await (orchestrator as any).runBackgroundInitialization(profile);

    expect(discoveryInitialize).not.toHaveBeenCalled();
    expect(addInternalSpy).toHaveBeenCalledTimes(1);
    expect((orchestrator as any).indexingProgress).toBeNull();
  });
});
