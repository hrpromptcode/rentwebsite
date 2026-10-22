/** qa-a: dump the crawl map of a demo (pages, nav, modules, products, categories, posts). tsx qa/redesign/_qa-a-db.ts demo-shop */
import "../../load-env";
import { getAdminDb, pages, tenants, navigation, tenantModules, products, categories, posts, eq } from "@rentweb/db";
const db = getAdminDb();
for (const slug of process.argv.slice(2)) {
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, slug));
  if (!t) { console.log("no tenant", slug); continue; }
  console.log(`== ${slug} ${t.id} template=${(t as Record<string, unknown>).templateKey ?? ""}`);
  const pg = await db.select({ slug: pages.slug, title: pages.title, status: pages.status, kind: pages.kind, nav: pages.showInNav }).from(pages).where(eq(pages.tenantId, t.id));
  console.log("pages:", pg.map((p) => `${p.slug}[${p.status[0]}${p.nav ? ",nav" : ""}]`).join(" "));
  const nav = await db.select().from(navigation).where(eq(navigation.tenantId, t.id));
  for (const n of nav) console.log(`nav ${n.location}:`, JSON.stringify(n.items).slice(0, 900));
  const mods = await db.select().from(tenantModules).where(eq(tenantModules.tenantId, t.id));
  console.log("modules:", mods.map((m) => `${m.moduleKey}${m.enabled ? "" : "(off)"}`).join(" "));
  const pr = await db.select({ slug: products.slug, status: products.status, imgs: products.images }).from(products).where(eq(products.tenantId, t.id));
  console.log("products:", pr.map((p) => `${p.slug}${p.status === "active" ? "" : "(" + p.status + ")"}#${(p.imgs as unknown[]).length}`).join(" "));
  const cats = await db.select({ slug: categories.slug, image: categories.image }).from(categories).where(eq(categories.tenantId, t.id));
  console.log("categories:", cats.map((c) => `${c.slug}${c.image ? "" : "(noimg)"}`).join(" "));
  const ps = await db.select({ slug: posts.slug }).from(posts).where(eq(posts.tenantId, t.id));
  console.log("posts:", ps.map((p) => p.slug).join(" "));
}
process.exit(0);
