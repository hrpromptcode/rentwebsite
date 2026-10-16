import "../load-env";
import { eq, and, getAdminDb, tenants, diningTables, menuItems, asc } from "@rentweb/db";

/** Prints demo-restaurant tenant id, dining-table QR tokens and a few menu item ids. QA helper, read-only. */
async function main() {
  const db = getAdminDb();
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, "demo-restaurant")).limit(1);
  if (!t) throw new Error("demo-restaurant tenant not found");
  console.log(`TENANT ${t.id}`);
  const tables = await db.select({ name: diningTables.name, qrToken: diningTables.qrToken, active: diningTables.active }).from(diningTables).where(eq(diningTables.tenantId, t.id)).orderBy(asc(diningTables.sort));
  for (const r of tables) console.log(`TABLE ${r.name}\t${r.qrToken}\t${r.active}`);
  const items = await db.select({ id: menuItems.id, name: menuItems.name, soldOut: menuItems.soldOut }).from(menuItems).where(and(eq(menuItems.tenantId, t.id))).orderBy(asc(menuItems.sort)).limit(5);
  for (const i of items) console.log(`ITEM ${i.id}\t${i.name}\t${i.soldOut}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
