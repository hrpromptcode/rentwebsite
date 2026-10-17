import { describe, expect, it } from "vitest";
import { availabilityOverrides, availabilityRules, bookings, clinicPackages, patientPackages, services, staffServices } from "@rentweb/db";
import { and, eq } from "drizzle-orm";
import { computeSlots, type SlotEngineInput } from "../src/services/availability";
import { cancelBooking, createBooking } from "../src/services/bookings";
import { listClasses, listInstructors, listTimetable, upcomingSessions, weekStartOf } from "../src/services/classes";
import { purchasePackage, onPatientPackagePaid } from "../src/services/clinic";
import { markPaid, registerPaymentHandler } from "@rentweb/core/payments";
import { formatBkkTime } from "../src/services/time";
import { at, CONFIG, DAY, NOW, seedSalon, SETTINGS } from "./helpers";

/* ------------------------------------------------------------------ */
/* pure engine                                                          */
/* ------------------------------------------------------------------ */

const CLASS = { id: "yoga", durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0, capacity: 3, requiresStaff: false, seatsPerBooking: null };
const biz = Array.from({ length: 7 }, (_, d) => ({ staffId: null, weekday: d, startTime: "07:00:00", endTime: "21:00:00" }));
// Friday (DAY) sessions: 07:30 with Nok, 18:30 with Pim; Saturday 09:00 with Nok
const sessions = [
  { staffId: "nok", serviceId: "yoga", weekday: 5, startTime: "07:30:00", endTime: "08:30:00" },
  { staffId: "pim", serviceId: "yoga", weekday: 5, startTime: "18:30:00", endTime: "19:30:00" },
  { staffId: "nok", serviceId: "yoga", weekday: 6, startTime: "09:00:00", endTime: "10:00:00" },
];
function base(over: Partial<SlotEngineInput> = {}): SlotEngineInput {
  return { config: CONFIG, service: CLASS, date: DAY, eligibleStaffIds: [], rules: [...biz, ...sessions], overrides: [], bookings: [], now: NOW, ...over };
}
const times = (slots: ReturnType<typeof computeSlots>) => slots.map((s) => formatBkkTime(s.start));

describe("class sessions in the slot engine", () => {
  it("a service with session rules yields exactly one slot per session with the instructor", () => {
    const slots = computeSlots(base());
    expect(times(slots)).toEqual(["07:30", "18:30"]);
    expect(slots.map((s) => s.staffId)).toEqual(["nok", "pim"]);
    expect(slots.every((s) => s.available && s.remaining === 3)).toBe(true);
    // Saturday
    expect(times(computeSlots(base({ date: "2026-10-17" })))).toEqual(["09:00"]);
    // Sunday: no sessions
    expect(computeSlots(base({ date: "2026-10-18" }))).toEqual([]);
  });

  it("enrolments consume seats; a full session is unavailable; party size is respected", () => {
    const booked = [
      { staffId: null, serviceId: "yoga", startsAt: new Date(at(DAY, "18:30")), endsAt: new Date(at(DAY, "19:30")), partySize: 2 },
      { staffId: null, serviceId: "other", startsAt: new Date(at(DAY, "18:30")), endsAt: new Date(at(DAY, "19:30")), partySize: 1 },
    ];
    const slots = computeSlots(base({ bookings: booked }));
    const evening = slots.find((s) => formatBkkTime(s.start) === "18:30")!;
    expect(evening.remaining).toBe(1);
    expect(evening.available).toBe(true);
    const forTwo = computeSlots(base({ bookings: booked, partySize: 2 })).find((s) => formatBkkTime(s.start) === "18:30")!;
    expect(forTwo.available).toBe(false);
    expect(forTwo.remaining).toBe(1);
  });

  it("a closed override (studio holiday or the instructor's day off) drops the session", () => {
    const holiday = [{ staffId: null, startsAt: new Date(at(DAY, "00:00")), endsAt: new Date(at(DAY, "23:59")), kind: "closed" }];
    expect(computeSlots(base({ overrides: holiday }))).toEqual([]);
    const nokOff = [{ staffId: "nok", startsAt: new Date(at(DAY, "06:00")), endsAt: new Date(at(DAY, "12:00")), kind: "closed" }];
    expect(times(computeSlots(base({ overrides: nokOff })))).toEqual(["18:30"]);
  });

  it("filters by instructor and hides sessions inside the minimum notice", () => {
    expect(times(computeSlots(base({ staffId: "pim" })))).toEqual(["18:30"]);
    // now = 07:00 on DAY with 1h notice → the 07:30 session is closed
    const late = computeSlots(base({ now: new Date(at(DAY, "07:00")) }));
    expect(times(late)).toEqual(["18:30"]);
  });

  it("session rules never widen the instructor's working hours for 1:1 services", () => {
    const privateSession = { id: "pt", durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0, capacity: 1, requiresStaff: true };
    const nokHours = [{ staffId: "nok", weekday: 5, startTime: "10:00:00", endTime: "12:00:00" }];
    const slots = computeSlots({ ...base({ service: privateSession, eligibleStaffIds: ["nok"], staffId: "nok", rules: [...biz, ...nokHours, ...sessions] }) });
    // only 10:00 and 11:00 from her own hours – the 07:30 / 18:30 class rows are not working hours
    expect(times(slots)).toEqual(["10:00", "10:30", "11:00"]);
  });
});

