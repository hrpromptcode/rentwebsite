/**
 * Tiny cache abstraction: Upstash Redis when configured, in-memory fallback otherwise.
 * Keys are always namespaced by the caller (e.g. `host:{hostname}`, `t:{tenantId}:config`).
 *
 * Without Upstash every app process (storefront, admin, worker) has its own memory cache, so a `del()` in the
 * admin used to never reach the storefront (ADMIN_B2-19: suspend / reactivate took up to 5 min, settings up to
 * 60 s). The memory cache is therefore synced through Postgres: `del()` appends the keys to the
 * `cache_invalidations` log and every process polls that log (at most every RENTWEB_CACHE_SYNC_MS, default
 * 2000 ms, on cache access) and evicts what other processes invalidated.
 */
import { asc, gt, lt, sql } from "drizzle-orm";
import { cacheInvalidations, getDb, type DbLike } from "@rentweb/db";

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  /** `loadedAt` (ms): when the value was read from the source; a value read before an invalidation is not cached */
  set<T>(key: string, value: T, ttlSeconds: number, loadedAt?: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
}

/** Bumped when the cache implementation changes, so a dev server replaces a cache created by older code. */
const CACHE_IMPL_VERSION = 2;

export class MemoryCache implements Cache {
  readonly implVersion = CACHE_IMPL_VERSION;
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

  clear(): void {
    this.store.clear();
  }
}

/** Transport for cross-process invalidations (Postgres in production code, a fake in tests). */
export interface InvalidationBus {
  /** highest entry id right now (0 when empty) */
  head(): Promise<number>;
  /** entries with id > afterId, ascending, at most `limit` */
  since(afterId: number, limit: number): Promise<Array<{ id: number; keys: string[] }>>;
  publish(keys: string[]): Promise<void>;
}

/** Postgres-backed bus on the `cache_invalidations` table (platform table, no RLS). */
export function postgresInvalidationBus(db: DbLike | (() => DbLike)): InvalidationBus {
  const conn = () => (typeof db === "function" ? db() : db);
  return {
    async head() {
      const [row] = await conn().select({ id: sql<number>`coalesce(max(${cacheInvalidations.id}), 0)::bigint` }).from(cacheInvalidations);
      return Number(row?.id ?? 0);
    },
    async since(afterId, limit) {
      const rows = await conn()
        .select({ id: cacheInvalidations.id, keys: cacheInvalidations.keys })
        .from(cacheInvalidations)
        .where(gt(cacheInvalidations.id, afterId))
        .orderBy(asc(cacheInvalidations.id))
        .limit(limit);
      return rows.map((r) => ({ id: Number(r.id), keys: r.keys ?? [] }));
    },
    async publish(keys) {
      if (!keys.length) return;
      await conn().insert(cacheInvalidations).values({ keys });
      // keep the log short: entries only matter for a few poll intervals
      if (Math.random() < 0.05) await conn().delete(cacheInvalidations).where(lt(cacheInvalidations.createdAt, new Date(Date.now() - 3_600_000)));
    },
  };
}

/** Entries re-read behind the high-water mark: ids are assigned before commit, so a slow commit can land "behind". */
const LOOKBACK_IDS = 50;
const POLL_LIMIT = 500;

/**
 * Per-process memory cache kept coherent across processes through an InvalidationBus. Reads poll the bus at
 * most every `intervalMs`; a bus failure never fails a read (the local TTL still applies).
 */
export class SyncedMemoryCache implements Cache {
  readonly implVersion = CACHE_IMPL_VERSION;
  private mem = new MemoryCache();
  private lastId: number | null = null;
  private seen = new Set<number>();
  private lastPoll = 0;
  private inflight: Promise<void> | null = null;
  /** key → when this process learned that it was invalidated (guards a load that raced the invalidation) */
  private invalidatedAt = new Map<string, number>();
  private warned = false;

  constructor(
    private readonly bus: InvalidationBus,
    private readonly intervalMs = 2000,
  ) {}

