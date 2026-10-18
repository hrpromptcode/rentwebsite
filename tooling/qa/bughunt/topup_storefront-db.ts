import "../../load-env";
import { sql, getAdminDb } from "@rentweb/db";
/** Read-only DB peek for the topup storefront bughunt. tsx qa/bughunt/topup_storefront-db.ts [query-name] */
const T = "01a1401c-b9af-71d6-8837-f2f2f33a2579";
const rows = (r: unknown) => (Array.isArray(r) ? r : ((r as { rows: unknown[] }).rows ?? []));
async function main() {
  const db = getAdminDb();
  const which = process.argv[2] ?? "all";
  const q = async (label: string, s: ReturnType<typeof sql>) => {
    if (which !== "all" && which !== label) return;
    console.log(`--- ${label} ---`);
    console.table(rows(await db.execute(s)));
  };
  await q("settings", sql`select settings->'line' as line, settings->'payments' as payments, settings->'contact' as contact from tenants where id = ${T}`);
  await q("modcfg", sql`select module_key, config from tenant_modules where tenant_id = ${T}`);
  await q("customers", sql`select id, phone, email, name, tier, blocked_at, line_user_id is not null as line from customers where tenant_id = ${T} order by created_at desc limit 15`);
  await q("wallets", sql`select w.id, c.phone, w.balance, w.frozen from wallets w join customers c on c.id = w.customer_id where w.tenant_id = ${T} order by w.updated_at desc limit 10`);
  await q("blacklist", sql`select kind, value, reason from topup_blacklist where tenant_id = ${T}`);
  await q("orders", sql`select number, status, payment_method, fulfillment, price, contact, customer_id, payment_id, placed_at from topup_orders where tenant_id = ${T} order by placed_at desc limit 12`);
  await q("payments", sql`select p.id, p.ref_type, p.status, p.amount, p.expires_at, p.failure_reason, p.provider_payload->'refundRequired' rr from payments p where p.tenant_id = ${T} and p.ref_type in ('topup','wallet_topup') order by p.created_at desc limit 12`);
  await q("hooks", sql`select 1 where false`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
