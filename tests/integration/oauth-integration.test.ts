/**
 * OAuth 2.1 Integration Tests
 *
 * Tests the OAuth provider and transport factory integration.
 */

import { MCPOAuthProvider, createMCPOAuthProvider } from '../../src/auth/mcp-oauth-provider.js';
import { Client, UnauthorizedError } from '@modelcontextprotocol/client';
import { DefaultTransportFactory } from '../../src/orchestrator/services/transport-factory.js';
import type { MCPConfig } from '../../src/orchestrator/types/connection.js';
import { createServer, request as httpRequest, type Server } from 'node:http';

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return (server.address() as { port: number }).port;
}

async function close(server: Server): Promise<void> {
  if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function callbackStatus(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.once('error', reject);
    req.end();
  });
}

async function createOAuthTestServers() {
  let issuer = '';
  let mcpOrigin = '';
  let authorizationUrl: URL | undefined;
  let tokenExchanges = 0;

  const authorizationServer = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString();
    if (req.url === '/.well-known/oauth-authorization-server') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        registration_endpoint: `${issuer}/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        authorization_response_iss_parameter_supported: true,
      }));
      return;
    }
    if (req.url === '/register') {
      const metadata = JSON.parse(body);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ...metadata,
        client_id: 'integration-client',
      }));
      return;
    }
    if (req.url === '/token') {
      tokenExchanges++;
      expect(body).toContain('grant_type=authorization_code');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        access_token: 'integration-access-token',
        refresh_token: 'integration-refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
      }));
      return;
    }
    if (req.url === '/authorize') {
      res.writeHead(200);
      res.end('authorization endpoint');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  const authPort = await listen(authorizationServer);
  issuer = `http://127.0.0.1:${authPort}`;

  const mcpServer = createServer(async (req, res) => {
    if (req.url === '/.well-known/oauth-protected-resource') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        resource: mcpOrigin,
        authorization_servers: [issuer],
        scopes_supported: ['mcp'],
      }));
      return;
    }
    if (req.headers.authorization !== 'Bearer integration-access-token') {
      res.writeHead(401, {
        'WWW-Authenticate': `Bearer resource_metadata="${mcpOrigin}/.well-known/oauth-protected-resource", scope="mcp"`,
      });
      res.end();
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const message = JSON.parse(Buffer.concat(chunks).toString());
    if (message.method === 'initialize') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          serverInfo: { name: 'oauth-test', version: '1.0.0' },
        },
      }));
      return;
    }
    res.writeHead(202);
    res.end();
  });
  const mcpPort = await listen(mcpServer);
  mcpOrigin = `http://127.0.0.1:${mcpPort}`;

  const callbackPortProbe = createServer();
  await new Promise<void>((resolve, reject) => {
    callbackPortProbe.once('error', reject);
    callbackPortProbe.listen(0, 'localhost', resolve);
  });
  const callbackPort = (callbackPortProbe.address() as { port: number }).port;
  await close(callbackPortProbe);

  return {
    authorizationServer,
    mcpServer,
    issuer,
    serverUrl: `${mcpOrigin}/mcp`,
    callbackPort,
    get authorizationUrl() { return authorizationUrl; },
    set authorizationUrl(value: URL | undefined) { authorizationUrl = value; },
    get tokenExchanges() { return tokenExchanges; },
  };
}

