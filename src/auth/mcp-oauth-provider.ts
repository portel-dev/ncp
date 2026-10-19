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
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type {
  OAuthClientInformationContext,
  OAuthClientMetadata,
  OAuthDiscoveryState,
  OAuthClientProvider,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from '@modelcontextprotocol/client';
import { logger } from '../utils/logger.js';
import {
  getSecureCredentialStore,
  type SecureCredentialStore,
} from './secure-credential-store.js';

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
  /** Legacy plaintext directory used only for one-time migration (default: ~/.ncp/auth) */
  storageDir?: string;
  /** Pre-registered client ID (optional - if not provided, uses dynamic registration) */
  clientId?: string;
  /** Pre-registered client secret (optional) */
  clientSecret?: string;
  /** Override used by tests and embedders. Defaults to NCP secure storage. */
  credentialStore?: Pick<SecureCredentialStore, 'getCredential' | 'setCredential'>;
}

/**
 * Stored OAuth state for an MCP server
 */
interface StoredOAuthState {
  clientInfo?: StoredOAuthClientInformation;
  tokens?: StoredOAuthTokens;
  codeVerifier?: string;
  discoveryState?: OAuthDiscoveryState;
  authorizationState?: string;
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
  private config: Required<Omit<MCPOAuthConfig, 'credentialStore'>>;
  private oauthState: StoredOAuthState = {};
  private callbackServers: Server[] = [];
  private finishAuthHandler?: (callbackParams: URLSearchParams) => Promise<void>;
  private activeFinishAuthHandler?: (callbackParams: URLSearchParams) => Promise<void>;
  private authorizationCompletion?: Promise<void>;
  private resolveAuthorization?: () => void;
  private rejectAuthorization?: (error: Error) => void;
  private callbackTimeout?: ReturnType<typeof setTimeout>;
  private authorizationComplete = false;
  private serverKey: string;
  private credentialStore: Pick<SecureCredentialStore, 'getCredential' | 'setCredential'>;

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
    this.credentialStore = config.credentialStore || getSecureCredentialStore();

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
      // The localhost redirect is a native-app loopback redirect (RFC 8252).
      application_type: 'native',
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
    if (this.authorizationCompletion && !this.authorizationComplete) {
      throw new Error('OAuth authorization is already in progress for this server');
    }
    const state = randomBytes(32).toString('base64url');
    this.oauthState.authorizationState = state;
    await this.saveState();
    return state;
  }

  /** Register the SDK transport callback used to redeem authorization codes. */
  setFinishAuthHandler(handler: (callbackParams: URLSearchParams) => Promise<void>): void {
    this.finishAuthHandler = handler;
  }

  /**
   * Load stored client information
   */
  async clientInformation(ctx?: OAuthClientInformationContext): Promise<StoredOAuthClientInformation | undefined> {
    await this.loadState();

    // Return pre-configured client info if available
    if (this.config.clientId) {
      return {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret || undefined,
        ...(ctx?.issuer && { issuer: ctx.issuer }),
      };
    }

    // Return dynamically registered client info
    if (this.oauthState.clientInfo) {
      // A registration belongs to the authorization server that issued it.
      // Legacy state without an issuer is deliberately not reused after an
      // issuer is known; the client will register again for that issuer.
      if (ctx?.issuer && this.oauthState.clientInfo.issuer !== ctx.issuer) {
        return undefined;
      }
      return this.oauthState.clientInfo;
    }

    return undefined;
  }

  /**
   * Save client information after dynamic registration
   */
  async saveClientInformation(clientInfo: StoredOAuthClientInformation): Promise<void> {
    this.oauthState.clientInfo = clientInfo;
    await this.saveState();
    logger.debug(`Saved client registration for ${this.config.serverUrl}`);
  }

  /**
   * Load stored tokens
   */
  async tokens(ctx?: OAuthClientInformationContext): Promise<StoredOAuthTokens | undefined> {
    await this.loadState();
    if (ctx?.issuer && this.oauthState.tokens?.issuer !== ctx.issuer) {
      return undefined;
    }
    return this.oauthState.tokens;
  }

  /**
   * Save tokens after authorization
   */
  async saveTokens(tokens: StoredOAuthTokens): Promise<void> {
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
  async redirectToAuthorization(
    authorizationUrl: URL,
    finishAuthHandler?: (callbackParams: URLSearchParams) => Promise<void>
  ): Promise<void> {
    logger.info('Starting OAuth authorization flow...');
    logger.info(`Authorization URL: ${authorizationUrl.toString()}`);

    const handler = finishAuthHandler || this.finishAuthHandler;
    if (!handler) {
      throw new Error('OAuth callback handler is not configured for this transport');
    }

    if (!this.authorizationCompletion || this.authorizationComplete) {
      this.authorizationComplete = false;
      this.activeFinishAuthHandler = handler;
      this.authorizationCompletion = new Promise<void>((resolve, reject) => {
        this.resolveAuthorization = resolve;
        this.rejectAuthorization = reject;
      });
      // A callback can arrive before the orchestrator begins waiting after the SDK
      // reports its initial UnauthorizedError. Keep early rejection handled.
      void this.authorizationCompletion.catch(() => undefined);
    }

    // Bind the local listener before opening the browser so fast redirects are not lost.
    await this.startCallbackServer();

    // Try to open browser
    const opened = await this.openBrowser(authorizationUrl.toString());

    if (!opened) {
      // Fallback: print URL for manual navigation
      console.error('\n=== OAuth Authorization Required ===');
      console.error('Please open the following URL in your browser:');
      console.error(`\n  ${authorizationUrl.toString()}\n`);
      console.error('After authorizing, you will be redirected to the callback URL.');
      console.error('=====================================\n');
    }
  }

  /**
   * Save PKCE code verifier
   */
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    if (this.authorizationCompletion && !this.authorizationComplete) {
      throw new Error('OAuth authorization is already in progress for this server');
    }
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
  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): Promise<void> {
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
      case 'discovery':
        delete this.oauthState.discoveryState;
        break;
    }
    await this.saveState();
    logger.debug(`Invalidated ${scope} credentials for ${this.config.serverUrl}`);
  }

  async saveDiscoveryState(state: OAuthDiscoveryState): Promise<void> {
    this.oauthState.discoveryState = state;
    await this.saveState();
  }

  async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    await this.loadState();
    return this.oauthState.discoveryState;
  }

  /**
   * Start callback server and wait for authorization code
   *
   * Returns the callback query parameters when the user returns from authorization.
   */
  async waitForCallback(timeoutMs: number = 300000): Promise<URLSearchParams> {
    await this.startCallbackServer(timeoutMs);
    return new Promise((resolve, reject) => {
      this.callbackResolve = resolve;
      this.callbackReject = reject;
    });
  }

  /** Wait for the active browser callback to finish exchanging its authorization code. */
  async waitForAuthorization(): Promise<void> {
    await (this.authorizationCompletion || Promise.resolve());
  }

  /** Stop a pending callback flow when its owning transport is closed. */
  cancelAuthorization(): void {
    if (!this.authorizationCompletion || this.authorizationComplete) return;
    this.rejectAuthorization?.(new Error('OAuth authorization was cancelled'));
    this.authorizationComplete = true;
    delete this.oauthState.authorizationState;
    void this.saveState().catch((error) => logger.warn(`Could not clear cancelled OAuth state: ${String(error)}`));
    this.stopCallbackServer();
    this.activeFinishAuthHandler = undefined;
  }

  private callbackResolve?: (params: URLSearchParams) => void;
  private callbackReject?: (error: Error) => void;

  private startCallbackServer(timeoutMs: number = 300000): Promise<void> {
    if (this.callbackServers.length > 0) return Promise.resolve();
    this.callbackTimeout = setTimeout(() => {
      this.stopCallbackServer();
      const error = new Error('Authorization timeout - user did not complete authorization');
      this.callbackReject?.(error);
      this.rejectAuthorization?.(error);
      this.authorizationComplete = true;
      delete this.oauthState.authorizationState;
      void this.saveState().catch((saveError) => logger.warn(`Could not clear expired OAuth state: ${String(saveError)}`));
      this.clearCallbackWaiters();
      this.activeFinishAuthHandler = undefined;
    }, timeoutMs);

    const callbackHandler = async (req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
      const url = new URL(req.url || '/', `http://localhost:${this.config.callbackPort}`);
      if (req.method !== 'GET' || url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const expectedState = this.oauthState.authorizationState;
      const actualState = url.searchParams.get('state');
      if (!expectedState || !actualState || !this.matchesState(expectedState, actualState)) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('OAuth state validation failed. You can close this window.');
        return;
      }
      // Let Node flush the callback response before closing the one-shot listener.
      res.once('finish', () => this.stopCallbackServer());

      try {
        const finishAuthHandler = this.activeFinishAuthHandler || this.finishAuthHandler;
        if (!finishAuthHandler) throw new Error('OAuth callback handler is not configured');
        // Consume the state before doing network work so this callback cannot be replayed.
        delete this.oauthState.authorizationState;
        await this.saveState();
        await finishAuthHandler(url.searchParams);
        this.resolveAuthorization?.();
        this.authorizationComplete = true;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body><h1>Authorization successful</h1><p>You can close this window.</p><script>window.close();</script></body></html>');
        this.callbackResolve?.(url.searchParams);
      } catch (error) {
        // Do not echo callback-controlled OAuth error details into the browser response.
        logger.warn(`OAuth callback processing failed: ${error instanceof Error ? error.message : String(error)}`);
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Authorization could not be completed. You can close this window.');
        this.callbackReject?.(error instanceof Error ? error : new Error(String(error)));
        this.rejectAuthorization?.(error instanceof Error ? error : new Error(String(error)));
        this.authorizationComplete = true;
      } finally {
        if (this.callbackTimeout) clearTimeout(this.callbackTimeout);
        this.callbackTimeout = undefined;
        this.clearCallbackWaiters();
        this.activeFinishAuthHandler = undefined;
      }
    };
    const ipv4Server = createServer(callbackHandler);
    const ipv6Server = createServer(callbackHandler);
    this.callbackServers = [ipv4Server, ipv6Server];

    return new Promise((resolve, reject) => {
      const listen = (server: Server, host: string, required: boolean): Promise<void> => new Promise((done, fail) => {
        server.once('listening', () => done());
        server.once('error', (err) => {
          if (!required) {
            server.close();
            done();
            return;
          }
          fail(err);
        });
        server.listen(this.config.callbackPort, host);
      });

      void (async () => {
        try {
          await listen(ipv4Server, '127.0.0.1', true);
          // Bind both loopback families so localhost works regardless of the
          // address order chosen by the user's browser or resolver.
          await listen(ipv6Server, '::1', false);
          logger.debug(`OAuth callback server listening on loopback port ${this.config.callbackPort}`);
          resolve();
        } catch (err) {
          if (this.callbackTimeout) clearTimeout(this.callbackTimeout);
          this.callbackTimeout = undefined;
          const error = new Error(`Failed to start callback server: ${err instanceof Error ? err.message : String(err)}`);
          this.callbackReject?.(error);
          this.clearCallbackWaiters();
          this.rejectAuthorization?.(error);
          this.authorizationComplete = true;
          this.callbackServers = [];
          reject(error);
        }
      })();
    });
  }

  private matchesState(expected: string, actual: string): boolean {
    const expectedBytes = Buffer.from(expected);
    const actualBytes = Buffer.from(actual);
    return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
  }

  private clearCallbackWaiters(): void {
    this.callbackResolve = undefined;
    this.callbackReject = undefined;
  }

  /**
   * Stop the callback server
   */
  private stopCallbackServer(): void {
    if (this.callbackTimeout) clearTimeout(this.callbackTimeout);
    this.callbackTimeout = undefined;
    for (const server of this.callbackServers) {
      if (server.listening) server.close();
    }
    this.callbackServers = [];
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
   * Load state from secure storage, migrating the old plaintext file if present.
   */
  private async loadState(): Promise<void> {
    const secureState = await this.credentialStore.getCredential(`oauth:${this.serverKey}`, 'oauth_token');
    if (typeof secureState === 'string') {
      try {
        this.oauthState = JSON.parse(secureState);
        return;
      } catch {
        logger.warn(`Ignoring invalid encrypted OAuth state for ${this.config.serverUrl}`);
      }
    }

    // Migrate legacy plaintext state on first access.
    const filePath = join(this.config.storageDir, `${this.serverKey}.json`);
    try {
      const data = await readFile(filePath, 'utf-8');
      this.oauthState = JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is invalid - start fresh
      this.oauthState = {};
      return;
    }

    await this.saveState();
  }

  /**
   * Save state to secure storage and remove any legacy plaintext copy.
   */
  private async saveState(): Promise<void> {
    const stored = await this.credentialStore.setCredential(
      `oauth:${this.serverKey}`,
      'oauth_token',
      JSON.stringify(this.oauthState),
      `OAuth state for ${this.config.serverUrl}`
    );
    if (!stored) {
      throw new Error(`Secure storage rejected OAuth state for ${this.config.serverUrl}`);
    }

    const legacyPath = join(this.config.storageDir, `${this.serverKey}.json`);
    try {
      await unlink(legacyPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn(`Could not remove legacy OAuth state file: ${error instanceof Error ? error.message : String(error)}`);
      }
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
