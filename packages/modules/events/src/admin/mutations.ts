/** Back-office writes that compose the core services (payments, tickets, catalog). Server only. */
import { and, eq } from "drizzle-orm";
import { payments, type Tx } from "@rentweb/db";
import { audit, emitEvent, fail, isUuid, ok, type Result } from "@rentweb/core";
import { createPayment, markFailed, markPaid, paymentRefundRequired, type PaymentMethod } from "@rentweb/core/payments";
import { createEvent, createSession, createTicketType, getEventById, listSessions, listTicketTypes, type EventRow } from "../services/catalog";
import { getOrderAdmin, lockOrder, lockOrderPayments, TICKET_ORDER_REF_TYPE, voidOrderPayments, type PaymentRow } from "../services/orders";
import { getTicketById, voidTicketsForOrder, type TicketRow } from "../services/tickets";
import { checkInByCode, type CheckInResult } from "../services/checkin";
import type { Actor } from "./stats";

async function orderPayment(tx: Tx, tenantId: string, orderId: string, paymentId: string): Promise<PaymentRow | null> {
  if (!isUuid(orderId) || !isUuid(paymentId)) return null;
  const [p] = await tx
    .select()
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId), eq(payments.refType, TICKET_ORDER_REF_TYPE), eq(payments.refId, orderId)))
    .limit(1);
  return p ?? null;
}

/** Approves a slip / confirms a QR as paid: markPaid runs onTicketOrderPaid (tickets issued, or refundRequired when the seats are gone). */
export async function approveTicketOrderPayment(tx: Tx, tenantId: string, orderId: string, paymentId: string, actor: Actor): Promise<Result<null, string>> {
  const p = await orderPayment(tx, tenantId, orderId, paymentId);
  if (!p) return fail("ไม่พบรายการชำระเงินของคำสั่งซื้อนี้");
  if (p.status === "paid") return fail("รายการนี้ยืนยันแล้ว");
  if (!["pending", "pending_verification", "failed", "expired"].includes(p.status)) return fail(`รายการอยู่ในสถานะ ${p.status} ยืนยันไม่ได้`);
  const paid = await markPaid(tx, tenantId, p.id, { verifiedBy: actor.userId });
  const refund = paymentRefundRequired(paid);
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "ticket_order.payment.approve", targetType: "payment", targetId: p.id, diff: { orderId, amount: p.amount, method: p.method, refundRequired: refund } });
  if (refund) return fail(`บันทึกรับเงินแล้ว แต่ต้องคืนเงินลูกค้า: ${refund}`);
  return ok(null);
}

export async function rejectTicketOrderPayment(tx: Tx, tenantId: string, orderId: string, paymentId: string, reason: string, actor: Actor): Promise<Result<null, string>> {
  const p = await orderPayment(tx, tenantId, orderId, paymentId);
  if (!p) return fail("ไม่พบรายการชำระเงินของคำสั่งซื้อนี้");
  if (p.status === "paid") return fail("รายการนี้ชำระแล้ว ปฏิเสธไม่ได้ (ใช้คืนเงินแทน)");
  if (!["pending", "pending_verification"].includes(p.status)) return fail(`รายการอยู่ในสถานะ ${p.status} ปฏิเสธไม่ได้`);
  await markFailed(tx, tenantId, p.id, reason);
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "ticket_order.payment.reject", targetType: "payment", targetId: p.id, diff: { orderId, reason } });
  return ok(null);
}

/**
 * Records a cash payment at the door for a pending (or lapsed) order: open QR / slip payments are voided (the slip under
 * review must be decided first), a cash payment is created and markPaid runs onTicketOrderPaid → tickets issued.
 */
export async function recordCashTicketPayment(tx: Tx, tenantId: string, orderId: string, actor: Actor): Promise<Result<{ amount: number }, string>> {
  if (!isUuid(orderId)) return fail("ไม่พบคำสั่งซื้อ");
  const pays = await lockOrderPayments(tx, tenantId, orderId);
  const order = await lockOrder(tx, tenantId, orderId);
  if (!order) return fail("ไม่พบคำสั่งซื้อ");
  if (order.status === "paid") return fail("คำสั่งซื้อนี้ชำระแล้ว");
  if (order.status === "cancelled" || order.status === "refunded") return fail("คำสั่งซื้อนี้ถูกยกเลิก / คืนเงินแล้ว");
  if (pays.some((x) => x.status === "pending_verification")) return fail("มีสลิปรอตรวจสอบอยู่ — อนุมัติหรือปฏิเสธสลิปก่อน");
  if (order.total <= 0) return fail("คำสั่งซื้อนี้ไม่มียอดที่ต้องชำระ");
  await voidOrderPayments(tx, tenantId, pays, "รับชำระเป็นเงินสดหน้างาน");
  const p = await createPayment(tx, tenantId, { refType: TICKET_ORDER_REF_TYPE, refId: order.id, amount: order.total, provider: "cash", method: "cash" as PaymentMethod, customerId: order.customerId, metadata: { orderNumber: order.number, by: actor.userId } });
  const paid = await markPaid(tx, tenantId, p.id, { verifiedBy: actor.userId });
  const refund = paymentRefundRequired(paid);
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "ticket_order.payment.cash", targetType: "payment", targetId: p.id, diff: { orderId, amount: order.total, refundRequired: refund } });
  if (refund) return fail(`บันทึกรับเงินแล้ว แต่ออกบัตรไม่ได้: ${refund}`);
  return ok({ amount: order.total });
}

