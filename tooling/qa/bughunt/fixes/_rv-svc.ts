import "../../../load-env";
import { and, eq, getDb, services, tenants, withPlatform } from "@rentweb/db";
/** reverify-storefront: list services (active flag) of a demo tenant. */
async function main() {
  const slug = process.argv[2] ?? "demo-clinic";
  await withPlatform(getDb(), async (tx) => {
    const rows = await tx.select({ slug: services.slug, name: services.name, active: services.active, updatedAt: services.updatedAt }).from(services).innerJoin(tenants, eq(tenants.id, services.tenantId)).where(and(eq(tenants.slug, slug)));
    for (const r of rows) console.log(r.active ? "ACTIVE  " : "inactive", r.slug.padEnd(18), r.name, r.updatedAt?.toISOString());
  });
  process.exit(0);
}
main();
