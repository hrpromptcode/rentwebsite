import "./load-env";
import { eq, getAdminDb, tenants } from "@rentweb/db";
import { provisionTenant } from "@rentweb/core/tenant";
import { rootHost } from "@rentweb/core/env";
import { getTemplate, listTemplates } from "@rentweb/templates";

/**
 * Usage: pnpm --filter @rentweb/tooling create-tenant -- --template shop --name "ร้านของฉัน" [--slug myshop] [--preset candy] [--no-sample]
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const templateKey = arg("template");
  const name = arg("name");
  if (!templateKey || !name) {
    console.log("templates:", listTemplates().map((t) => t.key).join(", "));
    throw new Error("--template and --name are required");
  }
  const template = getTemplate(templateKey);
  if (!template) throw new Error(`unknown template ${templateKey}`);
  const db = getAdminDb();
  const r = await provisionTenant({
    name,
    slug: arg("slug"),
    template,
    db,
    themeOverrides: arg("preset") ? { preset: arg("preset") } : undefined,
    withSampleData: !process.argv.includes("--no-sample"),
  });
  if (process.argv.includes("--active")) await db.update(tenants).set({ status: "active" }).where(eq(tenants.id, r.tenantId));
  console.log(`✓ created ${r.slug} → http://${r.slug}.${rootHost()}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
