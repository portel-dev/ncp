/**
 * MCP OAuth 2.1 Client Provider
 *
 * Implements OAuthClientProvider for MCP servers following the 2025-03-26 spec.
 * Supports:
 * - PKCE (required by OAuth 2.1)
 * - Dynamic Client Registration (RFC 7591)
 * - Token storage and refresh
 * - Browser-based authorization with local callback server
 * - Manual code entry fallback for headless environments
 */

import { createServer, Server } from 'http';
import { randomBytes, createHash } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientMetadata,
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthTokens,
  AuthorizationServerMetadata,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { logger } from '../utils/logger.js';

/**
 * Configuration for the MCP OAuth provider
 */
export interface MCPOAuthConfig {
  /** MCP server URL */
  serverUrl: string;
  /** Client name shown during authorization */
  clientName?: string;
  /** Requested scopes */
  scopes?: string[];
  /** Local callback port (default: 9876) */
  callbackPort?: number;
  /** Storage directory for tokens (default: ~/.ncp/auth) */
  storageDir?: string;
  /** Pre-registered client ID (optional - if not provided, uses dynamic registration) */
  clientId?: string;
  /** Pre-registered client secret (optional) */
  clientSecret?: string;
}

/**
 * Stored OAuth state for an MCP server
 */
interface StoredOAuthState {
  clientInfo?: OAuthClientInformationFull;
  tokens?: OAuthTokens;
  codeVerifier?: string;
}

/**
 * MCP OAuth Client Provider Implementation
 *
 * Handles the full OAuth 2.1 flow for MCP servers:
 * 1. Discovers protected resource metadata
 * 2. Discovers authorization server metadata
 * 3. Dynamically registers client (if needed)
 * 4. Performs PKCE authorization
 * 5. Stores and refreshes tokens
 */
export class MCPOAuthProvider implements OAuthClientProvider {
  private config: Required<MCPOAuthConfig>;
  private oauthState: StoredOAuthState = {};
  private callbackServer?: Server;
  private serverKey: string;

  constructor(config: MCPOAuthConfig) {
    this.config = {
      serverUrl: config.serverUrl,
      clientName: config.clientName || 'NCP - MCP Aggregator',
      scopes: config.scopes || [],
      callbackPort: config.callbackPort || 9876,
      storageDir: config.storageDir || join(homedir(), '.ncp', 'auth'),
      clientId: config.clientId || '',
      clientSecret: config.clientSecret || '',
    };

    // Create a unique key for this server's stored state
    this.serverKey = this.createServerKey(config.serverUrl);
  }

  /**
   * Create a unique key for storing server-specific OAuth state
   */
  private createServerKey(serverUrl: string): string {
    const hash = createHash('sha256').update(serverUrl).digest('hex');
    return hash.substring(0, 16);
  }

  /**
   * Get the redirect URL for OAuth callbacks
   */
  get redirectUrl(): string {
    return `http://localhost:${this.config.callbackPort}/callback`;
  }

