import "../../../load-env";
import { sql, getAdminDb, withPlatform } from "@rentweb/db";
async function main() {
  const q = process.argv[2] ?? "";
  const rows = await withPlatform(getAdminDb(), (tx) => tx.execute(sql.raw(q)));
  console.log(JSON.stringify((rows as any).rows ?? rows, null, 0).slice(0, 4000));
  await (getAdminDb() as any).$client?.end?.({ timeout: 2 });
}
main().catch((e) => { console.error(e); process.exit(1); });
