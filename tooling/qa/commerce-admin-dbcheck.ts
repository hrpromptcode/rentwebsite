import "../load-env";
import { desc, eq, getDb, orderItems, orders, sql, withTenant } from "@rentweb/db";
import { tenantIdBySlug } from "./stock";
/** Replicates the admin orders-list itemCount subquery to verify it returns real counts. */
async function main() {
  const tenantId = await tenantIdBySlug(process.argv[2] ?? "demo-shop");
  await withTenant(getDb(), tenantId, async (tx) => {
    const itemCountSub = sql<number>`(select coalesce(sum(${orderItems.quantity}), 0)::int from ${orderItems} where ${orderItems.orderId} = ${sql.raw('"orders"."id"')})`;
    const q = tx.select({ number: orders.number, itemCount: itemCountSub }).from(orders).where(eq(orders.tenantId, tenantId)).orderBy(desc(orders.placedAt)).limit(3);
    console.log("SQL:", q.toSQL().sql);
    console.log("rows:", JSON.stringify(await q));
    const raw = await tx.execute(`select o.number, (select count(*) from order_items oi where oi.order_id = o.id) as n from orders o where o.tenant_id = '${tenantId}' order by o.placed_at desc limit 3`);
    console.log("raw:", JSON.stringify(Array.isArray(raw) ? raw : (raw as unknown as { rows: unknown[] }).rows));
    const lo = await tx.execute(`select number, status, payment_status, source, to_char(created_at, 'HH24:MI:SS') as t from orders where tenant_id = '${tenantId}' order by created_at desc limit 4`);
    console.log("latest orders:", JSON.stringify(Array.isArray(lo) ? lo : (lo as unknown as { rows: unknown[] }).rows));
    const st = await tx.execute(`select p.name, v.title, v.stock from product_variants v join products p on p.id = v.product_id where p.tenant_id = '${tenantId}' and p.name like 'QA เสื้อยืด%' order by p.created_at desc, v.title limit 4`);
    console.log("qa variant stock:", JSON.stringify(Array.isArray(st) ? st : (st as unknown as { rows: unknown[] }).rows));
    const pr = await tx.execute(`select name, slug, status, has_variants, created_at from products where tenant_id = '${tenantId}' and name like 'QA เสื้อยืด%' order by created_at desc limit 3`);
    console.log("qa products:", JSON.stringify(Array.isArray(pr) ? pr : (pr as unknown as { rows: unknown[] }).rows));
  });
  process.exit(0);
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
