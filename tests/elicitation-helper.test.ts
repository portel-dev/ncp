import { afterEach, describe, expect, it, jest } from '@jest/globals';
import clipboardy from 'clipboardy';
import {
  collectBulkCredentials,
  collectCredential,
  collectCredentials,
  type UserInputProvider,
} from '../src/utils/elicitation-helper.js';

describe('request-scoped credential collection', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps a single credential out of the MCP input response', async () => {
    const read = jest.spyOn(clipboardy, 'read').mockResolvedValue(' secret-token ');
    const write = jest.spyOn(clipboardy, 'write').mockResolvedValue();
    const requestInput = jest.fn<UserInputProvider['requestInput']>().mockResolvedValue({
      action: 'accept',
      content: { ready: true },
    });

    const result = await collectCredential(
      { requestInput },
      'API token',
      'API_TOKEN',
    );

    expect(result).toBe('secret-token');
    expect(read).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('');
    expect(requestInput.mock.calls[0][0].requestedSchema).toEqual({
      type: 'object',
      properties: {
        ready: expect.objectContaining({ type: 'boolean' }),
      },
      required: ['ready'],
    });
    expect(JSON.stringify(requestInput.mock.calls[0][0])).not.toContain('secret-token');
  });

  it('collects required and optional credentials from one clipboard payload', async () => {
    jest.spyOn(clipboardy, 'read').mockResolvedValue(JSON.stringify({
      API_TOKEN: ' secret ',
      OPTIONAL_REGION: '',
    }));
    const write = jest.spyOn(clipboardy, 'write').mockResolvedValue();
    const requestInput = jest.fn<UserInputProvider['requestInput']>().mockResolvedValue({
      action: 'accept',
      content: { ready: true },
    });

    const result = await collectCredentials(
      { requestInput },
      [
        { envVarName: 'API_TOKEN', displayName: 'API token' },
        { envVarName: 'OPTIONAL_REGION', displayName: 'Region', required: false },
      ],
    );

    expect(requestInput).toHaveBeenCalledTimes(1);
    expect(requestInput.mock.calls[0][0].requestedSchema.required).toEqual(['ready']);
    expect(requestInput.mock.calls[0][0].requestedSchema.properties).toEqual({
      ready: expect.objectContaining({ type: 'boolean' }),
    });
    expect(result).toEqual({ API_TOKEN: 'secret' });
    expect(write).toHaveBeenCalledWith('');
  });

  it('uses one local clipboard payload across multiple MCPs', async () => {
    jest.spyOn(clipboardy, 'read').mockResolvedValue(JSON.stringify({
      github: { GITHUB_TOKEN: 'token' },
      maps: { REGION: '' },
    }));
    const write = jest.spyOn(clipboardy, 'write').mockResolvedValue();
    const requestInput = jest.fn<UserInputProvider['requestInput']>().mockResolvedValue({
      action: 'accept',
      content: { ready: true },
    });

    const result = await collectBulkCredentials(
      { requestInput },
      {
        github: [{ envVarName: 'GITHUB_TOKEN', displayName: 'GitHub token' }],
        maps: [{ envVarName: 'REGION', displayName: 'Region', required: false }],
      },
    );

    expect(requestInput).toHaveBeenCalledTimes(1);
    expect(requestInput.mock.calls[0][0].requestedSchema).toMatchObject({
      required: ['ready'],
      properties: { ready: { type: 'boolean' } },
    });
    expect(result).toEqual({ 'github:GITHUB_TOKEN': 'token' });
    expect(write).toHaveBeenCalledWith('');
  });
});
