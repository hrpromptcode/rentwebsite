import { and, asc, count, desc, eq, gte, ilike, inArray, lt, nextCounter, or, sql, type Tx } from "@rentweb/db";
import { eventPromoCodes, eventSessions, events, payments, ticketOrders, ticketTypes, type TicketHolderInput, type TicketOrderLine, type TicketOrderMeta } from "@rentweb/db";
import { audit, emitEvent, fail, isUuid, ok, randomToken, safeEqual, type Result } from "@rentweb/core";
import { isCustomerBlocked, upsertGuestCustomer } from "@rentweb/core/customer";
import {
  cancelPayment,
  createPayment,
  enabledMethods,
  getPayment,
  refundRequired,
  resolvePromptpayId,
  type PaymentAccessProof,
  type PaymentAccessVia,
  type PaymentClosedInfo,
  type PaymentMethod,
  type PaymentPaidResult,
  type PaymentProvider,
} from "@rentweb/core/payments";
import { checkPromoCode, getEventById, getSessionById, listSessions, listTicketTypes, sessionRemaining, ticketTypeRemaining, type EventRow, type PromoCodeRow, type SessionRow, type TicketTypeRow } from "./catalog";
import { HOLD_GRACE_MIN, type EventsConfig, type TicketOrderStatus } from "./config";
import { issueTicketsForOrder, listTicketsForOrder, voidTicketsForOrder, type TicketRow } from "./tickets";

export type TicketOrderRow = typeof ticketOrders.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;

export const TICKET_ORDER_REF_TYPE = "ticket_order" as const;

/** Online methods a ticket order can be paid with. */
export type TicketPaymentMethod = "promptpay_qr" | "slip";

export interface OrderOpts {
  config: EventsConfig;
  /** tenant settings (payments block) */
  settings: Record<string, unknown>;
  now?: Date;
}

export interface OrderLineInput {
  ticketTypeId: string;
  qty: number;
}

export interface QuoteInput {
  eventId: string;
  /** required when the event has more than one scheduled session */
  sessionId?: string | null;
  lines: OrderLineInput[];
  promoCode?: string | null;
  /** admin box office: ignores publish status, sales windows and per-order limits (quantities still apply) */
  bypassSalesRules?: boolean;
}

export type QuoteError =
  | "event_not_found"
  | "event_not_open"
  | "session_required"
  | "session_not_found"
  | "session_closed"
  | "ticket_type_not_found"
  | "no_lines"
  | "sales_not_started"
  | "sales_closed"
  | "min_qty"
  | "max_qty"
  | "max_per_order"
  | "sold_out"
  | "capacity"
  | "promo_invalid";

export interface Quote {
  event: EventRow;
  session: SessionRow | null;
  lines: TicketOrderLine[];
  /** tickets in the order */
  quantity: number;
  subtotal: number;
  discount: number;
  total: number;
  promo: PromoCodeRow | null;
  /** the error's subject (ticket type id) when a line failed */
  failedTicketTypeId?: string;
}

const PROVIDER_FOR: Record<TicketPaymentMethod, PaymentProvider> = { promptpay_qr: "promptpay", slip: "bank_transfer" };

/* ------------------------------------------------------------------ */
/* helpers                                                              */
/* ------------------------------------------------------------------ */

/** Serialises writers of one ticket type until the transaction ends (counters are read-then-written). */
export async function lockTicketType(tx: Tx, tenantId: string, ticketTypeId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('rentweb.events.type'), hashtext(${`${tenantId}:${ticketTypeId}`}))`);
}

/** Serialises writers of one session (capacity). Always taken BEFORE ticket-type locks. */
export async function lockSession(tx: Tx, tenantId: string, sessionId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('rentweb.events.session'), hashtext(${`${tenantId}:${sessionId}`}))`);
}

/** Session lock (if any) then ticket-type locks in id order – the one lock order every writer uses. */
async function lockForLines(tx: Tx, tenantId: string, sessionId: string | null, ticketTypeIds: string[]): Promise<void> {
  if (sessionId) await lockSession(tx, tenantId, sessionId);
  for (const id of [...new Set(ticketTypeIds)].sort()) await lockTicketType(tx, tenantId, id);
}

/** Methods the tenant accepts for tickets (online only; free orders need none). */
export function ticketPaymentMethods(settings: Record<string, unknown>): TicketPaymentMethod[] {
  return enabledMethods(settings).filter((m): m is TicketPaymentMethod => m === "promptpay_qr" || m === "slip");
}

export function metaOf(o: Pick<TicketOrderRow, "metadata">): TicketOrderMeta {
  return (o.metadata ?? {}) as TicketOrderMeta;
}

export async function lockOrder(tx: Tx, tenantId: string, id: string): Promise<TicketOrderRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx
    .select()
    .from(ticketOrders)
    .where(and(eq(ticketOrders.tenantId, tenantId), eq(ticketOrders.id, id)))
    .limit(1)
    .for("update");
  return row ?? null;
}

