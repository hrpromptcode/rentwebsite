import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, eventSessions, eventPromoCodes, eventsOutbox, payments, ticketOrders, ticketTypes } from "@rentweb/db";
import { expireStalePayments, markFailed, markPaid, paymentRefundRequired } from "@rentweb/core/payments";
import "../src/register";
import { cancelUnpaidOrder, createTicketOrder, getOrderForCustomer, listCustomerOrders, listOrders, orderStats, quoteTicketOrder, releaseLapsedHolds, renewOrderPayment, ticketOrderClosedReason, ticketOrderPaymentAccess } from "../src/services/orders";
import { listTicketsForOrder, verifyTicketPayload, signTicketPayload } from "../src/services/tickets";
import { getEventDetail, getPublicEvent, listPublicEvents } from "../src/services/catalog";
import { CONFIG, NOW, SETTINGS, seedEvents, type Seeded } from "./helpers";

let s: Seeded;
const opts = { config: CONFIG, settings: SETTINGS, now: NOW };

beforeAll(async () => {
  s = await seedEvents();
});

const orderRow = (id: string) => s.tx(async (tx) => (await tx.select().from(ticketOrders).where(eq(ticketOrders.id, id)))[0]!);
const paymentRow = (id: string) => s.tx(async (tx) => (await tx.select().from(payments).where(eq(payments.id, id)))[0]!);
const typeRow = (id: string) => s.tx(async (tx) => (await tx.select().from(ticketTypes).where(eq(ticketTypes.id, id)))[0]!);
const sessionRow = (id: string) => s.tx(async (tx) => (await tx.select().from(eventSessions).where(eq(eventSessions.id, id)))[0]!);
const events = (type: string) => s.tx((tx) => tx.select().from(eventsOutbox).where(and(eq(eventsOutbox.tenantId, s.tenantId), eq(eventsOutbox.type, type))));
const line = (ticketTypeId: string, qty: number) => ({ ticketTypeId, qty });

describe("quoteTicketOrder", () => {
  it("prices lines, applies a promo code and reports the session", async () => {
    const q = await s.tx((tx) => quoteTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.regular, 2)] }, opts));
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.value.subtotal).toBe(240000);
    expect(q.value.total).toBe(240000);
    expect(q.value.quantity).toBe(2);
    expect(q.value.session?.id).toBe(s.sessions.s1);
    const p = await s.tx((tx) => quoteTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.regular, 2)], promoCode: "jazz10" }, opts));
    expect(p.ok && p.value.discount).toBe(24000);
    expect(p.ok && p.value.total).toBe(216000);
    const bad = await s.tx((tx) => quoteTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.regular, 2)], promoCode: "NOPE" }, opts));
    expect(!bad.ok && bad.error).toBe("promo_invalid");
  });

  it("refuses drafts, missing sessions, foreign types and session-bound types on the wrong session", async () => {
    const draft = await s.tx((tx) => quoteTicketOrder(tx, s.tenantId, { eventId: s.draftEvent, lines: [line(s.types.regular, 1)] }, opts));
    expect(!draft.ok && draft.error).toBe("event_not_open");
    const noSession = await s.tx((tx) => quoteTicketOrder(tx, s.tenantId, { eventId: s.event, lines: [line(s.types.regular, 1)] }, opts));
    expect(!noSession.ok && noSession.error).toBe("session_required");
    const wrongSession = await s.tx((tx) => quoteTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.draft, lines: [line(s.types.regular, 1)] }, opts));
    expect(!wrongSession.ok && wrongSession.error).toBe("session_not_found");
    const s2only = await s.tx((tx) => quoteTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.s2only, 1)] }, opts));
    expect(!s2only.ok && s2only.error).toBe("ticket_type_not_found");
    const empty = await s.tx((tx) => quoteTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.regular, 0)] }, opts));
    expect(!empty.ok && empty.error).toBe("no_lines");
  });

  it("enforces the sales window server-side (and lets the box office bypass it)", async () => {
    const closed = await s.tx((tx) => quoteTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.closed, 1)] }, opts));
    expect(!closed.ok && closed.error).toBe("sales_closed");
    const future = await s.tx((tx) => quoteTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.future, 1)] }, opts));
    expect(!future.ok && future.error).toBe("sales_not_started");
    const bypass = await s.tx((tx) => quoteTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.future, 1)], bypassSalesRules: true }, opts));
    expect(bypass.ok).toBe(true);
    // after the session ended nothing sells
    const late = await s.tx((tx) => quoteTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.regular, 1)] }, { ...opts, now: new Date("2026-11-07T16:00:00.000Z") }));
    expect(!late.ok && late.error).toBe("session_closed");
  });

  it("enforces min / max per type and the per-order cap", async () => {
    const min = await s.tx((tx) => quoteTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.vip, 1)] }, opts));
    expect(!min.ok && min.error).toBe("min_qty");
    const max = await s.tx((tx) => quoteTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.vip, 5)] }, opts));
    expect(!max.ok && max.error).toBe("max_qty");
    const cap = await s.tx((tx) => quoteTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.regular, 6), line(s.types.free, 5)] }, opts));
    expect(!cap.ok && cap.error).toBe("max_per_order");
    const over = await s.tx((tx) => quoteTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.early, 2), line(s.types.early, 1)] }, opts));
    expect(!over.ok && over.error).toBe("max_qty"); // merged to 3 > max 2
  });
});

