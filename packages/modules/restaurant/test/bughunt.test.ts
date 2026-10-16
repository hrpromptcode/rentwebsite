/**
 * Regression tests for the restaurant bug-hunt packet (tooling/qa/bughunt/fixes/restaurant.md).
 * Each `describe` names the finding ids it pins.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, diningTables, eq, eventsOutbox, menuItemModifierGroups, modifierGroups, modifiers, payments, reservations, restaurantOrders, tableSessions } from "@rentweb/db";
import { attachSlip, createPayment, expirePayment, getPayment, markPaid, paymentRefundRequired, registerPaymentClosedHandler, registerPaymentHandler } from "@rentweb/core/payments";
import { createOrder, getOrderByNumber, onRestaurantOrderPaid, onRestaurantPaymentClosed } from "../src/services/orders";
import { getSessionByToken, getTableByQr, openOrGetSession, requestBill, sessionSummary } from "../src/services/tables";
import { cancelReservation, checkAvailability, createReservation, getReservationByNumber, onReservationPaid, onReservationPaymentClosed } from "../src/services/reservations";
import { priceCart } from "../src/services/cart";
import { approveOrderPayment, cancelOrder, listOpenSessions, saveModifier, setReservationStatus, settleSession } from "../src/admin";
import { makeFixture, unwrap, type Fixture } from "./helpers";

const PP = "0829876543";
let f: Fixture;
let n = 0;

beforeAll(async () => {
  f = await makeFixture();
  registerPaymentHandler("rest_order", onRestaurantOrderPaid);
  registerPaymentHandler("reservation", onReservationPaid);
  registerPaymentClosedHandler("rest_order", onRestaurantPaymentClosed);
  registerPaymentClosedHandler("reservation", onReservationPaymentClosed);
});

/** a fresh table (own zone, so reservation capacity of the fixture zones is untouched) */
async function newTable(seats = 4, zone = "QA") {
  const name = `T${++n}`;
  const [t] = await f.tx((tx) => tx.insert(diningTables).values({ tenantId: f.tenantId, name, zone, seats, qrToken: `qr-test-${n}` }).returning());
  return t!;
}
const satay = () => [{ menuItemId: f.ids.satay, qty: 1, modifierIds: [] as string[] }]; // ฿160
const tea = () => [{ menuItemId: f.ids.tea, qty: 1, modifierIds: [f.ids.sweetNormal] }]; // ฿70
const round = (sessionId: string, items = satay()) => f.tx((tx) => createOrder(tx, f.tenantId, { type: "dine_in", sessionId, items })).then(unwrap);
const bill = (sessionId: string) => f.tx((tx) => requestBill(tx, f.tenantId, sessionId, { method: "promptpay_qr", promptpayId: PP }));
const pay = (id: string) => f.tx((tx) => getPayment(tx, f.tenantId, id));
const summary = (sessionId: string) => f.tx((tx) => sessionSummary(tx, f.tenantId, sessionId)).then((s) => s!);

