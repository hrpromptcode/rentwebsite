import "../../load-env";
import { sql, getAdminDb } from "@rentweb/db";
const rows = (r: unknown) => (Array.isArray(r) ? r : ((r as { rows: unknown[] }).rows ?? []));
async function main() {
  const db = getAdminDb();
  console.log(JSON.stringify(rows(await db.execute(sql`select id, slug, site_type from tenants where slug like 'demo-%' order by slug`))));
  console.log(JSON.stringify(rows(await db.execute(sql`select g.slug, p.id, p.name, p.price, p.fulfillment, p.tier_prices, (select count(*) from code_stock c where c.package_id = p.id and c.status='available') avail from game_packages p join games g on g.id = p.game_id where g.tenant_id = (select id from tenants where slug='demo-topup') and g.slug in ('steam-wallet','rov','roblox') order by g.slug, p.sort limit 12`))));
  console.log(JSON.stringify(rows(await db.execute(sql`select tablename, policyname from pg_policies where tablename in ('games','topup_suppliers','game_packages','code_stock','wallets','wallet_transactions','wallet_topups','topup_orders','topup_blacklist') order by 1,2`))));
  console.log(JSON.stringify(rows(await db.execute(sql`select relname, relrowsecurity, relforcerowsecurity from pg_class where relname in ('games','topup_suppliers','game_packages','code_stock','wallets','wallet_transactions','wallet_topups','topup_orders','topup_blacklist') order by 1`))));
  console.log(JSON.stringify(rows(await db.execute(sql`select conname from pg_constraint where conname in ('wallets_balance_non_negative','wallet_tx_amount_positive')`))));
  console.log(JSON.stringify(rows(await db.execute(sql`select config from tenant_modules where tenant_id = (select id from tenants where slug='demo-topup') and module_key='topup'`))));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