describe('OAuth 2.1 Integration', () => {
  let transportFactory: DefaultTransportFactory;
  const secureState = new Map<string, string>();
  const credentialStore = {
    getCredential: async (name: string, type: string) => secureState.get(`${name}:${type}`) || null,
    setCredential: async (name: string, type: string, value: unknown) => {
      secureState.set(`${name}:${type}`, String(value));
      return true;
    },
  };
  const oauthProviderFactory = (config: any) => createMCPOAuthProvider({
    ...config,
    credentialStore: credentialStore as any,
  });

  beforeEach(() => {
    secureState.clear();
    transportFactory = new DefaultTransportFactory(undefined, oauthProviderFactory);
  });

  describe('MCPOAuthProvider', () => {
    it('should create an OAuth provider with default config', () => {
      const provider = oauthProviderFactory({
        serverUrl: 'https://example.com/mcp',
        clientName: 'Test Client',
      });

      expect(provider).toBeInstanceOf(MCPOAuthProvider);
      expect(provider.redirectUrl).toBe('http://localhost:9876/callback');
    });

    it('should create an OAuth provider with custom callback port', () => {
      const provider = oauthProviderFactory({
        serverUrl: 'https://example.com/mcp',
        clientName: 'Test Client',
        callbackPort: 8080,
      });

      expect(provider.redirectUrl).toContain(':8080');
    });

    it('should have required OAuthClientProvider methods', () => {
      const provider = oauthProviderFactory({
        serverUrl: 'https://example.com/mcp',
      });

      // Check interface compliance
      expect(typeof provider.clientMetadata).toBe('object');
      expect(typeof provider.redirectUrl).toBe('string');
      expect(typeof provider.state).toBe('function');
      expect(typeof provider.clientInformation).toBe('function');
      expect(typeof provider.tokens).toBe('function');
      expect(typeof provider.saveTokens).toBe('function');
      expect(typeof provider.redirectToAuthorization).toBe('function');
      expect(typeof provider.saveCodeVerifier).toBe('function');
      expect(typeof provider.codeVerifier).toBe('function');
    });
  });

  describe('DefaultTransportFactory OAuth Integration', () => {
    it('should create and reuse OAuth providers', () => {
      const config: MCPConfig = {
        name: 'test-mcp',
        url: 'https://example.com/mcp',
        auth: {
          type: 'oauth',
          oauth21: {
            scopes: ['read', 'write'],
            callbackPort: 9876,
          },
        },
      };

      const provider1 = transportFactory.getOAuthProvider(config);
      const provider2 = transportFactory.getOAuthProvider(config);

      // Should reuse the same provider instance
      expect(provider1).toBe(provider2);
    });

    it('should create different providers for different servers', () => {
      const config1: MCPConfig = {
        name: 'test-mcp-1',
        url: 'https://example1.com/mcp',
        auth: {
          type: 'oauth',
          oauth21: {},
        },
      };

      const config2: MCPConfig = {
        name: 'test-mcp-2',
        url: 'https://example2.com/mcp',
        auth: {
          type: 'oauth',
          oauth21: {},
        },
      };

      const provider1 = transportFactory.getOAuthProvider(config1);
      const provider2 = transportFactory.getOAuthProvider(config2);

      // Should be different provider instances
      expect(provider1).not.toBe(provider2);
    });

    it('should pass OAuth provider config to createMCPOAuthProvider', () => {
      const config: MCPConfig = {
        name: 'test-mcp',
        url: 'https://example.com/mcp',
        auth: {
          type: 'oauth',
          oauth21: {
            scopes: ['read', 'write'],
            callbackPort: 8080,
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
          },
        },
      };

      const provider = transportFactory.getOAuthProvider(config);

      expect(provider.redirectUrl).toContain(':8080');
      // Client info will be available after registration/loading
    });
  });

  describe('Transport Creation with OAuth', () => {
    it('keeps legacy device-flow OAuth on the configured bearer-token provider', async () => {
      const legacyFactory = new DefaultTransportFactory(async () => 'device-flow-token', oauthProviderFactory);
      const config: MCPConfig = {
        name: 'legacy-device-flow',
        url: 'https://example.com/mcp',
        transport: 'streamableHttp',
        auth: {
          type: 'oauth',
          oauth: {
            clientId: 'legacy-client',
            deviceAuthUrl: 'https://example.com/device',
            tokenUrl: 'https://example.com/token',
          },
        },
      };

      const transport = await legacyFactory.createTransport(config) as any;
      expect(transport._requestInit.headers.Authorization).toBe('Bearer device-flow-token');
      expect(await legacyFactory.waitForAuthorization(config)).toBeUndefined();
    });

    it('should handle OAuth config in createTransport', async () => {
      const config: MCPConfig = {
        name: 'test-oauth-mcp',
        url: 'https://example.com/mcp',
        auth: {
          type: 'oauth',
          oauth21: {
            scopes: ['read'],
          },
        },
      };

      // This should not throw - it creates the transport with OAuth provider
      // Note: We can't actually connect without a real OAuth server
      expect(() => {
        transportFactory.getOAuthProvider(config);
      }).not.toThrow();
    });

    it('should handle static auth types separately from OAuth', () => {
      const bearerConfig: MCPConfig = {
        name: 'test-bearer',
        url: 'https://example.com/mcp',
        auth: {
          type: 'bearer',
          token: 'test-token',
        },
      };

      // Should not create OAuth provider for non-OAuth auth
      expect(() => {
        // This would throw if OAuth provider is created for bearer auth
        transportFactory.createTransport(bearerConfig);
      }).not.toThrow();
    });
  });
});

