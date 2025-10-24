/**
 * OAuth 2.0 Authorization Code Grant with PKCE
 * RFC 6749 (OAuth 2.0) + RFC 7636 (PKCE)
 *
 * Used for CLI tools that can open a browser and listen on localhost.
 * More secure than device flow for local environments.
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { randomBytes, createHash } from 'crypto';
import { logger } from '../utils/logger.js';

export interface AuthCodeFlowConfig {
  clientId: string;
  clientSecret?: string; // Optional for public clients
  authorizationUrl: string; // Authorization endpoint
  tokenUrl: string; // Token endpoint
  scopes?: string[];
  redirectPort?: number; // Optional specific port (default: auto-select 3000-9000)
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export class AuthCodeFlowAuthenticator {
  private server?: Server;
  private codeVerifier: string;
  private codeChallenge: string;
  private state: string;
  private redirectUri?: string;

  constructor(private config: AuthCodeFlowConfig) {
    // Generate PKCE values
    this.codeVerifier = this.generateCodeVerifier();
    this.codeChallenge = this.generateCodeChallenge(this.codeVerifier);
    this.state = this.generateState();
  }

  /**
   * Complete OAuth Authorization Code Flow with PKCE
   */
  async authenticate(): Promise<TokenResponse> {
    logger.debug('Starting OAuth Authorization Code Flow with PKCE...');

    try {
      // Step 1: Start temporary localhost server
      const port = await this.startCallbackServer();
      this.redirectUri = `http://localhost:${port}/callback`;

      // Step 2: Build authorization URL and open browser
      const authUrl = this.buildAuthorizationUrl();
      this.displayUserInstructions(authUrl);

      // Step 3: Wait for callback with authorization code
      const code = await this.waitForCallback();

      // Step 4: Exchange code for token
      const token = await this.exchangeCodeForToken(code);

      logger.debug('OAuth Authorization Code Flow completed successfully');
      return token;
    } finally {
      // Always clean up server
      this.stopCallbackServer();
    }
  }

  /**
   * Generate cryptographically random code verifier
   */
  private generateCodeVerifier(): string {
    return randomBytes(32)
      .toString('base64url');
  }

  /**
   * Generate code challenge from verifier using SHA256
   */
  private generateCodeChallenge(verifier: string): string {
    return createHash('sha256')
      .update(verifier)
      .digest('base64url');
  }

  /**
   * Generate random state for CSRF protection
   */
  private generateState(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Start temporary HTTP server to receive OAuth callback
   */
  private startCallbackServer(): Promise<number> {
    return new Promise((resolve, reject) => {
      const startPort = this.config.redirectPort || 3000;
      const maxPort = this.config.redirectPort || 9000;
      let currentPort = startPort;

      const tryPort = () => {
        this.server = createServer();

        this.server.on('error', (err: any) => {
          if (err.code === 'EADDRINUSE' && currentPort < maxPort) {
            currentPort++;
            tryPort();
          } else {
            reject(new Error(`Failed to start callback server: ${err.message}`));
          }
        });

        this.server.listen(currentPort, 'localhost', () => {
          logger.debug(`Callback server listening on http://localhost:${currentPort}`);
          resolve(currentPort);
        });
      };

      tryPort();
    });
  }

  /**
   * Stop the callback server
   */
  private stopCallbackServer(): void {
    if (this.server) {
      this.server.close();
      this.server = undefined;
      logger.debug('Callback server stopped');
    }
  }

  /**
   * Build authorization URL with PKCE parameters
   */
  private buildAuthorizationUrl(): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri!,
      state: this.state,
      code_challenge: this.codeChallenge,
      code_challenge_method: 'S256'
    });

    if (this.config.scopes && this.config.scopes.length > 0) {
      params.set('scope', this.config.scopes.join(' '));
    }

    return `${this.config.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Display instructions to user
   */
  private displayUserInstructions(authUrl: string): void {
    console.log('\n┌─────────────────────────────────────────┐');
    console.log('│     🔐 OAuth Authentication Required    │');
    console.log('└─────────────────────────────────────────┘\n');
    console.log('🌐 Opening browser for authentication...\n');
    console.log('   If browser doesn\'t open, visit this URL:\n');
    console.log(`   ${authUrl}\n`);
    console.log('⏳ Waiting for authorization...');
    console.log('   (Press Ctrl+C to cancel)\n');

    // Try to open browser
    this.openBrowser(authUrl);
  }

  /**
   * Open browser to authorization URL
   */
  private openBrowser(url: string): void {
    const start = process.platform === 'darwin' ? 'open' :
                  process.platform === 'win32' ? 'start' :
                  'xdg-open';

    import('child_process').then(({ exec }) => {
      exec(`${start} "${url}"`, (error) => {
        if (error) {
          logger.debug(`Failed to open browser: ${error.message}`);
        }
      });
    });
  }

  /**
   * Wait for OAuth callback with authorization code
   */
  private waitForCallback(): Promise<string> {
    return new Promise((resolve, reject) => {
      let cancelled = false;

      // Set up Ctrl+C handler
      const stdin = process.stdin;
      const wasRaw = stdin.isRaw;

      if (stdin.isTTY) {
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');
      }

      const onKeypress = (char: string) => {
        if (char === '\u0003') { // Ctrl+C
          cancelled = true;
          cleanup();
          reject(new Error('Authentication cancelled by user'));
        }
      };

      stdin.on('data', onKeypress);

      const cleanup = () => {
        stdin.removeListener('data', onKeypress);
        if (stdin.isTTY) {
          stdin.setRawMode(wasRaw || false);
          stdin.pause();
        }
      };

      // Handle incoming HTTP requests
      this.server!.on('request', (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url!, `http://localhost`);

        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');
          const errorDescription = url.searchParams.get('error_description');

          // Handle error from OAuth provider
          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                  <h1>❌ Authentication Failed</h1>
                  <p>${errorDescription || error}</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            cleanup();
            reject(new Error(`OAuth error: ${error} - ${errorDescription || 'Unknown error'}`));
            return;
          }

          // Validate state (CSRF protection)
          if (state !== this.state) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                  <h1>❌ Invalid State</h1>
                  <p>CSRF protection failed. Please try again.</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            cleanup();
            reject(new Error('Invalid state parameter (CSRF protection)'));
            return;
          }

          // Success
          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                  <h1>✅ Authentication Successful!</h1>
                  <p>You can close this window and return to the terminal.</p>
                </body>
              </html>
            `);
            cleanup();
            console.log('\n✅ Authorization received, exchanging code for token...\n');
            resolve(code);
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                  <h1>❌ Missing Code</h1>
                  <p>Authorization code not received. Please try again.</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            cleanup();
            reject(new Error('Authorization code not received'));
          }
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
        }
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        if (!cancelled) {
          cleanup();
          reject(new Error('Authentication timed out after 5 minutes'));
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Exchange authorization code for access token
   */
  private async exchangeCodeForToken(code: string): Promise<TokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri!,
      client_id: this.config.clientId,
      code_verifier: this.codeVerifier
    });

    // Add client secret if provided (for confidential clients)
    if (this.config.clientSecret) {
      params.set('client_secret', this.config.clientSecret);
    }

    logger.debug(`Exchanging code for token at ${this.config.tokenUrl}`);

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${response.status} ${error}`);
    }

    const data: TokenResponse = await response.json();

    if (!data.access_token) {
      throw new Error('Token response missing access_token');
    }

    console.log('✅ Authentication successful!\n');
    return data;
  }
}