/** Payment rows of an order, locked (payments → order lock order, same as markPaid → onTicketOrderPaid). */
export async function lockOrderPayments(tx: Tx, tenantId: string, orderId: string): Promise<PaymentRow[]> {
  return tx
    .select()
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.refType, TICKET_ORDER_REF_TYPE), eq(payments.refId, orderId)))
    .orderBy(asc(payments.createdAt))
    .for("update");
}

const VOID_ON_CLOSE = ["pending", "failed"] as const;

/** Voids a closing order's unpaid payments (payments-api 3.2: runHandler false). A slip under review is left for the admin. */
export async function voidOrderPayments(tx: Tx, tenantId: string, list: PaymentRow[], reason: string): Promise<number> {
  let n = 0;
  for (const p of list) {
    if (!(VOID_ON_CLOSE as readonly string[]).includes(p.status)) continue;
    await cancelPayment(tx, tenantId, p.id, reason, { runHandler: false });
    n++;
  }
  return n;
}

/**
 * Moves ticket-type and session counters for an order's lines. `reserved` / `sold` are multipliers applied to each line's
 * qty (+1 / −1 / 0); results never go below 0.
 */
export async function applyCounters(tx: Tx, tenantId: string, order: Pick<TicketOrderRow, "lines" | "sessionId" | "quantity">, delta: { reserved?: number; sold?: number }): Promise<void> {
  const r = delta.reserved ?? 0;
  const s = delta.sold ?? 0;
  if (!r && !s) return;
  for (const line of order.lines ?? []) {
    await tx
      .update(ticketTypes)
      .set({
        reserved: sql`greatest(0, ${ticketTypes.reserved} + ${r * line.qty})`,
        sold: sql`greatest(0, ${ticketTypes.sold} + ${s * line.qty})`,
      })
      .where(and(eq(ticketTypes.tenantId, tenantId), eq(ticketTypes.id, line.ticketTypeId)));
  }
  if (order.sessionId) {
    await tx
      .update(eventSessions)
      .set({
        reserved: sql`greatest(0, ${eventSessions.reserved} + ${r * order.quantity})`,
        sold: sql`greatest(0, ${eventSessions.sold} + ${s * order.quantity})`,
      })
      .where(and(eq(eventSessions.tenantId, tenantId), eq(eventSessions.id, order.sessionId)));
  }
}

function contactPayload(o: TicketOrderRow) {
  return { customerId: o.customerId, customerName: o.contactName, customerPhone: o.contactPhone, customerEmail: o.contactEmail, phone: o.contactPhone, email: o.contactEmail, accessKey: o.accessKey };
}

/* ------------------------------------------------------------------ */
/* quote                                                                */
/* ------------------------------------------------------------------ */

function mergeLines(lines: OrderLineInput[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) {
    if (!l || !isUuid(l.ticketTypeId)) continue;
    const q = Math.floor(Number(l.qty));
    if (!Number.isFinite(q) || q <= 0) continue;
    m.set(l.ticketTypeId, (m.get(l.ticketTypeId) ?? 0) + q);
  }
  return m;
}

/** Picks the session: explicit id, or the only scheduled upcoming one; null when the event has no sessions. */
async function resolveSession(tx: Tx, tenantId: string, event: EventRow, sessionId: string | null | undefined, now: Date, bypass: boolean): Promise<Result<SessionRow | null, QuoteError>> {
  if (sessionId) {
    const s = await getSessionById(tx, tenantId, sessionId);
    if (!s || s.eventId !== event.id) return fail("session_not_found");
    if (!bypass && (s.status !== "scheduled" || s.endsAt.getTime() <= now.getTime())) return fail("session_closed");
    return ok(s);
  }
  const all = await listSessions(tx, tenantId, event.id);
  if (!all.length) return ok(null);
  const open = all.filter((s) => s.status === "scheduled" && s.endsAt.getTime() > now.getTime());
  if (open.length === 1) return ok(open[0]!);
  if (open.length === 0) return fail("session_closed");
  return fail("session_required");
}

/**
 * Prices an order without taking locks (storefront ticket picker / checkout page). Availability here is advisory;
 * createTicketOrder re-checks under the per-type locks.
 */
