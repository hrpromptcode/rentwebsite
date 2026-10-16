import "../load-env";
import { sql, getAdminDb } from "@rentweb/db";

/**
 * Read-only peek at the demo-topup back-office data (orders by status, games/packages, stock, wallets, suppliers).
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/topup-admin-db.ts
 */
const T = "01a1401c-b9af-71d6-8837-f2f2f33a2579";
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
