import { afterEach, describe, expect, it } from '@jest/globals';
import { access, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
    const secureState = new Map<string, string>();
    const credentialStore = {
      getCredential: async (name: string, type: string) => secureState.get(`${name}:${type}`) || null,
      setCredential: async (name: string, type: string, value: unknown) => {
        secureState.set(`${name}:${type}`, String(value));
        return true;
      },
    };
    const provider = new MCPOAuthProvider({
      serverUrl: 'https://mcp.example.test',
      storageDir,
      credentialStore: credentialStore as any,
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
    expect(await readdir(storageDir)).toEqual([]);
    expect([...secureState.values()].join('\n')).toContain('token-a');
  });

  it('moves legacy plaintext OAuth state into secure storage', async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'ncp-oauth-migration-'));
    const serverUrl = 'https://legacy-mcp.example.test';
    const serverKey = createHash('sha256').update(serverUrl).digest('hex').substring(0, 16);
    const legacyPath = join(storageDir, `${serverKey}.json`);
    await writeFile(legacyPath, JSON.stringify({
      tokens: {
        access_token: 'legacy-access-token',
        refresh_token: 'legacy-refresh-token',
        token_type: 'Bearer',
      },
      codeVerifier: 'legacy-pkce-verifier',
    }));

    const secureState = new Map<string, string>();
    const provider = new MCPOAuthProvider({
      serverUrl,
      storageDir,
      credentialStore: {
        getCredential: async (name: string, type: string) => secureState.get(`${name}:${type}`) || null,
        setCredential: async (name: string, type: string, value: unknown) => {
          secureState.set(`${name}:${type}`, String(value));
          return true;
        },
      } as any,
    });

    expect((await provider.tokens())?.access_token).toBe('legacy-access-token');
    expect(await provider.codeVerifier()).toBe('legacy-pkce-verifier');
    expect([...secureState.values()].join('\n')).toContain('legacy-refresh-token');
    await expect(access(legacyPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails closed when OAuth state cannot be stored securely', async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'ncp-oauth-fail-closed-'));
    const provider = new MCPOAuthProvider({
      serverUrl: 'https://unwritable-mcp.example.test',
      storageDir,
      credentialStore: {
        getCredential: async () => null,
        setCredential: async () => false,
      } as any,
    });

    await expect(provider.saveTokens({
      access_token: 'must-not-be-written',
      token_type: 'Bearer',
    })).rejects.toThrow('Secure storage rejected OAuth state');
    expect(await readdir(storageDir)).toEqual([]);
  });
});
