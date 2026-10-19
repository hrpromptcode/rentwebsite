import "../load-env";
import { eq, sql, getAdminDb, tenants } from "@rentweb/db";

/**
 * Read-only peek at the demo-topup back-office data (orders by status, games/packages, stock, wallets, suppliers).
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/topup-admin-db.ts
 */
/** resolved by slug — the id changes on every demo reset */
const T: string = (await getAdminDb().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, "demo-topup")).limit(1))[0]?.id ?? (() => { throw new Error("tenant demo-topup not found — run reset-demo --template topup"); })();
const rows = (r: unknown) => (Array.isArray(r) ? r : ((r as { rows: unknown[] }).rows ?? []));

async function main() {
  const db = getAdminDb();
  const q = async (label: string, s: ReturnType<typeof sql>) => {
    console.log(`--- ${label} ---`);
    console.table(rows(await db.execute(s)));
  };
  await q("orders by status/fulfillment/method", sql`select status, fulfillment, payment_method, count(*)::int n from topup_orders where tenant_id = ${T} group by 1,2,3 order by 1,2,3`);
  await q("games", sql`select g.id, g.slug, g.name, g.active, (select count(*)::int from game_packages p where p.game_id = g.id) pkgs from games g where g.tenant_id = ${T} order by g.sort`);
  await q("packages", sql`select p.id, g.slug, p.name, p.price, p.cost_price, p.fulfillment, p.active, (select count(*)::int from code_stock c where c.package_id = p.id and c.status='available') avail from game_packages p join games g on g.id = p.game_id where p.tenant_id = ${T} order by g.sort, p.sort`);
  await q("suppliers", sql`select id, name, provider, active from topup_suppliers where tenant_id = ${T}`);
  await q("wallets", sql`select w.id, c.phone, c.name, w.balance, w.frozen from wallets w join customers c on c.id = w.customer_id where w.tenant_id = ${T} order by w.updated_at desc limit 8`);
  await q("blacklist", sql`select kind, value, reason from topup_blacklist where tenant_id = ${T} limit 10`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