/* ------------------------------------------------------------------ */
/* DB: catalog, timetable, enrolment, pass                              */
/* ------------------------------------------------------------------ */

async function seedStudio() {
  const s = await seedSalon();
  const studio = await s.tx(async (tx) => {
    const [cls] = await tx
      .insert(services)
      .values({ tenantId: s.tenantId, name: "วินยาสะโฟลว์", slug: "vinyasa", durationMin: 60, price: 45000, capacity: 3, requiresStaff: false, level: "intermediate", featured: true, sort: 10 })
      .returning({ id: services.id });
    // ann teaches it (link) – sessions Fri 07:30 (ann) and Fri 18:30 (mali), Sat 09:00 (ann)
    await tx.insert(staffServices).values([{ tenantId: s.tenantId, staffId: s.staff.ann, serviceId: cls!.id }]);
    await tx.insert(availabilityRules).values([
      { tenantId: s.tenantId, staffId: s.staff.ann, serviceId: cls!.id, weekday: 5, startTime: "07:30", endTime: "08:30" },
      { tenantId: s.tenantId, staffId: s.staff.mali, serviceId: cls!.id, weekday: 5, startTime: "18:30", endTime: "19:30" },
      { tenantId: s.tenantId, staffId: s.staff.ann, serviceId: cls!.id, weekday: 6, startTime: "09:00", endTime: "10:00" },
    ]);
    const [pass] = await tx.insert(clinicPackages).values({ tenantId: s.tenantId, name: "คลาสพาส 5 ครั้ง", serviceId: null, sessions: 5, price: 190000, validityDays: 90 }).returning({ id: clinicPackages.id });
    return { classId: cls!.id, passId: pass!.id };
  });
  return { ...s, ...studio };
}

