import "../../load-env";
import { eq, getAdminDb, tenants } from "@rentweb/db";
async function main() {
  const slug = process.argv[2]!;
  const [t] = await getAdminDb().select().from(tenants).where(eq(tenants.slug, slug));
  console.log(JSON.stringify({ theme: t!.theme, plan: t!.planKey, status: t!.status, settings: process.argv[3] ? t!.settings : undefined }));
  process.exit(0);
}
main();
