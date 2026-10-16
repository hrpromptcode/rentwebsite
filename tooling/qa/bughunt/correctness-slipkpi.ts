import { done, plat } from "./correctness-lib";
import { sql } from "@rentweb/db";
const rows = (x: any) => (Array.isArray(x) ? x : x.rows);
async function main() {
  await plat(async (tx) => {
    console.log("orders.payment_status='pending_verification':", JSON.stringify(rows(await tx.execute(sql`select count(*)::int n from orders where payment_status='pending_verification'`))));
    console.log("order payments awaiting verification:", JSON.stringify(rows(await tx.execute(sql`select t.slug, o.number, o.payment_status from payments p join orders o on o.id=p.ref_id join tenants t on t.id=p.tenant_id where p.ref_type='order' and p.status='pending_verification'`))));
  });
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
