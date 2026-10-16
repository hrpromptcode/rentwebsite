import { done, plat } from "./correctness-lib";
import { sql } from "@rentweb/db";
const rows = (x: any) => (Array.isArray(x) ? x : x.rows);
async function main() {
  await plat(async (tx) => {
    console.log(JSON.stringify(rows(await tx.execute(sql`select status, count(*)::int n, max(processed_at) last_processed, min(next_run_at) filter (where status='pending') next_due from events_outbox group by status`))));
    console.log(JSON.stringify(rows(await tx.execute(sql`select type, count(*)::int n from events_outbox where status='pending' and next_run_at <= now() group by type order by n desc limit 40`))));
    console.log(JSON.stringify(rows(await tx.execute(sql`select type, last_error, attempts from events_outbox where status in ('failed') or (last_error is not null and last_error <> 'no handler') order by created_at desc limit 10`))));
    console.log(JSON.stringify(rows(await tx.execute(sql`select type, count(*)::int n from events_outbox where last_error = 'no handler' group by type`))));
  });
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
