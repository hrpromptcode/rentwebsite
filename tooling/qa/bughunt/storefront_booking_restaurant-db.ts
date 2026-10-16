import "../../load-env";
import { getAdminDb, sql } from "@rentweb/db";
/** read-only SQL runner for the bughunt: tsx qa/bughunt/storefront_booking_restaurant-db.ts "<sql>" */
async function main() {
  const db = getAdminDb();
  const q = process.argv[2]!;
  const r = await db.execute(sql.raw(q));
  const rows = Array.isArray(r) ? r : (r as { rows: unknown[] }).rows;
  for (const row of rows) console.log(JSON.stringify(row));
  process.exit(0);
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
