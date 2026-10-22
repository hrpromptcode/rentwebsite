import "./load-env";
import { eq, getAdminDb, inArray, plans, sql, tenants } from "@rentweb/db";
import { invalidateTenant } from "@rentweb/core/tenant";

/**
 * One-off data change (2026-10-23, owner decision "no free trial"): new prices 999 / 1,499 / 2,490 THB per month
 * (yearly = 10× monthly), retire the "trial" plan, move every trialing tenant to active (plan "trial" → "starter").
 * Idempotent. Usage: pnpm --filter @rentweb/tooling exec tsx fix-no-trial.ts
 */
const PRICES: Record<string, [number, number]> = { starter: [99900, 999000], pro: [149900, 1499000], business: [249000, 2490000] };

async function main() {
  const db = getAdminDb();
  for (const [key, [m, y]] of Object.entries(PRICES)) {
    await db.update(plans).set({ priceMonthly: m, priceYearly: y }).where(eq(plans.key, key));
  }
  const moved = await db
    .update(tenants)
    .set({ status: "active", trialEndsAt: null, planKey: sql`case when ${tenants.planKey} = 'trial' then 'starter' else ${tenants.planKey} end` })
    .where(sql`${tenants.status} = 'trialing' or ${tenants.planKey} = 'trial' or ${tenants.trialEndsAt} is not null`)
    .returning({ id: tenants.id, slug: tenants.slug });
  for (const t of moved) await invalidateTenant(t.id, [`${t.slug}.localhost`]);
  await db.delete(plans).where(inArray(plans.key, ["trial"]));
  const rows = await db.select({ key: plans.key, m: plans.priceMonthly, y: plans.priceYearly, active: plans.active }).from(plans).orderBy(plans.sort);
  console.log("plans:", rows.map((r) => `${r.key} ${r.m / 100}/${r.y / 100}${r.active ? "" : " (inactive)"}`).join(" · "));
  console.log("tenants moved to active:", moved.length);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
