import "./load-env";
import { eq, getAdminDb, tenants } from "@rentweb/db";
import { provisionTenant } from "@rentweb/core/tenant";
import { invalidateTenant } from "@rentweb/core/tenant";
import { rootHost } from "@rentweb/core/env";
import { getTemplate } from "@rentweb/templates";

/** Deletes and re-provisions a demo tenant from its template: pnpm --filter @rentweb/tooling reset-demo -- --template shop */
const DEMO_NAMES: Record<string, string> = { shop: "Siam Atelier", topup: "GameHub", clinic: "Lumière Clinic", restaurant: "บ้านริม", salon: "สบาย สบาย", corporate: "Northstar Studio", cafe: "Sugar Puff" };

async function main() {
  const i = process.argv.indexOf("--template");
  const key = i >= 0 ? process.argv[i + 1] : undefined;
  const tpl = key ? getTemplate(key) : undefined;
  if (!tpl) throw new Error("usage: reset-demo --template <key>");
  const db = getAdminDb();
  const slug = `demo-${tpl.key}`;
  const [old] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (old) {
    await db.delete(tenants).where(eq(tenants.id, old.id));
    await invalidateTenant(old.id, [`${slug}.localhost`]);
    console.log(`  • deleted ${slug}`);
  }
  const r = await provisionTenant({ name: DEMO_NAMES[tpl.key] ?? tpl.name.th, slug, template: tpl, planKey: "pro", db });
  await db.update(tenants).set({ status: "active", trialEndsAt: null }).where(eq(tenants.id, r.tenantId));
  console.log(`  ✓ http://${slug}.${rootHost()} (${r.tenantId})`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
