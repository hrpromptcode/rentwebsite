import { done, plat } from "./correctness-lib";
import { sql } from "@rentweb/db";
const rows = (x: any) => (Array.isArray(x) ? x : x.rows);
async function main() {
  await plat(async (tx) => {
    console.log(JSON.stringify(rows(await tx.execute(sql`select t.slug, count(distinct o.id)::int orders, coalesce(sum(oi.quantity),0)::int units_reserved, min(p.expires_at) oldest_expiry from orders o join tenants t on t.id=o.tenant_id join payments p on p.ref_type='order' and p.ref_id=o.id and p.status='pending' and p.expires_at < now() left join order_items oi on oi.order_id=o.id where o.status='pending' and o.payment_status='unpaid' group by t.slug`))));
    console.log(JSON.stringify(rows(await tx.execute(sql`select ref_type, method, expires_at < now() as expired, count(*)::int, min(created_at) from payments where status = 'pending' group by 1,2,3 order by 1`))));
  });
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
