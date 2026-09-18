import { describe, expect, it } from '@jest/globals';
import { redactSensitiveData } from '../src/utils/redact-sensitive.js';

describe('redactSensitiveData', () => {
  it('redacts sensitive values recursively before model-visible output', () => {
    expect(redactSensitiveData({
      query: 'visible',
      auth: {
        token: 'hidden-token',
        region: 'us-east-1',
      },
      nested: [{ password: 'hidden-password' }],
    })).toEqual({
      query: 'visible',
      auth: '********',
      nested: [{ password: '********' }],
    });
  });
});