export async function quoteTicketOrder(tx: Tx, tenantId: string, input: QuoteInput, opts: OrderOpts): Promise<Result<Quote, QuoteError>> {
  const now = opts.now ?? new Date();
  const bypass = !!input.bypassSalesRules;
  const event = await getEventById(tx, tenantId, input.eventId);
  if (!event) return fail("event_not_found");
  if (!bypass && event.status !== "published") return fail("event_not_open");
  const sess = await resolveSession(tx, tenantId, event, input.sessionId, now, bypass);
  if (!sess.ok) return sess;
  const session = sess.value;
  const wanted = mergeLines(input.lines);
  if (!wanted.size) return fail("no_lines");
  const types = await listTicketTypes(tx, tenantId, event.id, { sessionId: session?.id });
  const byId = new Map(types.map((t) => [t.id, t]));
  const lines: TicketOrderLine[] = [];
  let quantity = 0;
  for (const [ticketTypeId, qty] of wanted) {
    const t = byId.get(ticketTypeId);
    if (!t) return fail("ticket_type_not_found");
    if (t.sessionId && session && t.sessionId !== session.id) return fail("ticket_type_not_found");
    if (!bypass) {
      if (t.salesStart && t.salesStart.getTime() > now.getTime()) return fail("sales_not_started");
      const closeAt = t.salesEnd ?? session?.endsAt ?? event.endsAt ?? null;
      if (closeAt && closeAt.getTime() <= now.getTime()) return fail("sales_closed");
      if (qty < t.minPerOrder) return fail("min_qty");
      if (qty > t.maxPerOrder) return fail("max_qty");
    }
    if (qty > ticketTypeRemaining(t)) return fail("sold_out");
    lines.push({ ticketTypeId: t.id, name: t.name, unitPrice: t.price, qty, total: t.price * qty });
    quantity += qty;
  }
  if (!bypass && quantity > opts.config.maxPerOrder) return fail("max_per_order");
  if (session && quantity > sessionRemaining(session)) return fail("capacity");
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  let promo: PromoCodeRow | null = null;
  let discount = 0;
  if (input.promoCode?.trim()) {
    const p = await checkPromoCode(tx, tenantId, input.promoCode, { eventId: event.id, subtotal, now });
    if (!p.ok) return fail("promo_invalid");
    promo = p.promo;
    discount = p.discount;
  }
  return ok({ event, session, lines, quantity, subtotal, discount, total: Math.max(0, subtotal - discount), promo });
}

/* ------------------------------------------------------------------ */
/* create                                                               */
/* ------------------------------------------------------------------ */

export interface CreateTicketOrderInput extends QuoteInput {
  customer: { id?: string | null; name: string; phone?: string | null; email?: string | null };
  /** attendee names (one per ticket; missing ones default to the contact name) */
  holders?: TicketHolderInput[];
  note?: string | null;
  paymentMethod?: TicketPaymentMethod | null;
  /** online (default) | admin */
  source?: string;
  /** admin user id when source = admin */
  actorId?: string | null;
}

export type CreateTicketOrderError = QuoteError | "login_required" | "invalid_customer" | "customer_blocked" | "payment_method";

export interface CreateTicketOrderResult {
  order: TicketOrderRow;
  accessKey: string;
  /** null for free orders */
  payment: PaymentRow | null;
  /** issued at once for free orders, otherwise [] until paid */
  tickets: TicketRow[];
  quote: Quote;
}

/**
 * Creates a ticket order: quotes, takes the session + ticket-type locks, re-checks quantities, numbers it TK-1001…,
 * attaches / creates the customer, reserves the tickets and opens the payment. Paid orders (total 0) are issued at once.
 */
