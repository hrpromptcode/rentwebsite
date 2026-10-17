import "../../../load-env";
import { eq, getDb, shippingMethods, tenants, withPlatform } from "@rentweb/db";
/** reverify-storefront: list a demo tenant's shipping methods (read-only). */
async function main() {
  const slug = process.argv[2] ?? "demo-shop";
  await withPlatform(getDb(), async (tx) => {
    const rows = await tx.select({ id: shippingMethods.id, name: shippingMethods.name, type: shippingMethods.type, active: shippingMethods.active, config: shippingMethods.config, updatedAt: shippingMethods.updatedAt }).from(shippingMethods).innerJoin(tenants, eq(tenants.id, shippingMethods.tenantId)).where(eq(tenants.slug, slug));
    for (const r of rows) if (!r.name.startsWith("QA ")) console.log(r.active ? "ACTIVE  " : "inactive", r.type.padEnd(9), r.name, JSON.stringify(r.config), r.updatedAt?.toISOString(), r.id);
    console.log("QA methods:", rows.filter((r) => r.name.startsWith("QA ")).length);
  });
  process.exit(0);
}
main();
