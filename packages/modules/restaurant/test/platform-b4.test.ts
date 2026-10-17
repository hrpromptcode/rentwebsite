import { beforeAll, describe, expect, it } from "vitest";
import { customers, reservations, restaurantOrders } from "@rentweb/db";
import { CUSTOMER_BLOCKED_MESSAGE } from "@rentweb/core/customer";
import { createOrder } from "../src/services/orders";
import { createReservation } from "../src/services/reservations";
import { restaurantPaymentNotice, restaurantPaymentOptions } from "../src/services/payment-options";
import { makeFixture, type Fixture } from "./helpers";

let f: Fixture;
const NOW = new Date("2026-10-14T03:00:00Z");

beforeAll(async () => {
  f = await makeFixture();
  await f.tx((tx) => tx.insert(customers).values({ tenantId: f.tenantId, phone: "0899990004", email: "blocked@example.com", name: "Blocked", blockedAt: new Date() }));
});

describe("blocked customers cannot order / reserve (ADMIN_B2-13)", () => {
  it("pickup order with the blocked phone is refused and nothing is written", async () => {
    const r = await f.tx((tx) => createOrder(tx, f.tenantId, { type: "pickup", items: [{ menuItemId: f.ids.satay, qty: 1, modifierIds: [] }], contact: { name: "x", phone: "089-999-0004" }, paymentMethod: "cash" }));
    expect(r).toMatchObject({ ok: false, code: "customer_blocked", error: CUSTOMER_BLOCKED_MESSAGE });
    expect(await f.tx((tx) => tx.select().from(restaurantOrders))).toHaveLength(0);
  });

  it("reservation with the blocked phone or e-mail is refused", async () => {
    const startsAt = new Date("2026-10-14T12:00:00Z");
    expect(await f.tx((tx) => createReservation(tx, f.tenantId, { name: "x", phone: "0899990004", partySize: 2, startsAt, now: NOW }))).toMatchObject({ ok: false, code: "customer_blocked" });
    expect(await f.tx((tx) => createReservation(tx, f.tenantId, { name: "x", phone: "0811111111", email: "BLOCKED@example.com", partySize: 2, startsAt, now: NOW }))).toMatchObject({ ok: false, code: "customer_blocked" });
    expect(await f.tx((tx) => tx.select().from(reservations))).toHaveLength(0);
    expect((await f.tx((tx) => createReservation(tx, f.tenantId, { name: "y", phone: "0812222222", partySize: 2, startsAt, now: NOW }))).ok).toBe(true);
  });
});

describe("restaurant payment options need a receiver (ADMIN_B2-04)", () => {
  const fresh = { payments: { enabled: { promptpay: true, bankTransfer: true } } };
  it("no PromptPay ID / account → no online option and a Thai notice", () => {
    expect(restaurantPaymentOptions(fresh, "pickup")).toEqual([]);
    expect(restaurantPaymentOptions(fresh, "reservation")).toEqual([]);
    expect(restaurantPaymentNotice(fresh, "pickup")).toMatch(/ร้านยังไม่ได้ตั้งค่าช่องทางรับชำระเงิน/);
    expect(restaurantPaymentNotice({ payments: { promptpayId: "0812345678" } }, "pickup")).toBeNull();
    expect(restaurantPaymentOptions({ payments: { enabled: { cash: true } } }, "pickup").map((o) => o.value)).toEqual(["cash"]);
  });
});
