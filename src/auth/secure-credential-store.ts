/**
 * Secure Credential Store with OS Keychain Integration
 *
 * Stores credentials securely using:
 * 1. OS Keychain (macOS Keychain, Windows Credential Store, Linux Secret Service)
 * 2. Fallback to AES-256 encrypted file storage if keychain unavailable
 *
 * Profile JSON files only store credential references, not actual secrets.
 */

import { logger } from '../utils/logger.js';
import { getTokenStore } from './token-store.js';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

const SERVICE_NAME = '@portel/ncp';
const CREDENTIAL_INDEX_FILE = path.join(homedir(), '.ncp', 'credentials.json');

export type CredentialType = 'bearer_token' | 'api_key' | 'oauth_token' | 'basic_auth' | 'custom';

export interface CredentialMetadata {
  mcpName: string;
  type: CredentialType;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BasicAuthCredential {
  username: string;
  password: string;
}

/**
 * Secure credential storage using OS keychain with encrypted file fallback
 */
export class SecureCredentialStore {
  private keychainAvailable: boolean = false;
  private Entry: any = null;
  private index: Map<string, CredentialMetadata> = new Map();
  private initPromise: Promise<void>;

  constructor() {
    this.loadIndex();
    this.initPromise = this.initializeKeychain();
  }

