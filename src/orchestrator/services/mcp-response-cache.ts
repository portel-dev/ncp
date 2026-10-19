import { createHash } from 'node:crypto';
import { InMemoryResponseCacheStore, type CacheEntry, type CacheKey, type ResponseCacheStore } from '@modelcontextprotocol/client';

/**
 * One bounded SDK cache store per stable server configuration. Client instances
 * reconnecting to that server share it; the SDK partitions private entries by
 * the credential fingerprint supplied as `cachePartition`.
 */
export class MCPResponseCacheRegistry {
  private readonly stores = new Map<string, { store: InMemoryResponseCacheStore; lastUsed: number }>();
  private readonly maxStores: number;
  private readonly maxEntriesPerStore: number;

  constructor(maxStores = 64, maxEntriesPerStore = 256) {
    this.maxStores = maxStores;
    this.maxEntriesPerStore = maxEntriesPerStore;
  }

  get(configIdentity: string): InMemoryResponseCacheStore {
    const existing = this.stores.get(configIdentity);
    if (existing) {
      existing.lastUsed = Date.now();
      this.stores.delete(configIdentity);
      this.stores.set(configIdentity, existing);
      return existing.store;
    }

    while (this.stores.size >= this.maxStores) {
      const oldest = this.stores.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.stores.delete(oldest);
    }

    const store = new InMemoryResponseCacheStore({ maxEntries: this.maxEntriesPerStore });
    this.stores.set(configIdentity, { store, lastUsed: Date.now() });
    return store;
  }

  get size(): number {
    return this.stores.size;
  }
}

/**
 * Guard a shared SDK store against an authentication token changing while a
 * client remains connected. Such a client may still talk to the server, but
 * it must neither read nor write catalog entries under its old principal key.
 */
export function guardMCPResponseCacheStore(
  store: ResponseCacheStore,
  expectedPartition: string,
  getCurrentPartition: () => Promise<string>,
): ResponseCacheStore {
  let ignoredWriteStamp = 0;
  return {
    async get(key: CacheKey): Promise<CacheEntry | undefined> {
      if (await getCurrentPartition() !== expectedPartition) return undefined;
      return store.get(key);
    },
    async set(key, entry): Promise<number> {
      if (await getCurrentPartition() !== expectedPartition) return ++ignoredWriteStamp;
      return store.set(key, entry);
    },
    delete: key => store.delete(key),
    evict: method => store.evict(method),
    clear: () => store.clear(),
  };
}

export function fingerprintMCPServerConfig(config: {
  name: string;
  command?: string;
  args?: string[];
  url?: string;
  transport?: string;
}): string {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex');
}

export function fingerprintMCPPrincipal(material: unknown): string {
  return createHash('sha256').update(JSON.stringify(material)).digest('hex');
}
