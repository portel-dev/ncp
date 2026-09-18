import { afterEach, describe, expect, it } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MCPOAuthProvider } from '../src/auth/mcp-oauth-provider.js';

describe('MCP OAuth issuer isolation', () => {
  let storageDir: string | undefined;

  afterEach(async () => {
    if (storageDir) {
      await rm(storageDir, { recursive: true, force: true });
      storageDir = undefined;
    }
  });

  it('does not reuse registered clients or tokens with a different issuer', async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'ncp-oauth-issuer-'));
    const provider = new MCPOAuthProvider({
      serverUrl: 'https://mcp.example.test',
      storageDir,
    });
    const issuerA = { issuer: 'https://auth-a.example.test' };
    const issuerB = { issuer: 'https://auth-b.example.test' };

    await provider.saveClientInformation({ client_id: 'client-a', issuer: issuerA.issuer });
    await provider.saveTokens({
      access_token: 'token-a',
      token_type: 'Bearer',
      issuer: issuerA.issuer,
    });

    expect((await provider.clientInformation(issuerA))?.client_id).toBe('client-a');
    expect(await provider.clientInformation(issuerB)).toBeUndefined();
    expect((await provider.tokens(issuerA))?.access_token).toBe('token-a');
    expect(await provider.tokens(issuerB)).toBeUndefined();
    // The transport's context-free bearer-token read returns the most recent token.
    expect((await provider.tokens())?.access_token).toBe('token-a');
  });
});