  private warn(err: unknown) {
    if (this.warned) return;
    this.warned = true;
    console.warn("[cache] cross-process invalidation unavailable, falling back to local TTLs:", err instanceof Error ? err.message : err);
  }

  private markInvalidated(keys: string[]) {
    const now = Date.now();
    for (const k of keys) this.invalidatedAt.set(k, now);
    if (this.invalidatedAt.size > 5000) {
      const cutoff = now - 60_000;
      for (const [k, at] of this.invalidatedAt) if (at < cutoff) this.invalidatedAt.delete(k);
    }
  }

  private async poll(): Promise<void> {
    if (this.lastId === null) {
      this.lastId = await this.bus.head();
      return;
    }
    const rows = await this.bus.since(Math.max(0, this.lastId - LOOKBACK_IDS), POLL_LIMIT);
    if (rows.length >= POLL_LIMIT) this.mem.clear(); // fell far behind: drop everything rather than miss a key
    for (const r of rows) {
      if (this.seen.has(r.id)) continue;
      this.seen.add(r.id);
      if (r.keys.length) {
        await this.mem.del(...r.keys);
        this.markInvalidated(r.keys);
      }
      if (r.id > this.lastId) this.lastId = r.id;
    }
    const floor = this.lastId - LOOKBACK_IDS;
    for (const id of this.seen) if (id <= floor) this.seen.delete(id);
  }

  /** Applies invalidations published by other processes (at most once per interval; concurrent callers share one poll). */
  sync(force = false): Promise<void> {
    if (!force && Date.now() - this.lastPoll < this.intervalMs) return Promise.resolve();
    if (!this.inflight) {
      this.inflight = this.poll()
        .catch((err) => this.warn(err))
        .finally(() => {
          this.lastPoll = Date.now();
          this.inflight = null;
        });
    }
    return this.inflight;
  }

  async get<T>(key: string): Promise<T | null> {
    await this.sync();
    return this.mem.get<T>(key);
  }

  async set<T>(key: string, value: T, ttlSeconds: number, loadedAt?: number): Promise<void> {
    const inv = this.invalidatedAt.get(key);
    if (loadedAt !== undefined && inv !== undefined && inv >= loadedAt) return; // read before the invalidation: stale
    await this.mem.set(key, value, ttlSeconds);
  }

  async del(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    await this.mem.del(...keys);
    this.markInvalidated(keys);
    try {
      await this.bus.publish(keys);
    } catch (err) {
      this.warn(err);
    }
  }
}

class UpstashCache implements Cache {
  readonly implVersion = CACHE_IMPL_VERSION;
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

/** Cross-process sync is on when a database is configured, except in unit tests or with RENTWEB_CACHE_SYNC=off. */
function syncEnabled(): boolean {
  if (process.env.RENTWEB_CACHE_SYNC === "off") return false;
  if (process.env.RENTWEB_CACHE_SYNC === "on") return true;
  return !!process.env.DATABASE_URL && !process.env.VITEST;
}

export function getCache(): Cache {
  const existing = globalThis.__rentwebCache as (Cache & { implVersion?: number }) | undefined;
  if (existing && existing.implVersion === CACHE_IMPL_VERSION) return existing;
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
  if (syncEnabled()) {
    const ms = Number(process.env.RENTWEB_CACHE_SYNC_MS);
    globalThis.__rentwebCache = new SyncedMemoryCache(postgresInvalidationBus(() => getDb()), Number.isFinite(ms) && ms >= 0 ? ms : 2000);
    return globalThis.__rentwebCache;
  }
  globalThis.__rentwebCache = new MemoryCache();
  return globalThis.__rentwebCache;
}

/** Test hook: replace the process cache (pass undefined to rebuild it from the environment). */
export function setCache(cache: Cache | undefined): void {
  globalThis.__rentwebCache = cache;
}

/** Read-through helper. */
export async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  const cache = getCache();
  const hit = await cache.get<T>(key);
  if (hit !== null) return hit;
  const loadedAt = Date.now();
  const value = await loader();
  if (value !== null && value !== undefined) await cache.set(key, value, ttlSeconds, loadedAt);
  return value;
}
