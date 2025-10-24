/**
 * Provider Registry
 * Fetches provider info from mcps.portel.dev with local fallback
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REGISTRY_API = 'https://ncp-registry.arul-e2e.workers.dev/api/providers';

export interface ProviderStdioSetup {
  description: string;
  command: string;
  needsSetup: boolean;
}

export interface ProviderStdioConfig {
  setup?: ProviderStdioSetup;
  command: string;
  args: string[];
}

export interface ProviderHttpConfig {
  url: string;
  auth: 'bearer' | 'oauth' | 'basic';
  docs: string;
  notes?: string;
}

export interface Provider {
  id: string;
  name: string;
  description: string;
  website: string;
  recommended: 'stdio' | 'http';
  stdio?: ProviderStdioConfig;
  http?: ProviderHttpConfig;
}

export interface ProviderRegistry {
  [key: string]: Provider;
}

let cachedRegistry: ProviderRegistry | null = null;

/**
 * Load local provider registry from JSON file (fallback)
 */
function loadLocalRegistry(): ProviderRegistry {
  try {
    const registryPath = join(__dirname, 'providers.json');
    const registryData = readFileSync(registryPath, 'utf-8');
    return JSON.parse(registryData);
  } catch (error: any) {
    console.error('Failed to load local provider registry:', error.message);
    return {};
  }
}

/**
 * Transform MCPPackage to Provider format
 */
function transformMCPToProvider(mcp: any): Provider | null {
  try {
    const meta = mcp._meta?.['dev.portel/setup'];

    const provider: Provider = {
      id: mcp.id || mcp.name,
      name: mcp.displayName || mcp.name,
      description: mcp.description,
      website: mcp.homepage || mcp.repository?.url || '',
      recommended: meta?.recommendedTransport || mcp.transport?.type || 'stdio'
    };

    // Add stdio config if available
    if (mcp.transport?.type === 'stdio' || mcp.installCommand) {
      provider.stdio = {
        command: mcp.runtimeHint || 'npx',
        args: mcp.installCommand?.split(' ').slice(1) || []
      };

      // Add setup info from augmentation
      if (meta?.setupCommand) {
        provider.stdio.setup = {
          description: meta.setupDescription || 'Setup required',
          command: meta.setupCommand,
          needsSetup: true
        };
      }
    }

    // Add HTTP config if available
    const hasHttpTransport = mcp.transport?.type === 'http' || mcp.transport?.type === 'sse' || mcp.transport?.endpoint;
    const hasHttpCommand = mcp.installCommand?.includes('HTTP endpoint') || mcp.installCommand?.startsWith('http');

    if (hasHttpTransport || hasHttpCommand || meta?.recommendedTransport === 'http' || meta?.recommendedTransport === 'sse') {
      provider.http = {
        url: mcp.transport?.endpoint || (hasHttpCommand ? mcp.installCommand.replace(/^Use HTTP endpoint:\s*/, '') : ''),
        auth: meta?.authType || 'bearer',
        docs: mcp.homepage || '',
        notes: meta?.notes
      };
    }

    return provider;
  } catch (error) {
    console.error('Failed to transform MCP:', error);
    return null;
  }
}

/**
 * Fetch provider registry from mcps.portel.dev
 */
async function fetchRemoteRegistry(): Promise<ProviderRegistry | null> {
  try {
    const response = await fetch(REGISTRY_API, {
      headers: { 'User-Agent': 'ncp-cli' },
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();

    // Handle API response format: { success: true, data: { id: MCPPackage } }
    if (result.success && result.data) {
      const registry: ProviderRegistry = {};

      for (const [id, mcp] of Object.entries(result.data)) {
        const provider = transformMCPToProvider(mcp);
        if (provider) {
          registry[id] = provider;
        }
      }

      return registry;
    }

    // Fallback: try old format
    return result.providers || result;
  } catch (error: any) {
    // Network error or timeout - will use local fallback
    return null;
  }
}

/**
 * Load provider registry (remote first, local fallback)
 */
export async function loadProviderRegistry(): Promise<ProviderRegistry> {
  // Return cached if available
  if (cachedRegistry) {
    return cachedRegistry;
  }

  // Try remote first
  const remoteRegistry = await fetchRemoteRegistry();
  if (remoteRegistry) {
    cachedRegistry = remoteRegistry;
    return remoteRegistry;
  }

  // Fallback to local
  const localRegistry = loadLocalRegistry();
  cachedRegistry = localRegistry;
  return localRegistry;
}

/**
 * Get provider by ID (from remote or local cache)
 */
export async function getProvider(providerId: string): Promise<Provider | null> {
  const registry = await loadProviderRegistry();
  return registry[providerId.toLowerCase()] || null;
}

/**
 * Fetch single provider directly from API (faster for single lookups)
 */
export async function fetchProvider(providerId: string): Promise<Provider | null> {
  try {
    const response = await fetch(`${REGISTRY_API}/${providerId}`, {
      headers: { 'User-Agent': 'ncp-cli' },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();

    // Handle API response format: { success: true, data: MCPPackage }
    if (result.success && result.data) {
      return transformMCPToProvider(result.data);
    }

    // Fallback: old format
    return result;
  } catch {
    // Fallback to registry lookup
    return await getProvider(providerId);
  }
}

/**
 * List all available providers
 */
export async function listProviders(): Promise<Provider[]> {
  const registry = await loadProviderRegistry();
  return Object.values(registry);
}

/**
 * Search providers by name or description
 */
export async function searchProviders(query: string): Promise<Provider[]> {
  const registry = await loadProviderRegistry();
  const lowerQuery = query.toLowerCase();

  return Object.values(registry).filter(provider =>
    provider.name.toLowerCase().includes(lowerQuery) ||
    provider.description.toLowerCase().includes(lowerQuery) ||
    provider.id.toLowerCase().includes(lowerQuery)
  );
}