  /**
   * Ensure keychain is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  /**
   * Initialize OS keychain support
   */
  private async initializeKeychain(): Promise<void> {
    try {
      // Dynamically import keyring
      const keyring = await import('@napi-rs/keyring');
      this.Entry = keyring.Entry;

      // Test if keychain is accessible
      const testEntry = new this.Entry(SERVICE_NAME, '_ncp_test_');
      await testEntry.setPassword('test');
      await testEntry.getPassword();
      await testEntry.deletePassword();

      this.keychainAvailable = true;
      logger.debug('OS keychain initialized successfully');
    } catch (error) {
      this.keychainAvailable = false;
      logger.debug(`OS keychain unavailable, using encrypted file storage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load credential index from disk
   */
  private loadIndex(): void {
    try {
      if (fs.existsSync(CREDENTIAL_INDEX_FILE)) {
        const data = JSON.parse(fs.readFileSync(CREDENTIAL_INDEX_FILE, 'utf-8'));
        this.index = new Map(Object.entries(data));
      }
    } catch (error) {
      logger.error('Failed to load credential index:', error);
      this.index = new Map();
    }
  }

  /**
   * Save credential index to disk
   */
  private saveIndex(): void {
    try {
      const dir = path.dirname(CREDENTIAL_INDEX_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }

      const data = Object.fromEntries(this.index);
      fs.writeFileSync(CREDENTIAL_INDEX_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
    } catch (error) {
      logger.error('Failed to save credential index:', error);
    }
  }

  /**
   * Generate account identifier for keychain
   */
  private getAccountId(mcpName: string, type: CredentialType): string {
    return `${mcpName}:${type}`;
  }

  /**
   * Store credential securely
   */
  async setCredential(
    mcpName: string,
    type: CredentialType,
    credential: string | BasicAuthCredential,
    description?: string
  ): Promise<boolean> {
    await this.ensureInitialized();
    const accountId = this.getAccountId(mcpName, type);

    try {
      // Serialize credential
      const credentialString = typeof credential === 'string'
        ? credential
        : JSON.stringify(credential);

      if (this.keychainAvailable && this.Entry) {
        // Store in OS keychain
        const entry = new this.Entry(SERVICE_NAME, accountId);
        await entry.setPassword(credentialString);
        logger.debug(`Stored credential in OS keychain: ${accountId}`);
      } else {
        // Fallback to encrypted file storage
        const tokenStore = getTokenStore();
        await tokenStore.storeToken(accountId, {
          access_token: credentialString,
          expires_in: 315360000, // 10 years (basically never expires)
          token_type: type
        });
        logger.debug(`Stored credential in encrypted file: ${accountId}`);
      }

      // Update index
      this.index.set(accountId, {
        mcpName,
        type,
        description,
        createdAt: this.index.get(accountId)?.createdAt || Date.now(),
        updatedAt: Date.now()
      });
      this.saveIndex();

      return true;
    } catch (error) {
      logger.error(`Failed to store credential for ${accountId}:`, error);
      return false;
    }
  }

  /**
   * Retrieve credential securely
   */
  async getCredential(mcpName: string, type: CredentialType): Promise<string | BasicAuthCredential | null> {
    await this.ensureInitialized();
    const accountId = this.getAccountId(mcpName, type);

    try {
      let credentialString: string | null = null;

      if (this.keychainAvailable && this.Entry) {
        // Retrieve from OS keychain
        const entry = new this.Entry(SERVICE_NAME, accountId);
        credentialString = await entry.getPassword();
      } else {
        // Fallback to encrypted file storage
        const tokenStore = getTokenStore();
        const token = await tokenStore.getToken(accountId);
        credentialString = token?.access_token || null;
      }

      if (!credentialString) {
        return null;
      }

      // Deserialize if basic auth
      if (type === 'basic_auth') {
        try {
          return JSON.parse(credentialString);
        } catch {
          // If parsing fails, assume it's a plain token
          return credentialString;
        }
      }

      return credentialString;
    } catch (error) {
      logger.error(`Failed to retrieve credential for ${accountId}:`, error);
      return null;
    }
  }

  /**
   * Delete credential securely
   */
  async deleteCredential(mcpName: string, type: CredentialType): Promise<boolean> {
    await this.ensureInitialized();
    const accountId = this.getAccountId(mcpName, type);

    try {
      if (this.keychainAvailable && this.Entry) {
        // Delete from OS keychain
        const entry = new this.Entry(SERVICE_NAME, accountId);
        await entry.deletePassword();
      } else {
        // Delete from encrypted file storage
        const tokenStore = getTokenStore();
        await tokenStore.deleteToken(accountId);
      }

      // Remove from index
      this.index.delete(accountId);
      this.saveIndex();

      logger.debug(`Deleted credential: ${accountId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete credential for ${accountId}:`, error);
      return false;
    }
  }

  /**
   * List all stored credentials (metadata only)
   */
  async listCredentials(mcpName?: string): Promise<CredentialMetadata[]> {
    const credentials: CredentialMetadata[] = [];

    for (const [accountId, metadata] of this.index.entries()) {
      if (!mcpName || metadata.mcpName === mcpName) {
        credentials.push(metadata);
      }
    }

    return credentials.sort((a, b) => a.mcpName.localeCompare(b.mcpName));
  }

  /**
   * Check if credential exists
   */
  async hasCredential(mcpName: string, type: CredentialType): Promise<boolean> {
    const accountId = this.getAccountId(mcpName, type);
    return this.index.has(accountId);
  }

  /**
   * Migrate plain-text credentials from profile to secure storage
   */
  async migrateFromPlainText(
    mcpName: string,
    credential: { type?: string; token?: string; username?: string; password?: string }
  ): Promise<boolean> {
    await this.ensureInitialized();
    try {
      if (credential.token) {
        // Determine type from auth configuration
        const type: CredentialType = credential.type === 'bearer' ? 'bearer_token' : 'api_key';
        await this.setCredential(mcpName, type, credential.token, `Migrated from profile`);
        logger.info(`Migrated ${type} for ${mcpName} to secure storage`);
        return true;
      }

      if (credential.username && credential.password) {
        await this.setCredential(
          mcpName,
          'basic_auth',
          { username: credential.username, password: credential.password },
          'Migrated from profile'
        );
        logger.info(`Migrated basic auth for ${mcpName} to secure storage`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Failed to migrate credentials for ${mcpName}:`, error);
      return false;
    }
  }

  /**
   * Check if keychain is available
   */
  isKeychainAvailable(): boolean {
    return this.keychainAvailable;
  }

  /**
   * Get storage method being used
   */
  getStorageMethod(): 'keychain' | 'encrypted_file' {
    return this.keychainAvailable ? 'keychain' : 'encrypted_file';
  }
}

// Singleton instance
let credentialStoreInstance: SecureCredentialStore | null = null;

export function getSecureCredentialStore(): SecureCredentialStore {
  if (!credentialStoreInstance) {
    credentialStoreInstance = new SecureCredentialStore();
  }
  return credentialStoreInstance;
}
