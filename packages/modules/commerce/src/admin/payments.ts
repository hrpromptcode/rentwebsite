import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { bookings, customers, diningTables, orders, payments, reservations, restaurantOrders, tableSessions, topupOrders, type Tx } from "@rentweb/db";
import { paymentRefundRequired } from "@rentweb/core/payments";

export type PaymentQueueTab = "pending_verification" | "paid" | "failed";

export interface PaymentQueueRow {
  id: string;
  refType: string;
  refId: string;
  /** human number / label of the referenced record (#1001, BK-1001, "บิลโต๊ะ A3"…) when known */
  refNumber: string | null;
  /** admin route (relative to /t/{slug}) for the referenced record */
  refHref: string | null;
  /** markPaid flagged the money for a manual refund (late / duplicate payment), payments-api.md 3.1 */
  refundRequired: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  provider: string;
  method: string;
  status: string;
  amount: number;
  refundedAmount: number;
  slipUrl: string | null;
  slipTransRef: string | null;
  failureReason: string | null;
  verifiedBy: string | null;
  paidAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** YYYY-MM-DD in Asia/Bangkok (the restaurant admin pages filter by local day). */
function bangkokYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Admin route for the referenced record. Restaurant orders and reservations have no detail route (AM-01):
 * orders open the history view filtered to the order's day and number, reservations the day view.
 */
export function refHrefFor(refType: string, refId: string, ctx: { number?: string | null; at?: Date | null } = {}): string | null {
  switch (refType) {
    case "order":
      return `/orders/${refId}`;
    case "booking":
      return `/bookings/${refId}`;
    case "topup":
      return `/topup/orders/${refId}`;
    case "wallet_topup":
      return `/topup/wallets`;
    case "rest_order": {
      if (!ctx.at) return "/restaurant/orders";
      const day = bangkokYmd(ctx.at);
      const q = ctx.number ? `&q=${encodeURIComponent(ctx.number)}` : "";
      return `/restaurant/orders?tab=history&from=${day}&to=${day}${q}`;
    }
    case "reservation":
      return ctx.at ? `/restaurant/reservations?date=${bangkokYmd(ctx.at)}` : "/restaurant/reservations";
    default:
      return null;
  }
}

interface RefInfo {
  number: string | null;
  href: string | null;
}

async function refInfo(tx: Tx, tenantId: string, rows: Array<{ refType: string; refId: string }>): Promise<Map<string, RefInfo>> {
  const map = new Map<string, RefInfo>();
  const byType = new Map<string, string[]>();
  for (const r of rows) byType.set(r.refType, [...(byType.get(r.refType) ?? []), r.refId]);
  const ids = (t: string) => [...new Set(byType.get(t) ?? [])];
  const put = (type: string, id: string, number: string | null, at?: Date | null) => map.set(`${type}:${id}`, { number, href: refHrefFor(type, id, { number, at }) });
  if (ids("order").length) for (const x of await tx.select({ id: orders.id, number: orders.number }).from(orders).where(and(eq(orders.tenantId, tenantId), inArray(orders.id, ids("order"))))) put("order", x.id, x.number);
  if (ids("booking").length) for (const x of await tx.select({ id: bookings.id, number: bookings.number }).from(bookings).where(and(eq(bookings.tenantId, tenantId), inArray(bookings.id, ids("booking"))))) put("booking", x.id, x.number);
  if (ids("topup").length) for (const x of await tx.select({ id: topupOrders.id, number: topupOrders.number }).from(topupOrders).where(and(eq(topupOrders.tenantId, tenantId), inArray(topupOrders.id, ids("topup"))))) put("topup", x.id, x.number);
  if (ids("rest_order").length) {
    const restIds = ids("rest_order");
    const single = await tx.select({ id: restaurantOrders.id, number: restaurantOrders.number, at: restaurantOrders.placedAt }).from(restaurantOrders).where(and(eq(restaurantOrders.tenantId, tenantId), inArray(restaurantOrders.id, restIds)));
    for (const x of single) put("rest_order", x.id, x.number, x.at);
    // table bills: the payment references the table session (refId = table_sessions.id)
    const rest = restIds.filter((id) => !single.some((s) => s.id === id));
    if (rest.length) {
      const sessions = await tx
        .select({ id: tableSessions.id, table: diningTables.name, at: tableSessions.openedAt })
        .from(tableSessions)
        .leftJoin(diningTables, and(eq(diningTables.tenantId, tenantId), eq(diningTables.id, tableSessions.tableId)))
        .where(and(eq(tableSessions.tenantId, tenantId), inArray(tableSessions.id, rest)));
      for (const s of sessions) map.set(`rest_order:${s.id}`, { number: `บิลโต๊ะ ${s.table ?? "?"}`, href: refHrefFor("rest_order", s.id, { at: s.at }) });
    }
  }
  if (ids("reservation").length) for (const x of await tx.select({ id: reservations.id, number: reservations.number, at: reservations.startsAt }).from(reservations).where(and(eq(reservations.tenantId, tenantId), inArray(reservations.id, ids("reservation"))))) put("reservation", x.id, x.number, x.at);
  return map;
}

/** Cross-module verification queue: pending slips first (oldest waiting on top), or recent paid / failed. */
export async function paymentsQueue(tx: Tx, tenantId: string, f: { tab?: PaymentQueueTab; page?: number; perPage?: number; refType?: string | null } = {}): Promise<{ rows: PaymentQueueRow[]; total: number; page: number; pages: number }> {
  const tab = f.tab ?? "pending_verification";
  const perPage = Math.min(100, Math.max(1, f.perPage ?? 20));
  const page = Math.max(1, f.page ?? 1);
  const conds = [eq(payments.tenantId, tenantId), tab === "failed" ? inArray(payments.status, ["failed", "expired", "cancelled"]) : eq(payments.status, tab)];
  if (f.refType) conds.push(eq(payments.refType, f.refType));
  const where = and(...conds);
  const [rows, [c]] = await Promise.all([
    tx
      .select({ p: payments, customerName: customers.name, customerPhone: customers.phone })
      .from(payments)
      .leftJoin(customers, and(eq(customers.tenantId, tenantId), eq(customers.id, payments.customerId)))
      .where(where)
      .orderBy(tab === "pending_verification" ? desc(payments.updatedAt) : desc(sql`coalesce(${payments.paidAt}, ${payments.updatedAt})`))
      .limit(perPage)
      .offset((page - 1) * perPage),
    tx.select({ c: count() }).from(payments).where(where),
  ]);
  const refs = await refInfo(
    tx,
    tenantId,
    rows.map((r) => ({ refType: r.p.refType, refId: r.p.refId })),
  );
  const total = Number(c?.c ?? 0);
  return {
    rows: rows.map(({ p, customerName, customerPhone }) => {
      const ref = refs.get(`${p.refType}:${p.refId}`);
      return {
        id: p.id,
        refType: p.refType,
        refId: p.refId,
        refNumber: ref?.number ?? null,
        refHref: ref?.href ?? refHrefFor(p.refType, p.refId),
        refundRequired: p.status === "paid" || p.status === "partially_refunded" ? paymentRefundRequired(p) : null,
        customerId: p.customerId,
        customerName,
        customerPhone,
        provider: p.provider,
        method: p.method,
        status: p.status,
        amount: p.amount,
        refundedAmount: p.refundedAmount,
        slipUrl: p.slipUrl,
        slipTransRef: p.slipTransRef,
        failureReason: p.failureReason,
        verifiedBy: p.verifiedBy,
        paidAt: p.paidAt,
        expiresAt: p.expiresAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    }),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function paymentQueueCounts(tx: Tx, tenantId: string): Promise<Record<PaymentQueueTab, number>> {
  const [r] = await tx
    .select({
      pending: sql<number>`count(*) filter (where ${payments.status} = 'pending_verification')::int`,
      paid: sql<number>`count(*) filter (where ${payments.status} = 'paid')::int`,
      failed: sql<number>`count(*) filter (where ${payments.status} in ('failed','expired','cancelled'))::int`,
    })
    .from(payments)
    .where(eq(payments.tenantId, tenantId));
  return { pending_verification: Number(r?.pending ?? 0), paid: Number(r?.paid ?? 0), failed: Number(r?.failed ?? 0) };
}