describe("COR-07 / SBR-005 – a table bill pays exactly the orders it was issued for", () => {
  it("a round ordered after the bill voids the stale QR; the new QR charges the new due amount", async () => {
    const t = await newTable();
    const { session } = await f.tx((tx) => openOrGetSession(tx, f.tenantId, t.id));
    const r1 = await round(session.id);
    const first = unwrap(await bill(session.id)).payment!;
    expect(first.amount).toBe(16000);

    const r2 = await round(session.id); // ordered after the bill
    expect((await pay(first.id))!.status).toBe("cancelled");
    // the stale QR can neither take a slip nor be approved any more
    await expect(f.tx((tx) => attachSlip(tx, f.tenantId, first.id, { url: "/uploads/x.png" }, { autoApprove: true }))).rejects.toMatchObject({ code: "payment_state" });
    await expect(f.tx((tx) => markPaid(tx, f.tenantId, first.id, { verifiedBy: "admin" }))).rejects.toMatchObject({ code: "payment_state" });

    let s = await summary(session.id);
    expect(s.session.status).toBe("open");
    expect(s.dueTotal).toBe(32000);
    expect(s.session.paymentId).toBeNull();

    const second = unwrap(await bill(session.id)).payment!;
    expect(second.amount).toBe(32000);
    expect((second.providerPayload as { orderIds: string[] }).orderIds.sort()).toEqual([r1.order.id, r2.order.id].sort());
    await f.tx((tx) => markPaid(tx, f.tenantId, second.id, { verifiedBy: "auto" }));
    s = await summary(session.id);
    expect(s.session.status).toBe("paid");
    expect(s.dueTotal).toBe(0);
    expect(s.orders.every((o) => o.paymentStatus === "paid")).toBe(true);
  });

  it("a slip already uploaded for the old bill only pays the old rounds; the later round stays due", async () => {
    const t = await newTable();
    const { session } = await f.tx((tx) => openOrGetSession(tx, f.tenantId, t.id));
    const r1 = await round(session.id, tea());
    const qr = unwrap(await bill(session.id)).payment!;
    await f.tx((tx) => attachSlip(tx, f.tenantId, qr.id, { url: "/uploads/slip.png" })); // waiting for staff
    const r2 = await round(session.id); // ฿160 after the bill
    expect((await pay(qr.id))!.status).toBe("pending_verification"); // the guests paid it: kept

    const again = await bill(session.id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe("verifying");

    const approved = await f.tx((tx) => markPaid(tx, f.tenantId, qr.id, { verifiedBy: "admin" }));
    expect(paymentRefundRequired(approved)).toBeNull();
    let s = await summary(session.id);
    expect(s.orders.find((o) => o.id === r1.order.id)!.paymentStatus).toBe("paid");
    expect(s.orders.find((o) => o.id === r2.order.id)!.paymentStatus).toBe("pay_at_counter");
    expect(s.session.status).toBe("open");
    expect(s.dueTotal).toBe(16000);
    expect(s.paidTotal).toBe(7000);

    const rest = unwrap(await bill(session.id)).payment!;
    expect(rest.amount).toBe(16000);
    await f.tx((tx) => markPaid(tx, f.tenantId, rest.id, { verifiedBy: "auto" }));
    s = await summary(session.id);
    expect(s.session.status).toBe("paid");
    expect(s.dueTotal).toBe(0);
    const partial = await f.tx((tx) => tx.select().from(eventsOutbox).where(eq(eventsOutbox.type, "table.partially_paid")));
    expect(partial.some((e) => (e.payload as { sessionId?: string }).sessionId === session.id)).toBe(true);
  });

  it("legacy bill payments (no snapshot) only cover the orders placed before the payment", async () => {
    const t = await newTable();
    const { session } = await f.tx((tx) => openOrGetSession(tx, f.tenantId, t.id));
    await round(session.id);
    const legacy = await f.tx((tx) =>
      createPayment(tx, f.tenantId, { refType: "rest_order", refId: session.id, amount: 16000, provider: "promptpay", method: "promptpay_qr", promptpayId: PP, metadata: { kind: "session", sessionId: session.id, tableId: t.id } }),
    );
    await new Promise((r) => setTimeout(r, 5));
    const late = await f.tx((tx) => createOrder(tx, f.tenantId, { type: "dine_in", sessionId: session.id, items: satay() })).then(unwrap);
    await f.tx((tx) => markPaid(tx, f.tenantId, legacy.id, { verifiedBy: "admin" }));
    const s = await summary(session.id);
    expect(s.orders.find((o) => o.id === late.order.id)!.paymentStatus).toBe("pay_at_counter");
    expect(s.dueTotal).toBe(16000);
    expect(s.session.status).toBe("open");
  });

  it("money for an already-paid bill is flagged for a refund instead of being swallowed", async () => {
    const t = await newTable();
    const { session } = await f.tx((tx) => openOrGetSession(tx, f.tenantId, t.id));
    await round(session.id);
    const qr = unwrap(await bill(session.id)).payment!;
    // staff took cash for the whole table meanwhile (cash path voids the QR)
    unwrap(await f.tx((tx) => settleSession(tx, f.tenantId, session.id, { mode: "cash", verifiedBy: "staff" })));
    expect((await pay(qr.id))!.status).toBe("cancelled");
    // a provider-confirmed duplicate payment for the same bill
    const dup = await f.tx((tx) =>
      createPayment(tx, f.tenantId, { refType: "rest_order", refId: session.id, amount: 16000, provider: "promptpay", method: "promptpay_qr", promptpayId: PP, metadata: { kind: "session", sessionId: session.id, tableId: t.id, orderIds: (qr.providerPayload as { orderIds: string[] }).orderIds } }),
    );
    const paid = await f.tx((tx) => markPaid(tx, f.tenantId, dup.id, { verifiedBy: "provider" }));
    expect(paymentRefundRequired(paid)).toMatch(/ชำระซ้ำ/);
  });

  it("settleSession(approve) pays the guests' bill and leaves later rounds due; cash closes the rest", async () => {
    const t = await newTable();
    const { session } = await f.tx((tx) => openOrGetSession(tx, f.tenantId, t.id));
    await round(session.id, tea());
    const qr = unwrap(await bill(session.id)).payment!;
    await f.tx((tx) => attachSlip(tx, f.tenantId, qr.id, { url: "/uploads/slip2.png" }));
    await round(session.id);
    const boardBefore = (await f.tx((tx) => listOpenSessions(tx, f.tenantId))).find((s) => s.id === session.id)!;
    expect(boardBefore.dueTotal).toBe(23000);

    const approve = unwrap(await f.tx((tx) => settleSession(tx, f.tenantId, session.id, { mode: "approve", verifiedBy: "staff" })));
    expect(approve).toMatchObject({ amount: 7000, remaining: 16000, closed: false });
    const cash = unwrap(await f.tx((tx) => settleSession(tx, f.tenantId, session.id, { mode: "cash", verifiedBy: "staff" })));
    expect(cash).toMatchObject({ amount: 16000, remaining: 0, closed: true });
    const s = await summary(session.id);
    expect(s.session.status).toBe("closed");
    expect(s.orders.every((o) => o.paymentStatus === "paid")).toBe(true);
  });

  it("cancelling a round voids the table QR (amount changed); paying an order in cash voids its QR for good", async () => {
    const t = await newTable();
    const { session } = await f.tx((tx) => openOrGetSession(tx, f.tenantId, t.id));
    await round(session.id);
    const r2 = await round(session.id, tea());
    const qr = unwrap(await bill(session.id)).payment!;
    expect(qr.amount).toBe(23000);
    unwrap(await f.tx((tx) => cancelOrder(tx, f.tenantId, r2.order.id, "ลูกค้าเปลี่ยนใจ")));
    expect((await pay(qr.id))!.status).toBe("cancelled");
    expect(unwrap(await bill(session.id)).payment!.amount).toBe(16000);

    const pickup = unwrap(
      await f.tx((tx) => createOrder(tx, f.tenantId, { type: "pickup", items: satay(), contact: { name: "คุณเค", phone: "0812223333" }, paymentMethod: "promptpay_qr", promptpayId: PP })),
    );
    unwrap(await f.tx((tx) => approveOrderPayment(tx, f.tenantId, pickup.order.id, { verifiedBy: "staff", cash: true })));
    expect((await pay(pickup.payment!.id))!.status).toBe("cancelled");
    await expect(f.tx((tx) => markPaid(tx, f.tenantId, pickup.payment!.id, { verifiedBy: "admin" }))).rejects.toMatchObject({ code: "payment_state" });
    const [row] = await f.tx((tx) => tx.select().from(restaurantOrders).where(eq(restaurantOrders.id, pickup.order.id)));
    expect(row!.paymentStatus).toBe("paid");
  });
});

describe("COR-26 – one open session per table", () => {
  it("parallel scans join the same session and the database rejects a second open session", async () => {
    const t = await newTable();
    const res = await Promise.all(Array.from({ length: 8 }, () => f.tx((tx) => openOrGetSession(tx, f.tenantId, t.id))));
    expect(new Set(res.map((r) => r.session.id)).size).toBe(1);
    expect(res.filter((r) => r.created)).toHaveLength(1);
    await expect(f.tx((tx) => tx.insert(tableSessions).values({ tenantId: f.tenantId, tableId: t.id, token: "DUPE01", status: "open" }))).rejects.toThrow();
    const open = await f.tx((tx) => tx.select().from(tableSessions).where(and(eq(tableSessions.tableId, t.id), eq(tableSessions.status, "open"))));
    expect(open).toHaveLength(1);
  });
});

describe("SBR-006 – stale table sessions are not reused by the next guests", () => {
  it("an idle session with money due is retired as expired (kept for staff), one without orders is closed", async () => {
    const t = await newTable();
    const { session: old } = await f.tx((tx) => openOrGetSession(tx, f.tenantId, t.id));
    await round(old.id);
    const qr = unwrap(await bill(old.id)).payment!;

    const soon = await f.tx((tx) => openOrGetSession(tx, f.tenantId, t.id, { now: new Date(Date.now() + 60 * 60_000) }));
    expect(soon).toMatchObject({ created: false, session: { id: old.id } });

    const nextDay = await f.tx((tx) => openOrGetSession(tx, f.tenantId, t.id, { now: new Date(Date.now() + 20 * 3_600_000) }));
    expect(nextDay.created).toBe(true);
    expect(nextDay.session.id).not.toBe(old.id);
    const s = await summary(old.id);
    expect(s.session.status).toBe("expired");
    expect(s.dueTotal).toBe(16000);
    expect((await pay(qr.id))!.status).toBe("cancelled");
    // staff still see (and can settle) the unpaid one
    const board = await f.tx((tx) => listOpenSessions(tx, f.tenantId));
    expect(board.find((b) => b.id === old.id)).toMatchObject({ status: "expired", dueTotal: 16000 });
    unwrap(await f.tx((tx) => settleSession(tx, f.tenantId, old.id, { mode: "cash", verifiedBy: "staff" })));
    expect((await summary(old.id)).session.status).toBe("closed");
    // guests can not order into the retired session
    const late = await f.tx((tx) => createOrder(tx, f.tenantId, { type: "dine_in", sessionId: old.id, items: satay() }));
    expect(late.ok).toBe(false);

    // empty session past the idle limit → simply closed
    const empty = await f.tx((tx) => openOrGetSession(tx, f.tenantId, t.id, { now: new Date(Date.now() + 40 * 3_600_000) }));
    expect(empty.created).toBe(true);
    expect((await summary(nextDay.session.id)).session.status).toBe("closed");
  });
});

describe("payments-api 3.2 – closed handlers for rest_order", () => {
  it("an expired pickup QR cancels the untouched order; an expired table QR reopens the bill", async () => {
    const pickup = unwrap(
      await f.tx((tx) => createOrder(tx, f.tenantId, { type: "pickup", items: satay(), contact: { name: "คุณแอล", phone: "0814445555" }, paymentMethod: "promptpay_qr", promptpayId: PP })),
    );
    const later = new Date(Date.now() + 2 * 3_600_000);
    expect(await f.tx((tx) => expirePayment(tx, f.tenantId, pickup.payment!.id, { now: later }))).not.toBeNull();
    const [row] = await f.tx((tx) => tx.select().from(restaurantOrders).where(eq(restaurantOrders.id, pickup.order.id)));
    expect(row!.status).toBe("cancelled");

    const t = await newTable();
    const { session } = await f.tx((tx) => openOrGetSession(tx, f.tenantId, t.id));
    await round(session.id);
    const qr = unwrap(await bill(session.id)).payment!;
    await f.tx((tx) => expirePayment(tx, f.tenantId, qr.id, { now: later }));
    const s = await summary(session.id);
    expect(s.session.status).toBe("open");
    expect(s.session.paymentId).toBeNull();
    expect(s.dueTotal).toBe(16000);
  });
});

describe("COR-25 – discount modifiers never make a line negative", () => {
  it("pricing clamps at ฿0 and the admin refuses a discount larger than a dish that uses the group", async () => {
    const { groupId } = await f.tx(async (tx) => {
      const [g] = await tx.insert(modifierGroups).values({ tenantId: f.tenantId, name: "ส่วนลด", minSelect: 0, maxSelect: 1 }).returning();
      await tx.insert(modifiers).values({ tenantId: f.tenantId, groupId: g!.id, name: "ไม่เอาชา", priceDelta: -10000 });
      await tx.insert(menuItemModifierGroups).values({ tenantId: f.tenantId, itemId: f.ids.tea, groupId: g!.id, sort: 5 });
      return { groupId: g!.id };
    });
    const [neg] = await f.tx((tx) => tx.select().from(modifiers).where(eq(modifiers.groupId, groupId)));
    const priced = unwrap(await f.tx((tx) => priceCart(tx, f.tenantId, [{ menuItemId: f.ids.tea, qty: 2, modifierIds: [f.ids.sweetNormal, neg!.id] }])));
    expect(priced.lines[0]!.unitPrice).toBe(0);
    expect(priced.total).toBe(0);

    const tooMuch = await f.tx((tx) => saveModifier(tx, f.tenantId, { groupId, name: "ส่วนลดใหญ่", priceDelta: -8000, available: true }));
    expect(tooMuch.ok).toBe(false);
    if (!tooMuch.ok) expect(tooMuch.code).toBe("negative_total");
    // fixing the existing option to a sane discount is accepted
    expect((await f.tx((tx) => saveModifier(tx, f.tenantId, { id: neg!.id, groupId, name: "ไม่เอาน้ำแข็ง", priceDelta: -1000, available: true }))).ok).toBe(true);
  });
});

describe("COR-22 – malformed ids never reach Postgres", () => {
  it("returns null for garbage tokens / numbers", async () => {
    expect(await f.tx((tx) => getSessionByToken(tx, f.tenantId, "\u0000\u0000"))).toBeNull();
    expect(await f.tx((tx) => getTableByQr(tx, f.tenantId, "\u0000"))).toBeNull();
    expect(await f.tx((tx) => getOrderByNumber(tx, f.tenantId, "'\">"))).toBeNull();
    expect(await f.tx((tx) => getReservationByNumber(tx, f.tenantId, "\u0000"))).toBeNull();
  });
});

describe("reservations: COR-10 / SBR-013 / SBR-014 / SBR-015 / COR-34", () => {
  const NOW = new Date("2026-10-14T03:00:00Z"); // 10:00 Bangkok
  const at = (iso: string) => new Date(iso);
  const book = (input: { zone?: string | null; partySize?: number; startsAt: Date; deposit?: number; maxAdvanceDays?: number | null }) =>
    f.tx((tx) =>
      createReservation(tx, f.tenantId, {
        name: "คุณจอง",
        phone: "0811112222",
        partySize: input.partySize ?? 2,
        startsAt: input.startsAt,
        zone: input.zone ?? null,
        depositAmount: input.deposit ?? 0,
        promptpayId: PP,
        maxAdvanceDays: input.maxAdvanceDays,
        now: NOW,
      }),
    );

  it("COR-10: parallel bookings of a one-table zone accept exactly one", async () => {
    await newTable(4, "ระเบียง");
    const res = await Promise.all([1, 2, 3].map(() => book({ zone: "ระเบียง", startsAt: at("2026-11-01T12:00:00Z") })));
    expect(res.filter((r) => r.ok)).toHaveLength(1);
    expect(res.filter((r) => !r.ok && r.code === "full")).toHaveLength(2);
  });

  it("SBR-013: reservations without a zone count against every zone", async () => {
    const slot = at("2026-11-02T12:00:00Z");
    const tables = (await f.tx((tx) => tx.select().from(diningTables).where(eq(diningTables.active, true)))).length;
    // fill all but one table with zone-less (phone) bookings
    for (let i = 0; i < tables - 1; i++) unwrap(await book({ startsAt: slot }));
    const garden = await f.tx((tx) => checkAvailability(tx, f.tenantId, { startsAt: slot, zone: "สวน" }));
    expect(garden.remaining).toBe(1);
    unwrap(await book({ zone: "สวน", startsAt: slot })); // the last table
    const full = await book({ zone: "สวน", startsAt: slot });
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.code).toBe("full");
    expect((await book({ startsAt: slot })).ok).toBe(false);
  });

  it("SBR-014: party size decides how many tables a booking takes", async () => {
    const slot = at("2026-11-03T12:00:00Z");
    const huge = await book({ zone: "สวน", partySize: 40, startsAt: slot }); // garden = 2 x 6 seats
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.code).toBe("too_large");
    expect((await f.tx((tx) => checkAvailability(tx, f.tenantId, { startsAt: slot, zone: "สวน", partySize: 13 }))).available).toBe(false);
    unwrap(await book({ zone: "สวน", partySize: 12, startsAt: slot })); // both garden tables pushed together
    const after = await f.tx((tx) => checkAvailability(tx, f.tenantId, { startsAt: slot, zone: "สวน" }));
    expect(after).toMatchObject({ available: false, booked: 2, remaining: 0 });
  });

  it("SBR-015: the server enforces the booking window", async () => {
    const tooFar = await book({ startsAt: at("2027-01-20T12:00:00Z") }); // > 60 days after 2026-10-14
    expect(tooFar.ok).toBe(false);
    if (!tooFar.ok) expect(tooFar.code).toBe("too_far");
    expect((await book({ startsAt: at("2026-12-13T12:00:00Z") })).ok).toBe(true); // day 60
    expect((await book({ startsAt: at("2027-01-20T12:00:00Z"), maxAdvanceDays: null })).ok).toBe(true); // staff: no limit
  });

  it("COR-34: cancelling (or a no-show) voids the deposit QR; an expired deposit cancels the pending booking", async () => {
    const created = unwrap(await book({ zone: "ในบ้าน", startsAt: at("2026-11-05T12:00:00Z"), deposit: 50000 }));
    expect(created.reservation.status).toBe("pending");
    unwrap(await f.tx((tx) => cancelReservation(tx, f.tenantId, created.reservation.id, "เปลี่ยนแผน")));
    expect((await pay(created.payment!.id))!.status).toBe("cancelled");
    await expect(f.tx((tx) => attachSlip(tx, f.tenantId, created.payment!.id, { url: "/uploads/late.png" }, { autoApprove: true }))).rejects.toMatchObject({ code: "payment_state" });
    await expect(f.tx((tx) => markPaid(tx, f.tenantId, created.payment!.id, { verifiedBy: "admin" }))).rejects.toMatchObject({ code: "payment_state" });

    const noShow = unwrap(await book({ zone: "ในบ้าน", startsAt: at("2026-11-06T12:00:00Z"), deposit: 50000 }));
    unwrap(await f.tx((tx) => setReservationStatus(tx, f.tenantId, noShow.reservation.id, "no_show")));
    expect((await pay(noShow.payment!.id))!.status).toBe("cancelled");

    const expiring = unwrap(await book({ zone: "ในบ้าน", startsAt: at("2026-11-07T12:00:00Z"), deposit: 50000 }));
    await f.tx((tx) => expirePayment(tx, f.tenantId, expiring.payment!.id, { now: new Date(Date.now() + 3_600_000) }));
    const [r] = await f.tx((tx) => tx.select().from(reservations).where(eq(reservations.id, expiring.reservation.id)));
    expect(r!.status).toBe("cancelled");
    // money that still arrives for it (admin approves the expired QR) is flagged for a refund, the booking stays cancelled
    const late = await f.tx((tx) => markPaid(tx, f.tenantId, expiring.payment!.id, { verifiedBy: "admin" }));
    expect(paymentRefundRequired(late)).toBeTruthy();
    const [still] = await f.tx((tx) => tx.select().from(reservations).where(eq(reservations.id, expiring.reservation.id)));
    expect(still!.status).toBe("cancelled");
    const [p] = await f.tx((tx) => tx.select().from(payments).where(eq(payments.id, expiring.payment!.id)));
    expect(p!.status).toBe("paid");
  });
});
