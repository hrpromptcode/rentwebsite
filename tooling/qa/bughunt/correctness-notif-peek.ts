import { done, plat } from "./correctness-lib";
import { sql } from "@rentweb/db";
const rows = (x: any) => (Array.isArray(x) ? x : x.rows);
async function main() {
  await plat(async (tx) => {
    const r = rows(await tx.execute(sql`select distinct on (template) template, channel, payload->>'title' title, payload->>'text' text from notifications where created_at > now() - interval '30 minutes' and template in ('rest_order.paid','table.call_staff','table.bill_requested','reservation.owner','order.paid.owner','order.paid','booking.created','booking.reminder','reservation.created') order by template, created_at desc`));
    for (const x of r) console.log(JSON.stringify(x));
    console.log(JSON.stringify(rows(await tx.execute(sql`select template, count(*)::int from notifications where created_at > now() - interval '30 minutes' group by 1 order by 2 desc`))));
    console.log("reminders scheduled:", JSON.stringify(rows(await tx.execute(sql`select count(*)::int n, min(next_run_at) from events_outbox where type='booking.reminder' and status='pending'`))));
  });
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
