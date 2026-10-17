// read-only: demo-shop state after the admin journeys (theme preset, leftover qa domains / invitations)
import "../../../load-env";
import { and, eq, getAdminDb, like, tenantDomains, tenantInvitations, tenants, withPlatform } from "@rentweb/db";
const out = await withPlatform(getAdminDb(), async (tx) => {
  const [t] = await tx.select().from(tenants).where(eq(tenants.slug, "demo-shop"));
  const d = await tx.select({ h: tenantDomains.hostname }).from(tenantDomains).where(and(eq(tenantDomains.tenantId, t!.id), like(tenantDomains.hostname, "qa-%")));
  const i = await tx.select({ e: tenantInvitations.email }).from(tenantInvitations).where(and(eq(tenantInvitations.tenantId, t!.id), like(tenantInvitations.email, "qa-%")));
  return { preset: (t!.theme as { preset?: string }).preset, colors: (t!.theme as { colors?: unknown }).colors, domains: d, invitations: i };
});
console.log(JSON.stringify(out));
process.exit(0);
