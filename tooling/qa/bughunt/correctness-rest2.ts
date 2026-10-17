/** correctness bughunt – reservation capacity under parallel requests (zone with exactly one table). */
import { done, tenantIdOf, tt } from "./correctness-lib";
import { and, eq, diningTables } from "@rentweb/db";
import { checkAvailability, createReservation } from "../../../packages/modules/restaurant/src/services/index";

async function main() {
  const t = await tenantIdOf("demo-restaurant");
  const tag = Date.now().toString(36).toUpperCase().slice(-4);
  const zone = `QA-COR-${tag}`;
  await tt(t, (tx) => tx.insert(diningTables).values({ tenantId: t, name: `QA-COR-Z ${tag}`, zone, qrToken: `qacz${tag.toLowerCase()}${Math.random().toString(36).slice(2, 8)}`, seats: 4 }));
  const startsAt = new Date(Date.now() + 20 * 86_400_000);
  startsAt.setUTCMinutes(0, 0, 0);
  const mk = (i: number) => tt(t, (tx) => createReservation(tx, t, { name: `QA par ${i}`, phone: `08993000${String(i).padStart(2, "0")}`, partySize: 2, startsAt, zone })).then((r) => (r.ok ? `ok ${r.value.reservation.number}` : `fail ${r.code}`), (e) => `throw ${e.message}`);
  const res = await Promise.all([1, 2, 3].map(mk));
  const a = await tt(t, (tx) => checkAvailability(tx, t, { startsAt, zone }));
  console.log("parallel reservations in 1-table zone", zone, res, "availability after", JSON.stringify(a));
  // reverify-repro 2026-10-17: retire the probe table so it does not show up in the demo's public reserve form / capacity
  await tt(t, (tx) => tx.update(diningTables).set({ active: false }).where(and(eq(diningTables.tenantId, t), eq(diningTables.zone, zone))));
  console.log(res.filter((r) => r.startsWith("ok")).length === 1 ? "PASS COR-10 only one of 3 parallel reservations accepted for a 1-table zone" : "FAIL COR-10 bug reproduces");
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
