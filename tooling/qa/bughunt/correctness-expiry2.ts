import { done, plat } from "./correctness-lib";
import { sql } from "@rentweb/db";
const rows = (x: any) => (Array.isArray(x) ? x : x.rows);
async function main() {
  await plat(async (tx) => {
    console.log("NOW", new Date().toISOString());
    console.log("bookings holding a slot with an expired, never-paid deposit QR:", JSON.stringify(rows(await tx.execute(sql`select t.slug, b.number, b.status, b.payment_status, b.starts_at, p.status pay_status, p.expires_at from payments p join bookings b on b.id=p.ref_id join tenants t on t.id=p.tenant_id where p.ref_type='booking' and p.status='pending' and p.expires_at < now() and b.status='pending'`))));
    console.log("orders holding stock with an expired, never-paid QR:", JSON.stringify(rows(await tx.execute(sql`select t.slug, o.number, o.status, o.payment_status, p.status pay_status, p.expires_at, (select sum(quantity) from order_items oi where oi.order_id=o.id)::int units from payments p join orders o on o.id=p.ref_id join tenants t on t.id=p.tenant_id where p.ref_type='order' and p.status='pending' and p.expires_at < now() and o.status='pending' order by p.expires_at limit 8`))));
  });
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
