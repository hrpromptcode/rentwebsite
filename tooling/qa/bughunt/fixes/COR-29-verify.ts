/**
 * COR-29 + AC-06/AM-02 regression: dashboard KPIs (apps/admin/src/app/t/[slug]/dashboard/kpis.ts).
 *  - "สลิปรอตรวจ" = payments in pending_verification across all modules (same as the /payments queue)
 *  - restaurant tenants get restaurant KPIs (orders today, paid revenue, open tables, reservations today)
 * Creates a slip order on demo-shop with autoApprove=false (then cancels it) to prove the KPI moves.
 * Run from tooling/:  pnpm exec tsx qa/bughunt/fixes/COR-29-verify.ts
 */
import "../../../load-env";
import { and, count, eq, gte, inArray, lt, payments, reservations, restaurantOrders, sql, tableSessions, tenantModules, tenants, getAdminDb, getDb, withTenant, type Tx } from "@rentweb/db";
import { attachSlip } from "@rentweb/core/payments";
import { computeKpis } from "../../../../apps/admin/src/app/t/[slug]/dashboard/kpis";
import { addCartItem, createOrderFromCart, getOrCreateCart } from "../../../../packages/modules/commerce/src/services/index";
import { cancelOrderAdmin } from "../../../../packages/modules/commerce/src/admin/orders";

