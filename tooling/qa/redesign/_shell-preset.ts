/**
 * Dev helper (shell agent): show / switch a demo tenant's theme preset in place (no reset, tenant id unchanged).
 * Run from tooling/: pnpm exec tsx qa/redesign/_shell-preset.ts demo-corporate [obsidian]
 */
import "../../load-env";
import { eq, getAdminDb, tenants } from "@rentweb/db";
import { invalidateTenant } from "@rentweb/core/tenant";

const [slug, preset] = process.argv.slice(2);
(async () => {
  const db = getAdminDb();
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, slug!));
  if (!t) throw new Error(`no tenant ${slug}`);
  console.log(slug, t.id, JSON.stringify(t.theme));
  if (preset) {
    const theme = { ...(t.theme as Record<string, unknown>), preset };
    await db.update(tenants).set({ theme }).where(eq(tenants.id, t.id));
    await invalidateTenant(t.id, [`${slug}.localhost`]);
    console.log("→", JSON.stringify(theme));
  }
  process.exit(0);
})();
