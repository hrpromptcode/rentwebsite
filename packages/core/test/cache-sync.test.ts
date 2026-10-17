import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@rentweb/db/test-utils";
import { cacheInvalidations } from "@rentweb/db";
import { MemoryCache, SyncedMemoryCache, cached, postgresInvalidationBus, setCache, type InvalidationBus } from "../src/cache";

/** In-memory bus shared by several "processes". */
function fakeBus(): InvalidationBus & { log: Array<{ id: number; keys: string[] }> } {
  const log: Array<{ id: number; keys: string[] }> = [];
  return {
    log,
    async head() {
      return log.at(-1)?.id ?? 0;
    },
    async since(afterId, limit) {
      return log.filter((r) => r.id > afterId).slice(0, limit);
    },
    async publish(keys) {
      log.push({ id: log.length + 1, keys });
    },
  };
}

describe("cross-process cache invalidation without Upstash (ADMIN_B2-19)", () => {
  it("a del() in the admin process evicts the key in the storefront process on its next read", async () => {
    const bus = fakeBus();
    const storefront = new SyncedMemoryCache(bus, 0);
    const admin = new SyncedMemoryCache(bus, 0);
    await storefront.get("t:1:config"); // first access initialises the high-water mark
    await storefront.set("t:1:config", { status: "suspended" }, 60);
    expect(await storefront.get("t:1:config")).toEqual({ status: "suspended" });
    await admin.del("t:1:config", "host:shop.localhost");
    expect(await storefront.get("t:1:config")).toBeNull();
  });

  it("respects the poll interval (no bus query on every read) and shares one poll between concurrent reads", async () => {
    const bus = fakeBus();
    let polls = 0;
    const counting: InvalidationBus = { ...bus, since: (a, l) => (polls++, bus.since(a, l)) };
    const c = new SyncedMemoryCache(counting, 60_000);
    await c.sync(true); // head
    await c.sync(true); // first since()
    expect(polls).toBe(1);
    await Promise.all([c.get("a"), c.get("b"), c.get("c")]);
    expect(polls).toBe(1);
  });

  it("does not cache a value that was loaded before an invalidation arrived", async () => {
    const bus = fakeBus();
    const storefront = new SyncedMemoryCache(bus, 0);
    const admin = new SyncedMemoryCache(bus, 0);
    await storefront.get("k");
    const loadedAt = Date.now() - 10;
    await admin.del("k");
    await storefront.sync(true);
    await storefront.set("k", "stale", 60, loadedAt);
    expect(await storefront.get("k")).toBeNull();
  });

  it("a commit that lands behind the high-water mark is still applied once", async () => {
    const bus = fakeBus();
    const c = new SyncedMemoryCache(bus, 0);
    await c.sync(true);
    bus.log.push({ id: 2, keys: ["x"] });
    await c.sync(true);
    await c.set("y", 1, 60);
    bus.log.splice(0, 0, { id: 1, keys: ["y"] }); // id 1 committed late
    await c.sync(true);
    expect(await c.get("y")).toBeNull();
    await c.set("y", 2, 60);
    await c.sync(true); // id 1 already seen: not evicted again
    expect(await c.get("y")).toBe(2);
  });

  it("a broken bus never fails reads or writes", async () => {
    const broken: InvalidationBus = { head: () => Promise.reject(new Error("down")), since: () => Promise.reject(new Error("down")), publish: () => Promise.reject(new Error("down")) };
    const c = new SyncedMemoryCache(broken, 0);
    await c.set("a", 1, 60);
    expect(await c.get("a")).toBe(1);
    await expect(c.del("a")).resolves.toBeUndefined();
  });

  it("cached() goes through the process cache", async () => {
    setCache(new MemoryCache());
    let n = 0;
    expect(await cached("z", 60, async () => ++n)).toBe(1);
    expect(await cached("z", 60, async () => ++n)).toBe(1);
    setCache(undefined);
  });
});

describe("Postgres invalidation bus", () => {
  let db: TestDb;
  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  it("two processes on the same database stay coherent", async () => {
    const storefront = new SyncedMemoryCache(postgresInvalidationBus(db as never), 0);
    const admin = new SyncedMemoryCache(postgresInvalidationBus(db as never), 0);
    await storefront.get("host:a.localhost");
    await storefront.set("host:a.localhost", { id: "t1", status: "active" }, 300);
    await admin.del("host:a.localhost", "t:t1:config");
    expect(await storefront.get("host:a.localhost")).toBeNull();
    const rows = await db.select().from(cacheInvalidations);
    expect(rows.at(-1)?.keys).toEqual(["host:a.localhost", "t:t1:config"]);
  });
});
