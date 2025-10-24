/**
 * OAuth 2.0 Device Authorization Grant (Device Flow)
 * RFC 8628: https://tools.ietf.org/html/rfc8628
 *
 * Used for CLI and non-browser environments where user authenticates
 * on a separate device (phone, browser on another machine, etc.)
 */

import { logger } from '../utils/logger.js';

export interface DeviceAuthResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string; // Optional: includes code in URL
  expires_in: number;
  interval: number; // Polling interval in seconds
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret?: string; // Optional for public clients
  deviceAuthUrl: string; // Device authorization endpoint
  tokenUrl: string; // Token endpoint
  scopes?: string[];
}

export class DeviceFlowAuthenticator {
  constructor(private config: OAuthConfig) {}

  /**
   * Complete OAuth Device Flow authentication
   */
  async authenticate(): Promise<TokenResponse> {
    logger.debug('Starting OAuth Device Flow...');

    // Step 1: Request device code
    const deviceAuth = await this.requestDeviceCode();

    // Step 2: Display user instructions
    this.displayUserInstructions(deviceAuth);

    // Step 3: Poll for authorization
    const token = await this.pollForToken(deviceAuth);

    logger.debug('OAuth Device Flow completed successfully');
    return token;
  }

  /**
   * Step 1: Request device and user codes from authorization server
   */
  private async requestDeviceCode(): Promise<DeviceAuthResponse> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      scope: this.config.scopes?.join(' ') || ''
    });

    logger.debug(`Requesting device code from ${this.config.deviceAuthUrl}`);

    const response = await fetch(this.config.deviceAuthUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Device authorization request failed: ${response.status} ${error}`);
    }

    const data: DeviceAuthResponse = await response.json();

    logger.debug(`Device code received: ${data.device_code.substring(0, 10)}...`);
    logger.debug(`User code: ${data.user_code}`);

    return data;
  }

  /**
   * Step 2: Display instructions to user
   */
  private displayUserInstructions(auth: DeviceAuthResponse): void {
    console.log('\n┌─────────────────────────────────────────┐');
    console.log('│     🔐 OAuth Authentication Required    │');
    console.log('└─────────────────────────────────────────┘\n');

    if (auth.verification_uri_complete) {
      // Complete URI includes the user code
      console.log('📱 Visit this URL on any device:\n');
      console.log(`   ${auth.verification_uri_complete}\n`);
      console.log('   (Code is already included in the URL)\n');
    } else {
      // Separate URI and code
      console.log(`📱 Visit: ${auth.verification_uri}\n`);
      console.log(`🔑 Enter code: ${auth.user_code}\n`);
    }

    const expiresInMinutes = Math.floor(auth.expires_in / 60);
    console.log(`⏱️  Code expires in ${expiresInMinutes} minutes\n`);
    console.log('⏳ Waiting for authorization...');
    console.log('   (Press Ctrl+C to cancel)\n');
  }

  /**
   * Step 3: Poll token endpoint until user authorizes
   */
  private async pollForToken(auth: DeviceAuthResponse): Promise<TokenResponse> {
    const expiresAt = Date.now() + (auth.expires_in * 1000);
    const interval = auth.interval * 1000; // Convert to ms
    let pollInterval = interval;
    let cancelled = false;

    // Set up keyboard listener for cancellation
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    if (stdin.isTTY) {
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');
    }

    const onKeypress = (char: string) => {
      // Ctrl+C
      if (char === '\u0003') {
        cancelled = true;
      }
    };

    stdin.on('data', onKeypress);

    try {
      while (Date.now() < expiresAt && !cancelled) {
        await this.sleep(pollInterval);

        // Check if user cancelled
        if (cancelled) {
          console.log('\n\n❌ Authentication cancelled by user\n');
          throw new Error('Authentication cancelled by user');
        }

        const params = new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: auth.device_code,
          client_id: this.config.clientId
        });

        // Add client secret if provided (for confidential clients)
        if (this.config.clientSecret) {
          params.set('client_secret', this.config.clientSecret);
        }

        logger.debug('Polling token endpoint...');

        const response = await fetch(this.config.tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString()
        });

        const data = await response.json();

        // Success!
        if (data.access_token) {
          console.log('\n✅ Authentication successful!\n');
          return data;
        }

        // Handle errors according to RFC 8628
        if (data.error === 'authorization_pending') {
          // User hasn't authorized yet, continue polling
          process.stdout.write('.');
          continue;
        }

        if (data.error === 'slow_down') {
          // Server requests slower polling
          pollInterval += 5000;
          logger.debug(`Slowing down polling interval to ${pollInterval}ms`);
          process.stdout.write('.');
          continue;
        }

        if (data.error === 'expired_token') {
          throw new Error('Authorization code expired. Please try again.');
        }

        if (data.error === 'access_denied') {
          throw new Error('Authorization denied by user.');
        }

        // Other errors
        throw new Error(`OAuth error: ${data.error} - ${data.error_description || 'Unknown error'}`);
      }

      if (cancelled) {
        console.log('\n\n❌ Authentication cancelled by user\n');
        throw new Error('Authentication cancelled by user');
      }

      throw new Error('Authentication timed out. Please try again.');
    } finally {
      // Clean up keyboard listener
      stdin.removeListener('data', onKeypress);
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw || false);
        stdin.pause();
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
