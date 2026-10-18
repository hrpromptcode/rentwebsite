import { and, eq, inArray, type Tx } from "@rentweb/db";
import { ticketOrders, tickets } from "@rentweb/db";
import { audit, emitEvent, fail, ok, type Result } from "@rentweb/core";
import { refundPayment } from "@rentweb/core/payments";
import type { EventsConfig } from "./config";
import { applyCounters, lockOrder, type TicketOrderRow } from "./orders";
import { listTicketsForOrder, type TicketRow } from "./tickets";

export type RefundOrderError = "not_found" | "not_paid" | "nothing_to_refund" | "ticket_not_found";

export interface RefundOrderInput {
  /** refund only these tickets (default: every live ticket = full refund) */
  ticketIds?: string[] | null;
  /** satang; default = Σ price of the refunded tickets, capped at what was paid and not yet refunded */
  amount?: number | null;
  reason?: string | null;
  actorId?: string | null;
  actorType?: "user" | "superadmin" | "system";
  config: Pick<EventsConfig, "refundReleasesSeats">;
  now?: Date;
}

export interface RefundOrderResult {
  order: TicketOrderRow;
  /** satang actually refunded on the payment (0 for free tickets) */
  refundedAmount: number;
  tickets: TicketRow[];
  /** true when every ticket of the order is now refunded (order.status = refunded) */
  full: boolean;
}

/**
 * Refunds a paid order fully or per ticket: the money goes back through refundPayment (payments-api), the tickets become
 * `refunded` (QR no longer valid) and, by default, their seats return to the pool.
 */
export async function refundTicketOrder(tx: Tx, tenantId: string, orderId: string, input: RefundOrderInput): Promise<Result<RefundOrderResult, RefundOrderError>> {
  const order = await lockOrder(tx, tenantId, orderId);
  if (!order) return fail("not_found");
  if (order.status !== "paid") return fail(order.status === "refunded" ? "nothing_to_refund" : "not_paid");
  const now = input.now ?? new Date();
  const live = (await listTicketsForOrder(tx, tenantId, order.id)).filter((t) => t.status === "valid" || t.status === "checked_in");
  let targets = live;
  if (input.ticketIds) {
    const ids = new Set(input.ticketIds);
    targets = live.filter((t) => ids.has(t.id));
    if (targets.length !== ids.size) return fail("ticket_not_found");
  }
  if (!targets.length) return fail("nothing_to_refund");
  const reason = input.reason?.trim() || "คืนเงินบัตร";

  const refundable = Math.max(0, order.paidAmount - order.refundedAmount);
  const wanted = input.amount ?? targets.reduce((s, t) => s + t.price, 0);
  const amount = Math.max(0, Math.min(wanted, refundable));
  if (amount > 0 && order.paymentId) await refundPayment(tx, tenantId, order.paymentId, amount, reason);

  const refunded = await tx
    .update(tickets)
    .set({ status: "refunded", voidReason: reason })
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.orderId, order.id), inArray(tickets.id, targets.map((t) => t.id))))
    .returning();

  if (input.config.refundReleasesSeats) {
    // release per ticket type (a partial refund touches only some lines)
    const perType = new Map<string, number>();
    for (const t of refunded) perType.set(t.ticketTypeId, (perType.get(t.ticketTypeId) ?? 0) + 1);
    const lines = [...perType].map(([ticketTypeId, qty]) => ({ ticketTypeId, name: "", unitPrice: 0, qty, total: 0 }));
    await applyCounters(tx, tenantId, { lines, sessionId: order.sessionId, quantity: refunded.length }, { sold: -1 });
  }

  const full = refunded.length >= live.length;
  const [row] = await tx
    .update(ticketOrders)
    .set({ refundedAmount: order.refundedAmount + amount, status: full ? "refunded" : "paid", ...(full ? { cancelledAt: now, cancelledBy: input.actorType === "system" ? "system" : "admin", cancelReason: reason } : {}) })
    .where(and(eq(ticketOrders.tenantId, tenantId), eq(ticketOrders.id, order.id)))
    .returning();
  await audit(tx, { tenantId, actorType: input.actorType ?? "user", actorId: input.actorId ?? null, action: "ticket_order.refund", targetType: "ticket_order", targetId: order.id, diff: { number: order.number, amount, tickets: refunded.map((t) => t.code), full, reason } });
  await emitEvent(tx, {
    tenantId,
    type: "ticket_order.refunded",
    payload: { orderId: order.id, number: order.number, eventId: order.eventId, amount, full, ticketCodes: refunded.map((t) => t.code), reason, customerId: order.customerId, customerName: order.contactName, phone: order.contactPhone, email: order.contactEmail, accessKey: order.accessKey },
  });
  return ok({ order: row!, refundedAmount: amount, tickets: refunded, full });
}
