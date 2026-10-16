import "../../load-env";
import { eq, getAdminDb, tenants } from "@rentweb/db";
import { invalidateTenant } from "@rentweb/core/tenant";
/** Throwaway tenant sec-a only: business plan + malicious custom CSS, to prove the storefront sink. */
async function main() {
  const db = getAdminDb();
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, "sec-a")).limit(1);
  if (!t) throw new Error("no sec-a");
  const theme = { ...(t.theme as Record<string, unknown>), customCss: process.argv[2] ?? "</sty</style>le><script>window.__secXss=1;console.log('SEC-XSS-'+document.domain)</script>" };
  await db.update(tenants).set({ planKey: "business", theme }).where(eq(tenants.id, t.id));
  await invalidateTenant(t.id, [`sec-a.localhost`]).catch((e) => console.log("invalidate:", e.message));
  console.log("ok", t.id);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
