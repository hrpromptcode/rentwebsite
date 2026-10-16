import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { bookings, customers, orders, payments, reservations, restaurantOrders, topupOrders, type Tx } from "@rentweb/db";

export type PaymentQueueTab = "pending_verification" | "paid" | "failed";

export interface PaymentQueueRow {
  id: string;
  refType: string;
  refId: string;
  /** human number of the referenced record (#1001, BK-1001…) when known */
  refNumber: string | null;
  /** admin route (relative to /t/{slug}) for the referenced record */
  refHref: string | null;
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

export function refHrefFor(refType: string, refId: string): string | null {
  switch (refType) {
    case "order":
      return `/orders/${refId}`;
    case "booking":
      return `/bookings/${refId}`;
    case "topup":
      return `/topup/orders/${refId}`;
    case "wallet_topup":
      return `/topup/wallets`;
    case "rest_order":
      return `/restaurant/orders/${refId}`;
    case "reservation":
      return `/restaurant/reservations/${refId}`;
    default:
      return null;
  }
}

async function refNumbers(tx: Tx, tenantId: string, rows: Array<{ refType: string; refId: string }>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const byType = new Map<string, string[]>();
  for (const r of rows) byType.set(r.refType, [...(byType.get(r.refType) ?? []), r.refId]);
  const put = (type: string, list: Array<{ id: string; number: string }>) => list.forEach((x) => map.set(`${type}:${x.id}`, x.number));
  const ids = (t: string) => [...new Set(byType.get(t) ?? [])];
  if (ids("order").length) put("order", await tx.select({ id: orders.id, number: orders.number }).from(orders).where(and(eq(orders.tenantId, tenantId), inArray(orders.id, ids("order")))));
  if (ids("booking").length) put("booking", await tx.select({ id: bookings.id, number: bookings.number }).from(bookings).where(and(eq(bookings.tenantId, tenantId), inArray(bookings.id, ids("booking")))));
  if (ids("topup").length) put("topup", await tx.select({ id: topupOrders.id, number: topupOrders.number }).from(topupOrders).where(and(eq(topupOrders.tenantId, tenantId), inArray(topupOrders.id, ids("topup")))));
  if (ids("rest_order").length) put("rest_order", await tx.select({ id: restaurantOrders.id, number: restaurantOrders.number }).from(restaurantOrders).where(and(eq(restaurantOrders.tenantId, tenantId), inArray(restaurantOrders.id, ids("rest_order")))));
  if (ids("reservation").length) put("reservation", await tx.select({ id: reservations.id, number: reservations.number }).from(reservations).where(and(eq(reservations.tenantId, tenantId), inArray(reservations.id, ids("reservation")))));
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
      .leftJoin(customers, eq(customers.id, payments.customerId))
      .where(where)
      .orderBy(tab === "pending_verification" ? desc(payments.updatedAt) : desc(sql`coalesce(${payments.paidAt}, ${payments.updatedAt})`))
      .limit(perPage)
      .offset((page - 1) * perPage),
    tx.select({ c: count() }).from(payments).where(where),
  ]);
  const numbers = await refNumbers(
    tx,
    tenantId,
    rows.map((r) => ({ refType: r.p.refType, refId: r.p.refId })),
  );
  const total = Number(c?.c ?? 0);
  return {
    rows: rows.map(({ p, customerName, customerPhone }) => ({
      id: p.id,
      refType: p.refType,
      refId: p.refId,
      refNumber: numbers.get(`${p.refType}:${p.refId}`) ?? null,
      refHref: refHrefFor(p.refType, p.refId),
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
    })),
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
