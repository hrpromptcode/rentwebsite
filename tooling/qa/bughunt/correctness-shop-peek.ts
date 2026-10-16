import { done, tenantIdOf, tt } from "./correctness-lib";
import { sql } from "@rentweb/db";
async function main() {
  const t = await tenantIdOf("demo-shop");
  const rows = (x: any) => (Array.isArray(x) ? x : x.rows);
  await tt(t, async (tx) => {
    console.log(JSON.stringify(rows(await tx.execute(sql`select id, name, price, stock, track_inventory, has_variants, type, status, weight_grams from products where tenant_id=${t} order by stock limit 30`))));
    console.log(JSON.stringify(rows(await tx.execute(sql`select id, name, type, config, active from shipping_methods where tenant_id=${t}`))));
    console.log(JSON.stringify(rows(await tx.execute(sql`select code, type, value, max_discount, min_subtotal, max_uses, used_count, per_customer_limit, active, applies_to, ends_at from discounts where tenant_id=${t}`))));
    console.log(JSON.stringify(rows(await tx.execute(sql`select settings->'payments' p, settings->'contact' c from tenants where id=${t}`))));
  });
  await done();
}
main().catch((e) => { console.error(e); process.exit(1); });
