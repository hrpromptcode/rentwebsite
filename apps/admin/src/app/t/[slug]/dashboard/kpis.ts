/**
 * Dashboard KPI queries (no Next/server-only imports so tooling scripts can run them against a DB).
 * Each module contributes its own figures; "pending slips" is module-agnostic and counts what the
 * /payments queue shows: payments in pending_verification for any ref type (order, booking, top-up,
 * restaurant order, reservation deposit…).
 */
import { and, bookings, count, customers, eq, games, gte, inArray, lt, menuItems, orders, products, reservations, restaurantOrders, services, sql, sum, tableSessions, topupOrders, type Tx } from "@rentweb/db";
import { paymentQueueCounts } from "@rentweb/module-commerce/admin";

export interface Kpis {
  ordersToday: number | null;
  revenueToday: number | null; // satang
  /** payments awaiting slip verification, all modules (same number as the /payments queue) */
  pendingSlips: number | null;
  bookingsToday: number | null;
  topupsToday: number | null;
  topupQueue: number | null;
  /** restaurant: orders placed today (not cancelled) */
  restOrdersToday: number | null;
  /** restaurant: tables with an open / bill-requested session */
  openTables: number | null;
  /** restaurant: reservations starting today (not cancelled / no-show) */
  reservationsToday: number | null;
  newCustomers7d: number;
}

/** Modules whose flows create payments that can wait for slip verification. */
export const PAYMENT_MODULES = ["commerce", "booking", "topup", "restaurant"] as const;

const num = (v: unknown) => Number(v ?? 0);

export async function computeKpis(
  tx: Tx,
  input: { tenantId: string; modules: readonly string[]; today: Date; tomorrow: Date; since7: Date; createdCutoff: Date },
): Promise<{ kpis: Kpis; realItem: boolean }> {
  const { tenantId, modules, today, tomorrow, since7, createdCutoff } = input;
  const hasCommerce = modules.includes("commerce");
  const hasBooking = modules.includes("booking");
  const hasTopup = modules.includes("topup");
  const hasRestaurant = modules.includes("restaurant");
  const k: Kpis = { ordersToday: null, revenueToday: null, pendingSlips: null, bookingsToday: null, topupsToday: null, topupQueue: null, restOrdersToday: null, openTables: null, reservationsToday: null, newCustomers7d: 0 };
  let realItem = false;
  const addRevenue = (v: number) => {
    k.revenueToday = (k.revenueToday ?? 0) + v;
  };

  if (hasCommerce) {
    const [o] = await tx.select({ c: count() }).from(orders).where(and(eq(orders.tenantId, tenantId), gte(orders.placedAt, today), lt(orders.placedAt, tomorrow)));
    k.ordersToday = num(o?.c);
    const [paid] = await tx
      .select({ s: sum(orders.total) })
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), gte(orders.placedAt, today), lt(orders.placedAt, tomorrow), eq(orders.paymentStatus, "paid")));
    addRevenue(num(paid?.s));
    const [p] = await tx.select({ c: count() }).from(products).where(and(eq(products.tenantId, tenantId), gte(products.createdAt, createdCutoff)));
    realItem ||= num(p?.c) > 0;
  }
  if (hasRestaurant) {
    const [o] = await tx
      .select({
        c: sql<number>`count(*) filter (where ${restaurantOrders.status} <> 'cancelled')::int`,
        paid: sql<number>`coalesce(sum(${restaurantOrders.total}) filter (where ${restaurantOrders.paymentStatus} = 'paid' and ${restaurantOrders.status} <> 'cancelled'), 0)::bigint`,
      })
      .from(restaurantOrders)
      .where(and(eq(restaurantOrders.tenantId, tenantId), gte(restaurantOrders.placedAt, today), lt(restaurantOrders.placedAt, tomorrow)));
    k.restOrdersToday = num(o?.c);
    addRevenue(num(o?.paid));
    const [t] = await tx
      .select({ c: sql<number>`count(distinct ${tableSessions.tableId})::int` })
      .from(tableSessions)
      .where(and(eq(tableSessions.tenantId, tenantId), inArray(tableSessions.status, ["open", "bill_requested"])));
    k.openTables = num(t?.c);
    const [r] = await tx
      .select({ c: count() })
      .from(reservations)
      .where(and(eq(reservations.tenantId, tenantId), gte(reservations.startsAt, today), lt(reservations.startsAt, tomorrow), inArray(reservations.status, ["pending", "confirmed", "seated", "completed"])));
    k.reservationsToday = num(r?.c);
    const [m] = await tx.select({ c: count() }).from(menuItems).where(and(eq(menuItems.tenantId, tenantId), gte(menuItems.createdAt, createdCutoff)));
    realItem ||= num(m?.c) > 0;
  }
  if (hasBooking) {
    const [b] = await tx
      .select({ c: count() })
      .from(bookings)
      .where(and(eq(bookings.tenantId, tenantId), gte(bookings.startsAt, today), lt(bookings.startsAt, tomorrow), inArray(bookings.status, ["pending", "confirmed", "checked_in", "in_progress", "completed"])));
    k.bookingsToday = num(b?.c);
    const [sv] = await tx.select({ c: count() }).from(services).where(and(eq(services.tenantId, tenantId), gte(services.createdAt, createdCutoff)));
    realItem ||= num(sv?.c) > 0;
  }
  if (hasTopup) {
    const [t] = await tx.select({ c: count() }).from(topupOrders).where(and(eq(topupOrders.tenantId, tenantId), gte(topupOrders.placedAt, today), lt(topupOrders.placedAt, tomorrow)));
    k.topupsToday = num(t?.c);
    if (!hasCommerce) {
      const [paid] = await tx
        .select({ s: sum(topupOrders.price) })
        .from(topupOrders)
        .where(and(eq(topupOrders.tenantId, tenantId), gte(topupOrders.placedAt, today), lt(topupOrders.placedAt, tomorrow), inArray(topupOrders.status, ["paid", "processing", "fulfilled"])));
      addRevenue(num(paid?.s));
    }
    const [q] = await tx.select({ c: count() }).from(topupOrders).where(and(eq(topupOrders.tenantId, tenantId), inArray(topupOrders.status, ["paid", "processing"])));
    k.topupQueue = num(q?.c);
    const [g] = await tx.select({ c: count() }).from(games).where(and(eq(games.tenantId, tenantId), gte(games.createdAt, createdCutoff)));
    realItem ||= num(g?.c) > 0;
  }
  if (PAYMENT_MODULES.some((m) => modules.includes(m))) {
    k.pendingSlips = (await paymentQueueCounts(tx, tenantId)).pending_verification;
  }
  const [c] = await tx.select({ c: count() }).from(customers).where(and(eq(customers.tenantId, tenantId), gte(customers.createdAt, since7)));
  k.newCustomers7d = num(c?.c);
  return { kpis: k, realItem };
}
