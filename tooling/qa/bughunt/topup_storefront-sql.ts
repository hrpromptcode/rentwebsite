import "../../load-env";
import { sql, getAdminDb } from "@rentweb/db";
/** Ad-hoc SQL for the topup storefront bughunt (admin db). tsx qa/bughunt/topup_storefront-sql.ts "<sql>" */
const rows = (r: unknown) => (Array.isArray(r) ? r : ((r as { rows: unknown[] }).rows ?? []));
async function main() {
  const q = process.argv[2];
  if (!q) throw new Error("usage: topup_storefront-sql.ts <sql>");
  const db = getAdminDb();
  const res = rows(await db.execute(sql.raw(q)));
  console.log(JSON.stringify(res, null, 1));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
