/** booking packet – read-only DB peek used while fixing (services with capacity > 1, pending bookings). */
import { plat, done } from "../correctness-lib";
import { sql } from "@rentweb/db";
async function main() {
  const r = await plat((tx) => tx.execute(sql`select t.slug, s.slug as svc, s.capacity, s.requires_staff, s.seats_per_booking from services s join tenants t on t.id = s.tenant_id where s.capacity > 1`));
  console.log(JSON.stringify((r as any).rows ?? r));
  const p = await plat((tx) => tx.execute(sql`select t.slug, b.number, b.status, b.payment_status, b.created_at from bookings b join tenants t on t.id = b.tenant_id where b.status = 'pending' order by b.created_at limit 30`));
  console.log(JSON.stringify((p as any).rows ?? p));
  await done();
}
main();
