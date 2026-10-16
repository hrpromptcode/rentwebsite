import "../../load-env";
import { eq, getAdminDb, media, tenants } from "@rentweb/db";
async function main() {
  const [t] = await getAdminDb().select().from(tenants).where(eq(tenants.slug, process.argv[2]!));
  const rows = await getAdminDb().select({ key: media.key, mime: media.mime, size: media.size, folder: media.folder, alt: media.alt, at: media.createdAt }).from(media).where(eq(media.tenantId, t!.id));
  for (const r of rows) console.log(JSON.stringify(r));
  process.exit(0);
}
main();