export async function createTicketOrder(tx: Tx, tenantId: string, input: CreateTicketOrderInput, opts: OrderOpts): Promise<Result<CreateTicketOrderResult, CreateTicketOrderError>> {
  const now = opts.now ?? new Date();
  const first = await quoteTicketOrder(tx, tenantId, input, opts);
  if (!first.ok) return first;

  // customer
  const isAdmin = input.source === "admin";
  if (!isAdmin && !opts.config.allowGuestCheckout && !input.customer.id) return fail("login_required");
  let customerId = input.customer.id ?? null;
  if (await isCustomerBlocked(tx, tenantId, { customerId, phone: input.customer.phone, email: input.customer.email })) return fail("customer_blocked");
  if (!customerId && (input.customer.phone || input.customer.email)) {
    const guest = await upsertGuestCustomer(tx, tenantId, { phone: input.customer.phone, email: input.customer.email, name: input.customer.name });
    if (!guest) return fail("invalid_customer");
    customerId = guest.id;
  }
  if (!customerId && !isAdmin) return fail("invalid_customer");

  // payment method (decided before locking so a refusal costs nothing)
  const willBeFree = first.value.total <= 0;
  let method: TicketPaymentMethod | null = null;
  if (!willBeFree) {
    const methods = ticketPaymentMethods(opts.settings);
    if (!methods.length) return fail("payment_method");
    if (input.paymentMethod && !methods.includes(input.paymentMethod)) return fail("payment_method");
    method = input.paymentMethod ?? methods[0]!;
  }

  // lock + re-quote (fresh counters)
  await lockForLines(tx, tenantId, first.value.session?.id ?? null, first.value.lines.map((l) => l.ticketTypeId));
  const second = await quoteTicketOrder(tx, tenantId, input, opts);
  if (!second.ok) return second;
  const quote = second.value;
  const free = quote.total <= 0;

  const number = `TK-${await nextCounter(tx, tenantId, "ticket_order", 1000)}`;
  const accessKey = randomToken(16);
  const meta: TicketOrderMeta = {
    holders: (input.holders ?? []).filter((h) => h && isUuid(h.ticketTypeId) && h.name?.trim()).map((h) => ({ ticketTypeId: h.ticketTypeId, name: h.name.trim(), email: h.email?.trim() || null })),
    paymentMethod: method,
    promo: quote.promo ? { code: quote.promo.code, kind: quote.promo.kind, value: quote.promo.value } : null,
  };
  const [inserted] = await tx
    .insert(ticketOrders)
    .values({
      tenantId,
      number,
      eventId: quote.event.id,
      sessionId: quote.session?.id ?? null,
      customerId,
      contactName: input.customer.name.trim(),
      contactPhone: input.customer.phone?.trim() || null,
      contactEmail: input.customer.email?.trim() || null,
      lines: quote.lines,
      quantity: quote.quantity,
      subtotal: quote.subtotal,
      discount: quote.discount,
      total: quote.total,
      paidAmount: 0,
      status: free ? "paid" : "pending",
      source: input.source ?? "online",
      promoCode: quote.promo?.code ?? null,
      accessKey,
      note: input.note?.trim() || null,
      metadata: meta,
      holdUntil: free ? null : new Date(now.getTime() + (opts.config.holdMinutes + HOLD_GRACE_MIN) * 60_000),
      paidAt: free ? now : null,
    })
    .returning();
  let order = inserted!;

  await applyCounters(tx, tenantId, order, free ? { sold: +1 } : { reserved: +1 });

  let payment: PaymentRow | null = null;
  let tickets: TicketRow[] = [];
  if (free) {
    if (quote.promo) await tx.update(eventPromoCodes).set({ used: sql`${eventPromoCodes.used} + 1` }).where(and(eq(eventPromoCodes.tenantId, tenantId), eq(eventPromoCodes.id, quote.promo.id)));
    tickets = await issueTicketsForOrder(tx, tenantId, order);
    await emitEvent(tx, {
      tenantId,
      type: "ticket_order.paid",
      payload: { orderId: order.id, number, eventId: quote.event.id, eventTitle: quote.event.title, sessionId: order.sessionId, sessionStartsAt: quote.session?.startsAt ?? null, quantity: order.quantity, total: order.total, amount: 0, paymentId: null, ticketCodes: tickets.map((t) => t.code), ...contactPayload(order) },
    });
  } else {
    payment = await createPayment(tx, tenantId, {
      refType: TICKET_ORDER_REF_TYPE,
      refId: order.id,
      amount: order.total,
      provider: PROVIDER_FOR[method!],
      method: method!,
      customerId,
      promptpayId: resolvePromptpayId(opts.settings) ?? undefined,
      expiresMinutes: opts.config.holdMinutes,
      metadata: { orderNumber: number, eventTitle: quote.event.title, sessionId: order.sessionId },
    });
    await tx.update(ticketOrders).set({ paymentId: payment.id }).where(and(eq(ticketOrders.tenantId, tenantId), eq(ticketOrders.id, order.id)));
    order = { ...order, paymentId: payment.id };
    await emitEvent(tx, {
      tenantId,
      type: "ticket_order.created",
      payload: { orderId: order.id, number, eventId: quote.event.id, eventTitle: quote.event.title, sessionId: order.sessionId, sessionStartsAt: quote.session?.startsAt ?? null, quantity: order.quantity, total: order.total, amount: order.total, paymentId: payment.id, paymentMethod: method, holdMinutes: opts.config.holdMinutes, ...contactPayload(order) },
    });
  }
  if (isAdmin) await audit(tx, { tenantId, actorType: "user", actorId: input.actorId ?? null, action: "ticket_order.create", targetType: "ticket_order", targetId: order.id, diff: { number, total: order.total, quantity: order.quantity } });
  return ok({ order, accessKey, payment, tickets, quote });
}

/**
 * Fresh payment for a pending order whose QR expired / slip was rejected. The reservation is still held while the order
 * is pending, so no re-check is needed; old open payments are voided and the hold is extended.
 */
export async function renewOrderPayment(tx: Tx, tenantId: string, orderId: string, method: TicketPaymentMethod | null, opts: OrderOpts): Promise<Result<{ order: TicketOrderRow; payment: PaymentRow }, "not_found" | "not_pending" | "payment_method">> {
  const now = opts.now ?? new Date();
  const list = await lockOrderPayments(tx, tenantId, orderId);
  const order = await lockOrder(tx, tenantId, orderId);
  if (!order) return fail("not_found");
  if (order.status !== "pending" || order.total <= 0) return fail("not_pending");
  if (list.some((p) => p.status === "pending_verification")) return fail("not_pending");
  const methods = ticketPaymentMethods(opts.settings);
  if (!methods.length) return fail("payment_method");
  const m: TicketPaymentMethod = method && methods.includes(method) ? method : methods[0]!;
  await voidOrderPayments(tx, tenantId, list, "ออกรายการชำระเงินใหม่");
  const holdUntil = new Date(now.getTime() + (opts.config.holdMinutes + HOLD_GRACE_MIN) * 60_000);
  const event = await getEventById(tx, tenantId, order.eventId);
  const payment = await createPayment(tx, tenantId, {
    refType: TICKET_ORDER_REF_TYPE,
    refId: order.id,
    amount: order.total,
    provider: PROVIDER_FOR[m],
    method: m,
    customerId: order.customerId,
    promptpayId: resolvePromptpayId(opts.settings) ?? undefined,
    expiresMinutes: opts.config.holdMinutes,
    metadata: { orderNumber: order.number, eventTitle: event?.title ?? null, sessionId: order.sessionId },
  });
  await tx
    .update(ticketOrders)
    .set({ holdUntil, paymentId: payment.id, metadata: { ...metaOf(order), paymentMethod: m } })
    .where(and(eq(ticketOrders.tenantId, tenantId), eq(ticketOrders.id, order.id)));
  return ok({ order: { ...order, holdUntil, paymentId: payment.id }, payment });
}

