import "../../load-env";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { and, eq, getAdminDb, inArray, tenantMembers, tenants, user } from "@rentweb/db";
import { createAuth } from "../../../apps/admin/src/lib/auth-config";

/** Creates QA users for role tests (test values only, stored in admin_modules-creds.json). */
async function main() {
  const credsFile = path.resolve(process.cwd(), "qa/bughunt/admin_modules-creds.json");
  const creds: Record<string, { email: string; password: string }> = existsSync(credsFile) ? JSON.parse(readFileSync(credsFile, "utf8")) : {};
  const db = getAdminDb();
  const auth = createAuth(db);
  const roles: Array<[string, "staff" | "manager" | "viewer"]> = [["staff", "staff"], ["manager", "manager"], ["viewer", "viewer"]];
  const slugs = ["demo-shop", "demo-cafe", "demo-restaurant", "demo-salon", "demo-clinic"];
  const ts = await db.select({ id: tenants.id, slug: tenants.slug }).from(tenants).where(inArray(tenants.slug, slugs));
  for (const [key, role] of roles) {
    const email = `qa-am-${key}@rentweb.test`;
    if (!creds[key]) creds[key] = { email, password: `Qa-${randomBytes(9).toString("base64url")}` };
    let [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
    if (!u) {
      await auth.api.signUpEmail({ body: { email, password: creds[key]!.password, name: `QA AM ${key}` } });
      [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
    }
    await db.update(user).set({ emailVerified: true }).where(eq(user.id, u!.id));
    for (const t of ts) {
      await db.insert(tenantMembers).values({ tenantId: t.id, userId: u!.id, role }).onConflictDoUpdate({ target: [tenantMembers.tenantId, tenantMembers.userId], set: { role } });
    }
    const m = await db.select({ role: tenantMembers.role }).from(tenantMembers).where(and(eq(tenantMembers.userId, u!.id)));
    console.log(`user ${key}: ${m.length} memberships as ${m.map((x) => x.role).join(",")}`);
  }
  writeFileSync(credsFile, JSON.stringify(creds, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
