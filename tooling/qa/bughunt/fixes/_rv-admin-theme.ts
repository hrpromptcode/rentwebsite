// reverify-admin housekeeping: undo leftovers of an overlapping admin-journey run on demo-shop (theme preset, pending
// qa-*.example.com domains, qa-invite-* invitation). Prints before/after.
import "../../../load-env";
import { and, eq, getAdminDb, like, tenantDomains, tenantInvitations, tenants, withPlatform } from "@rentweb/db";
import { invalidateTenant } from "@rentweb/core/tenant";
const db = getAdminDb();
const [t] = await withPlatform(db, (tx) => tx.select().from(tenants).where(eq(tenants.slug, "demo-shop")));
const theme = { ...(t!.theme as Record<string, unknown>), preset: "aurora" };
await withPlatform(db, async (tx) => {
  await tx.update(tenants).set({ theme }).where(eq(tenants.id, t!.id));
  const d = await tx.delete(tenantDomains).where(and(eq(tenantDomains.tenantId, t!.id), like(tenantDomains.hostname, "qa-%.example.com"))).returning({ h: tenantDomains.hostname });
  const i = await tx.delete(tenantInvitations).where(and(eq(tenantInvitations.tenantId, t!.id), like(tenantInvitations.email, "qa-invite-%@example.com"))).returning({ e: tenantInvitations.email });
  console.log("removed domains", d.map((x) => x.h), "invitations", i.map((x) => x.e));
});
await invalidateTenant(t!.id, ["demo-shop.localhost"]);
console.log("theme now", JSON.stringify(theme));
await new Promise((r) => setTimeout(r, 3000));
process.exit(0);
