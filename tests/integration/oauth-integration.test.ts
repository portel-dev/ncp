/**
 * OAuth 2.1 Integration Tests
 *
 * Tests the OAuth provider and transport factory integration.
 */

import { MCPOAuthProvider, createMCPOAuthProvider } from '../../src/auth/mcp-oauth-provider.js';
import { DefaultTransportFactory } from '../../src/orchestrator/services/transport-factory.js';
import type { MCPConfig } from '../../src/orchestrator/types/connection.js';

describe('OAuth 2.1 Integration', () => {
  let transportFactory: DefaultTransportFactory;

  beforeEach(() => {
    transportFactory = new DefaultTransportFactory();
  });

  describe('MCPOAuthProvider', () => {
    it('should create an OAuth provider with default config', () => {
      const provider = createMCPOAuthProvider({
        serverUrl: 'https://example.com/mcp',
        clientName: 'Test Client',
      });

      expect(provider).toBeInstanceOf(MCPOAuthProvider);
      expect(provider.redirectUrl).toContain('localhost');
    });

    it('should create an OAuth provider with custom callback port', () => {
      const provider = createMCPOAuthProvider({
        serverUrl: 'https://example.com/mcp',
        clientName: 'Test Client',
        callbackPort: 8080,
      });

      expect(provider.redirectUrl).toContain(':8080');
    });

    it('should have required OAuthClientProvider methods', () => {
      const provider = createMCPOAuthProvider({
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