/** Voids one ticket without touching the money (duplicate / fraud / reissued). The seat is not released. */
export async function voidTicket(tx: Tx, tenantId: string, ticketId: string, reason: string, actor: Actor): Promise<Result<TicketRow, string>> {
  const t = await getTicketById(tx, tenantId, ticketId);
  if (!t) return fail("ไม่พบบัตร");
  if (t.status !== "valid" && t.status !== "checked_in") return fail("บัตรใบนี้ถูกยกเลิกหรือคืนเงินไปแล้ว");
  const [row] = await voidTicketsForOrder(tx, tenantId, t.orderId, reason, { ticketIds: [t.id] });
  if (!row) return fail("ยกเลิกบัตรไม่สำเร็จ");
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "ticket.void", targetType: "ticket", targetId: t.id, diff: { orderId: t.orderId, code: t.code, reason } });
  return ok(row);
}

/** Manual check-in from the attendee list: same rules as the gate except the day / time window (the admin decides). */
export async function manualCheckIn(tx: Tx, tenantId: string, ticketId: string, by: string): Promise<CheckInResult | null> {
  const t = await getTicketById(tx, tenantId, ticketId);
  if (!t) return null;
  return checkInByCode(tx, tenantId, { code: t.code, by, config: { enforceSessionDay: false, checkInOpensMinutesBefore: 0 } });
}

/**
 * Queues the ticket e-mail / LINE message again (outbox `ticket_order.resend`, same payload as `ticket_order.paid` plus
 * `resend: true`, so the notification handler can reuse the paid template).
 */
export async function resendTickets(tx: Tx, tenantId: string, orderId: string, actor: Actor): Promise<Result<{ tickets: number; to: string[] }, string>> {
  const d = await getOrderAdmin(tx, tenantId, orderId);
  if (!d) return fail("ไม่พบคำสั่งซื้อ");
  const o = d.order;
  if (o.status !== "paid") return fail("ส่งบัตรได้เฉพาะคำสั่งซื้อที่ชำระแล้ว");
  const live = d.tickets.filter((t) => t.status === "valid" || t.status === "checked_in");
  if (!live.length) return fail("คำสั่งซื้อนี้ไม่มีบัตรที่ใช้ได้แล้ว");
  const to = [o.contactEmail, o.contactPhone].filter((x): x is string => !!x);
  if (!to.length) return fail("คำสั่งซื้อนี้ไม่มีอีเมลหรือเบอร์โทรของลูกค้า");
  await emitEvent(tx, {
    tenantId,
    type: "ticket_order.resend",
    payload: {
      resend: true,
      orderId: o.id,
      number: o.number,
      eventId: o.eventId,
      eventTitle: d.event.title,
      sessionId: o.sessionId,
      sessionStartsAt: d.session?.startsAt ?? null,
      quantity: o.quantity,
      total: o.total,
      amount: o.paidAmount,
      paymentId: o.paymentId,
      ticketCodes: live.map((t) => t.code),
      customerId: o.customerId,
      customerName: o.contactName,
      customerPhone: o.contactPhone,
      customerEmail: o.contactEmail,
      phone: o.contactPhone,
      email: o.contactEmail,
      accessKey: o.accessKey,
      requestedBy: actor.userId,
    },
  });
  return ok({ tickets: live.length, to });
}

/** Copies an event (draft, "(สำเนา)") with its sessions and ticket types; counters start at zero. */
export async function duplicateEvent(tx: Tx, tenantId: string, eventId: string): Promise<EventRow | null> {
  const src = await getEventById(tx, tenantId, eventId);
  if (!src) return null;
  const copy = await createEvent(tx, tenantId, {
    title: `${src.title} (สำเนา)`.slice(0, 200),
    summary: src.summary,
    description: src.description,
    cover: src.cover,
    gallery: src.gallery,
    category: src.category,
    venueName: src.venueName,
    venueAddress: src.venueAddress,
    venueMapUrl: src.venueMapUrl,
    organizer: src.organizer,
    status: "draft",
    featured: false,
    sort: src.sort,
    settings: src.settings,
  });
  const sessionMap = new Map<string, string>();
  for (const s of await listSessions(tx, tenantId, src.id)) {
    if (s.status === "cancelled") continue;
    const ns = await createSession(tx, tenantId, copy.id, { name: s.name, startsAt: s.startsAt, endsAt: s.endsAt, doorsOpen: s.doorsOpen, capacity: s.capacity, status: "scheduled", sort: s.sort });
    sessionMap.set(s.id, ns.id);
  }
  for (const t of await listTicketTypes(tx, tenantId, src.id)) {
    const sessionId = t.sessionId ? sessionMap.get(t.sessionId) : null;
    if (t.sessionId && !sessionId) continue; // its session was cancelled
    await createTicketType(tx, tenantId, copy.id, { sessionId: sessionId ?? null, name: t.name, description: t.description, price: t.price, quantity: t.quantity, minPerOrder: t.minPerOrder, maxPerOrder: t.maxPerOrder, salesStart: t.salesStart, salesEnd: t.salesEnd, visibility: t.visibility as "public" | "hidden", sort: t.sort });
  }
  return (await getEventById(tx, tenantId, copy.id)) ?? copy;
}