describe("classes service + enrolment", () => {
  it("listClasses / listInstructors / listTimetable describe the studio", async () => {
    const s = await seedStudio();
    const classes = await s.tx((tx) => listClasses(tx, s.tenantId));
    expect(classes.map((c) => c.slug)).toEqual(["vinyasa"]); // "couple" (capacity 2) is a staffed group, not a class
    const vin = classes.find((c) => c.slug === "vinyasa")!;
    expect(vin.level).toBe("intermediate");
    expect(vin.instructors.map((i) => i.slug)).toEqual(["ann"]);
    expect(vin.sessions.map((x) => `${x.weekday} ${x.startTime} ${x.instructor?.slug}`)).toEqual(["5 07:30 ann", "5 18:30 mali", "6 09:00 ann"]);
    expect((await s.tx((tx) => listClasses(tx, s.tenantId, { level: "beginner" }))).length).toBe(0);
    const team = await s.tx((tx) => listInstructors(tx, s.tenantId));
    expect(team.find((t) => t.slug === "ann")?.weeklySessions).toBe(2);
    expect(team.find((t) => t.slug === "mali")?.weeklySessions).toBe(1);
    expect(team.find((t) => t.slug === "mali")?.classes.map((c) => c.slug)).toEqual(["vinyasa"]);

    const week = weekStartOf(DAY)!; // Monday 2026-10-12
    expect(week).toBe("2026-10-12");
    const tt = await s.tx((tx) => listTimetable(tx, s.tenantId, { from: week, days: 7, config: CONFIG, now: NOW }));
    expect(tt.map((x) => `${x.date} ${formatBkkTime(x.start)} ${x.instructor?.slug} ${x.state} ${x.remaining}/${x.capacity}`)).toEqual([
      "2026-10-16 07:30 ann open 3/3",
      "2026-10-16 18:30 mali open 3/3",
      "2026-10-17 09:00 ann open 3/3",
    ]);
    const onlyMali = await s.tx((tx) => listTimetable(tx, s.tenantId, { from: week, days: 7, config: CONFIG, now: NOW, instructorId: s.staff.mali }));
    expect(onlyMali.map((x) => formatBkkTime(x.start))).toEqual(["18:30"]);
    // a week in the past is shown as past (no engine call), never as bookable
    const past = await s.tx((tx) => listTimetable(tx, s.tenantId, { from: "2026-10-05", days: 7, config: CONFIG, now: NOW }));
    expect(past.length).toBe(3);
    expect(past.every((x) => x.state === "past" && !x.available)).toBe(true);
  });

  it("enrolling takes seats, records the instructor, refuses an overbooked session and frees the seat on cancel", async () => {
    const s = await seedStudio();
    const opts = { config: CONFIG, settings: SETTINGS, now: NOW };
    const customer = (n: number) => ({ id: null, name: `นักเรียน ${n}`, phone: `08100000${n}${n}`, email: null });
    const start = at(DAY, "18:30");
    const a = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.classId, staffId: null, start, customer: customer(1), partySize: 2 }, opts));
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.value.booking.staffId).toBeNull();
    expect(a.value.booking.partySize).toBe(2);
    expect(a.value.booking.price).toBe(90000); // per-person class: 2 × ฿450
    expect(a.value.booking.status).toBe("confirmed");
    expect((a.value.booking.answers as { instructorId?: string }).instructorId).toBe(s.staff.mali);

    const tt = await s.tx((tx) => upcomingSessions(tx, s.tenantId, s.classId, { config: CONFIG, now: NOW }));
    const evening = tt.find((x) => x.start === new Date(start).toISOString())!;
    expect(evening.remaining).toBe(1);
    expect(evening.state).toBe("open");

    // only one seat left → a party of 2 is refused, a single student fits, then it is full
    const tooMany = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.classId, staffId: null, start, customer: customer(2), partySize: 2 }, opts));
    expect(tooMany).toEqual({ ok: false, error: "slot_taken" });
    const b = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.classId, staffId: null, start, customer: customer(3), partySize: 1 }, opts));
    expect(b.ok).toBe(true);
    const full = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.classId, staffId: null, start, customer: customer(4), partySize: 1 }, opts));
    expect(full).toEqual({ ok: false, error: "slot_taken" });
    const tt2 = await s.tx((tx) => upcomingSessions(tx, s.tenantId, s.classId, { config: CONFIG, now: NOW }));
    expect(tt2.find((x) => x.start === new Date(start).toISOString())?.state).toBe("full");

    // cancelling the 2-seat enrolment frees two seats
    const cancelled = await s.tx((tx) => cancelBooking(tx, s.tenantId, a.value.booking.id, { by: "admin", config: CONFIG, now: NOW }));
    expect(cancelled.ok).toBe(true);
    const tt3 = await s.tx((tx) => upcomingSessions(tx, s.tenantId, s.classId, { config: CONFIG, now: NOW }));
    expect(tt3.find((x) => x.start === new Date(start).toISOString())?.remaining).toBe(2);
    // the instructor's private-session availability is untouched by class enrolments (staffId null)
    const [row] = await s.tx((tx) => tx.select({ staffId: bookings.staffId }).from(bookings).where(and(eq(bookings.tenantId, s.tenantId), eq(bookings.id, b.ok ? b.value.booking.id : ""))));
    expect(row?.staffId).toBeNull();
  });

  it("a class pass (package without service) pays for an enrolment and the session is deducted / returned", async () => {
    const s = await seedStudio();
    const customer = { id: "", name: "สมาชิก พาส", phone: "0899999999", email: null as string | null };
    // signed-in customer row
    const { upsertGuestCustomer } = await import("@rentweb/core/customer");
    const c = await s.tx((tx) => upsertGuestCustomer(tx, s.tenantId, { phone: customer.phone, email: null, name: customer.name }));
    customer.id = c!.id;
    const bought = await s.tx((tx) => purchasePackage(tx, s.tenantId, { packageId: s.passId, customer, paymentMethod: "promptpay_qr", consent: { version: "1.0" } }, { settings: SETTINGS, hnPrefix: "ST", now: NOW }));
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(bought.value.patient.hn.startsWith("ST-")).toBe(true);
    registerPaymentHandler("patient_package", onPatientPackagePaid);
    await s.tx((tx) => markPaid(tx, s.tenantId, bought.value.payment.id, { verifiedBy: "test" }));
    const [pp] = await s.tx((tx) => tx.select().from(patientPackages).where(eq(patientPackages.id, bought.value.patientPackage.id)));
    expect(pp?.status).toBe("active");

    const start = at(DAY, "07:30");
    const r = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.classId, staffId: null, start, customer, partySize: 1, patientPackageId: pp!.id }, { config: CONFIG, settings: SETTINGS, now: NOW }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.booking.price).toBe(0);
    expect(r.value.booking.paymentStatus).toBe("paid");
    expect(r.value.payment).toBeNull();
    const [after] = await s.tx((tx) => tx.select().from(patientPackages).where(eq(patientPackages.id, pp!.id)));
    expect(after?.sessionsUsed).toBe(1);
    const tt = await s.tx((tx) => upcomingSessions(tx, s.tenantId, s.classId, { config: CONFIG, now: NOW }));
    expect(tt.find((x) => x.start === new Date(start).toISOString())?.remaining).toBe(2);
    // admin cancels → seat back, session back
    const cancelled = await s.tx((tx) => cancelBooking(tx, s.tenantId, r.value.booking.id, { by: "admin", config: CONFIG, now: NOW }));
    expect(cancelled.ok).toBe(true);
    const [restored] = await s.tx((tx) => tx.select().from(patientPackages).where(eq(patientPackages.id, pp!.id)));
    expect(restored?.sessionsUsed).toBe(0);
    const tt2 = await s.tx((tx) => upcomingSessions(tx, s.tenantId, s.classId, { config: CONFIG, now: NOW }));
    expect(tt2.find((x) => x.start === new Date(start).toISOString())?.remaining).toBe(3);
  });

  it("a studio holiday override removes the day's sessions from the timetable", async () => {
    const s = await seedStudio();
    await s.tx((tx) => tx.insert(availabilityOverrides).values({ tenantId: s.tenantId, staffId: null, startsAt: new Date(at(DAY, "00:00")), endsAt: new Date(at(DAY, "23:59")), kind: "closed", reason: "หยุดชดเชย" }));
    const tt = await s.tx((tx) => listTimetable(tx, s.tenantId, { from: weekStartOf(DAY)!, days: 7, config: CONFIG, now: NOW }));
    expect(tt.map((x) => `${x.date} ${x.state}`)).toEqual(["2026-10-16 closed", "2026-10-16 closed", "2026-10-17 open"]);
  });
});
