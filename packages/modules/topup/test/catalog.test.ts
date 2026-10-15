import { beforeAll, describe, expect, it } from "vitest";
import { bestTierPrice, getGameBySlug, listGames, priceFor, validatePlayerFields, maskPlayerId } from "../src/services";
import { makeFixture, type Fixture } from "./_fixture";

let f: Fixture;

beforeAll(async () => {
  f = await makeFixture({ stockCodes: 3 });
});

describe("pricing by tier", () => {
  const pkg = { price: 3500, tierPrices: { vip: 3300, agent: 3200 } };
  it("uses the tier override when defined", () => {
    expect(priceFor(pkg, "vip")).toBe(3300);
    expect(priceFor(pkg, "agent")).toBe(3200);
  });
  it("falls back to the list price for member, guest (null) and unknown tiers", () => {
    expect(priceFor(pkg, "member")).toBe(3500);
    expect(priceFor(pkg, null)).toBe(3500);
    expect(priceFor(pkg, undefined)).toBe(3500);
    expect(priceFor(pkg, "platinum")).toBe(3500);
    expect(priceFor({ price: 100, tierPrices: null }, "vip")).toBe(100);
  });
  it("bestTierPrice returns the cheapest tier below list price", () => {
    expect(bestTierPrice(pkg)).toEqual({ tier: "agent", price: 3200 });
    expect(bestTierPrice({ price: 100, tierPrices: { vip: 100 } })).toBeNull();
  });
});

describe("catalog", () => {
  it("lists active games with the cheapest package price", async () => {
    const list = await f.tx((tx) => listGames(tx, f.tenantId));
    expect(list).toHaveLength(1);
    expect(list[0]!.slug).toBe(f.gameSlug);
    expect(list[0]!.minPrice).toBe(3500);
    expect(list[0]!.packageCount).toBe(3);
  });
  it("filters by category and search", async () => {
    expect(await f.tx((tx) => listGames(tx, f.tenantId, { category: "pc" }))).toHaveLength(0);
    expect(await f.tx((tx) => listGames(tx, f.tenantId, { search: "legend" }))).toHaveLength(1);
    expect(await f.tx((tx) => listGames(tx, f.tenantId, { search: "zzz" }))).toHaveLength(0);
  });
  it("returns the game with packages and live stock counts", async () => {
    const d = await f.tx((tx) => getGameBySlug(tx, f.tenantId, f.gameSlug));
    expect(d).not.toBeNull();
    expect(d!.packages).toHaveLength(3);
    const stock = d!.packages.find((p) => p.fulfillment === "stock")!;
    expect(stock.available).toBe(3);
    expect(d!.packages.find((p) => p.fulfillment === "api")!.available).toBeNull();
  });
  it("validates player fields", () => {
    const fields = [
      { key: "uid", label: "UID", type: "text" as const, required: true },
      { key: "server", label: "Server", type: "select" as const, required: true, options: ["Asia", "EU"] },
      { key: "zone", label: "Zone", type: "number" as const },
    ];
    expect(validatePlayerFields(fields, { uid: " 123 ", server: "Asia" })).toEqual({ ok: true, value: { uid: "123", server: "Asia" } });
    expect(validatePlayerFields(fields, { server: "Asia" })).toMatchObject({ ok: false, code: "missing_field", key: "uid" });
    expect(validatePlayerFields(fields, { uid: "1", server: "Mars" })).toMatchObject({ ok: false, code: "invalid_field", key: "server" });
    expect(validatePlayerFields(fields, { uid: "1", server: "EU", zone: "12a" })).toMatchObject({ ok: false, code: "invalid_field", key: "zone" });
  });
  it("masks player ids for the public feed", () => {
    expect(maskPlayerId("123456789")).toBe("1234****");
    expect(maskPlayerId("12")).toBe("****");
    expect(maskPlayerId("")).toBe("****");
  });
});
