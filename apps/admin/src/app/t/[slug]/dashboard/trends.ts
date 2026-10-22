/**
 * 14-day daily series for the dashboard sparklines / revenue bars. Same definitions as computeKpis (kpis.ts) so the
 * last bucket of each series equals the matching "today" KPI. Buckets are whole Bangkok days counted from `since`
 * (Bangkok midnight 13 days before today), computed in SQL from epoch offsets (no time-zone conversion needed).
 * No Next/server-only imports, like kpis.ts.
 */
import { and, bookings, customers, eq, gte, inArray, orders, restaurantOrders, sql, topupOrders, type Tx } from "@rentweb/db";
import type { SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { TOPUP_SALE_STATUSES } from "@rentweb/module-topup/admin";

export const TREND_DAYS = 14;

export interface Trends {
  /** commerce orders placed per day */
  orders: number[] | null;
  /** restaurant orders (not cancelled) per day */
  restOrders: number[] | null;
  /** paid revenue per day (satang), all revenue modules — same scope as kpis.revenueToday */
  revenue: number[] | null;
  bookings: number[] | null;
  topups: number[] | null;
  newCustomers: number[];
  /** Bangkok day labels "22 ต.ค." for each bucket */
  labels: string[];
}

const empty = () => Array.from({ length: TREND_DAYS }, () => 0);

function bucketExpr(col: AnyPgColumn, since: Date): SQL<number> {
  return sql<number>`floor(extract(epoch from (${col} - ${since.toISOString()}::timestamptz)) / 86400)::int`;
}

function fill(rows: Array<{ b: number; v: unknown }>, into = empty()): number[] {
  for (const r of rows) {
    const i = Number(r.b);
    if (i >= 0 && i < TREND_DAYS) into[i] = (into[i] ?? 0) + Number(r.v ?? 0);
  }
  return into;
}

export async function computeTrends(tx: Tx, input: { tenantId: string; modules: readonly string[]; today: Date }): Promise<Trends> {
  const { tenantId, modules, today } = input;
  const since = new Date(today.getTime() - (TREND_DAYS - 1) * 86_400_000);
  const until = new Date(today.getTime() + 86_400_000);
  const hasCommerce = modules.includes("commerce");
  const hasBooking = modules.includes("booking");
  const hasTopup = modules.includes("topup");
  const hasRestaurant = modules.includes("restaurant");
  const t: Trends = { orders: null, restOrders: null, revenue: null, bookings: null, topups: null, newCustomers: empty(), labels: [] };
  const fmt = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" });
  for (let i = 0; i < TREND_DAYS; i++) t.labels.push(fmt.format(new Date(since.getTime() + i * 86_400_000 + 12 * 3_600_000)));
  const addRevenue = (rows: Array<{ b: number; v: unknown }>) => {
    t.revenue = fill(rows, t.revenue ?? empty());
  };

  if (hasCommerce) {
    const b = bucketExpr(orders.placedAt, since);
    const rows = await tx
      .select({ b, c: sql<number>`count(*)::int`, s: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.paymentStatus} = 'paid'), 0)::bigint` })
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), gte(orders.placedAt, since), sql`${orders.placedAt} < ${until.toISOString()}::timestamptz`))
      .groupBy(sql`1`);
    t.orders = fill(rows.map((r) => ({ b: r.b, v: r.c })));
    addRevenue(rows.map((r) => ({ b: r.b, v: r.s })));
  }
  if (hasRestaurant) {
    const b = bucketExpr(restaurantOrders.placedAt, since);
    const rows = await tx
      .select({
        b,
        c: sql<number>`count(*) filter (where ${restaurantOrders.status} <> 'cancelled')::int`,
        s: sql<number>`coalesce(sum(${restaurantOrders.total}) filter (where ${restaurantOrders.paymentStatus} = 'paid' and ${restaurantOrders.status} <> 'cancelled'), 0)::bigint`,
      })
      .from(restaurantOrders)
      .where(and(eq(restaurantOrders.tenantId, tenantId), gte(restaurantOrders.placedAt, since), sql`${restaurantOrders.placedAt} < ${until.toISOString()}::timestamptz`))
      .groupBy(sql`1`);
    t.restOrders = fill(rows.map((r) => ({ b: r.b, v: r.c })));
    addRevenue(rows.map((r) => ({ b: r.b, v: r.s })));
  }
  if (hasBooking) {
    const b = bucketExpr(bookings.startsAt, since);
    const rows = await tx
      .select({ b, c: sql<number>`count(*)::int` })
      .from(bookings)
      .where(
        and(
          eq(bookings.tenantId, tenantId),
          gte(bookings.startsAt, since),
          sql`${bookings.startsAt} < ${until.toISOString()}::timestamptz`,
          inArray(bookings.status, ["pending", "confirmed", "checked_in", "in_progress", "completed"]),
        ),
      )
      .groupBy(sql`1`);
    t.bookings = fill(rows.map((r) => ({ b: r.b, v: r.c })));
  }
  if (hasTopup) {
    const b = bucketExpr(topupOrders.placedAt, since);
    const rows = await tx
      .select({ b, c: sql<number>`count(*)::int`, s: sql<number>`coalesce(sum(${topupOrders.price}), 0)::bigint` })
      .from(topupOrders)
      .where(and(eq(topupOrders.tenantId, tenantId), gte(topupOrders.placedAt, since), sql`${topupOrders.placedAt} < ${until.toISOString()}::timestamptz`, inArray(topupOrders.status, [...TOPUP_SALE_STATUSES])))
      .groupBy(sql`1`);
    t.topups = fill(rows.map((r) => ({ b: r.b, v: r.c })));
    if (!hasCommerce) addRevenue(rows.map((r) => ({ b: r.b, v: r.s })));
  }
  {
    const b = bucketExpr(customers.createdAt, since);
    const rows = await tx
      .select({ b, c: sql<number>`count(*)::int` })
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), gte(customers.createdAt, since)))
      .groupBy(sql`1`);
    t.newCustomers = fill(rows.map((r) => ({ b: r.b, v: r.c })));
  }
  return t;
}
