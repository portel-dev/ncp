import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { access, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
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

describe('MCP OAuth callback handling', () => {
  let storageDir: string | undefined;

  afterEach(async () => {
    if (storageDir) {
      await rm(storageDir, { recursive: true, force: true });
      storageDir = undefined;
    }
  });

  const getStatus = (url: string): Promise<number> => new Promise((resolve, reject) => {
    const req = httpRequest(url, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on('error', reject);
    req.end();
  });

  it('validates state and passes the complete callback parameters to finishAuth', async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'ncp-oauth-callback-'));
    const portProbe = createServer();
    await new Promise<void>((resolve) => portProbe.listen(0, 'localhost', resolve));
    const port = (portProbe.address() as { port: number }).port;
    await new Promise<void>((resolve, reject) => portProbe.close((error) => error ? reject(error) : resolve()));

    const secureState = new Map<string, string>();
    const provider = new MCPOAuthProvider({
      serverUrl: 'https://callback-mcp.example.test',
      callbackPort: port,
      storageDir,
      credentialStore: {
        getCredential: async (name: string, type: string) => secureState.get(`${name}:${type}`) || null,
        setCredential: async (name: string, type: string, value: unknown) => {
          secureState.set(`${name}:${type}`, String(value));
          return true;
        },
      } as any,
    });
    const finishAuth = jest.fn(async (_params: URLSearchParams) => undefined);
    provider.setFinishAuthHandler(finishAuth);
    const expectedState = await provider.state();
    const callback = provider.waitForCallback(5000);

    const callbackUrl = provider.redirectUrl;
    const wrongStateStatus = await getStatus(`${callbackUrl}?code=attacker-code&state=wrong-state`).catch((error) => {
      throw new Error(`wrong-state callback request failed: ${String(error)}`);
    });
    expect(wrongStateStatus).toBe(400);
    expect(finishAuth).not.toHaveBeenCalled();

    const params = new URLSearchParams({
      code: 'authorization-code',
      state: expectedState,
      iss: 'https://issuer.example.test',
    });
    const callbackStatus = await getStatus(`${callbackUrl}?${params.toString()}`);
    expect(callbackStatus).toBe(200);
    await expect(callback).resolves.toEqual(params);
    expect(finishAuth).toHaveBeenCalledTimes(1);
    expect(finishAuth).toHaveBeenCalledWith(params);
    await expect(provider.waitForAuthorization()).resolves.toBeUndefined();
  });

  it('declares the loopback redirect as a native OAuth client', () => {
    const provider = new MCPOAuthProvider({
      serverUrl: 'https://native-mcp.example.test',
      credentialStore: { getCredential: async () => null, setCredential: async () => true } as any,
    });
    expect(provider.clientMetadata.application_type).toBe('native');
    expect(provider.clientMetadata.redirect_uris).toEqual([provider.redirectUrl]);
  });

  it('writes manual browser instructions to stderr when browser launch is unavailable', async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'ncp-oauth-fallback-'));
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, 'localhost', resolve));
    const callbackPort = (probe.address() as { port: number }).port;
    await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
    const secureState = new Map<string, string>();
    const provider = new MCPOAuthProvider({
      serverUrl: 'https://fallback-mcp.example.test',
      callbackPort,
      storageDir,
      credentialStore: {
        getCredential: async (name: string, type: string) => secureState.get(`${name}:${type}`) || null,
        setCredential: async (name: string, type: string, value: unknown) => {
          secureState.set(`${name}:${type}`, String(value));
          return true;
        },
      } as any,
    });
    provider.setFinishAuthHandler(async () => undefined);
    (provider as any).openBrowser = async () => false;
    await provider.state();
    const stdout = jest.spyOn(console, 'log');
    const stderr = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await provider.redirectToAuthorization(new URL('https://auth.example.test/authorize'));
      expect(stdout).not.toHaveBeenCalled();
      expect(stderr).toHaveBeenCalled();
    } finally {
      provider.cancelAuthorization();
      stderr.mockRestore();
    }
  });
});