/* ------------------------------------------------------------------ */
/* cancel (unpaid)                                                      */
/* ------------------------------------------------------------------ */

export type CancelOrderError = "not_found" | "not_pending";

/** Customer / admin / system cancels a pending order: reservation released, open payments voided, event emitted. */
export async function cancelUnpaidOrder(tx: Tx, tenantId: string, orderId: string, input: { by: "customer" | "admin" | "system"; reason?: string | null; actorId?: string | null; now?: Date }): Promise<Result<TicketOrderRow, CancelOrderError>> {
  const list = await lockOrderPayments(tx, tenantId, orderId);
  const order = await lockOrder(tx, tenantId, orderId);
  if (!order) return fail("not_found");
  if (order.status !== "pending") return fail("not_pending");
  const now = input.now ?? new Date();
  const reason = input.reason?.trim() || (input.by === "customer" ? "ลูกค้ายกเลิก" : input.by === "admin" ? "ผู้ดูแลยกเลิก" : "ระบบยกเลิก");
  await applyCounters(tx, tenantId, order, { reserved: -1 });
  const [row] = await tx
    .update(ticketOrders)
    .set({ status: "cancelled", cancelledAt: now, cancelledBy: input.by, cancelReason: reason, holdUntil: null })
    .where(and(eq(ticketOrders.tenantId, tenantId), eq(ticketOrders.id, order.id)))
    .returning();
  await voidOrderPayments(tx, tenantId, list, reason);
  if (input.by === "admin") await audit(tx, { tenantId, actorType: "user", actorId: input.actorId ?? null, action: "ticket_order.cancel", targetType: "ticket_order", targetId: order.id, diff: { number: order.number, reason } });
  await emitEvent(tx, { tenantId, type: "ticket_order.cancelled", payload: { orderId: order.id, number: order.number, eventId: order.eventId, by: input.by, reason, quantity: order.quantity, total: order.total, ...contactPayload(order) } });
  return ok(row!);
}

/**
 * Pending orders whose hold lapsed but whose payment can no longer expire on its own (slip rejected → `failed`, or no
 * payment row at all): releases them. The payment sweep already handles `pending` payments through the closed hook.
 * Returns the number of orders released. Safe to call from an admin page load or the worker.
 */
