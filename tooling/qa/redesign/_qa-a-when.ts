/** qa-a: when were the demo tenants (re)provisioned. tsx qa/redesign/_qa-a-when.ts demo-shop … */
import "../../load-env";
import { getAdminDb, tenants, inArray } from "@rentweb/db";
const rows = await getAdminDb().select({ slug: tenants.slug, id: tenants.id, c: tenants.createdAt }).from(tenants).where(inArray(tenants.slug, process.argv.slice(2)));
for (const r of rows) console.log(r.slug, r.id, r.c?.toISOString());
process.exit(0);
