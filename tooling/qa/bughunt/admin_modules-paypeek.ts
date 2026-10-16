import "../../load-env";
import { getAdminDb, sql } from "@rentweb/db";
async function main() {
  const db = getAdminDb();
  const r: any = await db.execute(sql`select t.slug, p.ref_type, p.status, count(*)::int n, max(p.ref_id::text) sample_ref, max(p.id::text) sample_pay from payments p join tenants t on t.id=p.tenant_id where t.slug like 'demo-%' and t.slug <> 'demo-topup' group by 1,2,3 order by 1,2,3`);
  for (const x of (r.rows ?? r)) console.log(x.slug.padEnd(16), String(x.ref_type).padEnd(16), String(x.status).padEnd(22), x.n, x.sample_ref, x.sample_pay);
  const o: any = await db.execute(sql`select t.slug, o.payment_status, count(*)::int n from orders o join tenants t on t.id=o.tenant_id where t.slug like 'demo-%' group by 1,2 order by 1,2`);
  console.log("--- orders.payment_status"); for (const x of (o.rows ?? o)) console.log(x.slug, x.payment_status, x.n);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
