import "../../load-env";
import { getDb, withPlatform, sql } from "@rentweb/db";

/** Read-only DB peek for storefront_shop bughunt. Usage: tsx qa/bughunt/storefront_shop-db.ts "<sql>" */
async function main() {
  const db = getDb();
  const q = process.argv[2];
  await withPlatform(db, async (tx) => {
    const raw = await tx.execute(sql.raw(q!));
    const rows = Array.isArray(raw) ? raw : (raw as { rows: unknown[] }).rows;
    console.log(JSON.stringify(rows, null, 0).replace(/},{/g, "},\n{"));
  });
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
