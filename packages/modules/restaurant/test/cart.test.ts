import { beforeAll, describe, expect, it } from "vitest";
import { cartLineKey, normalizeCart, parseCart, priceCart, serializeCart } from "../src/services/cart";
import { getActiveMenu, getMenuItem } from "../src/services/menu";
import { isMenuOpen, parseHours, pickupSlots, reservationSlots } from "../src/services/time";
import { makeFixture, unwrap, type Fixture } from "./helpers";

let f: Fixture;
beforeAll(async () => {
  f = await makeFixture();
});

describe("menu", () => {
  it("loads the active menu with categories, items and modifier groups", async () => {
    const menu = await f.tx((tx) => getActiveMenu(tx, f.tenantId));
    expect(menu).not.toBeNull();
    expect(menu!.categories.map((c) => c.name)).toEqual(["ของทานเล่น", "แกง", "เครื่องดื่ม"]);
    const curry = menu!.categories[1]!.items[0]!;
    expect(curry.modifierGroups.map((g) => g.name)).toEqual(["ระดับความเผ็ด", "เพิ่มพิเศษ"]);
    expect(curry.modifierGroups[0]!.required).toBe(true);
    expect(menu!.featured.map((i) => i.name)).toEqual(["หมูสะเต๊ะ", "แกงเขียวหวาน"]);
    // sold-out item is still listed (flagged) so the card can show "หมดชั่วคราว"
    expect(menu!.categories[0]!.items.find((i) => i.id === f.ids.soldOut)?.soldOut).toBe(true);
  });

  it("getMenuItem returns groups for one item", async () => {
    const tea = await f.tx((tx) => getMenuItem(tx, f.tenantId, f.ids.tea));
    expect(tea?.modifierGroups[0]?.modifiers[0]?.name).toBe("หวานปกติ");
  });

  it("menu schedule windows are evaluated in Asia/Bangkok", () => {
    // 2026-10-14T02:30Z = 09:30 Wednesday in Bangkok
    const now = new Date("2026-10-14T02:30:00Z");
    expect(isMenuOpen([], now)).toBe(true);
    expect(isMenuOpen([{ weekdays: [3], start: "06:00", end: "11:00" }], now)).toBe(true);
    expect(isMenuOpen([{ weekdays: [3], start: "11:00", end: "22:00" }], now)).toBe(false);
    expect(isMenuOpen([{ weekdays: [1, 2], start: "06:00", end: "11:00" }], now)).toBe(false);
  });
});

describe("cart cookie helpers", () => {
  it("round-trips through serialize/parse and rejects junk", () => {
    const items = [{ menuItemId: f.ids.curry, qty: 2, modifierIds: [f.ids.spicyHot, f.ids.extraEgg], note: "ไม่ผักชี" }];
    expect(parseCart(serializeCart(items))).toEqual([{ menuItemId: f.ids.curry, qty: 2, modifierIds: [f.ids.spicyHot, f.ids.extraEgg].sort(), note: "ไม่ผักชี" }]);
    expect(parseCart("not json")).toEqual([]);
    expect(parseCart(encodeURIComponent(JSON.stringify([{ menuItemId: "x", qty: 1 }])))).toEqual([]);
  });

  it("merges identical lines", () => {
    const a = { menuItemId: f.ids.satay, qty: 1, modifierIds: [f.ids.extraEgg] };
    const b = { menuItemId: f.ids.satay, qty: 2, modifierIds: [f.ids.extraEgg] };
    const merged = normalizeCart([a, b, { menuItemId: f.ids.satay, qty: 1, modifierIds: [] }]);
    expect(merged).toHaveLength(2);
    expect(merged.find((l) => cartLineKey(l) === cartLineKey(a))?.qty).toBe(3);
  });
});

