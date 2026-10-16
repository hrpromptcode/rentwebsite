/** Runs the booking.reminder handler for a reminder whose booking is cancelled, inside a rolled-back tx. */
import { done, plat } from "./correctness-lib";
import { sql } from "@rentweb/db";
import { HANDLERS } from "../../../packages/integrations/src/events/handlers";
const rows = (x: any) => (Array.isArray(x) ? x : x.rows);
async function main() {
  await plat(async (tx) => {
    const [e] = rows(await tx.execute(sql`select e.id, e.tenant_id, e.type, e.payload, e.attempts, b.number, b.status from events_outbox e join bookings b on b.id = (e.payload->>'bookingId')::uuid and b.tenant_id = e.tenant_id where e.type='booking.reminder' and e.status='pending' and b.status='cancelled' order by e.next_run_at limit 1`));
    console.log("reminder event", e.id, "for", e.number, "booking status", e.status, "due", e.payload.hoursBefore, "h before", e.payload.startsAt);
    await HANDLERS["booking.reminder"]!(tx, { id: e.id, tenantId: e.tenant_id, type: e.type, payload: e.payload, attempts: e.attempts });
    const n = rows(await tx.execute(sql`select channel, recipient, status, payload->>'title' title from notifications where template='booking.reminder' order by created_at desc limit 2`));
    console.log("notification rows written by handler:", JSON.stringify(n));
    throw new Error("ROLLBACK (intentional)");
  }).catch((err) => console.log(String(err.message)));
  await done();
}
main();
