import "../load-env";
import { and, eq, getAdminDb, pages, tenants } from "@rentweb/db";
const db = getAdminDb();
const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, process.argv[2] ?? "demo-shop"));
const [p] = await db.select({ id: pages.id }).from(pages).where(and(eq(pages.tenantId, t!.id), eq(pages.kind, "home")));
console.log(`${t!.id} ${p!.id}`);
process.exit(0);