export async function releaseLapsedHolds(tx: Tx, tenantId: string, now: Date = new Date()): Promise<number> {
  const stale = await tx
    .select({ id: ticketOrders.id, paymentId: ticketOrders.paymentId })
    .from(ticketOrders)
    .where(and(eq(ticketOrders.tenantId, tenantId), eq(ticketOrders.status, "pending"), lt(ticketOrders.holdUntil, now)))
    .limit(200);
  let n = 0;
  for (const s of stale) {
    const p = s.paymentId ? await getPayment(tx, tenantId, s.paymentId) : null;
    if (p && (p.status === "pending" || p.status === "pending_verification")) continue; // the sweep / admin decides
    const r = await cancelUnpaidOrder(tx, tenantId, s.id, { by: "system", reason: "หมดเวลาชำระเงิน", now });
    if (r.ok) n++;
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* payment hooks (registered in register.ts)                            */
/* ------------------------------------------------------------------ */

/**
 * registerPaymentHandler("ticket_order") – money arrived: a pending order becomes paid and its tickets are issued. An
 * expired order is revived when its tickets are still available (late payment), otherwise the money is flagged for a refund.
 */
export async function onTicketOrderPaid(tx: Tx, payment: PaymentRow): Promise<PaymentPaidResult> {
  const tenantId = payment.tenantId;
  const order = await lockOrder(tx, tenantId, payment.refId);
  if (!order) return refundRequired("ไม่พบคำสั่งซื้อบัตร");
  if (order.status === "cancelled") return refundRequired("คำสั่งซื้อถูกยกเลิกแล้ว");
  if (order.status === "refunded") return refundRequired("คำสั่งซื้อนี้คืนเงินแล้ว");
  if (order.status === "paid") return order.paymentId === payment.id ? undefined : refundRequired("ชำระซ้ำ");
  if (payment.amount < order.total) return refundRequired(`ยอดชำระไม่ครบ (ได้รับ ${payment.amount} จาก ${order.total} สตางค์)`);

  if (order.status === "expired") {
    // the reservation was released: take the locks and re-check before reviving
    await lockForLines(tx, tenantId, order.sessionId, order.lines.map((l) => l.ticketTypeId));
    const types = await tx.select().from(ticketTypes).where(and(eq(ticketTypes.tenantId, tenantId), inArray(ticketTypes.id, order.lines.map((l) => l.ticketTypeId))));
    for (const l of order.lines) {
      const t = types.find((x) => x.id === l.ticketTypeId);
      if (!t || l.qty > ticketTypeRemaining(t)) return refundRequired("บัตรหมดแล้ว (ชำระหลังหมดเวลา)");
    }
    if (order.sessionId) {
      const s = await getSessionById(tx, tenantId, order.sessionId);
      if (!s || s.status !== "scheduled") return refundRequired("รอบถูกยกเลิกแล้ว");
      if (order.quantity > sessionRemaining(s)) return refundRequired("ที่นั่งของรอบนี้เต็มแล้ว (ชำระหลังหมดเวลา)");
    }
    await applyCounters(tx, tenantId, order, { sold: +1 });
  } else {
    await applyCounters(tx, tenantId, order, { reserved: -1, sold: +1 });
  }
  const now = new Date();
  const [row] = await tx
    .update(ticketOrders)
    .set({ status: "paid", paidAt: now, paidAmount: payment.amount, paymentId: payment.id, holdUntil: null, cancelledAt: null, cancelReason: null, cancelledBy: null })
    .where(and(eq(ticketOrders.tenantId, tenantId), eq(ticketOrders.id, order.id)))
    .returning();
  const paid = row!;
  if (paid.promoCode) await tx.update(eventPromoCodes).set({ used: sql`${eventPromoCodes.used} + 1` }).where(and(eq(eventPromoCodes.tenantId, tenantId), eq(eventPromoCodes.code, paid.promoCode)));
  const tickets = await issueTicketsForOrder(tx, tenantId, paid);
  const [event] = await tx.select({ title: events.title }).from(events).where(and(eq(events.tenantId, tenantId), eq(events.id, paid.eventId))).limit(1);
  const session = paid.sessionId ? await getSessionById(tx, tenantId, paid.sessionId) : null;
  await emitEvent(tx, {
    tenantId,
    type: "ticket_order.paid",
    payload: { orderId: paid.id, number: paid.number, eventId: paid.eventId, eventTitle: event?.title ?? null, sessionId: paid.sessionId, sessionStartsAt: session?.startsAt ?? null, quantity: paid.quantity, total: paid.total, amount: payment.amount, paymentId: payment.id, ticketCodes: tickets.map((t) => t.code), ...contactPayload(paid) },
  });
  return undefined;
}

/** registerPaymentClosedHandler("ticket_order") – an unpaid payment expired / was cancelled: release the pending order. */
export async function onTicketOrderPaymentClosed(tx: Tx, payment: PaymentRow, info: PaymentClosedInfo): Promise<void> {
  const tenantId = payment.tenantId;
  const order = await lockOrder(tx, tenantId, payment.refId);
  if (!order || order.status !== "pending") return;
  if (order.paymentId && order.paymentId !== payment.id) return; // superseded by a renewed payment
  const expired = info.status === "expired";
  const reason = expired ? "หมดเวลาชำระเงิน" : info.reason || "ยกเลิกรายการชำระเงิน";
  await applyCounters(tx, tenantId, order, { reserved: -1 });
  await tx
    .update(ticketOrders)
    .set({ status: expired ? "expired" : "cancelled", cancelledAt: new Date(), cancelledBy: "system", cancelReason: reason, holdUntil: null })
    .where(and(eq(ticketOrders.tenantId, tenantId), eq(ticketOrders.id, order.id)));
  await emitEvent(tx, { tenantId, type: expired ? "ticket_order.expired" : "ticket_order.cancelled", payload: { orderId: order.id, number: order.number, eventId: order.eventId, by: "system", reason, quantity: order.quantity, total: order.total, ...contactPayload(order) } });
}

/** registerPaymentTargetCheck("ticket_order") – reason the money can no longer be applied (payments-api 3.1). Expired orders may still be revived. */
export async function ticketOrderClosedReason(tx: Tx, payment: PaymentRow): Promise<string | null> {
  const [o] = await tx.select({ status: ticketOrders.status }).from(ticketOrders).where(and(eq(ticketOrders.tenantId, payment.tenantId), eq(ticketOrders.id, payment.refId))).limit(1);
  if (!o) return null;
  if (o.status === "cancelled") return "คำสั่งซื้อถูกยกเลิกแล้ว";
  if (o.status === "refunded") return "คำสั่งซื้อนี้คืนเงินแล้ว";
  return null;
}

/** registerPaymentAccessCheck("ticket_order") – the order's owner or the holder of its access key may see / pay it. */
export async function ticketOrderPaymentAccess(tx: Tx, payment: PaymentRow, proof: PaymentAccessProof): Promise<PaymentAccessVia | false | null> {
  const [o] = await tx.select({ customerId: ticketOrders.customerId, accessKey: ticketOrders.accessKey }).from(ticketOrders).where(and(eq(ticketOrders.tenantId, payment.tenantId), eq(ticketOrders.id, payment.refId))).limit(1);
  if (!o) return false;
  if (proof.customerId && o.customerId && proof.customerId === o.customerId) return "customer";
  if (proof.accessKey && safeEqual(proof.accessKey, o.accessKey)) return "access_key";
  return false;
}

/* ------------------------------------------------------------------ */
/* reads                                                                */
/* ------------------------------------------------------------------ */

export interface OrderDetail {
  order: TicketOrderRow;
  event: Pick<EventRow, "id" | "title" | "slug" | "cover" | "venueName" | "venueAddress" | "venueMapUrl" | "organizer" | "status">;
  session: SessionRow | null;
  tickets: TicketRow[];
  /** the order's current payment */
  payment: PaymentRow | null;
  /** how the caller was authorised */
  via: "customer" | "access_key" | "admin";
}

async function loadDetail(tx: Tx, tenantId: string, order: TicketOrderRow, via: OrderDetail["via"]): Promise<OrderDetail> {
  const [event] = await tx
    .select({ id: events.id, title: events.title, slug: events.slug, cover: events.cover, venueName: events.venueName, venueAddress: events.venueAddress, venueMapUrl: events.venueMapUrl, organizer: events.organizer, status: events.status })
    .from(events)
    .where(and(eq(events.tenantId, tenantId), eq(events.id, order.eventId)))
    .limit(1);
  const [session, tickets, payment] = await Promise.all([
    order.sessionId ? getSessionById(tx, tenantId, order.sessionId) : Promise.resolve(null),
    listTicketsForOrder(tx, tenantId, order.id),
    order.paymentId ? getPayment(tx, tenantId, order.paymentId) : Promise.resolve(null),
  ]);
  return { order, event: event!, session, tickets, payment, via };
}

/** Storefront order page: the owner (signed-in customer) or anyone with the access key (?k=). */
export async function getOrderForCustomer(tx: Tx, tenantId: string, id: string, who: { customerId?: string | null; key?: string | null }): Promise<OrderDetail | null> {
  if (!isUuid(id)) return null;
  const [order] = await tx.select().from(ticketOrders).where(and(eq(ticketOrders.tenantId, tenantId), eq(ticketOrders.id, id))).limit(1);
  if (!order) return null;
  const keyOk = !!who.key && safeEqual(who.key, order.accessKey);
  const ownerOk = !!who.customerId && !!order.customerId && who.customerId === order.customerId;
  if (!keyOk && !ownerOk) return null;
  return loadDetail(tx, tenantId, order, ownerOk ? "customer" : "access_key");
}

/** Admin order page. */
export async function getOrderAdmin(tx: Tx, tenantId: string, id: string): Promise<(OrderDetail & { payments: PaymentRow[] }) | null> {
  if (!isUuid(id)) return null;
  const [order] = await tx.select().from(ticketOrders).where(and(eq(ticketOrders.tenantId, tenantId), eq(ticketOrders.id, id))).limit(1);
  if (!order) return null;
  const detail = await loadDetail(tx, tenantId, order, "admin");
  const list = await tx
    .select()
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.refType, TICKET_ORDER_REF_TYPE), eq(payments.refId, order.id)))
    .orderBy(desc(payments.createdAt));
  return { ...detail, payments: list };
}

