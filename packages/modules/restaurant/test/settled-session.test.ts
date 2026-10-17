/**
 * last packet (LAST-03): after a table is paid, the paying guests' browser (rw_table cookie) keeps the paid session on
 * reload instead of a fresh session being opened for them; everyone else still gets an open session.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { diningTables } from "@rentweb/db";
import { markPaid, registerPaymentClosedHandler, registerPaymentHandler } from "@rentweb/core/payments";
import { createOrder, onRestaurantOrderPaid, onRestaurantPaymentClosed } from "../src/services/orders";
import { SETTLED_VIEW_MINUTES, callStaff, closeSession, getSettledGuestSession, openOrGetSession, requestBill } from "../src/services/tables";
import { settleSession } from "../src/admin";
import { makeFixture, unwrap, type Fixture } from "./helpers";

let f: Fixture;
let n = 0;

beforeAll(async () => {
  f = await makeFixture();
  registerPaymentHandler("rest_order", onRestaurantOrderPaid);
  registerPaymentClosedHandler("rest_order", onRestaurantPaymentClosed);
});

async function newTable() {
  const [t] = await f.tx((tx) => tx.insert(diningTables).values({ tenantId: f.tenantId, name: `S${++n}`, zone: "QA-SETTLED", seats: 2, qrToken: `qr-settled-${n}` }).returning());
  return t!;
}
const open = (tableId: string) => f.tx((tx) => openOrGetSession(tx, f.tenantId, tableId)).then((r) => r.session);
const round = (sessionId: string) => f.tx((tx) => createOrder(tx, f.tenantId, { type: "dine_in", sessionId, items: [{ menuItemId: f.ids.satay, qty: 1, modifierIds: [] }] })).then(unwrap);
const settled = (tableId: string, token: string | null, now?: Date) => f.tx((tx) => getSettledGuestSession(tx, f.tenantId, tableId, token, now ? { now } : {}));

describe("getSettledGuestSession", () => {
  it("cash settled by staff (closed): the guests' own token keeps the paid session, call staff stays refused", async () => {
    const t = await newTable();
    const s = await open(t.id);
    await round(s.id);
    expect(await settled(t.id, s.token)).toBeNull(); // still open: the normal path serves it
    unwrap(await f.tx((tx) => settleSession(tx, f.tenantId, s.id, { mode: "cash", verifiedBy: "staff" })));

    const kept = await settled(t.id, s.token);
    expect(kept?.id).toBe(s.id);
    expect(kept?.status).toBe("closed");
    expect(await settled(t.id, s.token.toLowerCase())).not.toBeNull(); // tokens are case-insensitive
    const call = await f.tx((tx) => callStaff(tx, f.tenantId, s.id));
    expect(call.ok).toBe(false);

    // other people / other tables / no cookie: not this browser's paid table
    expect(await settled(t.id, null)).toBeNull();
    expect(await settled(t.id, "ZZZZZZ")).toBeNull();
    expect(await settled(t.id, "bad token!")).toBeNull();
    const other = await newTable();
    expect(await settled(other.id, s.token)).toBeNull();

    // too long ago: the next visit opens a fresh session again
    expect(await settled(t.id, s.token, new Date(Date.now() + (SETTLED_VIEW_MINUTES + 1) * 60_000))).toBeNull();
  });

  it("slip/PromptPay paid (status paid, table not yet closed) is kept too", async () => {
    const t = await newTable();
    const s = await open(t.id);
    await round(s.id);
    const bill = unwrap(await f.tx((tx) => requestBill(tx, f.tenantId, s.id, { method: "promptpay_qr", promptpayId: "0829876543" }))).payment!;
    await f.tx((tx) => markPaid(tx, f.tenantId, bill.id, { verifiedBy: "auto" }));
    const kept = await settled(t.id, s.token);
    expect(kept?.status).toBe("paid");
  });

  it("is dropped once newer guests open the table", async () => {
    const t = await newTable();
    const s = await open(t.id);
    await round(s.id);
    unwrap(await f.tx((tx) => settleSession(tx, f.tenantId, s.id, { mode: "cash", verifiedBy: "staff" })));
    const next = await open(t.id); // someone without the cookie scans the QR
    expect(next.id).not.toBe(s.id);
    expect(await settled(t.id, s.token)).toBeNull();
  });

  it("an empty session closed by staff is not a paid state", async () => {
    const t = await newTable();
    const s = await open(t.id);
    unwrap(await f.tx((tx) => closeSession(tx, f.tenantId, s.id)));
    expect(await settled(t.id, s.token)).toBeNull();
  });
});
