/**
 * reverify-repro: cancels every still-active reservation that storefront_booking_restaurant-rest2.ts created on
 * demo-restaurant (phone 0897776655, the script's RPHONE) — used after a run that aborted before its own cleanup.
 * Run from tooling/: pnpm exec tsx qa/bughunt/fixes/_repro-rest2-cleanup.ts
 */
import { done, tenantIdOf, tt } from "../correctness-lib";
import { and, eq, inArray, reservations } from "@rentweb/db";
import { cancelReservation } from "../../../../packages/modules/restaurant/src/services/index";
async function main() {
  const t = await tenantIdOf("demo-restaurant");
  const rows = await tt(t, (tx) => tx.select({ id: reservations.id, number: reservations.number }).from(reservations).where(and(eq(reservations.tenantId, t), eq(reservations.phone, "0897776655"), inArray(reservations.status, ["pending", "confirmed"]))));
  let n = 0;
  for (const r of rows) {
    const c = await tt(t, (tx) => cancelReservation(tx, t, r.id, "QA cleanup (rest2 repro)", { by: "staff" }));
    if (c.ok) n++;
  }
  console.log(`cancelled ${n}/${rows.length}: ${rows.map((r) => r.number).join(",")}`);
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
