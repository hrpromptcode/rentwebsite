import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, eventsOutbox, payments, ticketTypes } from "@rentweb/db";
import { markPaid } from "@rentweb/core/payments";
import "../src/register";
import { createTicketOrder } from "../src/services/orders";
import { checkInByCode, checkInStats, listRecentCheckIns, undoCheckIn } from "../src/services/checkin";
import { getTicketDetail, listAttendees, listTicketsForOrder, signTicketPayload, voidTicketsForOrder, type TicketRow } from "../src/services/tickets";
import { refundTicketOrder } from "../src/services/refunds";
import { bkkDateTime } from "../src/services/time";
import { CONFIG, NOW, SETTINGS, seedEvents, type Seeded } from "./helpers";

let s: Seeded;
const opts = { config: CONFIG, settings: SETTINGS, now: NOW };
/** Sat 7 Nov 2026 18:30 Bangkok – S1 doors are open. */
const GATE_NOW = bkkDateTime("2026-11-07", "18:30");
const cfg = { config: CONFIG, now: GATE_NOW, by: "gate-1" };

let s1Tickets: TicketRow[] = [];
let s1Order: string;

beforeAll(async () => {
  s = await seedEvents();
  const r = await s.tx((tx) => createTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [{ ticketTypeId: s.types.regular, qty: 3 }], customer: s.buyer(1), paymentMethod: "promptpay_qr" }, opts));
  if (!r.ok) throw new Error(r.error);
  s1Order = r.value.order.id;
  await s.tx((tx) => markPaid(tx, s.tenantId, r.value.payment!.id, { verifiedBy: "test" }));
  s1Tickets = await s.tx((tx) => listTicketsForOrder(tx, s.tenantId, s1Order));
});

const events = (type: string) => s.tx((tx) => tx.select().from(eventsOutbox).where(and(eq(eventsOutbox.tenantId, s.tenantId), eq(eventsOutbox.type, type))));
const typeRow = (id: string) => s.tx(async (tx) => (await tx.select().from(ticketTypes).where(eq(ticketTypes.id, id)))[0]!);
const paymentRow = (id: string) => s.tx(async (tx) => (await tx.select().from(payments).where(eq(payments.id, id)))[0]!);

