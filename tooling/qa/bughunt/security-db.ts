import "../../load-env";
import { getAdminDb, sql } from "@rentweb/db";
/** usage: tsx qa/bughunt/security-db.ts "<sql>" — read-only peek for the security bughunt */
async function main() {
  const q = process.argv.slice(2).join(" ");
  const r = (await getAdminDb().execute(sql.raw(q))) as unknown;
  const rows = Array.isArray(r) ? r : (r as { rows: unknown[] }).rows;
  console.log(JSON.stringify(rows, null, 0));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
