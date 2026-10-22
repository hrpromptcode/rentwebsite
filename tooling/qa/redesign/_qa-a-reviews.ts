/** qa-a: reviews per product for demo tenants. tsx qa/redesign/_qa-a-reviews.ts demo-cafe … */
import "../../load-env";
import { getAdminDb, tenants, reviews, products, eq, and } from "@rentweb/db";
const db = getAdminDb();
for (const slug of process.argv.slice(2)) {
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, slug));
  const rows = await db.select({ p: products.slug, a: reviews.authorName, s: reviews.status }).from(reviews).innerJoin(products, eq(products.id, reviews.productId)).where(eq(reviews.tenantId, t!.id));
  console.log(slug, rows.length, rows.map((r) => `${r.p}:${r.a}:${r.s}`).join(" | "));
}
process.exit(0);