export interface OrderListItem {
  order: TicketOrderRow;
  event: { id: string; title: string; slug: string; cover: string | null; venueName: string | null; status: string };
  session: { id: string; name: string | null; startsAt: Date; endsAt: Date; status: string } | null;
}

const listSelect = {
  order: ticketOrders,
  eventId: events.id,
  eventTitle: events.title,
  eventSlug: events.slug,
  eventCover: events.cover,
  eventVenue: events.venueName,
  eventStatus: events.status,
  sessionId: eventSessions.id,
  sessionName: eventSessions.name,
  sessionStarts: eventSessions.startsAt,
  sessionEnds: eventSessions.endsAt,
  sessionStatus: eventSessions.status,
};

function toListItem(r: { order: TicketOrderRow; eventId: string; eventTitle: string; eventSlug: string; eventCover: string | null; eventVenue: string | null; eventStatus: string; sessionId: string | null; sessionName: string | null; sessionStarts: Date | null; sessionEnds: Date | null; sessionStatus: string | null }): OrderListItem {
  return {
    order: r.order,
    event: { id: r.eventId, title: r.eventTitle, slug: r.eventSlug, cover: r.eventCover, venueName: r.eventVenue, status: r.eventStatus },
    session: r.sessionId ? { id: r.sessionId, name: r.sessionName, startsAt: r.sessionStarts!, endsAt: r.sessionEnds!, status: r.sessionStatus! } : null,
  };
}