describe("checkInByCode", () => {
  it("checks a typed code in once; the second scan reports already_checked_in with the original time", async () => {
    const t = s1Tickets[0]!;
    const first = await s.tx((tx) => checkInByCode(tx, s.tenantId, { code: t.code.toLowerCase().replace(/-/g, " "), sessionId: s.sessions.s1, ...cfg }));
    expect(first.outcome).toBe("checked_in");
    if (first.outcome !== "checked_in") return;
    expect(first.ticket.ticket.status).toBe("checked_in");
    expect(first.ticket.ticket.checkedInBy).toBe("gate-1");
    const second = await s.tx((tx) => checkInByCode(tx, s.tenantId, { code: t.code, sessionId: s.sessions.s1, ...cfg, now: new Date(GATE_NOW.getTime() + 60_000) }));
    expect(second.outcome).toBe("already_checked_in");
    if (second.outcome !== "already_checked_in") return;
    expect(second.checkedInAt.getTime()).toBe(GATE_NOW.getTime());
    expect((await events("ticket.checked_in")).length).toBe(1);
  });

  it("accepts the signed QR payload and rejects tampered / foreign / unknown codes with a reason", async () => {
    const t = s1Tickets[1]!;
    const payload = signTicketPayload({ tenantId: s.tenantId, ticketId: t.id, code: t.code });
    const detail = await s.tx((tx) => getTicketDetail(tx, s.tenantId, t.id));
    expect(detail?.qrPayload).toBe(payload);
    const tampered = await s.tx((tx) => checkInByCode(tx, s.tenantId, { code: payload.replace(t.code, s1Tickets[2]!.code), ...cfg }));
    expect(tampered).toMatchObject({ outcome: "rejected", reason: "invalid_signature" });
    const foreign = await s.tx((tx) => checkInByCode(tx, s.tenantId, { code: signTicketPayload({ tenantId: "019a0000-0000-7000-8000-000000000001", ticketId: t.id, code: t.code }), ...cfg }));
    expect(foreign).toMatchObject({ outcome: "rejected", reason: "wrong_tenant" });
    const unknown = await s.tx((tx) => checkInByCode(tx, s.tenantId, { code: "AAAA-BBBB-CCCC", ...cfg }));
    expect(unknown).toMatchObject({ outcome: "rejected", reason: "unknown" });
    const garbage = await s.tx((tx) => checkInByCode(tx, s.tenantId, { code: "hello", ...cfg }));
    expect(garbage).toMatchObject({ outcome: "rejected", reason: "unknown" });
    const ok = await s.tx((tx) => checkInByCode(tx, s.tenantId, { code: payload, sessionId: s.sessions.s1, ...cfg }));
    expect(ok.outcome).toBe("checked_in");
  });

  it("refuses the wrong session, the wrong day and too-early scans without touching the ticket", async () => {
    const t = s1Tickets[2]!;
    const wrongSession = await s.tx((tx) => checkInByCode(tx, s.tenantId, { code: t.code, sessionId: s.sessions.s2, ...cfg }));
    expect(wrongSession).toMatchObject({ outcome: "rejected", reason: "wrong_session" });
    const wrongDay = await s.tx((tx) => checkInByCode(tx, s.tenantId, { code: t.code, sessionId: s.sessions.s1, ...cfg, now: bkkDateTime("2026-11-06", "19:00") }));
    expect(wrongDay).toMatchObject({ outcome: "rejected", reason: "wrong_day" });
    const tooEarly = await s.tx((tx) => checkInByCode(tx, s.tenantId, { code: t.code, sessionId: s.sessions.s1, ...cfg, now: bkkDateTime("2026-11-07", "09:00"), config: { ...CONFIG, checkInOpensMinutesBefore: 60 } }));
    expect(tooEarly).toMatchObject({ outcome: "rejected", reason: "too_early" });
    expect((await s.tx((tx) => getTicketDetail(tx, s.tenantId, t.id)))!.ticket.status).toBe("valid");
    // relaxed day rule: an early scan on another day is fine
    const relaxed = await s.tx((tx) => checkInByCode(tx, s.tenantId, { code: t.code, ...cfg, now: bkkDateTime("2026-11-06", "19:00"), config: { ...CONFIG, enforceSessionDay: false } }));
    expect(relaxed.outcome).toBe("checked_in");
    const undone = await s.tx((tx) => undoCheckIn(tx, s.tenantId, t.id));
    expect(undone?.status).toBe("valid");
  });

  it("void tickets are rejected; stats and the recent feed reflect the gate", async () => {
    const t = s1Tickets[2]!;
    const voided = await s.tx((tx) => voidTicketsForOrder(tx, s.tenantId, s1Order, "ทดสอบ", { ticketIds: [t.id] }));
    expect(voided.length).toBe(1);
    const r = await s.tx((tx) => checkInByCode(tx, s.tenantId, { code: t.code, ...cfg }));
    expect(r).toMatchObject({ outcome: "rejected", reason: "void" });
    const stats = await s.tx((tx) => checkInStats(tx, s.tenantId, s.event, s.sessions.s1));
    expect(stats).toMatchObject({ total: 2, checkedIn: 2, remaining: 0 });
    expect(stats.byType[0]).toMatchObject({ name: "บัตรทั่วไป", total: 2, checkedIn: 2 });
    expect(stats.lastCheckInAt).toBeInstanceOf(Date);
    const recent = await s.tx((tx) => listRecentCheckIns(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1 }));
    expect(recent.length).toBe(2);
    const attendees = await s.tx((tx) => listAttendees(tx, s.tenantId, { eventId: s.event, q: "ผู้ซื้อ 1" }));
    expect(attendees.total).toBe(3);
    const byCode = await s.tx((tx) => listAttendees(tx, s.tenantId, { eventId: s.event, q: t.code.toLowerCase() }));
    expect(byCode.items.map((a) => a.ticket.id)).toEqual([t.id]);
  });
});

