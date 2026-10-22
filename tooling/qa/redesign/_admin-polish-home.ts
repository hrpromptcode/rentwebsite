import "../../load-env";
import { and, eq, getAdminDb, pages, tenants } from "@rentweb/db";
const db = getAdminDb();
for (const slug of (process.argv[2] ?? "demo-shop").split(",")) {
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
  const [p] = await db.select({ s: pages.sections, ps: pages.publishedSections }).from(pages).where(and(eq(pages.tenantId, t!.id), eq(pages.kind, "home"))).limit(1);
  const secs = (p?.ps ?? p?.s ?? []).slice(0, 3);
  console.log(slug, JSON.stringify(secs.map((s) => ({ type: s.type, props: s.props }))).slice(0, 1500));
}
process.exit(0);
