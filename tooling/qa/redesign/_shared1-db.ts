import "../../load-env";
import { getAdminDb, pages, tenants, eq, and } from "@rentweb/db";
const [slugT, type] = process.argv.slice(2);
const db = getAdminDb();
const [t] = await db.select().from(tenants).where(eq(tenants.slug, slugT!));
const [pg] = await db.select().from(pages).where(and(eq(pages.tenantId, t!.id), eq(pages.slug, "home")));
for (const s of (pg!.publishedSections ?? pg!.sections) as Array<{ type: string; props: Record<string, unknown> }>) if (s.type === type) console.log(t!.id, JSON.stringify(s.props));
process.exit(0);
