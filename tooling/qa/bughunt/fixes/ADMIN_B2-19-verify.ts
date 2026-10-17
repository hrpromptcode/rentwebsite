/**
 * ADMIN_B2-19 – cross-process cache invalidation without Upstash, against the running storefront (port 3000).
 * This script is a third process: it changes the tenant name in the DB (what the admin does), checks that the
 * storefront keeps serving its cached copy, then publishes the invalidation exactly like the admin's
 * invalidateTenant() does (cache_invalidations row) and measures how long the storefront takes to show it.
 * The name is restored at the end. Run: cd tooling && npx tsx qa/bughunt/fixes/ADMIN_B2-19-verify.ts [slug]
 */
import { done, hreq, plat } from "../correctness-lib";
import { eq, getAdminDb, tenants } from "@rentweb/db";
import { postgresInvalidationBus } from "@rentweb/core/cache";
import { configKey, hostKey } from "@rentweb/core/tenant";

let failures = 0;
const check = (name: string, ok: boolean, info = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const title = (body: string) => body.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";

async function main() {
  const slug = process.argv[2] ?? "qa-b2-corp-sppp";
  const host = `${slug}.localhost:3000`;
  const [t] = await plat((tx) => tx.select({ id: tenants.id, name: tenants.name, status: tenants.status }).from(tenants).where(eq(tenants.slug, slug)));
  if (!t) throw new Error(`no tenant ${slug}`);
  const bus = postgresInvalidationBus(getAdminDb());
  const keys = [configKey(t.id), hostKey(`${slug}.localhost`)];
  const original = t.name;
  const marker = `${original} B4-${Date.now() % 100000}`;
  try {
    // warm: the storefront caches the tenant config (60 s TTL)
    for (let i = 0; i < 2; i++) await hreq(host, "/");
    const warm = await hreq(host, "/");
    check("storefront serves the tenant", warm.status === 200 && title(warm.body).includes(original), `${warm.status} ${title(warm.body)}`);

    await plat((tx) => tx.update(tenants).set({ name: marker }).where(eq(tenants.id, t.id)));
    await sleep(3000);
    const stale = await hreq(host, "/");
    check("without an invalidation the storefront still serves its cached copy (cache is real)", !title(stale.body).includes(marker), title(stale.body));

    const t0 = Date.now();
    await bus.publish(keys);
    let seenAfter = -1;
    for (let i = 0; i < 40; i++) {
      const r = await hreq(host, "/");
      if (title(r.body).includes(marker)) {
        seenAfter = Date.now() - t0;
        break;
      }
      await sleep(250);
    }
    check("storefront shows the change within 5 s of the invalidation", seenAfter >= 0 && seenAfter <= 5000, `${seenAfter} ms`);
  } finally {
    await plat((tx) => tx.update(tenants).set({ name: original }).where(eq(tenants.id, t.id)));
    await bus.publish(keys);
  }
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
  await done();
  process.exit(failures ? 1 : 0);
}
main().catch(async (e) => {
  console.error("FATAL", e);
  await done();
  process.exit(1);
});