/** Account page: the customer's orders. upcoming = paid/pending for sessions (or events) not yet ended; past = the rest. */
export async function listCustomerOrders(tx: Tx, tenantId: string, customerId: string, opts: { scope?: "upcoming" | "past" | "all"; limit?: number; now?: Date } = {}): Promise<OrderListItem[]> {
  if (!isUuid(customerId)) return [];
  const now = opts.now ?? new Date();
  const scope = opts.scope ?? "all";
  const where = [eq(ticketOrders.tenantId, tenantId), eq(ticketOrders.customerId, customerId)];
  const endsAt = sql`coalesce(${eventSessions.endsAt}, ${events.endsAt})`;
  // a raw SQL operand gets no column mapper, so the Date must be bound as a typed parameter (postgres-js rejects a bare Date)
  const nowTs = sql`${now.toISOString()}::timestamptz`;
  if (scope === "upcoming") where.push(inArray(ticketOrders.status, ["pending", "paid"]), or(sql`${endsAt} is null`, gte(endsAt, nowTs))!);
  if (scope === "past") where.push(or(inArray(ticketOrders.status, ["cancelled", "refunded", "expired"]), lt(endsAt, nowTs))!);
  const q = tx
    .select(listSelect)
    .from(ticketOrders)
    .innerJoin(events, eq(events.id, ticketOrders.eventId))
    .leftJoin(eventSessions, eq(eventSessions.id, ticketOrders.sessionId))
    .where(and(...where))
    .orderBy(scope === "past" ? desc(ticketOrders.createdAt) : sql`${endsAt} asc nulls last`, desc(ticketOrders.createdAt));
  const rows = await (opts.limit ? q.limit(opts.limit) : q);
  return rows.map(toListItem);
}

export interface OrderListFilter {
  eventId?: string | null;
  sessionId?: string | null;
  status?: TicketOrderStatus | TicketOrderStatus[] | null;
  /** number / contact name / phone / e-mail */
  q?: string | null;
  page?: number;
  pageSize?: number;
}

/** Admin orders list (paged, newest first). */
export async function listOrders(tx: Tx, tenantId: string, f: OrderListFilter = {}): Promise<{ items: OrderListItem[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 25));
  const where = [eq(ticketOrders.tenantId, tenantId)];
  if (f.eventId) where.push(eq(ticketOrders.eventId, f.eventId));
  if (f.sessionId) where.push(eq(ticketOrders.sessionId, f.sessionId));
  if (f.status) where.push(Array.isArray(f.status) ? inArray(ticketOrders.status, f.status) : eq(ticketOrders.status, f.status));
  if (f.q?.trim()) {
    const like = `%${f.q.trim().replace(/[%_]/g, "")}%`;
    where.push(or(ilike(ticketOrders.number, like), ilike(ticketOrders.contactName, like), ilike(ticketOrders.contactPhone, like), ilike(ticketOrders.contactEmail, like))!);
  }
  const [[c], rows] = await Promise.all([
    tx
      .select({ n: count() })
      .from(ticketOrders)
      .where(and(...where)),
    tx
      .select(listSelect)
      .from(ticketOrders)
      .innerJoin(events, eq(events.id, ticketOrders.eventId))
      .leftJoin(eventSessions, eq(eventSessions.id, ticketOrders.sessionId))
      .where(and(...where))
      .orderBy(desc(ticketOrders.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);
  return { items: rows.map(toListItem), total: Number(c?.n ?? 0), page, pageSize };
}

/** Counts for admin badges / dashboards. */
export async function orderStats(tx: Tx, tenantId: string, opts: { eventId?: string | null } = {}): Promise<{ pending: number; paid: number; revenue: number; ticketsSold: number }> {
  const where = [eq(ticketOrders.tenantId, tenantId)];
  if (opts.eventId) where.push(eq(ticketOrders.eventId, opts.eventId));
  const rows = await tx
    .select({ status: ticketOrders.status, n: count(), revenue: sql<string>`coalesce(sum(${ticketOrders.paidAmount} - ${ticketOrders.refundedAmount}), 0)`, qty: sql<string>`coalesce(sum(${ticketOrders.quantity}), 0)` })
    .from(ticketOrders)
    .where(and(...where))
    .groupBy(ticketOrders.status);
  const out = { pending: 0, paid: 0, revenue: 0, ticketsSold: 0 };
  for (const r of rows) {
    if (r.status === "pending") out.pending = Number(r.n);
    if (r.status === "paid") {
      out.paid = Number(r.n);
      out.ticketsSold = Number(r.qty);
    }
    if (r.status === "paid" || r.status === "refunded") out.revenue += Number(r.revenue);
  }
  return out;
}

/** Admin note on an order. */
export async function setOrderInternalNote(tx: Tx, tenantId: string, orderId: string, note: string | null): Promise<void> {
  if (!isUuid(orderId)) return;
  await tx
    .update(ticketOrders)
    .set({ internalNote: note?.trim() || null })
    .where(and(eq(ticketOrders.tenantId, tenantId), eq(ticketOrders.id, orderId)));
}

export { voidTicketsForOrder };
