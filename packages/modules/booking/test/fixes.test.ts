/**
 * Regression tests for the platform bug hunt (booking packet, tooling/qa/bughunt/fixes/booking.md):
 * COR-08, COR-09 / SBR-009, SBR-002, SBR-001 / SBR-004, COR-27, SBR-016, SBR-007.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, bookings, customers, eq, packageUsages, patientPackages, patients, payments, services, tenants, withTenant } from "@rentweb/db";
import { attachSlip, expireStalePayments, isPaymentStateError, markPaid, paymentRefundRequired, registerPaymentClosedHandler, registerPaymentHandler } from "@rentweb/core/payments";
import { cancelBooking, createBooking, getBookingForCustomer, onBookingPaid, onBookingPaymentClosed, renewBookingPayment, rescheduleBooking } from "../src/services/bookings";
import { getSlotsForDate, toSlotService } from "../src/services/availability";
import { getServiceById } from "../src/services/catalog";
import { onPatientPackagePaid, onPatientPackagePaymentClosed, purchasePackage } from "../src/services/clinic";
import { formatBkkTime } from "../src/services/time";
import { at, CONFIG, DAY, NOW, SETTINGS, seedSalon, type Seeded } from "./helpers";

let s: Seeded;
let pair: string; // fixed package for 2 guests (seatsPerBooking 2)
const opts = { config: CONFIG, settings: SETTINGS, now: NOW };
const guest = (n: number) => ({ name: `ลูกค้า ${n}`, phone: `08100000${String(n).padStart(2, "0")}` });
const SLIP = { url: "/uploads/t/slip.png" };

const booking = (id: string) => s.tx((tx) => tx.select().from(bookings).where(eq(bookings.id, id)).then((r) => r[0]!));
const paymentRow = (id: string) => s.tx((tx) => tx.select().from(payments).where(eq(payments.id, id)).then((r) => r[0]!));
const paymentsOf = (bookingId: string) => s.tx((tx) => tx.select().from(payments).where(and(eq(payments.refType, "booking"), eq(payments.refId, bookingId))));
const slotsFor = (serviceId: string, date = DAY, staffId: string | null = null) =>
  s.tx(async (tx) => getSlotsForDate(tx, s.tenantId, { service: toSlotService((await getServiceById(tx, s.tenantId, serviceId))!), date, staffId, config: CONFIG, now: NOW }));
const slotAt = async (serviceId: string, hm: string, date = DAY) => (await slotsFor(serviceId, date)).find((x) => formatBkkTime(x.start) === hm);

beforeAll(async () => {
  s = await seedSalon();
  registerPaymentHandler("booking", onBookingPaid);
  registerPaymentHandler("patient_package", onPatientPackagePaid);
  registerPaymentClosedHandler("booking", onBookingPaymentClosed);
  registerPaymentClosedHandler("patient_package", onPatientPackagePaymentClosed);
  const [p] = await s.tx((tx) =>
    tx.insert(services).values({ tenantId: s.tenantId, name: "แพ็กเกจคู่ (2 ท่าน)", slug: "pair", durationMin: 60, price: 200000, capacity: 2, seatsPerBooking: 2, sort: 9 }).returning({ id: services.id }),
  );
  pair = p!.id;
  const { staffServices } = await import("@rentweb/db");
  await s.tx((tx) => tx.insert(staffServices).values([s.staff.ann, s.staff.mali, s.staff.nam].map((staffId) => ({ tenantId: s.tenantId, staffId, serviceId: pair }))));
});

describe("COR-08 cancel voids the deposit; late money never confirms a cancelled booking", () => {
  it("customer cancel → open QR cancelled, a slip upload is refused, booking stays cancelled + unpaid", async () => {
    const r = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.aroma90, staffId: s.staff.nam, start: at(DAY, "10:00"), customer: guest(1), paymentMethod: "promptpay_qr" }, opts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pay = r.value.payment!;
    const c = await s.tx((tx) => cancelBooking(tx, s.tenantId, r.value.booking.id, { by: "customer", config: CONFIG, now: NOW }));
    expect(c.ok).toBe(true);
    expect((await paymentRow(pay.id)).status).toBe("cancelled");
    let err: unknown = null;
    await s.tx((tx) => attachSlip(tx, s.tenantId, pay.id, SLIP, { autoApprove: true })).catch((e) => (err = e));
    expect(isPaymentStateError(err)).toBe(true);
    const b = await booking(r.value.booking.id);
    expect([b.status, b.paymentStatus]).toEqual(["cancelled", "unpaid"]);
  });

  it("a slip that was already under review stays for the admin; approving it flags a refund instead of paying the booking", async () => {
    const r = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.aroma90, staffId: s.staff.nam, start: at(DAY, "12:00"), customer: guest(2), paymentMethod: "slip" }, opts));
    if (!r.ok) throw new Error(r.error);
    const pay = r.value.payment!;
    await s.tx((tx) => attachSlip(tx, s.tenantId, pay.id, SLIP));
    await s.tx((tx) => cancelBooking(tx, s.tenantId, r.value.booking.id, { by: "customer", config: CONFIG, now: NOW }));
    expect((await paymentRow(pay.id)).status).toBe("pending_verification");
    const paid = await s.tx((tx) => markPaid(tx, s.tenantId, pay.id, { verifiedBy: "admin" }));
    expect(paid.status).toBe("paid");
    expect(paymentRefundRequired(paid)).toBeTruthy();
    const b = await booking(r.value.booking.id);
    expect([b.status, b.paymentStatus]).toEqual(["cancelled", "unpaid"]);
  });

  it("onBookingPaid refuses (refundRequired) for cancelled / no-show bookings and for a second payment", async () => {
    const r = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.aroma90, staffId: s.staff.mali, start: at(DAY, "12:00"), customer: guest(3), paymentMethod: "promptpay_qr" }, opts));
    if (!r.ok) throw new Error(r.error);
    await s.tx((tx) => markPaid(tx, s.tenantId, r.value.payment!.id, { verifiedBy: "test" }));
    expect((await booking(r.value.booking.id)).paymentStatus).toBe("deposit_paid");
    // a stray second payment for the same booking
    const { createPayment } = await import("@rentweb/core/payments");
    const extra = await s.tx((tx) => createPayment(tx, s.tenantId, { refType: "booking", refId: r.value.booking.id, amount: 30000, provider: "promptpay", method: "promptpay_qr" }));
    const second = await s.tx((tx) => markPaid(tx, s.tenantId, extra.id, { verifiedBy: "test" }));
    expect(paymentRefundRequired(second)).toBe("ชำระซ้ำ");
    // the booking's own payment again is a harmless no-op
    expect(await s.tx(async (tx) => onBookingPaid(tx, (await tx.select().from(payments).where(eq(payments.id, r.value.payment!.id)))[0]!))).toBeUndefined();
  });
});

describe("COR-09 / SBR-009 reschedule moves the payment state to the new booking", () => {
  it("unpaid: the old QR is voided and the new booking gets its own live QR; paying it confirms the NEW booking", async () => {
    const r = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.aroma90, staffId: s.staff.nam, start: at(DAY, "14:00"), customer: guest(4), paymentMethod: "promptpay_qr" }, opts));
    if (!r.ok) throw new Error(r.error);
    const oldPay = r.value.payment!;
    const moved = await s.tx((tx) => rescheduleBooking(tx, s.tenantId, r.value.booking.id, { start: at(DAY, "16:00"), by: "customer" }, opts));
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    const next = moved.value.booking;
    expect(moved.value.payment).not.toBeNull();
    expect(moved.value.payment!.id).not.toBe(oldPay.id);
    expect(moved.value.payment!.refId).toBe(next.id);
    expect(moved.value.payment!.status).toBe("pending");
    expect(moved.value.payment!.qrPayload).toBeTruthy();
    expect((next.answers as { paymentId: string }).paymentId).toBe(moved.value.payment!.id);
    expect((await paymentRow(oldPay.id)).status).toBe("cancelled");
    // the booking page finds a live payment (no "QR expired" card)
    const detail = await s.tx((tx) => getBookingForCustomer(tx, s.tenantId, next.id, { key: moved.value.accessKey }));
    expect(detail?.payment?.id).toBe(moved.value.payment!.id);
    expect(detail!.payment!.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    // paying the original QR is refused, paying the new one confirms the new booking
    let err: unknown = null;
    await s.tx((tx) => attachSlip(tx, s.tenantId, oldPay.id, SLIP, { autoApprove: true })).catch((e) => (err = e));
    expect(isPaymentStateError(err)).toBe(true);
    await s.tx((tx) => attachSlip(tx, s.tenantId, moved.value.payment!.id, SLIP, { autoApprove: true }));
    const b = await booking(next.id);
    expect([b.status, b.paymentStatus]).toEqual(["confirmed", "deposit_paid"]);
    const old = await booking(r.value.booking.id);
    expect([old.status, old.paymentStatus]).toEqual(["cancelled", "unpaid"]);
  });

  it("deposit paid: the paid payment follows the booking so refunds target the live one", async () => {
    const r = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.aroma90, staffId: s.staff.ann, start: at(DAY, "13:00"), customer: guest(5), paymentMethod: "promptpay_qr" }, opts));
    if (!r.ok) throw new Error(r.error);
    await s.tx((tx) => markPaid(tx, s.tenantId, r.value.payment!.id, { verifiedBy: "test" }));
    const moved = await s.tx((tx) => rescheduleBooking(tx, s.tenantId, r.value.booking.id, { start: at(DAY, "17:00"), by: "customer" }, opts));
    if (!moved.ok) throw new Error(moved.error);
    expect(moved.value.booking.status).toBe("confirmed");
    expect(moved.value.booking.paymentStatus).toBe("deposit_paid");
    expect(moved.value.payment?.id).toBe(r.value.payment!.id);
    expect((await paymentRow(r.value.payment!.id)).refId).toBe(moved.value.booking.id);
    expect(await paymentsOf(r.value.booking.id)).toHaveLength(0);
  });

  it("a slip under review moves with the booking and no second QR is issued", async () => {
    const r = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.aroma90, staffId: s.staff.mali, start: at(DAY, "18:30"), customer: guest(6), paymentMethod: "slip" }, opts));
    if (!r.ok) throw new Error(r.error);
    await s.tx((tx) => attachSlip(tx, s.tenantId, r.value.payment!.id, SLIP));
    const moved = await s.tx((tx) => rescheduleBooking(tx, s.tenantId, r.value.booking.id, { start: at(DAY, "20:00"), by: "customer" }, opts));
    if (!moved.ok) throw new Error(moved.error);
    expect(moved.value.booking.status).toBe("pending");
    expect(moved.value.payment?.id).toBe(r.value.payment!.id);
    expect(moved.value.payment?.status).toBe("pending_verification");
    expect(await paymentsOf(moved.value.booking.id)).toHaveLength(1);
  });
});

describe("SBR-002 an expired deposit releases the slot", () => {
  it("the expiry sweep cancels the pending booking (system) and the slot is bookable again", async () => {
    const r = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.aroma90, staffId: s.staff.nam, start: at("2026-10-17", "11:00"), customer: guest(7), paymentMethod: "promptpay_qr" }, opts));
    if (!r.ok) throw new Error(r.error);
    expect((await slotsFor(s.services.aroma90, "2026-10-17", s.staff.nam)).find((x) => formatBkkTime(x.start) === "11:00")?.available).toBe(false);
    const res = await expireStalePayments(s.db, { now: new Date(Date.now() + 3 * 3_600_000), refTypes: ["booking"] });
    expect(res.expired).toBeGreaterThanOrEqual(1);
    expect((await paymentRow(r.value.payment!.id)).status).toBe("expired");
    const b = await booking(r.value.booking.id);
    expect([b.status, b.cancelledBy, b.cancelReason]).toEqual(["cancelled", "system", "หมดเวลาชำระมัดจำ"]);
    expect((await slotsFor(s.services.aroma90, "2026-10-17", s.staff.nam)).find((x) => formatBkkTime(x.start) === "11:00")?.available).toBe(true);
  });

  it("a renewed QR supersedes the old one: closing the old payment does not cancel the booking", async () => {
    const r = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.aroma90, staffId: s.staff.mali, start: at("2026-10-17", "15:00"), customer: guest(8), paymentMethod: "promptpay_qr" }, opts));
    if (!r.ok) throw new Error(r.error);
    // pretend the first QR ran out → renew
    await s.tx((tx) => tx.update(payments).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(payments.id, r.value.payment!.id)));
    const renewed = await s.tx((tx) => renewBookingPayment(tx, s.tenantId, r.value.booking.id, null, SETTINGS));
    expect(renewed.ok).toBe(true);
    if (!renewed.ok) return;
    expect(renewed.value.id).not.toBe(r.value.payment!.id);
    expect((await paymentRow(r.value.payment!.id)).status).toBe("cancelled");
    // the closed handler for the superseded payment is a no-op
    await s.tx(async (tx) => onBookingPaymentClosed(tx, (await tx.select().from(payments).where(eq(payments.id, r.value.payment!.id)))[0]!, { status: "expired", reason: "x" }));
    expect((await booking(r.value.booking.id)).status).toBe("pending");
    // a live payment is reused instead of issuing yet another QR
    const again = await s.tx((tx) => renewBookingPayment(tx, s.tenantId, r.value.booking.id, null, SETTINGS));
    expect(again.ok && again.value.id).toBe(renewed.value.id);
  });
});

describe("SBR-001 / SBR-004 capacity × staff", () => {
  it("a fixed 2-guest package takes the whole session and two therapists; nobody else can book that slot", async () => {
    const r = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: pair, start: at("2026-10-18", "15:00"), customer: guest(10) }, opts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.booking.partySize).toBe(2);
    expect(r.value.booking.price).toBe(200000); // priced per booking
    expect(r.value.booking.staffId).toBeTruthy();
    expect(r.value.booking.extraStaffIds).toHaveLength(1);
    expect(r.value.booking.extraStaffIds[0]).not.toBe(r.value.booking.staffId);
    const second = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: pair, start: at("2026-10-18", "15:00"), customer: guest(11) }, opts));
    expect(second).toMatchObject({ ok: false, error: "slot_taken" });
    // the two therapists are busy for 1:1 services too: 2026-10-18 is a Sunday (Ann off) → nobody left for thai-60
    expect((await slotAt(s.services.thai60, "15:00", "2026-10-18"))?.remaining).toBe(0);
    expect((await slotAt(s.services.thai60, "17:00", "2026-10-18"))?.remaining).toBe(2);
  });

  it("per-person service: party of 2 is priced per guest and reserves two staff; seats are capped by capacity", async () => {
    const r = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.couple, start: at("2026-10-18", "18:00"), customer: guest(12), partySize: 2 }, opts));
    if (!r.ok) throw new Error(r.error);
    expect(r.value.booking.partySize).toBe(2);
    expect(r.value.booking.price).toBe(299000 * 2);
    expect(r.value.booking.extraStaffIds).toHaveLength(1);
    expect(await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.couple, start: at("2026-10-18", "18:00"), customer: guest(13) }, opts))).toMatchObject({ ok: false, error: "slot_taken" });
    // party size above capacity is clamped
    const big = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.couple, start: at("2026-10-19", "18:00"), customer: guest(14), partySize: 9 }, opts));
    expect(big.ok && big.value.booking.partySize).toBe(2);
  });

  it("group slots are only offered when enough eligible staff are on shift", async () => {
    // 2026-10-20 10:00: only Mali and Nam work mornings (Ann 13:00–22:00)
    expect((await slotAt(pair, "10:00", "2026-10-20"))?.available).toBe(true);
    const one = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.thai60, staffId: s.staff.mali, start: at("2026-10-20", "10:00"), customer: guest(15) }, opts));
    expect(one.ok).toBe(true);
    const slot = await slotAt(pair, "10:00", "2026-10-20");
    expect(slot?.available).toBe(false);
    expect(slot?.remaining).toBe(1);
    expect(await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: pair, start: at("2026-10-20", "10:00"), customer: guest(16) }, opts))).toMatchObject({ ok: false, error: "slot_taken" });
  });
});

describe("COR-27 'ใครก็ได้' picks another free staff when the first choice is taken", () => {
  it("an exclusion violation on the least-booked staff falls back to the next free staff instead of slot_taken", async () => {
    // a booking of another tenant on Ann (invisible to this tenant's engine – same effect as a concurrent insert)
    const [other] = await s.db.insert(tenants).values({ slug: "other-tenant-cor27", name: "Other", siteType: "salon" }).returning({ id: tenants.id });
    await withTenant(s.db, other!.id, (tx) =>
      tx.insert(bookings).values({ tenantId: other!.id, number: "X-27", serviceId: s.services.consult, staffId: s.staff.ann, startsAt: new Date(at("2026-10-21", "16:00")), endsAt: new Date(at("2026-10-21", "17:00")), status: "confirmed", customerName: "ghost" }),
    );
    const before = await slotAt(s.services.thai60, "16:00", "2026-10-21");
    expect(before?.remaining).toBe(3);
    const r = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.thai60, start: at("2026-10-21", "16:00"), customer: guest(17) }, opts));
    expect(r.ok).toBe(true);
    if (r.ok) expect([s.staff.mali, s.staff.nam]).toContain(r.value.booking.staffId);
  });
});

describe("SBR-016 / SBR-007 clinic course holders book online with a session", () => {
  let customerId: string;
  let ppId: string;

  it("purchase requires consent and records it on the patient (PDPA)", async () => {
    const [c] = await s.tx((tx) => tx.insert(customers).values({ tenantId: s.tenantId, name: "คอร์ส ทดสอบ", phone: "0891234567" }).returning({ id: customers.id }));
    customerId = c!.id;
    const ref = { id: customerId, name: "คอร์ส ทดสอบ", phone: "0891234567" };
    const no = await s.tx((tx) => purchasePackage(tx, s.tenantId, { packageId: s.packageId, customer: ref, paymentMethod: "slip", consent: null }, { settings: SETTINGS, hnPrefix: "LM", now: NOW }));
    expect(no).toMatchObject({ ok: false, error: "consent_required" });
    expect(await s.tx((tx) => tx.select().from(patientPackages))).toHaveLength(0);
    const r = await s.tx((tx) => purchasePackage(tx, s.tenantId, { packageId: s.packageId, customer: ref, paymentMethod: "slip", consent: { version: "2.1" } }, { settings: SETTINGS, hnPrefix: "LM", now: NOW }));
    if (!r.ok) throw new Error(r.error);
    const [p] = await s.tx((tx) => tx.select().from(patients).where(eq(patients.id, r.value.patient.id)));
    expect(p!.consents.pdpa).toMatchObject({ version: "2.1", by: "customer" });
    expect(p!.consents.treatment).toMatchObject({ version: "2.1", by: "customer" });
    ppId = r.value.patientPackage.id;
    await s.tx((tx) => markPaid(tx, s.tenantId, r.value.payment.id, { verifiedBy: "test" }));
  });

  it("booking with the course costs nothing, spends a session and gives it back on cancel", async () => {
    const ref = { id: customerId, name: "คอร์ส ทดสอบ", phone: "0891234567" };
    const r = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.thai60, start: at("2026-10-22", "11:00"), customer: ref, patientPackageId: ppId }, opts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.booking.price).toBe(0);
    expect(r.value.booking.paymentStatus).toBe("paid");
    expect(r.value.booking.status).toBe("confirmed");
    expect(r.value.payment).toBeNull();
    const pp = () => s.tx((tx) => tx.select().from(patientPackages).where(eq(patientPackages.id, ppId)).then((x) => x[0]!));
    expect((await pp()).sessionsUsed).toBe(1);
    expect(await s.tx((tx) => tx.select().from(packageUsages).where(eq(packageUsages.patientPackageId, ppId)))).toHaveLength(1);
    const detail = await s.tx((tx) => getBookingForCustomer(tx, s.tenantId, r.value.booking.id, { customerId }));
    expect(detail?.package).toMatchObject({ id: ppId, sessionsLeft: 4 });
    // reschedule keeps the session (no second deduction)
    const moved = await s.tx((tx) => rescheduleBooking(tx, s.tenantId, r.value.booking.id, { start: at("2026-10-22", "12:00"), by: "customer" }, opts));
    if (!moved.ok) throw new Error(moved.error);
    expect(moved.value.booking.price).toBe(0);
    expect((await pp()).sessionsUsed).toBe(1);
    await s.tx((tx) => cancelBooking(tx, s.tenantId, moved.value.booking.id, { by: "customer", config: CONFIG, now: NOW }));
    expect((await pp()).sessionsUsed).toBe(0);
    expect(await s.tx((tx) => tx.select().from(packageUsages).where(eq(packageUsages.patientPackageId, ppId)))).toHaveLength(0);
  });

  it("the course cannot pay for another service or for somebody else", async () => {
    const ref = { id: customerId, name: "คอร์ส ทดสอบ", phone: "0891234567" };
    expect(await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.aroma90, start: at("2026-10-22", "15:00"), customer: ref, patientPackageId: ppId }, opts))).toMatchObject({ ok: false, error: "package_not_usable" });
    const [c] = await s.tx((tx) => tx.insert(customers).values({ tenantId: s.tenantId, name: "คนอื่น", phone: "0897654321" }).returning({ id: customers.id }));
    expect(
      await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.thai60, start: at("2026-10-22", "15:00"), customer: { id: c!.id, name: "คนอื่น", phone: "0897654321" }, patientPackageId: ppId }, opts)),
    ).toMatchObject({ ok: false, error: "package_not_usable" });
    expect(await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.thai60, start: at("2026-10-22", "15:00"), customer: { name: "guest", phone: "0897654322" }, patientPackageId: ppId }, opts))).toMatchObject({
      ok: false,
      error: "package_not_usable",
    });
  });

  it("an unpaid course purchase is cancelled when its payment expires", async () => {
    const ref = { id: customerId, name: "คอร์ส ทดสอบ", phone: "0891234567" };
    const r = await s.tx((tx) => purchasePackage(tx, s.tenantId, { packageId: s.packageId, customer: ref, paymentMethod: "promptpay_qr", consent: { version: "2.1" } }, { settings: SETTINGS, hnPrefix: "LM", now: NOW }));
    if (!r.ok) throw new Error(r.error);
    await expireStalePayments(s.db, { now: new Date(Date.now() + 3 * 3_600_000), refTypes: ["patient_package"] });
    const [pp] = await s.tx((tx) => tx.select().from(patientPackages).where(eq(patientPackages.id, r.value.patientPackage.id)));
    expect(pp!.status).toBe("cancelled");
    // late money for it is flagged for a refund
    const paid = await s.tx((tx) => markPaid(tx, s.tenantId, r.value.payment.id, { verifiedBy: "admin" }));
    expect(paymentRefundRequired(paid)).toBeTruthy();
  });
});
