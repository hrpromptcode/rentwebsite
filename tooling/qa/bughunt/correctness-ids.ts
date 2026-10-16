import { plat, done } from "./correctness-lib";
import { sql } from "@rentweb/db";
async function main() {
  const r = await plat((tx) => tx.execute(sql`select id, slug, status from tenants where slug like 'demo-%' order by slug`));
  console.log(r);
  const s = await plat((tx) => tx.execute(sql`select current_setting('TimeZone') tz, now()`));
  console.log(s);
  await done();
}
main().catch((e) => { console.error(e); process.exit(1); });
