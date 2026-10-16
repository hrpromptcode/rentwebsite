/** Regression tests (booking packet): COR-11 visit billing lock, COR-12 Bangkok-calendar age. */
import { beforeAll, describe, expect, it } from "vitest";
import { clinicVisits, eq, payments, patients } from "@rentweb/db";
import { completeVisit, createVisit, saveVisit } from "../src/admin/clinic";
import { patientSchema, visitSchema } from "../src/admin/schemas";
import { ageOn } from "../src/services/time";
import { seedSalon, type Seeded } from "./helpers";

let s: Seeded;
const actor = { userId: "test-user", actorType: "user" as const };

beforeAll(async () => {
  s = await seedSalon();
});

describe("COR-11 saveVisit keeps the bill of a completed / paid visit", () => {
  it("billing changes are refused after completion, clinical notes can still be saved", async () => {
    const [p] = await s.tx((tx) => tx.insert(patients).values({ tenantId: s.tenantId, hn: "LM-0500", firstName: "บิล" }).returning({ id: patients.id }));
    const v = await s.tx((tx) => createVisit(tx, s.tenantId, { patientId: p!.id, bookingId: null, doctorId: null, chiefComplaint: "ปวดหลัง" }, actor));
    if (!v.ok) throw new Error(v.error);
    const bill = visitSchema.parse({ doctorId: null, procedures: [{ name: "นวดรักษา", price: 100000, serviceId: null, staffId: null }], discount: 0 });
    const saved = await s.tx((tx) => saveVisit(tx, s.tenantId, v.value.id, bill, actor));
    expect(saved).toMatchObject({ ok: true, value: { total: 100000 } });
    const done = await s.tx((tx) => completeVisit(tx, s.tenantId, v.value.id, "cash", actor));
    expect(done).toMatchObject({ ok: true, value: { paymentStatus: "paid" } });

    // a direct server-action call with a different bill is rejected and nothing changes
    const cheaper = visitSchema.parse({ doctorId: null, procedures: [{ name: "นวดรักษา", price: 1000, serviceId: null, staffId: null }], discount: 0 });
    const r = await s.tx((tx) => saveVisit(tx, s.tenantId, v.value.id, cheaper, actor));
    expect(r.ok).toBe(false);
    const discounted = visitSchema.parse({ doctorId: null, procedures: [{ name: "นวดรักษา", price: 100000, serviceId: null, staffId: null }], discount: 50000 });
    expect((await s.tx((tx) => saveVisit(tx, s.tenantId, v.value.id, discounted, actor))).ok).toBe(false);
    const [row] = await s.tx((tx) => tx.select().from(clinicVisits).where(eq(clinicVisits.id, v.value.id)));
    expect(row!.total).toBe(100000);
    const [pay] = await s.tx((tx) => tx.select().from(payments).where(eq(payments.id, row!.paymentId!)));
    expect(pay!.amount).toBe(row!.total);

    // same bill + clinical fields → accepted, bill untouched
    const notes = visitSchema.parse({ doctorId: null, procedures: [{ name: "นวดรักษา", price: 100000, serviceId: null, staffId: null }], discount: 0, diagnosis: "กล้ามเนื้ออักเสบ", nextVisitNote: "นัดอีก 2 สัปดาห์" });
    const ok = await s.tx((tx) => saveVisit(tx, s.tenantId, v.value.id, notes, actor));
    expect(ok).toMatchObject({ ok: true, value: { total: 100000 } });
    const [after] = await s.tx((tx) => tx.select().from(clinicVisits).where(eq(clinicVisits.id, v.value.id)));
    expect([after!.diagnosis, after!.total, after!.subtotal]).toEqual(["กล้ามเนื้ออักเสบ", 100000, 100000]);
  });
});

describe("COR-12 ages and birth dates use the Bangkok calendar", () => {
  it("a birthday turns over at 00:00 Bangkok, not at 07:00 (UTC midnight)", () => {
    // 2026-10-17 01:30 Bangkok = 2026-10-16 18:30Z
    const at0130 = new Date("2026-10-16T18:30:00.000Z");
    expect(ageOn("2000-10-17", at0130)).toBe(26);
    expect(ageOn("2000-10-18", at0130)).toBe(25);
    // 2026-10-16 23:30 Bangkok = 16:30Z → still 25
    expect(ageOn("2000-10-17", new Date("2026-10-16T16:30:00.000Z"))).toBe(25);
    expect(ageOn("2026-02-30", at0130)).toBeNull();
    expect(ageOn("2030-01-01", at0130)).toBeNull();
  });

  it("patient birth dates must be real dates and not in the future", () => {
    expect(patientSchema.safeParse({ firstName: "ก", birthDate: "2001-02-29", phone: null, email: null, emergencyPhone: null }).success).toBe(false);
    expect(patientSchema.safeParse({ firstName: "ก", birthDate: "2999-01-01", phone: null, email: null, emergencyPhone: null }).success).toBe(false);
    expect(patientSchema.safeParse({ firstName: "ก", birthDate: "2000-01-01", phone: null, email: null, emergencyPhone: null }).success).toBe(true);
  });
});