let fails = 0;
const check = (name: string, cond: boolean, extra: unknown = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra !== "" ? " " + JSON.stringify(extra) : ""}`);
};
const tt = <T>(tenantId: string, fn: (tx: Tx) => Promise<T>) => withTenant(getDb(), tenantId, fn);
const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }) + "T00:00:00+07:00");
const tomorrow = new Date(today.getTime() + 86_400_000);
const since7 = new Date(Date.now() - 7 * 86_400_000);

async function tenant(slug: string) {
  const [t] = await getAdminDb().select({ id: tenants.id, createdAt: tenants.createdAt, settings: tenants.settings }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
  const mods = await getAdminDb().select({ k: tenantModules.moduleKey }).from(tenantModules).where(and(eq(tenantModules.tenantId, t!.id), eq(tenantModules.enabled, true)));
  return { ...t!, modules: mods.map((m) => m.k) };
}
const kpisOf = (t: Awaited<ReturnType<typeof tenant>>) => tt(t.id, (tx) => computeKpis(tx, { tenantId: t.id, modules: t.modules, today, tomorrow, since7, createdCutoff: new Date(t.createdAt.getTime() + 5 * 60_000) }));
const pendingAll = async (tid: string) => Number((await tt(tid, (tx) => tx.select({ c: count() }).from(payments).where(and(eq(payments.tenantId, tid), eq(payments.status, "pending_verification")))))[0]?.c ?? 0);

/* ---- COR-29: slips KPI follows payments.status ---- */
const shop = await tenant("demo-shop");
const before = await kpisOf(shop);
check("demo-shop pendingSlips = payments pending_verification (all modules)", before.kpis.pendingSlips === (await pendingAll(shop.id)), { kpi: before.kpis.pendingSlips });
const created = await tt(shop.id, async (tx) => {
  // same fixtures as qa/bughunt/correctness-slipkpi2.ts (seeded demo-shop product + shipping method)
  const prod = { id: "01a14029-0996-762b-99c5-f1ccda07f220" };
  const ship = { id: "01a14029-0a1d-76dc-8672-49f55d69cea6" };
  const { cart } = await getOrCreateCart(tx, shop.id, null);
  await addCartItem(tx, shop.id, cart.id, { productId: prod.id, quantity: 1 });
  const r = await createOrderFromCart(tx, shop.id, { cartToken: cart.token, customer: null, contact: { name: "QA COR-29", phone: "0899700029" }, address: { name: "QA", phone: "0899700029", line1: "1", subdistrict: "a", district: "b", province: "เชียงใหม่", postalCode: "50200", country: "TH" }, shippingMethodId: ship.id, paymentMethod: "slip", settings: shop.settings } as any);
  if (!r.ok) throw new Error(r.error);
  await attachSlip(tx, shop.id, r.value.paymentId, { url: "/uploads/qa/_qa-slip.png" }, { autoApprove: false });
  return r.value;
});
{
  try {
    const after = await kpisOf(shop);
    check("slip attached (autoApprove off) -> KPI +1", after.kpis.pendingSlips === (before.kpis.pendingSlips ?? 0) + 1, { before: before.kpis.pendingSlips, after: after.kpis.pendingSlips });
  } finally {
    await tt(shop.id, (tx) => cancelOrderAdmin(tx, shop.id, created.orderId, "QA COR-29 cleanup", { userId: "00000000-0000-0000-0000-000000000000", actorType: "user" } as any)).catch((e) => console.log("cleanup:", String(e)));
  }
  const cleaned = await kpisOf(shop);
  check("after cancelling the QA order the KPI is back", cleaned.kpis.pendingSlips === before.kpis.pendingSlips, { kpi: cleaned.kpis.pendingSlips });
}

/* ---- AC-06 / AM-02: restaurant branch ---- */
const rest = await tenant("demo-restaurant");
const rk = await kpisOf(rest);
const [ro] = await tt(rest.id, (tx) =>
  tx
    .select({ c: sql<number>`count(*) filter (where ${restaurantOrders.status} <> 'cancelled')::int`, paid: sql<number>`coalesce(sum(${restaurantOrders.total}) filter (where ${restaurantOrders.paymentStatus} = 'paid' and ${restaurantOrders.status} <> 'cancelled'),0)::bigint` })
    .from(restaurantOrders)
    .where(and(eq(restaurantOrders.tenantId, rest.id), gte(restaurantOrders.placedAt, today), lt(restaurantOrders.placedAt, tomorrow))),
);
const [ot] = await tt(rest.id, (tx) => tx.select({ c: sql<number>`count(distinct ${tableSessions.tableId})::int` }).from(tableSessions).where(and(eq(tableSessions.tenantId, rest.id), inArray(tableSessions.status, ["open", "bill_requested"]))));
const [rv] = await tt(rest.id, (tx) => tx.select({ c: count() }).from(reservations).where(and(eq(reservations.tenantId, rest.id), gte(reservations.startsAt, today), lt(reservations.startsAt, tomorrow), inArray(reservations.status, ["pending", "confirmed", "seated", "completed"]))));
check("demo-restaurant has restaurant module", rest.modules.includes("restaurant"), rest.modules);
check("restaurant orders today KPI present and correct", rk.kpis.restOrdersToday !== null && rk.kpis.restOrdersToday === Number(ro?.c), { kpi: rk.kpis.restOrdersToday, sql: ro?.c });
check("restaurant paid revenue today KPI", rk.kpis.revenueToday === Number(ro?.paid), { kpi: rk.kpis.revenueToday, sql: ro?.paid });
check("open tables KPI", rk.kpis.openTables === Number(ot?.c), { kpi: rk.kpis.openTables, sql: ot?.c });
check("reservations today KPI", rk.kpis.reservationsToday === Number(rv?.c), { kpi: rk.kpis.reservationsToday, sql: rv?.c });
check("restaurant pendingSlips present", rk.kpis.pendingSlips === (await pendingAll(rest.id)), { kpi: rk.kpis.pendingSlips });
const pageOnly = await kpisOf({ ...rest, modules: ["cms"] });
check("cms-only tenant: no module KPIs, no slips card", pageOnly.kpis.restOrdersToday === null && pageOnly.kpis.ordersToday === null && pageOnly.kpis.pendingSlips === null);

console.log(fails === 0 ? "PASS COR-29/AC-06/AM-02 (all checks)" : `FAIL COR-29/AC-06/AM-02 (${fails} failing)`);
await (getDb() as any).$client?.end?.({ timeout: 2 });
await (getAdminDb() as any).$client?.end?.({ timeout: 2 });
process.exitCode = fails === 0 ? 0 : 1;
