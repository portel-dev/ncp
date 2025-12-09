/**
 * Bindings Manager - Credential Isolation for Code-Mode
 * Phase 3: Hide API keys from sandboxed code
 * Phase 4 Enhancement: Per-binding network policies
 *
 * Implements Cloudflare Workers-style bindings pattern:
 * - Credentials stored securely in main thread only
 * - Worker receives pre-authenticated clients (bindings)
 * - Worker calls methods on bindings, never sees raw keys
 * - Main thread executes actual API calls with credentials
 * - Each binding can have custom network access rules
 */

import * as path from 'path';
import { access, mkdir, readFile, writeFile } from 'fs/promises';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';
import { getNcpBaseDirectory } from '../utils/ncp-paths.js';
import { logger } from '../utils/logger.js';
import type { NetworkPolicy } from './network-policy.js';

/**
 * Binding definition - what the worker sees
 */
export interface Binding {
  name: string;           // e.g., "github", "stripe", "lg-remote"
  type: 'http' | 'sdk' | 'database' | 'custom' | 'local-network';
  methods: string[];      // Available methods on this binding
  networkPolicy?: Partial<NetworkPolicy>;  // Custom network access for this binding
}

/**
 * Credential definition - stored securely in main thread
 */
export interface Credential {
  mcpName: string;        // MCP this credential belongs to
  type: 'api_key' | 'oauth_token' | 'basic_auth' | 'custom';
  data: {
    apiKey?: string;
    token?: string;
    username?: string;
    password?: string;
    custom?: Record<string, any>;
  };
}

/**
 * Binding execution request from worker
 */
export interface BindingExecutionRequest {
  bindingName: string;    // Which binding to use
  method: string;         // Which method to call
  args: any[];            // Arguments to pass
}

/**
 * Manages bindings and credential isolation
 */
export class BindingsManager {
  private credentials: Map<string, Credential> = new Map();
  private bindings: Map<string, Binding> = new Map();
  private authenticatedClients: Map<string, any> = new Map();
  private bindingNetworkPolicies: Map<string, Partial<NetworkPolicy>> = new Map();

  /**
   * Register a credential for an MCP
   * Credentials are stored securely in main thread only
   */
  registerCredential(credential: Credential): void {
    this.credentials.set(credential.mcpName, credential);
    logger.info(`🔐 Registered credential for MCP: ${credential.mcpName}`);
  }

  /**
   * Create a binding for an MCP
   * This is what the worker will receive (no credentials)
   */
  createBinding(
    mcpName: string,
    type: Binding['type'],
    methods: string[],
    networkPolicy?: Partial<NetworkPolicy>
  ): Binding {
    const binding: Binding = {
      name: mcpName,
      type,
      methods,
      networkPolicy
    };

    this.bindings.set(mcpName, binding);

    // Store network policy separately for easy lookup
    if (networkPolicy) {
      this.bindingNetworkPolicies.set(mcpName, networkPolicy);
      logger.info(`🔗 Created binding for MCP: ${mcpName} with ${methods.length} methods and custom network policy`);
    } else {
      logger.info(`🔗 Created binding for MCP: ${mcpName} with ${methods.length} methods`);
    }

    return binding;
  }

  /**
   * Get network policy for a specific binding
   * Returns undefined if binding has no custom policy (use default)
   */
  getBindingNetworkPolicy(bindingName: string): Partial<NetworkPolicy> | undefined {
    return this.bindingNetworkPolicies.get(bindingName);
  }

  /**
   * Get all bindings to pass to worker
   * Returns binding definitions only (no credentials)
   */
  getBindingsForWorker(): Binding[] {
    return Array.from(this.bindings.values());
  }

  /**
   * Create authenticated client for an MCP
   * This happens in main thread with access to credentials
   */
  createAuthenticatedClient(
    mcpName: string,
    clientFactory: (credential: Credential) => any
  ): void {
    const credential = this.credentials.get(mcpName);

    if (!credential) {
      logger.warn(`No credential found for MCP: ${mcpName}`);
      return;
    }

    const client = clientFactory(credential);
    this.authenticatedClients.set(mcpName, client);

    logger.info(`✅ Created authenticated client for MCP: ${mcpName}`);
  }

  /**
   * Execute a binding method call from worker
   * This runs in main thread with access to real credentials
   */
  async executeBinding(request: BindingExecutionRequest): Promise<any> {
    const { bindingName, method, args } = request;

    const client = this.authenticatedClients.get(bindingName);
    if (!client) {
      throw new Error(`No authenticated client for binding: ${bindingName}`);
    }

    const binding = this.bindings.get(bindingName);
    if (!binding || !binding.methods.includes(method)) {
      throw new Error(`Method ${method} not available on binding ${bindingName}`);
    }

    logger.info(`🔗 Executing binding: ${bindingName}.${method}()`);

    // Execute method on authenticated client
    if (typeof client[method] !== 'function') {
      throw new Error(`Method ${method} not found on client for ${bindingName}`);
    }

    return await client[method](...args);
  }

  /**
   * Get credential for an MCP (main thread only)
   * Never expose this to worker
   */
  getCredential(mcpName: string): Credential | undefined {
    return this.credentials.get(mcpName);
  }

  /**
   * Remove credential and binding
   */
  removeBinding(mcpName: string): void {
    this.credentials.delete(mcpName);
    this.bindings.delete(mcpName);
    this.authenticatedClients.delete(mcpName);
    logger.info(`🗑️  Removed binding for MCP: ${mcpName}`);
  }

