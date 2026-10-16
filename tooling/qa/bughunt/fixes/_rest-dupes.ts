import { done, plat } from "../correctness-lib";
import { sql } from "@rentweb/db";
async function main() {
  const r = await plat((tx) => tx.execute(sql`select tenant_id, table_id, count(*)::int n, array_agg(status) st from table_sessions where status in ('open','bill_requested') group by 1,2 having count(*) > 1`));
  console.log(JSON.stringify(r));
  const s = await plat((tx) => tx.execute(sql`select status, count(*)::int from table_sessions group by 1`));
  console.log(JSON.stringify(s));
  await done();
}
main();
