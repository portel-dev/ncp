/**
 * Bindings Manager - Credential Isolation for Code-Mode
 * Phase 3: Hide API keys from sandboxed code
 *
 * Implements Cloudflare Workers-style bindings pattern:
 * - Credentials stored securely in main thread only
 * - Worker receives pre-authenticated clients (bindings)
 * - Worker calls methods on bindings, never sees raw keys
 * - Main thread executes actual API calls with credentials
 */

import { logger } from '../utils/logger.js';

/**
 * Binding definition - what the worker sees
 */
export interface Binding {
  name: string;           // e.g., "github", "stripe", "openai"
  type: 'http' | 'sdk' | 'database' | 'custom';
  methods: string[];      // Available methods on this binding
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
    methods: string[]
  ): Binding {
    const binding: Binding = {
      name: mcpName,
      type,
      methods
    };

    this.bindings.set(mcpName, binding);
    logger.info(`🔗 Created binding for MCP: ${mcpName} with ${methods.length} methods`);

    return binding;
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
 * For now uses simple in-memory storage, can be extended to:
 * - File-based with encryption
 * - OS keychain integration
 * - External secret managers (HashiCorp Vault, AWS Secrets Manager)
 */
export class CredentialVault {
  private static instance: CredentialVault;
  private credentials: Map<string, Credential> = new Map();

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): CredentialVault {
    if (!CredentialVault.instance) {
      CredentialVault.instance = new CredentialVault();
    }
    return CredentialVault.instance;
  }

  /**
   * Store a credential securely
   * TODO: Add encryption at rest
   */
  async store(mcpName: string, credential: Credential): Promise<void> {
    // In production, encrypt before storing
    this.credentials.set(mcpName, credential);
    logger.info(`🔐 Stored credential for ${mcpName} in vault`);
  }

  /**
   * Retrieve a credential
   * TODO: Add decryption
   */
  async retrieve(mcpName: string): Promise<Credential | undefined> {
    // In production, decrypt after retrieving
    return this.credentials.get(mcpName);
  }

  /**
   * Remove a credential
   */
  async remove(mcpName: string): Promise<void> {
    this.credentials.delete(mcpName);
    logger.info(`🗑️  Removed credential for ${mcpName} from vault`);
  }

  /**
   * List all stored credentials (metadata only, no sensitive data)
   */
  async list(): Promise<Array<{ mcpName: string; type: string }>> {
    return Array.from(this.credentials.values()).map(cred => ({
      mcpName: cred.mcpName,
      type: cred.type
    }));
  }
}
