import { createTestDb, type TestDb } from "@rentweb/db/test-utils";
import { eventPromoCodes, eventSessions, events, tenants, ticketTypes, withTenant, type Tx } from "@rentweb/db";
import { registerPaymentAccessCheck, registerPaymentClosedHandler, registerPaymentHandler, registerPaymentTargetCheck } from "@rentweb/core/payments";
import type { EventsConfig } from "../src/services/config";
import { onTicketOrderPaid, onTicketOrderPaymentClosed, ticketOrderClosedReason, ticketOrderPaymentAccess } from "../src/services/orders";
import { bkkDateTime } from "../src/services/time";

// src/register.ts also registers the storefront sections (JSX + @rentweb/storefront), which vitest cannot transform;
// the tests only need the "ticket_order" payment hooks, registered here exactly as register.ts does.
registerPaymentHandler("ticket_order", onTicketOrderPaid);
registerPaymentClosedHandler("ticket_order", onTicketOrderPaymentClosed);
registerPaymentTargetCheck("ticket_order", ticketOrderClosedReason);
registerPaymentAccessCheck("ticket_order", ticketOrderPaymentAccess);

export const CONFIG: EventsConfig = {
  holdMinutes: 20,
  allowGuestCheckout: true,
  ticketTerms: "ทดสอบ",
  maxPerOrder: 10,
  enforceSessionDay: true,
  checkInOpensMinutesBefore: 0,
  refundReleasesSeats: true,
  showOrganizerContact: true,
};

export const SETTINGS = {
  contact: { phone: "02-000-1111" },
  payments: { promptpayId: "0891112222", promptpayName: "ทดสอบ", bankAccounts: [{ bank: "กสิกรไทย", name: "ทดสอบ", number: "123-4-56789-0" }], enabled: { promptpay: true, bankTransfer: true, cash: true }, autoApproveSlips: true },
};

/** Thursday 2026-10-15 09:00 Bangkok. */
export const NOW = new Date("2026-10-15T02:00:00.000Z");

export interface Seeded {
  db: TestDb;
  tenantId: string;
  tx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  event: string;
  draftEvent: string;
  sessions: { s1: string; s2: string; draft: string };
  types: { early: string; regular: string; vip: string; hidden: string; free: string; closed: string; future: string; s2only: string };
  buyer: (n: number) => { name: string; phone: string; email?: string };
}

/**
 * "Jazz Night" (published): S1 Sat 7 Nov 19:00–22:00 (uncapped), S2 Sun 8 Nov 19:00–22:00 (capacity 3).
 * Types (event-wide unless noted): early ฿800 ×2 (max 2) · regular ฿1,200 ×50 (max 6) · vip ฿3,000 ×5 (min 2, max 4) ·
 * hidden ฿0 ×10 (hidden) · free ฿0 unlimited (max 10) · closed (sales ended 1 Oct) · future (sales start 1 Dec) · s2only ฿1,500 ×3 (S2).
 * Promo JAZZ10 = 10 % (max 1 use). "Workshop" is a draft event with one session.
 */
export async function seedEvents(): Promise<Seeded> {
  const { db } = await createTestDb();
  const [t] = await db.insert(tenants).values({ slug: "demo-test-events", name: "Test Events", siteType: "events" }).returning({ id: tenants.id });
  const tenantId = t!.id;
  const tx = <T>(fn: (tx: Tx) => Promise<T>) => withTenant(db, tenantId, fn);
  const seeded = await tx(async (tx) => {
    const [ev, draft] = await tx
      .insert(events)
      .values([
        { tenantId, title: "Jazz Night", slug: "jazz-night", status: "published", category: "คอนเสิร์ต", venueName: "ลานกิจกรรมริมน้ำ", startsAt: bkkDateTime("2026-11-07", "19:00"), endsAt: bkkDateTime("2026-11-08", "22:00") },
        { tenantId, title: "Workshop", slug: "workshop", status: "draft", startsAt: bkkDateTime("2026-11-20", "10:00"), endsAt: bkkDateTime("2026-11-20", "12:00") },
      ])
      .returning({ id: events.id });
    const event = ev!.id;
    const draftEvent = draft!.id;
    const ss = await tx
      .insert(eventSessions)
      .values([
        { tenantId, eventId: event, name: "คืนแรก", startsAt: bkkDateTime("2026-11-07", "19:00"), endsAt: bkkDateTime("2026-11-07", "22:00"), doorsOpen: bkkDateTime("2026-11-07", "18:00"), sort: 0 },
        { tenantId, eventId: event, name: "คืนที่สอง", startsAt: bkkDateTime("2026-11-08", "19:00"), endsAt: bkkDateTime("2026-11-08", "22:00"), capacity: 3, sort: 1 },
        { tenantId, eventId: draftEvent, startsAt: bkkDateTime("2026-11-20", "10:00"), endsAt: bkkDateTime("2026-11-20", "12:00") },
      ])
      .returning({ id: eventSessions.id, name: eventSessions.name, eventId: eventSessions.eventId });
    const s1 = ss.find((s) => s.name === "คืนแรก")!.id;
    const s2 = ss.find((s) => s.name === "คืนที่สอง")!.id;
    const sDraft = ss.find((s) => s.eventId === draftEvent)!.id;
    const tt = await tx
      .insert(ticketTypes)
      .values([
        { tenantId, eventId: event, name: "Early Bird", price: 80000, quantity: 2, minPerOrder: 1, maxPerOrder: 2, sort: 0 },
        { tenantId, eventId: event, name: "บัตรทั่วไป", price: 120000, quantity: 50, minPerOrder: 1, maxPerOrder: 6, sort: 1 },
        { tenantId, eventId: event, name: "VIP", price: 300000, quantity: 5, minPerOrder: 2, maxPerOrder: 4, sort: 2 },
        { tenantId, eventId: event, name: "Staff", price: 0, quantity: 10, visibility: "hidden", sort: 3 },
        { tenantId, eventId: event, name: "ชมฟรี", price: 0, quantity: null, maxPerOrder: 10, sort: 4 },
        { tenantId, eventId: event, name: "Presale (ปิดแล้ว)", price: 50000, quantity: 10, salesEnd: bkkDateTime("2026-10-01", "00:00"), sort: 5 },
        { tenantId, eventId: event, name: "Late (ยังไม่เปิด)", price: 150000, quantity: 10, salesStart: bkkDateTime("2026-12-01", "00:00"), sort: 6 },
        { tenantId, eventId: event, sessionId: s2, name: "คืนที่สองเท่านั้น", price: 150000, quantity: 3, sort: 7 },
      ])
      .returning({ id: ticketTypes.id, name: ticketTypes.name });
    const id = (name: string) => tt.find((x) => x.name === name)!.id;
    await tx.insert(eventPromoCodes).values({ tenantId, eventId: event, code: "JAZZ10", kind: "percent", value: 10, maxUses: 1 });
    return {
      event,
      draftEvent,
      sessions: { s1, s2, draft: sDraft },
      types: { early: id("Early Bird"), regular: id("บัตรทั่วไป"), vip: id("VIP"), hidden: id("Staff"), free: id("ชมฟรี"), closed: id("Presale (ปิดแล้ว)"), future: id("Late (ยังไม่เปิด)"), s2only: id("คืนที่สองเท่านั้น") },
    };
  });
  return { db, tenantId, tx, ...seeded, buyer: (n) => ({ name: `ผู้ซื้อ ${n}`, phone: `08100000${String(n).padStart(2, "0")}`, email: `b${n}@example.com` }) };
}
