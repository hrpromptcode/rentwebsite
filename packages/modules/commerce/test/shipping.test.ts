import { beforeAll, describe, expect, it } from "vitest";
import { quoteMethod, quoteShipping } from "../src/services";
import { setupFixture, type Fixture } from "./helpers";

let f: Fixture;

beforeAll(async () => {
  f = await setupFixture();
});

describe("quoteMethod (pure)", () => {
  const base = { subtotal: 50000, weightGrams: 800 };

  it("flat", () => {
    expect(quoteMethod({ type: "flat", config: { amount: 6000 } }, base)).toEqual({ amount: 6000, codFee: 0 });
  });

  it("weight tiers pick the first tier that fits; heavier than all tiers is unavailable", () => {
    const m = { type: "weight", config: { tiers: [{ maxGrams: 3000, amount: 8000 }, { maxGrams: 1000, amount: 4000 }] } };
    expect(quoteMethod(m, { ...base, weightGrams: 800 })).toEqual({ amount: 4000, codFee: 0 });
    expect(quoteMethod(m, { ...base, weightGrams: 1000 })).toEqual({ amount: 4000, codFee: 0 });
    expect(quoteMethod(m, { ...base, weightGrams: 2500 })).toEqual({ amount: 8000, codFee: 0 });
    expect(quoteMethod(m, { ...base, weightGrams: 3001 })).toBeNull();
  });

  it("free_over waives the fee at the threshold", () => {
    const m = { type: "free_over", config: { amount: 5000, threshold: 99000 } };
    expect(quoteMethod(m, { ...base, subtotal: 98999 })).toEqual({ amount: 5000, codFee: 0 });
    expect(quoteMethod(m, { ...base, subtotal: 99000 })).toEqual({ amount: 0, codFee: 0 });
  });

  it("cod adds its fee on top of the shipping amount", () => {
    expect(quoteMethod({ type: "cod", config: { amount: 6000, fee: 3000 } }, base)).toEqual({ amount: 6000, codFee: 3000 });
  });

  it("pickup is free", () => {
    expect(quoteMethod({ type: "pickup", config: {} }, base)).toEqual({ amount: 0, codFee: 0 });
  });

  it("free-shipping coupon zeroes the shipping amount but not the COD fee", () => {
    expect(quoteMethod({ type: "flat", config: { amount: 6000 } }, { ...base, freeShipping: true })).toEqual({ amount: 0, codFee: 0 });
    expect(quoteMethod({ type: "cod", config: { amount: 6000, fee: 3000 } }, { ...base, freeShipping: true })).toEqual({ amount: 0, codFee: 3000 });
  });
});

describe("quoteShipping (db)", () => {
  it("quotes every active method for the cart and drops unavailable ones", async () => {
    const quotes = await f.run((tx) => quoteShipping(tx, f.tenantId, { subtotal: 120000, weightGrams: 2000 }));
    expect(quotes.map((q) => [q.type, q.amount, q.codFee, q.total])).toEqual([
      ["flat", 6000, 0, 6000],
      ["weight", 8000, 0, 8000],
      ["free_over", 0, 0, 0],
      ["cod", 6000, 3000, 9000],
      ["pickup", 0, 0, 0],
    ]);
    expect(quotes.find((q) => q.type === "cod")!.requiresCod).toBe(true);
    expect(quotes.find((q) => q.type === "pickup")!.isPickup).toBe(true);

    const heavy = await f.run((tx) => quoteShipping(tx, f.tenantId, { subtotal: 50000, weightGrams: 9000 }));
    expect(heavy.map((q) => q.type)).toEqual(["flat", "free_over", "cod", "pickup"]);
    expect(heavy.find((q) => q.type === "free_over")!.amount).toBe(5000);
  });
});
