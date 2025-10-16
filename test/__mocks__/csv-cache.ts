/**
 * Mock CSV Cache for Jest testing
 * Provides a simple in-memory cache implementation to bypass import.meta issues
 */

export interface CachedTool {
  mcpName: string;
  toolId: string;
  toolName: string;
  description: string;
  hash: string;
  timestamp: string;
}

export interface CachedMCP {
  name: string;
  hash: string;
  toolCount: number;
  timestamp: string;
  tools: CachedTool[];
}

export interface FailedMCP {
  name: string;
  lastAttempt: string;
  errorType: string;
  errorMessage: string;
  attemptCount: number;
  nextRetry: string;
}

export interface CacheMetadata {
  version: string;
  profileName: string;
  profileHash: string;
  ncpVersion: string;
  createdAt: string;
  lastUpdated: string;
  totalMCPs: number;
  totalTools: number;
  indexedMCPs: Map<string, string>;
  failedMCPs: Map<string, FailedMCP>;
}

export class CSVCache {
  private metadata: CacheMetadata | null = null;
  private tools: CachedTool[] = [];

  constructor(private cacheDir: string, private profileName: string) {}

  async initialize(): Promise<void> {
    this.metadata = {
      version: '1.0',
      profileName: this.profileName,
      profileHash: '',
      ncpVersion: '1.0.0-mock',
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalMCPs: 0,
      totalTools: 0,
      indexedMCPs: new Map(),
      failedMCPs: new Map()
    };
  }

  validateCache(currentProfileHash: string): boolean {
    return false; // Always invalid in tests to force re-indexing
  }

  getIndexedMCPs(): Map<string, string> {
    return this.metadata?.indexedMCPs || new Map();
  }

  isMCPIndexed(mcpName: string, currentHash: string): boolean {
    return false; // Never indexed in mock
  }

  loadCachedTools(): CachedTool[] {
    return this.tools;
  }

  loadMCPTools(mcpName: string): CachedTool[] {
    return this.tools.filter(t => t.mcpName === mcpName);
  }

  async startIncrementalWrite(profileHash: string): Promise<void> {
    if (this.metadata) {
      this.metadata.profileHash = profileHash;
    }
  }

  async appendMCP(mcpName: string, tools: CachedTool[], mcpHash: string): Promise<void> {
    this.tools.push(...tools);
    if (this.metadata) {
      this.metadata.indexedMCPs.set(mcpName, mcpHash);
      this.metadata.totalMCPs = this.metadata.indexedMCPs.size;
      this.metadata.totalTools += tools.length;
      this.metadata.lastUpdated = new Date().toISOString();
    }
  }

  async finalize(): Promise<void> {
    // No-op in mock
  }

  async clear(): Promise<void> {
    this.tools = [];
    this.metadata = null;
  }

  markFailed(mcpName: string, error: Error): void {
    if (!this.metadata) return;

    const failedMCP: FailedMCP = {
      name: mcpName,
      lastAttempt: new Date().toISOString(),
      errorType: 'unknown',
      errorMessage: error.message,
      attemptCount: 1,
      nextRetry: new Date(Date.now() + 3600000).toISOString()
    };

    this.metadata.failedMCPs.set(mcpName, failedMCP);
  }

  shouldRetryFailed(mcpName: string, forceRetry: boolean = false): boolean {
    return true; // Always retry in tests
  }

  clearFailedMCPs(): void {
    if (this.metadata) {
      this.metadata.failedMCPs.clear();
    }
  }

  getFailedMCPsCount(): number {
    return this.metadata?.failedMCPs.size || 0;
  }

  getRetryReadyFailedMCPs(): string[] {
    return [];
  }

  isMCPFailed(mcpName: string): boolean {
    return this.metadata?.failedMCPs.has(mcpName) || false;
  }

  static hashProfile(profile: any): string {
    return 'mock-profile-hash';
  }

  static hashTools(tools: any[]): string {
    return 'mock-tools-hash';
  }
}
