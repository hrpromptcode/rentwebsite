/**
 * Tiny cache abstraction: Upstash Redis when configured, in-memory fallback otherwise.
 * Keys are always namespaced by the caller (e.g. `host:{hostname}`, `t:{tenantId}:config`).
 */

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
}

class MemoryCache implements Cache {
  private store = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return hit.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (this.store.size > 5000) {
      // crude eviction: drop oldest 10%
      const keys = [...this.store.keys()].slice(0, 500);
      for (const k of keys) this.store.delete(k);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(...keys: string[]): Promise<void> {
    for (const k of keys) this.store.delete(k);
  }
}

class UpstashCache implements Cache {
  private client: import("@upstash/redis").Redis;
  private memo = new MemoryCache(); // short local layer to absorb bursts

  constructor(url: string, token: string, RedisCtor: typeof import("@upstash/redis").Redis) {
    this.client = new RedisCtor({ url, token });
  }

  async get<T>(key: string): Promise<T | null> {
    const local = await this.memo.get<T>(key);
    if (local !== null) return local;
    const v = (await this.client.get<T>(key)) ?? null;
    if (v !== null) await this.memo.set(key, v, 5);
    return v;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.memo.set(key, value, Math.min(ttlSeconds, 5));
    await this.client.set(key, value, { ex: ttlSeconds });
  }

  async del(...keys: string[]): Promise<void> {
    await this.memo.del(...keys);
    if (keys.length) await this.client.del(...keys);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __rentwebCache: Cache | undefined;
}

export function getCache(): Cache {
  if (globalThis.__rentwebCache) return globalThis.__rentwebCache;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Redis } = require("@upstash/redis") as typeof import("@upstash/redis");
      globalThis.__rentwebCache = new UpstashCache(url, token, Redis);
      return globalThis.__rentwebCache;
    } catch {
      /* fall through to memory */
    }
  }
  globalThis.__rentwebCache = new MemoryCache();
  return globalThis.__rentwebCache;
}

/** Read-through helper. */
export async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  const cache = getCache();
  const hit = await cache.get<T>(key);
  if (hit !== null) return hit;
  const value = await loader();
  if (value !== null && value !== undefined) await cache.set(key, value, ttlSeconds);
  return value;
}