describe("createTicketOrder", () => {
  let firstOrder: string;
  let firstPayment: string;
  let firstKey: string;
  let firstCustomer: string;

  it("numbers orders TK-1001…, reserves tickets, opens a payment with expiry and stores an access key", async () => {
    const r = await s.tx((tx) => createTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.regular, 2)], promoCode: "JAZZ10", customer: s.buyer(1), holders: [{ ticketTypeId: s.types.regular, name: "เพื่อน หนึ่ง" }], paymentMethod: "promptpay_qr" }, opts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { order, payment, accessKey, tickets } = r.value;
    firstOrder = order.id;
    firstPayment = payment!.id;
    firstKey = accessKey;
    firstCustomer = order.customerId!;
    expect(order.number).toBe("TK-1001");
    expect(order.status).toBe("pending");
    expect(order.quantity).toBe(2);
    expect(order.subtotal).toBe(240000);
    expect(order.discount).toBe(24000);
    expect(order.total).toBe(216000);
    expect(payment).toMatchObject({ refType: "ticket_order", refId: order.id, amount: 216000, method: "promptpay_qr", status: "pending" });
    expect(payment!.expiresAt).toBeInstanceOf(Date);
    expect(order.holdUntil!.getTime()).toBeGreaterThan(NOW.getTime());
    expect(order.paymentId).toBe(payment!.id);
    expect(accessKey).toHaveLength(22);
    expect(tickets).toEqual([]);
    expect(order.customerId).toBeTruthy();
    expect((await typeRow(s.types.regular))).toMatchObject({ reserved: 2, sold: 0 });
    expect((await sessionRow(s.sessions.s1))).toMatchObject({ reserved: 2, sold: 0 });
    expect((await events("ticket_order.created")).length).toBe(1);
    const detail = await s.tx((tx) => getOrderForCustomer(tx, s.tenantId, order.id, { key: accessKey }));
    expect(detail?.event.slug).toBe("jazz-night");
    expect(detail?.payment?.id).toBe(payment!.id);
    expect(detail?.via).toBe("access_key");
    expect(await s.tx((tx) => getOrderForCustomer(tx, s.tenantId, order.id, { key: "wrong" }))).toBeNull();
    expect((await s.tx((tx) => getOrderForCustomer(tx, s.tenantId, order.id, { customerId: order.customerId })))?.via).toBe("customer");
    const access = await s.tx((tx) => ticketOrderPaymentAccess(tx, payment!, { accessKey }));
    expect(access).toBe("access_key");
    expect(await s.tx((tx) => ticketOrderPaymentAccess(tx, payment!, { customerId: order.customerId }))).toBe("customer");
    expect(await s.tx((tx) => ticketOrderPaymentAccess(tx, payment!, { accessKey: "nope" }))).toBe(false);
  });

  it("two parallel orders for the last 2 Early Bird tickets → exactly one wins", async () => {
    const mk = (n: number) => s.tx((tx) => createTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.early, 2)], customer: s.buyer(n), paymentMethod: "slip" }, opts));
    const [a, b] = await Promise.all([mk(2), mk(3)]);
    const wins = [a, b].filter((r) => r.ok);
    const loses = [a, b].filter((r) => !r.ok);
    expect(wins.length).toBe(1);
    expect(loses.length).toBe(1);
    expect(!loses[0]!.ok && loses[0]!.error).toBe("sold_out");
    expect((await typeRow(s.types.early))).toMatchObject({ reserved: 2, sold: 0, quantity: 2 });
    const one = await s.tx((tx) => createTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.early, 1)], customer: s.buyer(4), paymentMethod: "slip" }, opts));
    expect(!one.ok && one.error).toBe("sold_out");
    const detail = await s.tx((tx) => getPublicEvent(tx, s.tenantId, "jazz-night", { now: NOW }));
    const early = detail!.ticketTypes.find((t) => t.id === s.types.early)!;
    expect(early.remaining).toBe(0);
    expect(early.saleState).toBe("sold_out");
    expect(detail!.ticketTypes.some((t) => t.id === s.types.hidden)).toBe(false);
    expect(detail!.fromPrice).toBe(0); // free type is on sale
  });

  it("paying issues one ticket per attendee with unique signed codes (idempotent)", async () => {
    await s.tx((tx) => markPaid(tx, s.tenantId, firstPayment, { verifiedBy: "test" }));
    const order = await orderRow(firstOrder);
    expect(order.status).toBe("paid");
    expect(order.paidAmount).toBe(216000);
    expect(order.paidAt).toBeInstanceOf(Date);
    expect(order.holdUntil).toBeNull();
    const tickets = await s.tx((tx) => listTicketsForOrder(tx, s.tenantId, firstOrder));
    expect(tickets.length).toBe(2);
    expect(new Set(tickets.map((t) => t.code)).size).toBe(2);
    for (const t of tickets) {
      expect(t.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
      expect(t.status).toBe("valid");
      const payload = signTicketPayload({ tenantId: s.tenantId, ticketId: t.id, code: t.code });
      expect(verifyTicketPayload(payload)).toEqual({ tenantId: s.tenantId, ticketId: t.id, code: t.code });
      expect(verifyTicketPayload(payload.slice(0, -2) + "xx")).toBeNull();
    }
    expect(tickets.map((t) => t.holderName).sort()).toEqual(["ผู้ซื้อ 1", "เพื่อน หนึ่ง"].sort());
    // proportional discount: 1,200 − 120 each
    expect(tickets.map((t) => t.price)).toEqual([108000, 108000]);
    expect((await typeRow(s.types.regular))).toMatchObject({ reserved: 0, sold: 2 });
    expect((await sessionRow(s.sessions.s1))).toMatchObject({ reserved: 0, sold: 2 });
    const [promo] = await s.tx((tx) => tx.select().from(eventPromoCodes).where(eq(eventPromoCodes.code, "JAZZ10")));
    expect(promo!.used).toBe(1);
    expect((await events("ticket_order.paid")).length).toBe(1);
    // a second markPaid is a no-op (payment already paid → handler not re-run) and no extra tickets appear
    await s.tx((tx) => markPaid(tx, s.tenantId, firstPayment, { verifiedBy: "test" }));
    expect((await s.tx((tx) => listTicketsForOrder(tx, s.tenantId, firstOrder))).length).toBe(2);
    // the promo is used up now
    const again = await s.tx((tx) => quoteTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.regular, 1)], promoCode: "JAZZ10" }, opts));
    expect(!again.ok && again.error).toBe("promo_invalid");
  });

  it("session capacity caps the total across ticket types; cancelling an unpaid order releases everything", async () => {
    const r = await s.tx((tx) => createTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s2, lines: [line(s.types.regular, 2), line(s.types.s2only, 1)], customer: s.buyer(5), paymentMethod: "slip" }, opts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await sessionRow(s.sessions.s2))).toMatchObject({ reserved: 3, capacity: 3 });
    const full = await s.tx((tx) => createTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s2, lines: [line(s.types.free, 1)], customer: s.buyer(6) }, opts));
    expect(!full.ok && full.error).toBe("capacity");
    const detail = await s.tx((tx) => getEventDetail(tx, s.tenantId, s.event, { now: NOW }));
    expect(detail!.sessions.find((x) => x.id === s.sessions.s2)!.soldOut).toBe(true);

    const c = await s.tx((tx) => cancelUnpaidOrder(tx, s.tenantId, r.value.order.id, { by: "customer", now: NOW }));
    expect(c.ok && c.value.status).toBe("cancelled");
    expect((await sessionRow(s.sessions.s2))).toMatchObject({ reserved: 0, sold: 0 });
    expect((await typeRow(s.types.s2only))).toMatchObject({ reserved: 0, sold: 0 });
    expect((await paymentRow(r.value.payment!.id)).status).toBe("cancelled");
    const twice = await s.tx((tx) => cancelUnpaidOrder(tx, s.tenantId, r.value.order.id, { by: "customer" }));
    expect(!twice.ok && twice.error).toBe("not_pending");
    expect(await s.tx((tx) => ticketOrderClosedReason(tx, { ...r.value.payment!, refId: r.value.order.id }))).toContain("ยกเลิก");
    expect((await events("ticket_order.cancelled")).length).toBe(1);
  });

  it("the payment expiry sweep releases the hold; a late payment revives the order when tickets remain", async () => {
    const r = await s.tx((tx) => createTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.regular, 3)], customer: s.buyer(7), paymentMethod: "promptpay_qr" }, opts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await typeRow(s.types.regular)).reserved).toBe(3);
    const res = await expireStalePayments(s.db, { now: new Date(Date.now() + 3 * 3_600_000), refTypes: ["ticket_order"] });
    expect(res.expired).toBeGreaterThanOrEqual(1);
    expect((await paymentRow(r.value.payment!.id)).status).toBe("expired");
    const expired = await orderRow(r.value.order.id);
    expect(expired.status).toBe("expired");
    expect(expired.holdUntil).toBeNull();
    expect((await typeRow(s.types.regular)).reserved).toBe(0);
    expect((await events("ticket_order.expired")).length).toBe(1);
    // the money arrives late: tickets are still available → revived + issued
    await s.tx((tx) => markPaid(tx, s.tenantId, r.value.payment!.id, { verifiedBy: "admin" }));
    const revived = await orderRow(r.value.order.id);
    expect(revived.status).toBe("paid");
    expect((await typeRow(s.types.regular))).toMatchObject({ reserved: 0, sold: 5 });
    expect((await s.tx((tx) => listTicketsForOrder(tx, s.tenantId, r.value.order.id))).length).toBe(3);
    expect(paymentRefundRequired(await paymentRow(r.value.payment!.id))).toBeNull();
  });

  it("late money for sold-out tickets is flagged for a refund instead of overselling", async () => {
    // reserve both Early Bird tickets (order from the race test holds them) → create a second early order is impossible,
    // so use VIP: hold 4 of 5, expire, then another buyer takes 2 → only 3 left for the late payer who wanted 4
    const r = await s.tx((tx) => createTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.vip, 4)], customer: s.buyer(8), paymentMethod: "promptpay_qr" }, opts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await expireStalePayments(s.db, { now: new Date(Date.now() + 3 * 3_600_000), refTypes: ["ticket_order"] });
    expect((await orderRow(r.value.order.id)).status).toBe("expired");
    const other = await s.tx((tx) => createTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.vip, 2)], customer: s.buyer(9), paymentMethod: "slip" }, opts));
    expect(other.ok).toBe(true);
    await s.tx((tx) => markPaid(tx, s.tenantId, r.value.payment!.id, { verifiedBy: "admin" }));
    const p = await paymentRow(r.value.payment!.id);
    expect(p.status).toBe("paid");
    expect(paymentRefundRequired(p)).toContain("บัตรหมด");
    expect((await orderRow(r.value.order.id)).status).toBe("expired");
    expect((await s.tx((tx) => listTicketsForOrder(tx, s.tenantId, r.value.order.id))).length).toBe(0);
    expect((await typeRow(s.types.vip))).toMatchObject({ reserved: 2, sold: 0 });
  });

  it("free tickets are issued immediately without a payment", async () => {
    const r = await s.tx((tx) => createTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.free, 2)], customer: s.buyer(10) }, opts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.order.status).toBe("paid");
    expect(r.value.payment).toBeNull();
    expect(r.value.tickets.length).toBe(2);
    expect((await typeRow(s.types.free))).toMatchObject({ reserved: 0, sold: 2 });
  });

  it("guest checkout can be switched off; blocked contacts and missing contact details are refused", async () => {
    const login = await s.tx((tx) => createTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.free, 1)], customer: s.buyer(11) }, { ...opts, config: { ...CONFIG, allowGuestCheckout: false } }));
    expect(!login.ok && login.error).toBe("login_required");
    const noContact = await s.tx((tx) => createTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.free, 1)], customer: { name: "ไม่มีช่องทาง" } }, opts));
    expect(!noContact.ok && noContact.error).toBe("invalid_customer");
    const noMethod = await s.tx((tx) => createTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.regular, 1)], customer: s.buyer(12) }, { ...opts, settings: { payments: { enabled: { promptpay: false, bankTransfer: false } } } }));
    expect(!noMethod.ok && noMethod.error).toBe("payment_method");
  });

  it("renewOrderPayment voids the old payment and extends the hold; releaseLapsedHolds frees orders whose slip was rejected", async () => {
    const r = await s.tx((tx) => createTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [line(s.types.regular, 1)], customer: s.buyer(13), paymentMethod: "promptpay_qr" }, opts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const renewed = await s.tx((tx) => renewOrderPayment(tx, s.tenantId, r.value.order.id, "slip", opts));
    expect(renewed.ok).toBe(true);
    if (!renewed.ok) return;
    expect(renewed.value.payment.method).toBe("slip");
    expect((await paymentRow(r.value.payment!.id)).status).toBe("cancelled");
    expect((await orderRow(r.value.order.id)).status).toBe("pending"); // closed handler skipped (runHandler false)
    expect((await typeRow(s.types.regular)).reserved).toBe(1);
    // slip rejected → payment failed → the sweep ignores it; the lapsed-hold release frees the tickets
    await s.tx((tx) => markFailed(tx, s.tenantId, renewed.value.payment.id, "สลิปไม่ถูกต้อง"));
    expect(await s.tx((tx) => releaseLapsedHolds(tx, s.tenantId, NOW))).toBe(0); // hold not lapsed yet
    expect(await s.tx((tx) => releaseLapsedHolds(tx, s.tenantId, new Date(NOW.getTime() + 2 * 3_600_000)))).toBe(1);
    expect((await orderRow(r.value.order.id)).status).toBe("cancelled");
    expect((await typeRow(s.types.regular)).reserved).toBe(0);
  });

  it("lists orders for the customer and the admin", async () => {
    const upcoming = await s.tx((tx) => listCustomerOrders(tx, s.tenantId, firstCustomer, { scope: "upcoming", now: NOW }));
    expect(upcoming.map((o) => o.order.number)).toEqual(["TK-1001"]);
    expect(upcoming[0]!.session?.id).toBe(s.sessions.s1);
    const past = await s.tx((tx) => listCustomerOrders(tx, s.tenantId, firstCustomer, { scope: "past", now: new Date("2026-12-01T00:00:00.000Z") }));
    expect(past.map((o) => o.order.number)).toEqual(["TK-1001"]);
    const admin = await s.tx((tx) => listOrders(tx, s.tenantId, { eventId: s.event, status: "paid" }));
    expect(admin.total).toBe(3); // TK-1001, revived, free
    const search = await s.tx((tx) => listOrders(tx, s.tenantId, { q: "ผู้ซื้อ 1" }));
    expect(search.items.length).toBeGreaterThanOrEqual(1);
    const stats = await s.tx((tx) => orderStats(tx, s.tenantId, { eventId: s.event }));
    expect(stats.paid).toBe(3);
    expect(stats.ticketsSold).toBe(7);
    expect(stats.revenue).toBe(216000 + 360000);
    const list = await s.tx((tx) => listPublicEvents(tx, s.tenantId, { now: NOW }));
    expect(list.map((e) => e.slug)).toEqual(["jazz-night"]);
  });
});
