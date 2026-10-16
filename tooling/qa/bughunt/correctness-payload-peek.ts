import { done, plat } from "./correctness-lib";
import { sql } from "@rentweb/db";
const rows = (x: any) => (Array.isArray(x) ? x : x.rows);
async function main() {
  await plat(async (tx) => {
    const r = rows(await tx.execute(sql`select distinct on (type) type, payload, status from events_outbox where type in ('rest_order.paid','table.call_staff','table.bill_requested','order.paid','booking.created','booking.confirmed','reservation.created','order.created') order by type, created_at desc`));
    for (const x of r) console.log(x.type, x.status, "keys=", Object.keys(x.payload).join(","));
    console.log(JSON.stringify(rows(await tx.execute(sql`select slug, settings->'contact'->>'email' owner_email, settings->'notifications' n from tenants where slug like 'demo-%'`))));
  });
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
