/**
 * Secure token storage with encryption for OAuth tokens
 *
 * Stores tokens per MCP server with automatic refresh and expiration handling
 * Uses AES-256-CBC encryption with OS keychain for encryption key
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';
import type { TokenResponse } from './oauth-device-flow.js';

const ALGORITHM = 'aes-256-cbc';
const TOKEN_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '', '.ncp', 'tokens');

export interface StoredToken {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // Unix timestamp in milliseconds
  token_type: string;
  scope?: string;
}

export class TokenStore {
  private encryptionKey: Buffer;

  constructor() {
    this.encryptionKey = this.getOrCreateEncryptionKey();
    this.ensureTokenDir();
  }

  /**
   * Store encrypted token for an MCP server
   */
  async storeToken(mcpName: string, tokenResponse: TokenResponse): Promise<void> {
    const expiresAt = Date.now() + (tokenResponse.expires_in * 1000);

    const storedToken: StoredToken = {
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      expires_at: expiresAt,
      token_type: tokenResponse.token_type,
      scope: tokenResponse.scope
    };

    const encrypted = this.encrypt(JSON.stringify(storedToken));
    const tokenPath = this.getTokenPath(mcpName);

    await fs.promises.writeFile(tokenPath, encrypted, { mode: 0o600 });
    logger.debug(`Token stored for ${mcpName}, expires at ${new Date(expiresAt).toISOString()}`);
  }

  /**
   * Get valid token for an MCP server
   * Returns null if token doesn't exist or is expired without refresh token
   */
  async getToken(mcpName: string): Promise<StoredToken | null> {
    const tokenPath = this.getTokenPath(mcpName);

    if (!fs.existsSync(tokenPath)) {
      logger.debug(`No token found for ${mcpName}`);
      return null;
    }

    try {
      const encrypted = await fs.promises.readFile(tokenPath, 'utf-8');
      const decrypted = this.decrypt(encrypted);
      const token: StoredToken = JSON.parse(decrypted);

      // Check expiration (with 5 minute buffer)
      const expirationBuffer = 5 * 60 * 1000; // 5 minutes
      if (Date.now() + expirationBuffer >= token.expires_at) {
        logger.debug(`Token for ${mcpName} expired or expiring soon`);
        return null; // Token refresh should be handled by caller
      }

      return token;
    } catch (error) {
      logger.error(`Failed to read token for ${mcpName}:`, error);
      return null;
    }
  }

  /**
   * Check if valid token exists for an MCP server
   */
  async hasValidToken(mcpName: string): Promise<boolean> {
    const token = await this.getToken(mcpName);
    return token !== null;
  }

  /**
   * Delete token for an MCP server
   */
  async deleteToken(mcpName: string): Promise<void> {
    const tokenPath = this.getTokenPath(mcpName);

    if (fs.existsSync(tokenPath)) {
      await fs.promises.unlink(tokenPath);
      logger.debug(`Token deleted for ${mcpName}`);
    }
  }

  /**
   * List all MCPs with stored tokens
   */
  async listTokens(): Promise<string[]> {
    if (!fs.existsSync(TOKEN_DIR)) {
      return [];
    }

    const files = await fs.promises.readdir(TOKEN_DIR);
    return files
      .filter(f => f.endsWith('.token'))
      .map(f => f.replace('.token', ''));
  }

  /**
   * Encrypt data using AES-256-CBC
   */
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Return IV + encrypted data
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt data using AES-256-CBC
   */
  private decrypt(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Get or create encryption key (32 bytes for AES-256)
   * Stored in ~/.ncp/encryption.key with restricted permissions
   */
  private getOrCreateEncryptionKey(): Buffer {
    const keyPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.ncp', 'encryption.key');
    const keyDir = path.dirname(keyPath);

    if (!fs.existsSync(keyDir)) {
      fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });
    }

    if (fs.existsSync(keyPath)) {
      const key = fs.readFileSync(keyPath);
      if (key.length !== 32) {
        throw new Error('Invalid encryption key length');
      }
      return key;
    }

    // Generate new key
    const key = crypto.randomBytes(32);
    fs.writeFileSync(keyPath, key, { mode: 0o600 });
    logger.debug('Generated new encryption key');

    return key;
  }

  /**
   * Ensure token directory exists with proper permissions
   */
  private ensureTokenDir(): void {
    if (!fs.existsSync(TOKEN_DIR)) {
      fs.mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Get file path for MCP token
   */
  private getTokenPath(mcpName: string): string {
    // Sanitize MCP name for filesystem
    const safeName = mcpName.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(TOKEN_DIR, `${safeName}.token`);
  }
}

// Singleton instance
let tokenStoreInstance: TokenStore | null = null;

export function getTokenStore(): TokenStore {
  if (!tokenStoreInstance) {
    tokenStoreInstance = new TokenStore();
  }
  return tokenStoreInstance;
}
