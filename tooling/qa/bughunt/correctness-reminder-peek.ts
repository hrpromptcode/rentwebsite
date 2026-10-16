import { done, plat } from "./correctness-lib";
import { sql } from "@rentweb/db";
const rows = (x: any) => (Array.isArray(x) ? x : x.rows);
async function main() {
  await plat(async (tx) => {
    console.log(JSON.stringify(rows(await tx.execute(sql`select b.number, b.status, b.starts_at, e.payload->>'startsAt' reminder_for, e.payload->>'hoursBefore' h, e.next_run_at from events_outbox e join bookings b on b.id = (e.payload->>'bookingId')::uuid where e.type='booking.reminder' and e.status='pending' and (b.status in ('cancelled','no_show') or b.starts_at <> (e.payload->>'startsAt')::timestamptz) order by e.next_run_at limit 10`))));
  });
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