  /**
   * Clear all bindings and credentials
   */
  clear(): void {
    this.credentials.clear();
    this.bindings.clear();
    this.authenticatedClients.clear();
    logger.info('🗑️  Cleared all bindings and credentials');
  }
}

/**
 * Credential storage - encrypts credentials at rest
 * Persists credentials to encrypted vault on disk with automatic key rotation support
 */
interface EncryptedPayload {
  version: number;
  iv: string;
  tag: string;
  data: string;
}

export class CredentialVault {
  private static instance: CredentialVault;
  private credentials: Map<string, Credential> = new Map();
  private vaultDir: string;
  private vaultPath: string;
  private keyPath: string;
  private encryptionKey: Buffer | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private constructor() {
    const baseDir = getNcpBaseDirectory();
    this.vaultDir = path.join(baseDir, 'credentials');
    this.vaultPath = path.join(this.vaultDir, 'vault.json');
    this.keyPath = path.join(this.vaultDir, '.key');
  }

  static getInstance(): CredentialVault {
    if (!CredentialVault.instance) {
      CredentialVault.instance = new CredentialVault();
    }
    return CredentialVault.instance;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }

    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      await mkdir(this.vaultDir, { recursive: true });
      this.encryptionKey = await this.loadOrCreateKey();
      await this.loadFromDisk();
      logger.info(`🔐 Credential vault ready: ${this.vaultPath}`);
    } catch (error: any) {
      logger.error(`Failed to initialize credential vault: ${error.message}`);
      // Fall back to in-memory only vault if disk persistence fails
      this.encryptionKey = null;
    } finally {
      this.initialized = true;
    }
  }

  private async loadOrCreateKey(): Promise<Buffer> {
    if (process.env.NCP_CREDENTIAL_KEY) {
      return this.deriveKey(process.env.NCP_CREDENTIAL_KEY);
    }

    try {
      const existing = await readFile(this.keyPath, 'utf-8');
      if (existing.trim()) {
        return this.deriveKey(existing.trim());
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.warn(`Failed to load credential key: ${error.message}`);
      }
    }

    const secret = randomBytes(32).toString('hex');
    await writeFile(this.keyPath, secret, { mode: 0o600 });
    return this.deriveKey(secret);
  }

  private deriveKey(secret: string): Buffer {
    return createHash('sha256').update(secret).digest();
  }

  private async loadFromDisk(): Promise<void> {
    try {
      await access(this.vaultPath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.warn(`Credential vault access error: ${error.message}`);
      }
      return;
    }

    try {
      const raw = await readFile(this.vaultPath, 'utf-8');
      if (!raw.trim()) {
        return;
      }

      const payload = JSON.parse(raw) as EncryptedPayload;
      const decrypted = this.decryptPayload(payload);
      const stored: Credential[] = JSON.parse(decrypted);

      this.credentials.clear();
      for (const credential of stored) {
        if (credential?.mcpName) {
          this.credentials.set(credential.mcpName, credential);
        }
      }

      logger.info(`🔐 Loaded ${stored.length} credential(s) from vault`);
    } catch (error: any) {
      logger.warn(`Failed to load credentials from vault: ${error.message}`);
    }
  }

  private encryptPayload(plaintext: string): EncryptedPayload {
    if (!this.encryptionKey) {
      throw new Error('Credential vault encryption key unavailable');
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      version: 1,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: encrypted.toString('base64')
    };
  }

  private decryptPayload(payload: EncryptedPayload): string {
    if (!this.encryptionKey) {
      throw new Error('Credential vault encryption key unavailable');
    }

    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const data = Buffer.from(payload.data, 'base64');

    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  }

  private async persistVault(): Promise<void> {
    if (!this.encryptionKey) {
      logger.warn('Credential vault persistence disabled (no encryption key)');
      return;
    }

    const payload = this.encryptPayload(JSON.stringify(Array.from(this.credentials.values())));
    await writeFile(this.vaultPath, JSON.stringify(payload), { mode: 0o600 });
  }

  /**
   * Store a credential securely (encrypted at rest)
   */
  async store(mcpName: string, credential: Credential): Promise<void> {
    await this.ensureInitialized();
    this.credentials.set(mcpName, credential);
    logger.info(`🔐 Stored credential for ${mcpName} in vault`);

    try {
      await this.persistVault();
    } catch (error: any) {
      logger.error(`Failed to persist credential vault: ${error.message}`);
    }
  }

  /**
   * Retrieve a credential (decrypted transparently)
   */
  async retrieve(mcpName: string): Promise<Credential | undefined> {
    await this.ensureInitialized();
    return this.credentials.get(mcpName);
  }

  /**
   * Remove a credential
   */
  async remove(mcpName: string): Promise<void> {
    await this.ensureInitialized();
    this.credentials.delete(mcpName);
    logger.info(`🗑️  Removed credential for ${mcpName} from vault`);

    try {
      await this.persistVault();
    } catch (error: any) {
      logger.error(`Failed to update credential vault: ${error.message}`);
    }
  }

  /**
   * List all stored credentials (metadata only, no sensitive data)
   */
  async list(): Promise<Array<{ mcpName: string; type: string }>> {
    await this.ensureInitialized();
    return Array.from(this.credentials.values()).map(cred => ({
      mcpName: cred.mcpName,
      type: cred.type
    }));
  }
}
