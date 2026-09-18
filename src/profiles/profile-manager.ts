/**
 * Profile Manager for NCP
 * Manages different profiles with their MCP configurations
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { getProfilesDirectory, getNcpBaseDirectory } from '../utils/ncp-paths.js';
import { importFromClient, shouldAttemptClientSync } from '../utils/client-importer.js';
import { getClientConfigPath, getClientDefinition } from '../utils/client-registry.js';
import type { OAuthConfig } from '../auth/oauth-device-flow.js';
import { getSecureCredentialStore, type CredentialType } from '../auth/secure-credential-store.js';
import { logger } from '../utils/logger.js';
import { isSensitiveKey } from '../utils/redact-sensitive.js';

export const SECURE_STORAGE_REFERENCE = '_USE_SECURE_STORAGE_';

interface AddMCPOptions {
  sensitiveEnvKeys?: string[];
}

interface MCPConfig {
  command?: string;  // Optional: for stdio transport
  args?: string[];
  env?: Record<string, string>;
  url?: string;  // Optional: for HTTP/SSE transport
  auth?: {
    type: 'oauth' | 'bearer' | 'apiKey' | 'basic';
    oauth?: OAuthConfig;  // OAuth 2.0 Device Flow configuration
    oauth21?: {
      clientId?: string;
      clientSecret?: string;
      scopes?: string[];
      callbackPort?: number;
    };
    token?: string;       // Bearer token or API key
    username?: string;    // Basic auth username
    password?: string;    // Basic auth password
  };
}

interface Profile {
  name: string;
  description: string;
  mcpServers: Record<string, MCPConfig>;
  metadata: {
    created: string;
    modified: string;
  };
}

export class ProfileManager {
  private profilesDir: string;
  private profiles: Map<string, Profile> = new Map();
  private credentialStore = getSecureCredentialStore();

  constructor() {
    // Use centralized path utility to determine local vs global .ncp directory
    this.profilesDir = getProfilesDirectory();
  }

  /**
   * Store sensitive credentials in secure storage and replace with references
   */
  private async storeCredentials(
    mcpName: string,
    config: MCPConfig,
    sensitiveEnvKeys: string[] = []
  ): Promise<MCPConfig> {
    // Clone config to avoid mutating original
    const securConfig = JSON.parse(JSON.stringify(config));
    const explicitlySensitive = new Set(sensitiveEnvKeys);

    // Store token/API key
    if (config.auth?.token && config.auth.token !== SECURE_STORAGE_REFERENCE) {
      const type: CredentialType = config.auth.type === 'bearer' ? 'bearer_token' : 'api_key';
      const success = await this.credentialStore.setCredential(
        mcpName,
        type,
        config.auth.token,
        `${config.auth.type} credential for ${mcpName}`
      );

      if (success) {
        securConfig.auth.token = SECURE_STORAGE_REFERENCE;
        logger.debug(`Stored ${type} for ${mcpName} in secure storage`);
      } else {
        throw new Error(`Secure storage rejected the ${type} for ${mcpName}`);
      }
    }

    // Store basic auth credentials
    if (config.auth?.username && config.auth.password &&
        config.auth.username !== SECURE_STORAGE_REFERENCE &&
        config.auth.password !== SECURE_STORAGE_REFERENCE) {
      const success = await this.credentialStore.setCredential(
        mcpName,
        'basic_auth',
        { username: config.auth.username, password: config.auth.password },
        `Basic auth credentials for ${mcpName}`
      );

      if (success) {
        securConfig.auth.username = SECURE_STORAGE_REFERENCE;
        securConfig.auth.password = SECURE_STORAGE_REFERENCE;
        logger.debug(`Stored basic auth for ${mcpName} in secure storage`);
      } else {
        throw new Error(`Secure storage rejected the basic auth credential for ${mcpName}`);
      }
    }

    const oauthClientSecret = config.auth?.oauth21?.clientSecret || config.auth?.oauth?.clientSecret;
    if (oauthClientSecret && oauthClientSecret !== SECURE_STORAGE_REFERENCE) {
      const success = await this.credentialStore.setCredential(
        mcpName,
        'oauth_client_secret',
        oauthClientSecret,
        `OAuth client secret for ${mcpName}`
      );
      if (!success) {
        throw new Error(`Secure storage rejected the OAuth client secret for ${mcpName}`);
      }
      if (securConfig.auth.oauth21?.clientSecret) {
        securConfig.auth.oauth21.clientSecret = SECURE_STORAGE_REFERENCE;
      }
      if (securConfig.auth.oauth?.clientSecret) {
        securConfig.auth.oauth.clientSecret = SECURE_STORAGE_REFERENCE;
      }
    }

    // Environment credentials use one encrypted/keychain entry per MCP. The
    // profile keeps only references, while non-sensitive settings remain clear.
    const environmentCredentials = Object.fromEntries(
      Object.entries(config.env || {}).filter(([key, value]) =>
        value !== SECURE_STORAGE_REFERENCE &&
        (explicitlySensitive.has(key) || isSensitiveKey(key))
      )
    );

    if (Object.keys(environmentCredentials).length > 0) {
      const existing = await this.credentialStore.getCredential(mcpName, 'custom');
      const existingEnvironment = existing && typeof existing === 'object'
        ? existing as Record<string, string>
        : {};
      const success = await this.credentialStore.setCredential(
        mcpName,
        'custom',
        { ...existingEnvironment, ...environmentCredentials },
        `Environment credentials for ${mcpName}`
      );

      if (!success) {
        throw new Error(`Secure storage rejected environment credentials for ${mcpName}`);
      }

      for (const key of Object.keys(environmentCredentials)) {
        securConfig.env[key] = SECURE_STORAGE_REFERENCE;
      }
      logger.debug(`Stored ${Object.keys(environmentCredentials).length} environment credential(s) for ${mcpName}`);
    }

    return securConfig;
  }

  /**
   * Load actual credentials from secure storage if references are found
   */
  private async loadCredentials(mcpName: string, config: MCPConfig): Promise<MCPConfig> {
    // Clone config to avoid mutating cached version
    const fullConfig = JSON.parse(JSON.stringify(config));

    // Load token/API key if it's a reference
    if (config.auth?.token === SECURE_STORAGE_REFERENCE) {
      const type: CredentialType = config.auth.type === 'bearer' ? 'bearer_token' : 'api_key';
      const credential = await this.credentialStore.getCredential(mcpName, type);
      if (credential && typeof credential === 'string') {
        fullConfig.auth.token = credential;
      } else {
        logger.warn(`Failed to load ${type} for ${mcpName} from secure storage`);
      }
    }

    // Load basic auth credentials if they're references
    if (config.auth?.username === SECURE_STORAGE_REFERENCE && config.auth.password === SECURE_STORAGE_REFERENCE) {
      const credential = await this.credentialStore.getCredential(mcpName, 'basic_auth');
      if (credential && typeof credential === 'object') {
        fullConfig.auth.username = credential.username;
        fullConfig.auth.password = credential.password;
      } else {
        logger.warn(`Failed to load basic auth for ${mcpName} from secure storage`);
      }
    }

    const referencesOAuthClientSecret =
      config.auth?.oauth21?.clientSecret === SECURE_STORAGE_REFERENCE ||
      config.auth?.oauth?.clientSecret === SECURE_STORAGE_REFERENCE;
    if (referencesOAuthClientSecret) {
      const secret = await this.credentialStore.getCredential(mcpName, 'oauth_client_secret');
      if (typeof secret === 'string' && secret.length > 0) {
        if (fullConfig.auth.oauth21?.clientSecret === SECURE_STORAGE_REFERENCE) {
          fullConfig.auth.oauth21.clientSecret = secret;
        }
        if (fullConfig.auth.oauth?.clientSecret === SECURE_STORAGE_REFERENCE) {
          fullConfig.auth.oauth.clientSecret = secret;
        }
      } else {
        if (fullConfig.auth.oauth21) delete fullConfig.auth.oauth21.clientSecret;
        if (fullConfig.auth.oauth) delete fullConfig.auth.oauth.clientSecret;
        logger.warn(`Secure OAuth client secret is unavailable for ${mcpName}`);
      }
    }

    const referencedEnvironmentKeys = Object.entries(config.env || {})
      .filter(([, value]) => value === SECURE_STORAGE_REFERENCE)
      .map(([key]) => key);

    if (referencedEnvironmentKeys.length > 0) {
      const stored = await this.credentialStore.getCredential(mcpName, 'custom');
      const environment = stored && typeof stored === 'object'
        ? stored as Record<string, string>
        : {};

      for (const key of referencedEnvironmentKeys) {
        const value = environment[key];
        if (typeof value === 'string' && value.length > 0) {
          fullConfig.env[key] = value;
        } else {
          // Never pass the reference marker to a child process as a credential.
          delete fullConfig.env[key];
          logger.warn(`Secure environment credential ${key} is unavailable for ${mcpName}`);
        }
      }
    }

    return fullConfig;
  }

  async initialize(skipAutoImport: boolean = false): Promise<void> {
    // Ensure profiles directory exists
    if (!existsSync(this.profilesDir)) {
      await fs.mkdir(this.profilesDir, { recursive: true });
    }

    // Load existing profiles
    await this.loadProfiles();

    // Create default universal profile if it doesn't exist
    if (!this.profiles.has('all')) {
      await this.createDefaultProfile();
    }

    // Auto-migrate credentials on first run (silent unless credentials found)
    try {
      const migrationResult = await this.migrateAllCredentials();
      if (migrationResult.migrated > 0) {
        logger.info(`🔐 Auto-migrated ${migrationResult.migrated} credential(s) to secure storage`);
      }
      if (migrationResult.errors > 0) {
        logger.warn(`⚠️  ${migrationResult.errors} credential(s) failed to migrate`);
      }
    } catch (error) {
      // Silent failure - don't block initialization
      logger.debug(`Credential auto-migration failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Auto-migrate commands (npx → npx.cmd on Windows)
    if (process.platform === 'win32') {
      try {
        const runtimeResult = await this.migrateAllRuntimeCommands();
        if (runtimeResult.migrated > 0) {
          logger.info(`🔧 Auto-migrated ${runtimeResult.migrated} command(s) for Windows`);
        }
      } catch (error) {
        // Silent failure - don't block initialization
        logger.debug(`Runtime command auto-migration failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // ⚠️ IMPORTANT: Auto-import is now triggered ONLY when a client announces itself
    // via the MCP initialize handshake (see ncp-orchestrator.ts line 2084)
    // This ensures:
    // 1. Auto-import respects the client-initiated protocol
    // 2. Local project .ncp folders don't auto-sync with global Claude Desktop
    // 3. Only known/supported clients trigger auto-import
    // The skipAutoImport parameter is kept for backward compatibility but has no effect
  }

  /**
   * Auto-sync MCPs from any MCP client on every startup
   * Detects both config files (JSON/TOML) and extensions (.dxt/dxt bundles)
   * Imports missing MCPs using add command for cache coherence
   *
   * Supports: Claude Desktop, Perplexity, Cursor, Cline, Continue, and more
   *
   * How it works:
   * 1. Client identifies itself via MCP initialize request (clientInfo.name)
   * 2. Name is matched against CLIENT_REGISTRY (with normalization)
   * 3. Client-specific importer reads config and extensions
   * 4. Missing MCPs are added to 'all' profile
   *
   * ⚠️ CRITICAL: This MUST target the 'all' profile - DO NOT CHANGE!
   * Auto-imported MCPs go to 'all' to maintain consistency with manual `ncp add`.
   */
  async tryAutoImportFromClient(
    clientName: string,
    notificationManager?: any
  ): Promise<void> {
    try {
      // Check if we should attempt auto-sync for this client
      if (!shouldAttemptClientSync(clientName)) {
        return; // Client config not found, skip auto-sync
      }

      // Get current 'all' profile
      // ⚠️ DO NOT CHANGE 'all' to 'default' or any other profile name!
      const allProfile = this.profiles.get('all');
      if (!allProfile) {
        return; // Should not happen, but guard anyway
      }

      // Get MCPs from client (both config and extensions)
      const importResult = await importFromClient(clientName);
      if (!importResult || importResult.count === 0) {
        return; // No MCPs found in client
      }

      // Get existing MCPs in NCP profile
      const existingMCPs = allProfile.mcpServers || {};
      const existingMCPNames = new Set(Object.keys(existingMCPs));

      // Find MCPs that are in client but NOT in NCP (missing MCPs)
      const missingMCPs: Array<{ name: string; config: any }> = [];

      // Filter to only new MCPs (not already in NCP)
      // Use simple name-based check to avoid spawning child processes
      const newMCPEntries = Object.entries(importResult.mcpServers).filter(([name]) => {
        // Skip if already in NCP
        if (existingMCPNames.has(name)) return false;

        // Skip NCP itself by name (avoid protocol check that spawns processes)
        const nameLower = name.toLowerCase();
        if (nameLower === 'ncp' || nameLower.includes('ncp-server')) {
          return false;
        }

        return true;
      });

      // Show simple message if there are new MCPs
      if (newMCPEntries.length > 0) {
        logger.info(`✨ Found ${newMCPEntries.length} new MCPs from ${importResult.clientName}`);
      }

      // Add all new MCPs without spawning them
      for (const [mcpName, mcpConfig] of newMCPEntries) {
        missingMCPs.push({ name: mcpName, config: mcpConfig });
      }

      if (missingMCPs.length === 0) {
        return; // All client MCPs already in NCP
      }

      // Import missing MCPs in parallel with timeout (prevents startup delays)
      const AUTO_IMPORT_TIMEOUT = 30000; // 30 second max for all auto-imports
      const imported: string[] = [];
      const timeoutAt = Date.now() + AUTO_IMPORT_TIMEOUT;

      for (const { name, config } of missingMCPs) {
        if (Date.now() > timeoutAt) {
          logger.warn('Auto-import timeout - remaining MCPs will be skipped');
          break;
        }

        try {
          // Remove metadata fields before adding (internal use only)
          // Support both stdio (command) and HTTP (url) transport types
          const cleanConfig: MCPConfig = {};

          // Stdio transport fields
          if (config.command) {
            cleanConfig.command = config.command;
            cleanConfig.args = config.args || [];
            cleanConfig.env = config.env || {};
          }

          // HTTP/SSE transport fields
          if (config.url) {
            cleanConfig.url = config.url;
          }

          // Auth configuration (for HTTP MCPs)
          if (config.auth) {
            cleanConfig.auth = config.auth;
          }

          // Use addMCPToProfile to ensure cache updates happen
          await this.addMCPToProfile('all', name, cleanConfig);
          imported.push(name);
        } catch (error) {
          logger.warn(`Failed to import ${name}: ${error}`);
        }
      }

      if (imported.length > 0) {
        // Count by source for logging
        const configCount = missingMCPs.filter(m => m.config._source !== '.dxt' && m.config._source !== 'dxt').length;
        const extensionsCount = missingMCPs.filter(m => m.config._source === '.dxt' || m.config._source === 'dxt').length;

        // Log import summary
        logger.info(`   - ${configCount} from config file`);
        if (extensionsCount > 0) {
          logger.info(`   - ${extensionsCount} from extensions`);
        }
        logger.info(`   → Added to ${path.join(this.profilesDir, 'all.json')}`);

        // After successful import, queue an explicit config optimization action.
        await this.maybeReplaceClientConfig(
          clientName,
          importResult,
          notificationManager
        );
      }
    } catch (error) {
      // Silent failure - don't block startup if auto-import fails
      // User can still configure manually
      logger.warn(`Auto-sync failed: ${error}`);
    }
  }

  /**
   * Queue the client-specific config optimization action after auto-import.
   */
  private async maybeReplaceClientConfig(
    clientName: string,
    importResult: any,
    notificationManager?: any
  ): Promise<void> {
    // Claude Desktop: Special case - users can disable MCPs via UI
    const isClaudeDesktop = clientName.toLowerCase().includes('claude');
    if (isClaudeDesktop) {
      logger.info('💡 Claude Desktop: Manage MCPs in settings if needed');

      // Show notification about disabling MCPs in UI to save tokens
      if (notificationManager) {
        const totalMCPs = Object.keys(importResult.mcpServers).length;
        const estimatedTools = totalMCPs * 20;

        notificationManager.add({
          type: 'tip',
          message: `${totalMCPs} MCPs configured (~${estimatedTools} tools) - disable them in Claude Desktop settings to save ~95% tokens (NCP manages them all)`,
          relatedId: 'claude-desktop-ui'
        });
      }
      return;
    }

    // Initialization notifications cannot initiate MCP requests. Surface an
    // explicit management action that can use input_required when invoked.
    this.queueConfigOptimizationNotification(
      clientName,
      importResult,
      notificationManager
    );
  }

  /**
   * Queue notification about config optimization opportunity
   * (for non-Claude Desktop clients that can't disable MCPs via UI)
   */
  private queueConfigOptimizationNotification(
    clientName: string,
    importResult: any,
    notificationManager?: any
  ): void {
    if (!notificationManager) return;

    const totalMCPs = Object.keys(importResult.mcpServers).length;
    const estimatedTools = totalMCPs * 20;

    notificationManager.add({
      type: 'action',
      message: `${totalMCPs} MCPs configured (~${estimatedTools} tools) - run mcp:optimize_client for ${clientName} to replace its config with NCP-only and save ~95% tokens`,
      relatedId: clientName  // AI can ask about client-specific config replacement
    });
  }

  /** Back up and replace a supported client's MCP configuration with NCP. */
  async optimizeClientConfig(clientName: string): Promise<string> {
    const configPath = getClientConfigPath(clientName);
    if (!configPath) {
      throw new Error(`Unable to locate a supported client configuration for ${clientName}`);
    }
    const definition = getClientDefinition(clientName);
    if (definition?.configFormat && definition.configFormat !== 'json') {
      throw new Error(`Config format ${definition.configFormat} for ${clientName} is not supported for automatic replacement`);
    }
    await this.backupAndReplaceConfig(clientName);
    return configPath;
  }

  /**
   * Backup and replace client config with NCP-only
   */
  private async backupAndReplaceConfig(
    clientName: string
  ): Promise<void> {
    const configPath = getClientConfigPath(clientName);

    if (!configPath) {
      logger.warn(`Unable to locate config for ${clientName} – skipping automatic replacement`);
      return;
    }

    const definition = getClientDefinition(clientName);
    if (definition?.configFormat && definition.configFormat !== 'json') {
      logger.warn(`Config format ${definition.configFormat} for ${clientName} is not supported for automatic replacement`);
      return;
    }

    const mcpPath = definition?.mcpServersPath || 'mcpServers';
    await fs.mkdir(path.dirname(configPath), { recursive: true });

    const configData = await this.readJsonConfig(configPath);
    const existingValue = this.getNestedProperty(configData, mcpPath);

    if (Array.isArray(existingValue)) {
      throw new Error(`Cannot optimize ${clientName} config because ${mcpPath} is array-based`);
    }

    await this.backupClientConfigFile(clientName, configPath);
    this.setNestedProperty(configData, mcpPath, this.buildNcpServerDefinition());

    await fs.writeFile(configPath, JSON.stringify(configData, null, 2), 'utf-8');
    logger.info(`🔄 Replaced ${clientName} MCP config with NCP-only server at ${configPath}`);
  }

  private async backupClientConfigFile(clientName: string, configPath: string): Promise<void> {
    try {
      await fs.access(configPath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return; // Nothing to backup
      }
      throw error;
    }

    const backupDir = path.join(getNcpBaseDirectory(), 'client-backups', this.normalizeClientName(clientName));
    await fs.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `config-${timestamp}.json`);
    await fs.copyFile(configPath, backupPath);
    logger.info(`📦 Backed up ${clientName} config to ${backupPath}`);
  }

  private async readJsonConfig(configPath: string): Promise<any> {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      if (!content.trim()) {
        return {};
      }
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Client config at ${configPath} must contain a JSON object`);
      }
      return parsed;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  private buildNcpServerDefinition(): Record<string, any> {
    const launchConfig = this.resolveNcpLaunchCommand();
    const server: Record<string, any> = {
      command: launchConfig.command,
      env: {
        NCP_PROFILE: 'all'
      }
    };

    if (launchConfig.args.length > 0) {
      server.args = launchConfig.args;
    }

    return {
      ncp: server
    };
  }

  private resolveNcpLaunchCommand(): { command: string; args: string[] } {
    const entryPoint = process.argv[1];
    if (entryPoint) {
      return {
        command: process.execPath,
        args: [entryPoint]
      };
    }

    return {
      command: 'ncp',
      args: []
    };
  }

  private getNestedProperty(obj: any, keyPath: string): any {
    const parts = keyPath.split('.');
    let current = obj;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  private setNestedProperty(obj: any, keyPath: string, value: any): void {
    const parts = keyPath.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
  }

  private normalizeClientName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'client';
  }

  private async loadProfiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.profilesDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const profilePath = path.join(this.profilesDir, file);
          const content = await fs.readFile(profilePath, 'utf-8');
          const profile = JSON.parse(content) as Profile;

          // Skip profiles without a name field (invalid profile files)
          if (!profile.name || typeof profile.name !== 'string') {
            // Log as debug only - not user's problem if internal files are corrupted
            logger.debug(`Skipping invalid profile ${file}: missing or invalid 'name' field`);
            continue;
          }

          this.profiles.set(profile.name, profile);
        }
      }
    } catch (error) {
      // Directory might not exist yet
    }
  }

  /**
   * ⚠️ CRITICAL: Profile name MUST be 'all' - DO NOT CHANGE!
   *
   * This creates the universal 'all' profile that:
   * 1. Is the default target for `ncp add`, `ncp config import`, auto-import
   * 2. Merges all MCPs from other profiles at runtime
   * 3. Is used by default when running NCP as MCP server
   *
   * DO NOT change the name to 'default' or anything else - it will break:
   * - All CLI commands that depend on 'all' being the default
   * - Auto-import from Claude Desktop
   * - User expectations (docs say 'all' is the universal profile)
   */
  private async createDefaultProfile(): Promise<void> {
    const defaultProfile: Profile = {
      name: 'all', // ⚠️ DO NOT CHANGE THIS NAME!
      description: 'Universal profile with all configured MCP servers',
      mcpServers: {},
      metadata: {
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      }
    };

    await this.saveProfile(defaultProfile);
    this.profiles.set('all', defaultProfile); // ⚠️ DO NOT CHANGE THIS NAME!
  }

  async saveProfile(profile: Profile): Promise<void> {
    const profilePath = path.join(this.profilesDir, `${profile.name}.json`);
    await fs.writeFile(profilePath, JSON.stringify(profile, null, 2));
  }

  async getProfile(name: string): Promise<Profile | undefined> {
    // For 'all' profile, merge with MCPs from other profiles at runtime
    if (name === 'all') {
      const allProfile = this.profiles.get('all');
      if (!allProfile) return undefined;

      // Start with MCPs directly in the all profile
      const mergedServers: Record<string, MCPConfig> = { ...allProfile.mcpServers };

      // Add MCPs from all other profiles
      for (const [profileName, profile] of this.profiles) {
        if (profileName !== 'all') {
          for (const [mcpName, mcpConfig] of Object.entries(profile.mcpServers)) {
            // Only add if not already in merged (preserves direct 'all' additions)
            if (!mergedServers[mcpName]) {
              mergedServers[mcpName] = mcpConfig;
            }
          }
        }
      }

      return {
        ...allProfile,
        mcpServers: mergedServers
      };
    }

    return this.profiles.get(name);
  }

  async addMCPToProfile(
    profileName: string,
    mcpName: string,
    config: MCPConfig,
    options: AddMCPOptions = {}
  ): Promise<void> {
    // Resolve secure storage before mutating profile state. A storage failure
    // leaves both the in-memory profile and its file untouched.
    const secureConfig = await this.storeCredentials(mcpName, config, options.sensitiveEnvKeys);
    let profile = this.profiles.get(profileName);

    if (!profile) {
      // Create new profile if it doesn't exist
      profile = {
        name: profileName,
        description: `Profile: ${profileName}`,
        mcpServers: {},
        metadata: {
          created: new Date().toISOString(),
          modified: new Date().toISOString()
        }
      };
      this.profiles.set(profileName, profile);
    }

    // Add or update MCP config
    profile.mcpServers[mcpName] = secureConfig;
    profile.metadata.modified = new Date().toISOString();

    await this.saveProfile(profile);
  }

  async removeMCPFromProfile(profileName: string, mcpName: string): Promise<void> {
    const profile = this.profiles.get(profileName);
    if (!profile) {
      throw new Error(`Profile ${profileName} not found`);
    }

    delete profile.mcpServers[mcpName];
    profile.metadata.modified = new Date().toISOString();

    await this.saveProfile(profile);
  }

  listProfiles(): string[] {
    return Array.from(this.profiles.keys());
  }

  async getProfileMCPs(profileName: string): Promise<Record<string, MCPConfig> | undefined> {
    const profile = await this.getProfile(profileName);
    if (!profile?.mcpServers) return undefined;

    // Filter out invalid configurations and load credentials from secure storage
    const validMCPs: Record<string, MCPConfig> = {};
    for (const [name, config] of Object.entries(profile.mcpServers)) {
      if (typeof config === 'object' && config !== null) {
        // Valid if it has command (stdio) OR url (HTTP/SSE)
        const hasStdio = 'command' in config && typeof config.command === 'string';
        const hasHttp = 'url' in config && typeof config.url === 'string';

        if (hasStdio || hasHttp) {
          // Load actual credentials from secure storage if needed
          const fullConfig = await this.loadCredentials(name, config as MCPConfig);
          validMCPs[name] = fullConfig;
        }
      }
    }

    return Object.keys(validMCPs).length > 0 ? validMCPs : undefined;
  }

  getConfigPath(): string {
    return this.profilesDir;
  }

  getProfilePath(profileName: string): string {
    return path.join(this.profilesDir, `${profileName}.json`);
  }

  /**
   * Migrate all plain-text credentials in a profile to secure storage
   */
  async migrateProfileCredentials(profileName: string): Promise<{ migrated: number; errors: number }> {
    const profile = this.profiles.get(profileName);
    if (!profile) {
      throw new Error(`Profile ${profileName} not found`);
    }

    let migrated = 0;
    let errors = 0;

    for (const [mcpName, config] of Object.entries(profile.mcpServers)) {
      // Check if credentials are plain-text (not already secure references)
      const hasPlainTextToken = config.auth?.token && config.auth.token !== SECURE_STORAGE_REFERENCE;
      const hasPlainTextBasicAuth =
        config.auth?.username &&
        config.auth.password &&
        config.auth.username !== SECURE_STORAGE_REFERENCE;
      const hasPlainTextOAuthClientSecret =
        (config.auth?.oauth21?.clientSecret && config.auth.oauth21.clientSecret !== SECURE_STORAGE_REFERENCE) ||
        (config.auth?.oauth?.clientSecret && config.auth.oauth.clientSecret !== SECURE_STORAGE_REFERENCE);
      const sensitiveEnvironmentKeys = Object.entries(config.env || {})
        .filter(([key, value]) => value !== SECURE_STORAGE_REFERENCE && isSensitiveKey(key))
        .map(([key]) => key);

      if (hasPlainTextToken || hasPlainTextBasicAuth || hasPlainTextOAuthClientSecret || sensitiveEnvironmentKeys.length > 0) {
        try {
          const secureConfig = await this.storeCredentials(mcpName, config, sensitiveEnvironmentKeys);
          profile.mcpServers[mcpName] = secureConfig;
          migrated++;
          logger.info(`Migrated credentials for ${mcpName}`);
        } catch (error) {
          logger.error(`Failed to migrate credentials for ${mcpName}: ${error}`);
          errors++;
        }
      }
    }

    if (migrated > 0) {
      profile.metadata.modified = new Date().toISOString();
      await this.saveProfile(profile);
    }

    return { migrated, errors };
  }

  /**
   * Migrate all plain-text credentials across all profiles
   */
  async migrateAllCredentials(): Promise<{ migrated: number; errors: number }> {
    let totalMigrated = 0;
    let totalErrors = 0;

    for (const profileName of this.listProfiles()) {
      const result = await this.migrateProfileCredentials(profileName);
      totalMigrated += result.migrated;
      totalErrors += result.errors;
    }

    return { migrated: totalMigrated, errors: totalErrors };
  }

  /**
   * Migrate runtime commands in a profile (npx → npx.cmd on Windows)
   */
  async migrateProfileRuntimeCommands(profileName: string): Promise<{ migrated: number; errors: number }> {
    const { getRuntimeForExtension } = await import('../utils/runtime-detector.js');
    const profile = this.profiles.get(profileName);
    if (!profile) {
      return { migrated: 0, errors: 0 };
    }

    let migrated = 0;
    let errors = 0;

    for (const [mcpName, config] of Object.entries(profile.mcpServers)) {
      if (config.command && typeof config.command === 'string') {
        try {
          const resolved = getRuntimeForExtension(config.command);
          
          // Only update if resolution actually changed the command
          if (resolved !== config.command) {
            profile.mcpServers[mcpName].command = resolved;
            migrated++;
            logger.debug(`Migrated command for ${mcpName}: ${config.command} → ${resolved}`);
          }
        } catch (error) {
          logger.error(`Failed to migrate command for ${mcpName}: ${error}`);
          errors++;
        }
      }
    }

    if (migrated > 0) {
      profile.metadata.modified = new Date().toISOString();
      await this.saveProfile(profile);
    }

    return { migrated, errors };
  }

  /**
   * Migrate runtime commands across all profiles
   */
  async migrateAllRuntimeCommands(): Promise<{ migrated: number; errors: number }> {
    let totalMigrated = 0;
    let totalErrors = 0;

    for (const profileName of this.listProfiles()) {
      const result = await this.migrateProfileRuntimeCommands(profileName);
      totalMigrated += result.migrated;
      totalErrors += result.errors;
    }

    return { migrated: totalMigrated, errors: totalErrors };
  }
}

export default ProfileManager;
