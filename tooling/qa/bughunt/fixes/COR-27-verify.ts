/**
 * booking packet – COR-27 / SBR-004 verification against the real DB (demo-salon):
 *  1. two parallel "ใครก็ได้" thai-60 bookings for a slot with >= 2 free staff → both succeed with DIFFERENT staff
 *  2. three parallel bookings for a slot with exactly 2 free staff → 2 succeed, 1 slot_taken (no overbooking)
 *  3. couple package (seats_per_booking 2) → one booking reserves 2 therapists; a parallel second one is refused
 * Everything created here is cancelled again at the end (admin cancel). Run: cd tooling && npx tsx qa/bughunt/fixes/COR-27-verify.ts
 */
import { done, tenantIdOf, tt } from "../correctness-lib";
import { and, eq, tenants, tenantModules } from "@rentweb/db";
import { addDays, bookingConfig, cancelBooking, createBooking, getServiceBySlug, getSlotsForDate, toBkkParts, toSlotService, ymdToString } from "../../../../packages/modules/booking/src/services/index";

let failures = 0;
const check = (name: string, ok: boolean, info = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`);
};

async function main() {
  const t = await tenantIdOf("demo-salon");
  const settings = await tt(t, async (tx) => (await tx.select({ s: tenants.settings }).from(tenants).where(eq(tenants.id, t)))[0]!.s as Record<string, unknown>);
  const mc = await tt(t, async (tx) => (await tx.select({ c: tenantModules.config }).from(tenantModules).where(and(eq(tenantModules.tenantId, t), eq(tenantModules.moduleKey, "booking"))))[0]?.c ?? {});
  const config = bookingConfig({ booking: mc as Record<string, unknown> });
  const thai = (await tt(t, (tx) => getServiceBySlug(tx, t, "thai-60")))!;
  const couple = (await tt(t, (tx) => getServiceBySlug(tx, t, "couple")))!;
  const created: string[] = [];
  const book = (serviceId: string, start: string, n: number) =>
    tt(t, (tx) => createBooking(tx, t, { serviceId, start, customer: { name: `QA COR-27 ${n}`, phone: `08992700${String(n).padStart(2, "0")}` } }, { config, settings }));

  const today = toBkkParts(new Date());
  const findSlot = async (svc: typeof thai, want: (remaining: number) => boolean, fromDay: number) => {
    for (let i = fromDay; i < fromDay + 20; i++) {
      const date = ymdToString(addDays(today, i));
      const slots = await tt(t, (tx) => getSlotsForDate(tx, t, { service: toSlotService(svc), date, config }));
      const s = slots.find((x) => x.available && want(x.remaining));
      if (s) return s;
    }
    return null;
  };

  // 1. two parallel any-staff bookings
  const s1 = await findSlot(thai, (r) => r >= 2, 12);
  if (!s1) throw new Error("no slot with 2 free staff");
  const r1 = await Promise.all([book(thai.id, s1.start, 1), book(thai.id, s1.start, 2)]);
  for (const r of r1) if (r.ok) created.push(r.value.booking.id);
  const staff1 = r1.map((r) => (r.ok ? r.value.booking.staffId : `fail:${r.error}`));
  check("parallel any-staff bookings both succeed", r1.every((r) => r.ok), JSON.stringify(staff1));
  check("…with different staff", new Set(staff1).size === 2);

  // 2. exactly-2-free slot, three parallel bookings
  const s2 = await findSlot(thai, (r) => r === 2, 13);
  if (s2) {
    const r2 = await Promise.all([book(thai.id, s2.start, 3), book(thai.id, s2.start, 4), book(thai.id, s2.start, 5)]);
    for (const r of r2) if (r.ok) created.push(r.value.booking.id);
    const oks = r2.filter((r) => r.ok).length;
    const errs = r2.filter((r) => !r.ok).map((r) => (!r.ok ? r.error : ""));
    check("3 parallel bookings for 2 free staff → 2 ok, 1 slot_taken", oks === 2 && errs.join() === "slot_taken", `ok=${oks} errors=${errs.join(",")}`);
    const after = (await tt(t, (tx) => getSlotsForDate(tx, t, { service: toSlotService(thai), date: ymdToString(toBkkParts(new Date(s2.start))), config }))).find((x) => x.start === s2.start);
    check("slot shows remaining 0 afterwards", after?.remaining === 0, `remaining=${after?.remaining}`);
  } else console.log("SKIP 2 (no slot with exactly 2 free staff)");

  // 3. couple package: 2 therapists per booking
  check("couple service has seats_per_booking 2 (migration 0003)", couple.seatsPerBooking === 2, `seats=${couple.seatsPerBooking}`);
  const s3 = await findSlot(couple, () => true, 14);
  if (s3) {
    const r3 = await Promise.all([book(couple.id, s3.start, 6), book(couple.id, s3.start, 7)]);
    for (const r of r3) if (r.ok) created.push(r.value.booking.id);
    const ok = r3.find((r) => r.ok);
    check("parallel couple bookings → exactly one accepted", r3.filter((r) => r.ok).length === 1, JSON.stringify(r3.map((r) => (r.ok ? "ok" : r.error))));
    if (ok && ok.ok) check("…it reserves two therapists", !!ok.value.booking.staffId && ok.value.booking.extraStaffIds.length === 1, JSON.stringify([ok.value.booking.staffId, ok.value.booking.extraStaffIds]));
  } else console.log("SKIP 3 (no couple slot)");

  // cleanup
  for (const id of created) await tt(t, (tx) => cancelBooking(tx, t, id, { by: "admin", reason: "QA COR-27 cleanup", config }));
  console.log(`cleanup: cancelled ${created.length} bookings`);
  console.log(failures ? `FAILED (${failures})` : "ALL PASS");
  await done();
  process.exit(failures ? 1 : 0);
}
main().catch(async (e) => {
  console.error(e);
  await done();
  process.exit(1);
});
