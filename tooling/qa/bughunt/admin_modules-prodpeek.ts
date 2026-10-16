import "../../load-env";
import { getAdminDb, sql } from "@rentweb/db";
async function main() {
  const slug = process.argv[2] ?? "demo-shop";
  const db = getAdminDb();
  const r: any = await db.execute(sql`select p.id, p.slug, p.name, p.status, p.price, p.stock, p.has_variants, p.track_inventory from products p join tenants t on t.id=p.tenant_id where t.slug=${slug} order by p.created_at limit 40`);
  for (const x of (r.rows ?? r)) console.log(x.id, x.slug, "|", x.name, "|", x.status, x.price, "stock", x.stock, "var", x.has_variants, "track", x.track_inventory);
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
