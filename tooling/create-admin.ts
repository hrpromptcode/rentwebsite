import "./load-env";
import { eq, getAdminDb, like, tenantMembers, tenants, user } from "@rentweb/db";
import { createAuth } from "../apps/admin/src/lib/auth-config";

/**
 * Creates (or promotes) a platform superadmin and makes them owner of every demo-* tenant.
 *   pnpm --filter @rentweb/tooling create-admin -- --email admin@rentweb.local --password "Admin1234!" [--name "Platform Admin"]
 * Safe to re-run: an existing user is promoted and memberships are upserted.
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = (arg("email") ?? "admin@rentweb.local").toLowerCase();
  const password = arg("password") ?? "Admin1234!";
  const name = arg("name") ?? "Platform Admin";
  if (password.length < 8) throw new Error("password must be at least 8 characters");

  const db = getAdminDb();
  const auth = createAuth(db);

  let [existing] = await db.select({ id: user.id, role: user.role }).from(user).where(eq(user.email, email)).limit(1);
  if (!existing) {
    await auth.api.signUpEmail({ body: { email, password, name } });
    [existing] = await db.select({ id: user.id, role: user.role }).from(user).where(eq(user.email, email)).limit(1);
    if (!existing) throw new Error("sign-up did not create the user");
    console.log(`✓ created user ${email}`);
  } else {
    console.log(`• user ${email} already exists (${existing.role}) – promoting`);
  }

  await db.update(user).set({ role: "superadmin", emailVerified: true }).where(eq(user.id, existing.id));

  const demos = await db.select({ id: tenants.id, slug: tenants.slug }).from(tenants).where(like(tenants.slug, "demo-%"));
  for (const t of demos) {
    await db
      .insert(tenantMembers)
      .values({ tenantId: t.id, userId: existing.id, role: "owner" })
      .onConflictDoUpdate({ target: [tenantMembers.tenantId, tenantMembers.userId], set: { role: "owner" } });
  }

  console.log(`✓ ${email} is superadmin and owner of ${demos.length} demo tenant(s): ${demos.map((d) => d.slug).join(", ") || "none"}`);
  console.log(`  sign in at ${process.env.ADMIN_URL ?? "http://localhost:3001"}/login`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
