import "../load-env";
import { eq, getAdminDb, tenants, diningTables, asc } from "@rentweb/db";

/** Prints demo-restaurant tenant id + its dining tables (name, zone, seats, qrToken). QA helper, read-only. */
async function main() {
  const db = getAdminDb();
  const [t] = await db.select({ id: tenants.id, slug: tenants.slug }).from(tenants).where(eq(tenants.slug, "demo-restaurant")).limit(1);
  if (!t) throw new Error("demo-restaurant tenant not found");
  console.log(`TENANT ${t.id}`);
  const rows = await db.select({ name: diningTables.name, zone: diningTables.zone, seats: diningTables.seats, qrToken: diningTables.qrToken, active: diningTables.active }).from(diningTables).where(eq(diningTables.tenantId, t.id)).orderBy(asc(diningTables.sort));
  for (const r of rows) console.log(`TABLE ${r.name}\t${r.zone}\t${r.seats}\t${r.qrToken}\t${r.active}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
