/** correctness bughunt – two parallel "ใครก็ได้" (any staff) bookings for a slot where ≥2 staff are free. */
import { done, tenantIdOf, tt } from "./correctness-lib";
import { and, eq, tenants, tenantModules } from "@rentweb/db";
import { addDays, bookingConfig, createBooking, getSlotsForDate, getServiceById, toBkkParts, toSlotService, ymdToString } from "../../../packages/modules/booking/src/services/index";
const SERVICE = "01a1401b-ad12-7546-8f7f-bb020e71d441"; // thai-60, no deposit
async function main() {
  const t = await tenantIdOf("demo-salon");
  const settings = await tt(t, async (tx) => (await tx.select({ s: tenants.settings }).from(tenants).where(eq(tenants.id, t)))[0]!.s);
  const mc = await tt(t, async (tx) => (await tx.select({ c: tenantModules.config }).from(tenantModules).where(and(eq(tenantModules.tenantId, t), eq(tenantModules.moduleKey, "booking"))))[0]?.c ?? {});
  const config = bookingConfig({ booking: mc });
  const service = (await tt(t, (tx) => getServiceById(tx, t, SERVICE)))!;
  let pick: { start: string; remaining: number } | null = null;
  for (let i = 20; i < 29 && !pick; i++) {
    const s = await tt(t, (tx) => getSlotsForDate(tx, t, { service: toSlotService(service), date: ymdToString(addDays(toBkkParts(new Date()), i)), config }));
    pick = s.find((x) => x.remaining >= 2) ?? null;
  }
  console.log("slot", pick);
  await Promise.all(Array.from({ length: 4 }, () => tt(t, (tx) => tx.select({ id: tenants.id }).from(tenants).limit(1))));
  const res = await Promise.all([1, 2].map((i) => tt(t, (tx) => createBooking(tx, t, { serviceId: SERVICE, start: pick!.start, customer: { name: `QA any ${i}`, phone: `08995000${i}0` } }, { config, settings })).then((r) => (r.ok ? `ok ${r.value.booking.number} staff=${r.value.booking.staffId?.slice(-6)}` : `fail ${r.error}`))));
  const after = await tt(t, (tx) => getSlotsForDate(tx, t, { service: toSlotService(service), date: pick!.start.slice(0, 10), config }));
  console.log("parallel any-staff bookings", res, "| remaining at that slot afterwards", after.find((x) => x.start === pick!.start)?.remaining);
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
