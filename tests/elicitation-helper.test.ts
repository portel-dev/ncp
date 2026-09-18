import { describe, expect, it, jest } from '@jest/globals';
import {
  collectBulkCredentials,
  collectCredentials,
  type UserInputProvider,
} from '../src/utils/elicitation-helper.js';

describe('request-scoped credential collection', () => {
  it('collects required and optional credentials in one form', async () => {
    const requestInput = jest.fn<UserInputProvider['requestInput']>().mockResolvedValue({
      action: 'accept',
      content: { API_TOKEN: ' secret ', OPTIONAL_REGION: '' },
    });

    const result = await collectCredentials(
      { requestInput },
      [
        { envVarName: 'API_TOKEN', displayName: 'API token' },
        { envVarName: 'OPTIONAL_REGION', displayName: 'Region', required: false },
      ],
    );

    expect(requestInput).toHaveBeenCalledTimes(1);
    expect(requestInput.mock.calls[0][0].requestedSchema).toMatchObject({
      required: ['API_TOKEN'],
      properties: {
        API_TOKEN: { type: 'string', minLength: 1 },
        OPTIONAL_REGION: { type: 'string' },
      },
    });
    expect(requestInput.mock.calls[0][0].requestedSchema.properties.OPTIONAL_REGION).not.toHaveProperty('minLength');
    expect(result).toEqual({ API_TOKEN: 'secret' });
  });

  it('uses one consolidated form across multiple MCPs', async () => {
    const requestInput = jest.fn<UserInputProvider['requestInput']>().mockResolvedValue({
      action: 'accept',
      content: { 'github:GITHUB_TOKEN': 'token', 'maps:REGION': '' },
    });

    const result = await collectBulkCredentials(
      { requestInput },
      {
        github: [{ envVarName: 'GITHUB_TOKEN', displayName: 'GitHub token' }],
        maps: [{ envVarName: 'REGION', displayName: 'Region', required: false }],
      },
    );

    expect(requestInput).toHaveBeenCalledTimes(1);
    expect(requestInput.mock.calls[0][0].requestedSchema.required).toEqual(['github:GITHUB_TOKEN']);
    expect(requestInput.mock.calls[0][0].requestedSchema.properties['github:GITHUB_TOKEN']).toMatchObject({
      type: 'string',
      minLength: 1,
    });
    expect(result).toEqual({ 'github:GITHUB_TOKEN': 'token' });
  });
});