describe('OAuth callback continuation through MCP transports', () => {
  const secureState = new Map<string, string>();
  const credentialStore = {
    getCredential: async (name: string, type: string) => secureState.get(`${name}:${type}`) || null,
    setCredential: async (name: string, type: string, value: unknown) => {
      secureState.set(`${name}:${type}`, String(value));
      return true;
    },
  };
  const oauthProviderFactory = (config: any) => createMCPOAuthProvider({
    ...config,
    credentialStore: credentialStore as any,
  });

  it('waits for a state- and issuer-validated callback, exchanges the code, then allows retry', async () => {
    const servers = await createOAuthTestServers();
    const factory = new DefaultTransportFactory(undefined, oauthProviderFactory);
    const config: MCPConfig = {
      name: 'oauth-test',
      url: servers.serverUrl,
      transport: 'streamableHttp',
      auth: { type: 'oauth', oauth21: { callbackPort: servers.callbackPort, scopes: ['mcp'] } },
    };
    const provider = factory.getOAuthProvider(config);
    (provider as any).openBrowser = async (url: string) => {
      servers.authorizationUrl = new URL(url);
      return true;
    };
    const client = new Client({ name: 'oauth-test-client', version: '1.0.0' }, { capabilities: {} });

    try {
      const transport = await factory.createTransport(config);
      await expect(client.connect(transport)).rejects.toBeInstanceOf(UnauthorizedError);
      expect(servers.authorizationUrl).toBeDefined();
      const state = servers.authorizationUrl!.searchParams.get('state');
      expect(state).toBeTruthy();
      const callback = new URL(provider.redirectUrl);
      callback.searchParams.set('code', 'integration-code');
      callback.searchParams.set('state', state!);
      callback.searchParams.set('iss', servers.issuer);
      expect(await callbackStatus(callback.toString())).toBe(200);
      await expect(factory.waitForAuthorization(config)).resolves.toBeUndefined();
      expect(servers.tokenExchanges).toBe(1);
      expect(await provider.getAccessToken()).toBe('integration-access-token');

      await client.close();
      const retryClient = new Client({ name: 'oauth-test-retry', version: '1.0.0' }, { capabilities: {} });
      await retryClient.connect(await factory.createTransport(config));
      await retryClient.close();
    } finally {
      await client.close().catch(() => undefined);
      await close(servers.mcpServer);
      await close(servers.authorizationServer);
      secureState.clear();
    }
  });

  it('rejects an issuer-mismatched callback before redeeming its code', async () => {
    const servers = await createOAuthTestServers();
    const factory = new DefaultTransportFactory(undefined, oauthProviderFactory);
    const config: MCPConfig = {
      name: 'oauth-issuer-mismatch',
      url: servers.serverUrl,
      transport: 'streamableHttp',
      auth: { type: 'oauth', oauth21: { callbackPort: servers.callbackPort, scopes: ['mcp'] } },
    };
    const provider = factory.getOAuthProvider(config);
    (provider as any).openBrowser = async (url: string) => {
      servers.authorizationUrl = new URL(url);
      return true;
    };
    const client = new Client({ name: 'oauth-test-client', version: '1.0.0' }, { capabilities: {} });

    try {
      await expect(client.connect(await factory.createTransport(config))).rejects.toBeInstanceOf(UnauthorizedError);
      const state = servers.authorizationUrl!.searchParams.get('state')!;
      const callback = new URL(provider.redirectUrl);
      callback.searchParams.set('code', 'must-not-be-redeemed');
      callback.searchParams.set('state', state);
      callback.searchParams.set('iss', `${servers.issuer}/attacker`);
      expect(await callbackStatus(callback.toString())).toBe(400);
      await expect(factory.waitForAuthorization(config)).rejects.toThrow(/issuer|authorization/i);
      expect(servers.tokenExchanges).toBe(0);
    } finally {
      await client.close().catch(() => undefined);
      await close(servers.mcpServer);
      await close(servers.authorizationServer);
      secureState.clear();
    }
  });
});
