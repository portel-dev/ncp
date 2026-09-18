import { afterEach, describe, expect, it, jest } from '@jest/globals';
import clipboardy from 'clipboardy';
import { PhotonAdapter } from '../src/internal-mcps/photon-adapter.js';
import type { UserInputProvider } from '../src/utils/elicitation-helper.js';

describe('Photon secret input isolation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps sensitive settings out of MCP input responses', async () => {
    jest.spyOn(clipboardy, 'read').mockResolvedValue('local-secret');
    jest.spyOn(clipboardy, 'write').mockResolvedValue();
    const requestInput = jest.fn<UserInputProvider['requestInput']>()
      .mockResolvedValueOnce({ action: 'accept', content: { region: 'us-east-1' } })
      .mockResolvedValueOnce({ action: 'accept', content: { ready: true } });
    const adapter = Object.create(PhotonAdapter.prototype) as any;
    adapter.name = 'secure-photon';
    adapter.elicitationServer = { requestInput };
    adapter.settingsSchema = {
      properties: {
        region: { type: 'string' },
        API_TOKEN: { type: 'string', writeOnly: true },
      },
      required: ['region', 'API_TOKEN'],
    };

    const result = await adapter.elicitRequiredSettings();

    expect(result).toEqual({ region: 'us-east-1', API_TOKEN: 'local-secret' });
    expect(requestInput).toHaveBeenCalledTimes(2);
    expect(requestInput.mock.calls[0][0].requestedSchema.properties).toEqual({
      region: { type: 'string' },
    });
    expect(requestInput.mock.calls[1][0].requestedSchema.properties).toEqual({
      ready: expect.objectContaining({ type: 'boolean' }),
    });
    expect(JSON.stringify(requestInput.mock.calls)).not.toContain('local-secret');
  });

  it('reads Photon password asks from the local clipboard', async () => {
    jest.spyOn(clipboardy, 'read').mockResolvedValue('photon-password');
    const write = jest.spyOn(clipboardy, 'write').mockResolvedValue();
    const requestInput = jest.fn<UserInputProvider['requestInput']>().mockResolvedValue({
      action: 'accept',
      content: { ready: true },
    });
    const adapter = Object.create(PhotonAdapter.prototype) as any;
    adapter.elicitationServer = { requestInput };

    const provider = adapter.createInputProvider();
    const result = await provider({
      ask: 'password',
      message: 'Database password',
      required: true,
    });

    expect(result).toBe('photon-password');
    expect(write).toHaveBeenCalledWith('');
    expect(JSON.stringify(requestInput.mock.calls)).not.toContain('photon-password');
  });
});
