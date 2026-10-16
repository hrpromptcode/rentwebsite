import "../../load-env";
import { eq, getAdminDb, tenants, tenantDomains } from "@rentweb/db";
import { invalidateTenant } from "@rentweb/core/tenant";
/** usage: tsx qa/bughunt/security-invalidate.ts <slug> [status]  (throwaway sec-* tenants only) */
async function main() {
  const slug = process.argv[2]!; if (!slug.startsWith("sec-")) throw new Error("sec-* only");
  const db = getAdminDb();
  if (process.argv[3]) await db.update(tenants).set({ status: process.argv[3] as "active" }).where(eq(tenants.slug, slug));
  const [t] = await db.select({ id: tenants.id, status: tenants.status }).from(tenants).where(eq(tenants.slug, slug));
  const hosts = (await db.select({ h: tenantDomains.hostname }).from(tenantDomains).where(eq(tenantDomains.tenantId, t!.id))).map((r) => r.h);
  await invalidateTenant(t!.id, hosts);
  console.log("invalidated", slug, t!.status, hosts.join(","));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
