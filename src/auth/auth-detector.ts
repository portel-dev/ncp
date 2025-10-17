/**
 * Auto-detect authentication requirements from HTTP/SSE MCP servers
 *
 * Analyzes server responses to determine what authentication is needed:
 * - HTTP status codes (401, 403)
 * - WWW-Authenticate headers
 * - OAuth discovery endpoints
 * - MCP protocol error responses
 */

import { logger } from '../utils/logger.js';

export interface AuthRequirements {
  type: 'bearer' | 'oauth' | 'apiKey' | 'basic' | 'none';
  required: boolean;
  fields: AuthField[];
  detected: {
    statusCode?: number;
    wwwAuthenticate?: string;
    errorMessage?: string;
    oauthEndpoints?: {
      deviceAuthUrl?: string;
      tokenUrl?: string;
      authorizationUrl?: string;
    };
  };
}

export interface AuthField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'url';
  required: boolean;
  description?: string;
  placeholder?: string;
}

export class AuthDetector {
  /**
   * Detect authentication requirements by probing the endpoint
   */
  async detect(url: string): Promise<AuthRequirements> {
    logger.debug(`Detecting auth requirements for ${url}`);

    try {
      // Step 1: Try connecting without auth
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream, application/json'
        }
      });

      // Success without auth!
      if (response.ok) {
        logger.debug('Endpoint accessible without authentication');
        return {
          type: 'none',
          required: false,
          fields: [],
          detected: {
            statusCode: response.status
          }
        };
      }

      // Auth required - analyze response
      return this.analyzeAuthResponse(response, url);

    } catch (error: any) {
      logger.debug(`Connection failed: ${error.message}`);

      // Network error - assume endpoint requires auth but we can't detect specifics
      return {
        type: 'bearer', // Default to bearer token
        required: true,
        fields: this.getBearerTokenFields(),
        detected: {
          errorMessage: error.message
        }
      };
    }
  }

  /**
   * Analyze authentication response to determine requirements
   */
  private async analyzeAuthResponse(response: Response, url: string): Promise<AuthRequirements> {
    const statusCode = response.status;
    const wwwAuthenticate = response.headers.get('WWW-Authenticate');
    const contentType = response.headers.get('Content-Type');

    logger.debug(`Auth response: ${statusCode}, WWW-Authenticate: ${wwwAuthenticate}`);

    // Parse WWW-Authenticate header
    if (wwwAuthenticate) {
      const authType = this.parseWWWAuthenticate(wwwAuthenticate);

      if (authType === 'Basic') {
        return {
          type: 'basic',
          required: true,
          fields: this.getBasicAuthFields(),
          detected: {
            statusCode,
            wwwAuthenticate
          }
        };
      }

      if (authType === 'Bearer') {
        // Check for OAuth discovery
        const oauthEndpoints = await this.tryOAuthDiscovery(url);

        if (oauthEndpoints) {
          return {
            type: 'oauth',
            required: true,
            fields: this.getOAuthFields(),
            detected: {
              statusCode,
              wwwAuthenticate,
              oauthEndpoints
            }
          };
        }

        // No OAuth discovery - assume bearer token or API key
        return {
          type: 'bearer',
          required: true,
          fields: this.getBearerTokenFields(),
          detected: {
            statusCode,
            wwwAuthenticate
          }
        };
      }
    }

    // Check response body for error messages
    let errorBody: any = null;
    try {
      if (contentType?.includes('application/json')) {
        errorBody = await response.json();
        logger.debug(`Error body: ${JSON.stringify(errorBody)}`);
      }
    } catch (e) {
      // Ignore parsing errors
    }

    // Look for OAuth hints in error response
    if (errorBody?.error === 'invalid_token' || errorBody?.error === 'unauthorized') {
      const oauthEndpoints = await this.tryOAuthDiscovery(url);

      if (oauthEndpoints) {
        return {
          type: 'oauth',
          required: true,
          fields: this.getOAuthFields(),
          detected: {
            statusCode,
            errorMessage: errorBody.error_description || errorBody.error,
            oauthEndpoints
          }
        };
      }
    }

    // Default to bearer token for 401/403
    if (statusCode === 401 || statusCode === 403) {
      return {
        type: 'bearer',
        required: true,
        fields: this.getBearerTokenFields(),
        detected: {
          statusCode,
          errorMessage: errorBody?.message || errorBody?.error || 'Authentication required'
        }
      };
    }

    // Unknown - default to no auth required
    return {
      type: 'none',
      required: false,
      fields: [],
      detected: {
        statusCode
      }
    };
  }

  /**
   * Parse WWW-Authenticate header to determine auth scheme
   */
  private parseWWWAuthenticate(header: string): string {
    const match = header.match(/^(\w+)/);
    return match ? match[1] : 'Unknown';
  }

  /**
   * Try to discover OAuth endpoints using common patterns
   */
  private async tryOAuthDiscovery(baseUrl: string): Promise<AuthRequirements['detected']['oauthEndpoints'] | null> {
    try {
      // Common OAuth discovery patterns
      const discoveryUrls = [
        new URL('/.well-known/oauth-authorization-server', baseUrl).toString(),
        new URL('/.well-known/openid-configuration', baseUrl).toString(),
        new URL('/oauth/discovery', baseUrl).toString(),
        new URL('/auth/discovery', baseUrl).toString()
      ];

      for (const discoveryUrl of discoveryUrls) {
        try {
          const response = await fetch(discoveryUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
          });

          if (response.ok) {
            const discovery = await response.json();

            return {
              deviceAuthUrl: discovery.device_authorization_endpoint,
              tokenUrl: discovery.token_endpoint,
              authorizationUrl: discovery.authorization_endpoint
            };
          }
        } catch (e) {
          // Continue to next discovery URL
          continue;
        }
      }

      return null;

    } catch (error) {
      logger.debug(`OAuth discovery failed: ${error}`);
      return null;
    }
  }

  /**
   * Get field definitions for bearer token auth
   */
  private getBearerTokenFields(): AuthField[] {
    return [
      {
        name: 'token',
        label: 'Bearer Token',
        type: 'password',
        required: true,
        description: 'Enter your API bearer token',
        placeholder: 'sk-...'
      }
    ];
  }

  /**
   * Get field definitions for API key auth
   */
  private getApiKeyFields(): AuthField[] {
    return [
      {
        name: 'token',
        label: 'API Key',
        type: 'password',
        required: true,
        description: 'Enter your API key',
        placeholder: 'your-api-key-here'
      }
    ];
  }

  /**
   * Get field definitions for basic auth
   */
  private getBasicAuthFields(): AuthField[] {
    return [
      {
        name: 'username',
        label: 'Username',
        type: 'text',
        required: true,
        description: 'Enter your username',
        placeholder: 'username'
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        required: true,
        description: 'Enter your password',
        placeholder: 'password'
      }
    ];
  }

  /**
   * Get field definitions for OAuth
   */
  private getOAuthFields(): AuthField[] {
    return [
      {
        name: 'clientId',
        label: 'OAuth Client ID',
        type: 'text',
        required: true,
        description: 'Your OAuth application client ID',
        placeholder: 'Iv1.abc123...'
      },
      {
        name: 'clientSecret',
        label: 'OAuth Client Secret (optional)',
        type: 'password',
        required: false,
        description: 'Client secret for confidential clients',
        placeholder: 'secret123...'
      },
      {
        name: 'deviceAuthUrl',
        label: 'Device Authorization URL',
        type: 'url',
        required: true,
        description: 'OAuth device authorization endpoint',
        placeholder: 'https://auth.example.com/device/code'
      },
      {
        name: 'tokenUrl',
        label: 'Token URL',
        type: 'url',
        required: true,
        description: 'OAuth token endpoint',
        placeholder: 'https://auth.example.com/token'
      },
      {
        name: 'scopes',
        label: 'Scopes (comma-separated, optional)',
        type: 'text',
        required: false,
        description: 'Requested OAuth scopes',
        placeholder: 'read,write'
      }
    ];
  }

  /**
   * Auto-fill discovered OAuth endpoints
   */
  fillDiscoveredOAuthEndpoints(fields: AuthField[], endpoints: AuthRequirements['detected']['oauthEndpoints']): AuthField[] {
    if (!endpoints) return fields;

    return fields.map(field => {
      if (field.name === 'deviceAuthUrl' && endpoints.deviceAuthUrl) {
        return { ...field, placeholder: endpoints.deviceAuthUrl };
      }
      if (field.name === 'tokenUrl' && endpoints.tokenUrl) {
        return { ...field, placeholder: endpoints.tokenUrl };
      }
      return field;
    });
  }
}