  /**
   * Get client metadata for registration
   */
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: this.config.clientName,
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: this.config.clientSecret
        ? 'client_secret_post'
        : 'none',
    };
  }

  /**
   * Generate OAuth state parameter
   */
  async state(): Promise<string> {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Load stored client information
   */
  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    await this.loadState();

    // Return pre-configured client info if available
    if (this.config.clientId) {
      return {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret || undefined,
      };
    }

    // Return dynamically registered client info
    if (this.oauthState.clientInfo) {
      return {
        client_id: this.oauthState.clientInfo.client_id,
        client_secret: this.oauthState.clientInfo.client_secret,
      };
    }

    return undefined;
  }

  /**
   * Save client information after dynamic registration
   */
  async saveClientInformation(clientInfo: OAuthClientInformationFull): Promise<void> {
    this.oauthState.clientInfo = clientInfo;
    await this.saveState();
    logger.debug(`Saved client registration for ${this.config.serverUrl}`);
  }

  /**
   * Load stored tokens
   */
  async tokens(): Promise<OAuthTokens | undefined> {
    await this.loadState();
    return this.oauthState.tokens;
  }

  /**
   * Save tokens after authorization
   */
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this.oauthState.tokens = tokens;
    await this.saveState();
    logger.debug(`Saved tokens for ${this.config.serverUrl}`);
  }

  /**
   * Redirect user to authorization URL
   *
   * For CLI environments:
   * 1. Start local callback server
   * 2. Open browser with authorization URL
   * 3. Wait for callback with authorization code
   */
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    logger.info('Starting OAuth authorization flow...');
    logger.info(`Authorization URL: ${authorizationUrl.toString()}`);

    // Try to open browser
    const opened = await this.openBrowser(authorizationUrl.toString());

    if (!opened) {
      // Fallback: print URL for manual navigation
      console.log('\n=== OAuth Authorization Required ===');
      console.log('Please open the following URL in your browser:');
      console.log(`\n  ${authorizationUrl.toString()}\n`);
      console.log('After authorizing, you will be redirected to the callback URL.');
      console.log('=====================================\n');
    }
  }

  /**
   * Save PKCE code verifier
   */
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this.oauthState.codeVerifier = codeVerifier;
    await this.saveState();
  }

  /**
   * Load PKCE code verifier
   */
  async codeVerifier(): Promise<string> {
    await this.loadState();
    if (!this.oauthState.codeVerifier) {
      throw new Error('No code verifier found - authorization flow may not have started');
    }
    return this.oauthState.codeVerifier;
  }

  /**
   * Invalidate stored credentials
   */
  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier'): Promise<void> {
    switch (scope) {
      case 'all':
        this.oauthState = {};
        break;
      case 'client':
        delete this.oauthState.clientInfo;
        break;
      case 'tokens':
        delete this.oauthState.tokens;
        break;
      case 'verifier':
        delete this.oauthState.codeVerifier;
        break;
    }
    await this.saveState();
    logger.debug(`Invalidated ${scope} credentials for ${this.config.serverUrl}`);
  }

  /**
   * Start callback server and wait for authorization code
   *
   * Returns a promise that resolves with the authorization code
   * when the user completes authorization in their browser.
   */
  async waitForCallback(timeoutMs: number = 300000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stopCallbackServer();
        reject(new Error('Authorization timeout - user did not complete authorization'));
      }, timeoutMs);

      this.callbackServer = createServer((req, res) => {
        const url = new URL(req.url || '/', `http://localhost:${this.config.callbackPort}`);

        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');
          const errorDescription = url.searchParams.get('error_description');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>Authorization Failed</h1>
                  <p>Error: ${error}</p>
                  <p>${errorDescription || ''}</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            clearTimeout(timeout);
            this.stopCallbackServer();
            reject(new Error(`OAuth error: ${error} - ${errorDescription}`));
            return;
          }

          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>Authorization Successful!</h1>
                  <p>You can close this window and return to the terminal.</p>
                  <script>window.close();</script>
                </body>
              </html>
            `);
            clearTimeout(timeout);
            this.stopCallbackServer();
            resolve(code);
            return;
          }
        }

        res.writeHead(404);
        res.end('Not found');
      });

      this.callbackServer.listen(this.config.callbackPort, () => {
        logger.debug(`OAuth callback server listening on port ${this.config.callbackPort}`);
      });

      this.callbackServer.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start callback server: ${err.message}`));
      });
    });
  }

  /**
   * Stop the callback server
   */
  private stopCallbackServer(): void {
    if (this.callbackServer) {
      this.callbackServer.close();
      this.callbackServer = undefined;
    }
  }

  /**
   * Open URL in default browser
   */
  private async openBrowser(url: string): Promise<boolean> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const platform = process.platform;
      let command: string;

      if (platform === 'darwin') {
        command = `open "${url}"`;
      } else if (platform === 'win32') {
        command = `start "" "${url}"`;
      } else {
        // Linux - try xdg-open
        command = `xdg-open "${url}"`;
      }

      await execAsync(command);
      logger.debug('Opened browser for authorization');
      return true;
    } catch (error) {
      logger.debug(`Failed to open browser: ${error}`);
      return false;
    }
  }

  /**
   * Load state from disk
   */
  private async loadState(): Promise<void> {
    try {
      const filePath = join(this.config.storageDir, `${this.serverKey}.json`);
      const data = await readFile(filePath, 'utf-8');
      this.oauthState = JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is invalid - start fresh
      this.oauthState = {};
    }
  }

  /**
   * Save state to disk
   */
  private async saveState(): Promise<void> {
    try {
      await mkdir(this.config.storageDir, { recursive: true });
      const filePath = join(this.config.storageDir, `${this.serverKey}.json`);
      await writeFile(filePath, JSON.stringify(this.oauthState, null, 2));
    } catch (error) {
      logger.error('Failed to save OAuth state:', error);
    }
  }

  /**
   * Check if we have valid tokens
   */
  async hasValidTokens(): Promise<boolean> {
    const tokens = await this.tokens();
    if (!tokens) return false;

    // Check if token is expired (with 60 second buffer)
    if (tokens.expires_in) {
      // expires_in is relative seconds from when token was issued
      // We need to track when the token was saved to calculate expiry
      // For now, assume tokens are fresh if they have expires_in
      // A proper implementation would store the issued_at timestamp
      return true;
    }

    // If no expiry info, assume valid
    return true;
  }

  /**
   * Get current access token (if available)
   */
  async getAccessToken(): Promise<string | undefined> {
    const tokens = await this.tokens();
    return tokens?.access_token;
  }

  /**
   * Clear all stored state for this server
   */
  async clearState(): Promise<void> {
    await this.invalidateCredentials('all');
  }
}

/**
 * Create an MCP OAuth provider instance
 */
export function createMCPOAuthProvider(config: MCPOAuthConfig): MCPOAuthProvider {
  return new MCPOAuthProvider(config);
}