describe("priceCart", () => {
  it("prices lines with modifier deltas and applies the service charge", async () => {
    const r = await f.tx((tx) =>
      priceCart(
        tx,
        f.tenantId,
        [
          { menuItemId: f.ids.curry, qty: 2, modifierIds: [f.ids.spicyHot, f.ids.extraEgg, f.ids.extraMeat] }, // (220 + 15 + 50) x 2 = 570
          { menuItemId: f.ids.satay, qty: 1, modifierIds: [] }, // 160
        ],
        { serviceChargePercent: 10 },
      ),
    );
    const cart = unwrap(r);
    expect(cart.lines[0]!.unitPrice).toBe(28500);
    expect(cart.lines[0]!.lineTotal).toBe(57000);
    expect(cart.lines[0]!.modifiers.map((m) => m.name)).toEqual(["เผ็ดมาก", "ไข่ดาว", "เพิ่มเนื้อ"]);
    expect(cart.subtotal).toBe(73000);
    expect(cart.serviceCharge).toBe(7300);
    expect(cart.total).toBe(80300);
  });

  it("fails when a required group is missing or max is exceeded", async () => {
    const missing = await f.tx((tx) => priceCart(tx, f.tenantId, [{ menuItemId: f.ids.curry, qty: 1, modifierIds: [] }]));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("modifier_required");
    const tooMany = await f.tx((tx) => priceCart(tx, f.tenantId, [{ menuItemId: f.ids.curry, qty: 1, modifierIds: [f.ids.spicyHot, f.ids.spicyMild] }]));
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.code).toBe("modifier_max");
  });

  it("fails on sold-out items and foreign modifiers", async () => {
    const soldOut = await f.tx((tx) => priceCart(tx, f.tenantId, [{ menuItemId: f.ids.soldOut, qty: 1, modifierIds: [] }]));
    expect(soldOut.ok).toBe(false);
    if (!soldOut.ok) expect(soldOut.code).toBe("sold_out");
    const foreign = await f.tx((tx) => priceCart(tx, f.tenantId, [{ menuItemId: f.ids.satay, qty: 1, modifierIds: [f.ids.sweetNormal] }]));
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.code).toBe("invalid_modifier");
  });
});

describe("time slots", () => {
  const hours = parseHours([{ day: "ทุกวัน", time: "11:00 – 22:00 (ครัวปิด 21:30)" }]);
  it("parses opening hours from the contact settings", () => {
    expect(hours).toEqual({ open: "11:00", close: "22:00" });
    expect(parseHours(undefined)).toEqual({ open: "10:00", close: "20:00" });
  });
  it("pickup slots start 20 minutes ahead, rounded to 15 min", () => {
    const now = new Date("2026-10-14T05:07:00Z"); // 12:07 Bangkok
    const slots = pickupSlots({ hours, now, leadMinutes: 20, stepMinutes: 15 });
    expect(slots[0]!.label).toBe("12:30");
    expect(slots[0]!.day).toBe("วันนี้");
    expect(slots.at(-1)!.label).toBe("21:45");
    expect(new Date(slots[0]!.value).toISOString()).toBe("2026-10-14T05:30:00.000Z");
  });
  it("rolls to tomorrow after closing time", () => {
    const now = new Date("2026-10-14T15:30:00Z"); // 22:30 Bangkok
    const slots = pickupSlots({ hours, now });
    expect(slots[0]!.day).toBe("พรุ่งนี้");
    expect(slots[0]!.label).toBe("11:00");
    expect(slots[0]!.ymd).toBe("2026-10-15");
  });
  it("reservation slots leave room for the 90 minute seating", () => {
    const now = new Date("2026-10-14T05:00:00Z"); // 12:00 Bangkok
    const today = reservationSlots({ hours, ymd: "2026-10-14", now });
    expect(today[0]).toBe("13:00");
    expect(today.at(-1)).toBe("20:30");
    const tomorrow = reservationSlots({ hours, ymd: "2026-10-15", now });
    expect(tomorrow[0]).toBe("11:00");
    expect(reservationSlots({ hours, ymd: "2026-10-01", now })).toEqual([]);
  });
});