describe("refundTicketOrder", () => {
  it("refunds per ticket (partial) then the rest (full): payment, tickets, seats and order status follow", async () => {
    const r = await s.tx((tx) => createTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [{ ticketTypeId: s.types.vip, qty: 3 }], customer: s.buyer(2), paymentMethod: "slip" }, opts));
    if (!r.ok) throw new Error(r.error);
    await s.tx((tx) => markPaid(tx, s.tenantId, r.value.payment!.id, { verifiedBy: "test" }));
    const tickets = await s.tx((tx) => listTicketsForOrder(tx, s.tenantId, r.value.order.id));
    expect(tickets.length).toBe(3);
    expect((await typeRow(s.types.vip))).toMatchObject({ sold: 3, reserved: 0 });

    const partial = await s.tx((tx) => refundTicketOrder(tx, s.tenantId, r.value.order.id, { ticketIds: [tickets[0]!.id], reason: "ลูกค้าขอคืน 1 ใบ", actorId: null, config: CONFIG, now: NOW }));
    expect(partial.ok).toBe(true);
    if (!partial.ok) return;
    expect(partial.value.refundedAmount).toBe(300000);
    expect(partial.value.full).toBe(false);
    expect(partial.value.order.status).toBe("paid");
    expect(partial.value.order.refundedAmount).toBe(300000);
    expect((await paymentRow(r.value.payment!.id))).toMatchObject({ status: "partially_refunded", refundedAmount: 300000 });
    expect((await typeRow(s.types.vip))).toMatchObject({ sold: 2 });
    const scan = await s.tx((tx) => checkInByCode(tx, s.tenantId, { code: tickets[0]!.code, ...cfg }));
    expect(scan).toMatchObject({ outcome: "rejected", reason: "refunded" });
    const still = await s.tx((tx) => checkInByCode(tx, s.tenantId, { code: tickets[1]!.code, ...cfg }));
    expect(still.outcome).toBe("checked_in");

    const full = await s.tx((tx) => refundTicketOrder(tx, s.tenantId, r.value.order.id, { reason: "งานยกเลิก", config: CONFIG, now: NOW }));
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    expect(full.value.full).toBe(true);
    expect(full.value.refundedAmount).toBe(600000);
    expect(full.value.tickets.length).toBe(2); // the checked-in one is refunded too
    expect(full.value.order.status).toBe("refunded");
    expect((await paymentRow(r.value.payment!.id))).toMatchObject({ status: "refunded", refundedAmount: 900000 });
    expect((await typeRow(s.types.vip))).toMatchObject({ sold: 0 });
    const again = await s.tx((tx) => refundTicketOrder(tx, s.tenantId, r.value.order.id, { config: CONFIG }));
    expect(!again.ok && again.error).toBe("nothing_to_refund");
    expect((await events("ticket_order.refunded")).length).toBe(2);
    // a refunded order's late re-payment attempt is refused by the target check (paid → nothing to do here) – covered by the payments layer
  });

  it("free orders refund 0 baht but still void the tickets", async () => {
    const r = await s.tx((tx) => createTicketOrder(tx, s.tenantId, { eventId: s.event, sessionId: s.sessions.s1, lines: [{ ticketTypeId: s.types.free, qty: 2 }], customer: s.buyer(3) }, opts));
    if (!r.ok) throw new Error(r.error);
    const res = await s.tx((tx) => refundTicketOrder(tx, s.tenantId, r.value.order.id, { config: CONFIG }));
    expect(res.ok && res.value.refundedAmount).toBe(0);
    expect(res.ok && res.value.order.status).toBe("refunded");
    expect(res.ok && res.value.tickets.every((t) => t.status === "refunded")).toBe(true);
    expect((await typeRow(s.types.free)).sold).toBe(0);
  });
});
