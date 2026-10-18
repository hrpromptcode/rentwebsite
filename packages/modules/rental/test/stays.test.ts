import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, eventsOutbox, payments, rentalBlockedDates, rentalStays } from "@rentweb/db";
import { attachSlip, cancelPayment, expireStalePayments, markPaid, paymentRefundRequired, registerPaymentAccessCheck, registerPaymentClosedHandler, registerPaymentHandler, registerPaymentTargetCheck, canAccessPayment } from "@rentweb/core/payments";
import { cancelStay, createStay, evaluateCancellation, getStayForCustomer, listCustomerStays, onStayPaid, onStayPaymentClosed, renewStayPayment, stayClosedReason, stayPaymentAccess, transitionStay } from "../src/services/stays";
import { unitsAvailable } from "../src/services/availability";
import { getUnitTypeById } from "../src/services/catalog";
import { CONFIG, NOW, SETTINGS, seedResort, type Seeded } from "./helpers";

let s: Seeded;
const opts = { config: CONFIG, settings: SETTINGS, now: NOW };

beforeAll(async () => {
  s = await seedResort();
  registerPaymentHandler("stay", onStayPaid);
  registerPaymentClosedHandler("stay", onStayPaymentClosed);
  registerPaymentTargetCheck("stay", stayClosedReason);
  registerPaymentAccessCheck("stay", stayPaymentAccess);
});

const stayRow = (id: string) => s.tx(async (tx) => (await tx.select().from(rentalStays).where(eq(rentalStays.id, id)))[0]!);
const paymentRow = (id: string) => s.tx(async (tx) => (await tx.select().from(payments).where(eq(payments.id, id)))[0]!);
const events = (type: string) => s.tx((tx) => tx.select().from(eventsOutbox).where(and(eq(eventsOutbox.tenantId, s.tenantId), eq(eventsOutbox.type, type))));

describe("createStay", () => {
  it("numbers stays ST-1001…, opens a deposit payment with expiry, holds the unit and stores an access key", async () => {
    const r = await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.deluxe, checkIn: "2026-11-10", checkOut: "2026-11-13", guests: 2, extras: [{ id: s.extras.breakfast, qty: 1 }], customer: s.guest(1), paymentMethod: "promptpay_qr" }, opts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { stay, payment, accessKey, quote } = r.value;
    expect(stay.number).toBe("ST-1001");
    expect(stay.status).toBe("pending");
    expect(stay.paymentStatus).toBe("unpaid");
    expect(stay.nights).toBe(3);
    // Tue 10, Wed 11, Thu 12 Nov: 3,750 each (high season) + breakfast 350 × 2 × 3
    expect(quote.roomTotal).toBe(1125000);
    expect(quote.extrasTotal).toBe(210000);
    expect(stay.total).toBe(1335000);
    expect(stay.depositAmount).toBe(400500);
    expect(payment).toMatchObject({ refType: "stay", refId: stay.id, amount: 400500, method: "promptpay_qr", status: "pending" });
    expect(payment!.expiresAt).toBeInstanceOf(Date);
    expect(stay.holdUntil!.getTime()).toBeGreaterThan(NOW.getTime());
    expect(stay.paymentId).toBe(payment!.id);
    expect(accessKey).toHaveLength(22);
    expect(stay.customerId).toBeTruthy();
    const detail = await s.tx((tx) => getStayForCustomer(tx, s.tenantId, stay.id, { key: accessKey }));
    expect(detail?.type.slug).toBe("deluxe");
    expect(detail?.payment?.id).toBe(payment!.id);
    expect(await s.tx((tx) => getStayForCustomer(tx, s.tenantId, stay.id, { key: "wrong" }))).toBeNull();
    expect(await s.tx((tx) => getStayForCustomer(tx, s.tenantId, stay.id, { customerId: stay.customerId }))).not.toBeNull();
    expect((await events("stay.created")).length).toBe(1);
  });

  it("'full' pay option charges the whole total; a stay with nothing due is confirmed at once", async () => {
    const full = await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.deluxe, checkIn: "2026-11-10", checkOut: "2026-11-11", guests: 2, customer: s.guest(2), paymentMethod: "slip", payOption: "full" }, opts));
    expect(full.ok && full.value.payment?.amount).toBe(375000);
    const free = await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.deluxe, checkIn: "2026-11-10", checkOut: "2026-11-11", guests: 2, customer: s.guest(3) }, { ...opts, config: { ...CONFIG, depositPercent: 0 } }));
    expect(free.ok && free.value.stay.status).toBe("confirmed");
    expect(free.ok && free.value.payment).toBeNull();
    // pay at the property (cash) → confirmed now, cash payment row open for the front desk
    const cash = await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.deluxe, checkIn: "2026-11-11", checkOut: "2026-11-12", guests: 2, customer: s.guest(4), paymentMethod: "cash" }, { ...opts, config: { ...CONFIG, allowPayAtProperty: true } }));
    expect(cash.ok && cash.value.stay.status).toBe("confirmed");
    expect(cash.ok && cash.value.payment?.method).toBe("cash");
    expect(cash.ok && cash.value.payment?.expiresAt).toBeNull();
    // the cash method is refused when the policy does not offer it
    const noCash = await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.deluxe, checkIn: "2026-11-11", checkOut: "2026-11-12", guests: 2, customer: s.guest(4), paymentMethod: "cash" }, opts));
    expect(noCash).toMatchObject({ ok: false, error: "payment_method" });
  });

  it("validation errors come back as results (never throws): min nights, guests, unknown type", async () => {
    expect(await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.villa, checkIn: "2026-11-10", checkOut: "2026-11-11", guests: 2, customer: s.guest(5) }, opts))).toMatchObject({ ok: false, error: "min_nights" });
    expect(await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.deluxe, checkIn: "2026-11-10", checkOut: "2026-11-12", guests: 9, customer: s.guest(5) }, opts))).toMatchObject({ ok: false, error: "too_many_guests" });
    expect(await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: "00000000-0000-0000-0000-000000000000", checkIn: "2026-11-10", checkOut: "2026-11-12", guests: 2, customer: s.guest(5) }, opts))).toMatchObject({ ok: false, error: "unit_type_not_found" });
    expect(await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: "nope", checkIn: "2026-11-10", checkOut: "2026-11-12", guests: 2, customer: s.guest(5) }, opts))).toMatchObject({ ok: false, error: "unit_type_not_found" });
  });

  it("the last unit: a second overlapping guest is refused, an adjacent stay is fine", async () => {
    const a = await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.villa, checkIn: "2026-12-01", checkOut: "2026-12-04", guests: 4, customer: s.guest(6), paymentMethod: "promptpay_qr" }, opts));
    expect(a.ok).toBe(true);
    const overlap = await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.villa, checkIn: "2026-12-03", checkOut: "2026-12-06", guests: 2, customer: s.guest(7), paymentMethod: "promptpay_qr" }, opts));
    expect(overlap).toMatchObject({ ok: false, error: "unavailable" });
    const adjacent = await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.villa, checkIn: "2026-12-04", checkOut: "2026-12-06", guests: 2, customer: s.guest(7), paymentMethod: "promptpay_qr" }, opts));
    expect(adjacent.ok).toBe(true);
  });

  it("two parallel bookings for the last unit → exactly one wins", async () => {
    const villa = (await s.tx((tx) => getUnitTypeById(tx, s.tenantId, s.types.villa)))!;
    const dates = { checkIn: "2027-01-10", checkOut: "2027-01-13", guests: 4 } as const;
    const [r1, r2] = await Promise.all([
      s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: villa.id, ...dates, customer: s.guest(8), paymentMethod: "slip" }, opts)),
      s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: villa.id, ...dates, customer: s.guest(9), paymentMethod: "slip" }, opts)),
    ]);
    expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1);
    const loser = [r1, r2].find((r) => !r.ok)!;
    expect(loser).toMatchObject({ ok: false, error: "unavailable" });
    expect(await s.tx((tx) => unitsAvailable(tx, s.tenantId, villa, dates.checkIn, dates.checkOut, { now: NOW }))).toBe(0);
  });

  it("a blocked date makes the type unbookable across it", async () => {
    await s.tx((tx) => tx.insert(rentalBlockedDates).values({ tenantId: s.tenantId, unitTypeId: s.types.deluxe, date: "2026-11-25", reason: "ซ่อมบำรุง" }));
    expect(await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.deluxe, checkIn: "2026-11-24", checkOut: "2026-11-26", guests: 2, customer: s.guest(10) }, opts))).toMatchObject({ ok: false, error: "unavailable" });
    expect((await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.deluxe, checkIn: "2026-11-23", checkOut: "2026-11-25", guests: 2, customer: s.guest(10) }, opts))).ok).toBe(true);
  });
});

describe("payment hooks", () => {
  it("markPaid confirms the pending stay (deposit_paid), the same payment again changes nothing, late balance → paid", async () => {
    const r = await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.deluxe, checkIn: "2026-11-15", checkOut: "2026-11-17", guests: 2, customer: s.guest(11), paymentMethod: "promptpay_qr" }, opts));
    if (!r.ok) throw new Error(r.error);
    const pid = r.value.payment!.id;
    await s.tx((tx) => markPaid(tx, s.tenantId, pid, { verifiedBy: "test" }));
    let st = await stayRow(r.value.stay.id);
    expect([st.status, st.paymentStatus, st.paidAmount, st.holdUntil]).toEqual(["confirmed", "deposit_paid", r.value.stay.depositAmount, null]);
    expect(st.confirmedAt).toBeInstanceOf(Date);
    // idempotent: the handler is not re-run by markPaid and a direct second call is a no-op
    await s.tx((tx) => markPaid(tx, s.tenantId, pid, { verifiedBy: "test" }));
    const paidRow = await paymentRow(pid); // read outside the tx: PGlite has one connection, a nested s.tx() deadlocks
    expect(await s.tx((tx) => onStayPaid(tx, paidRow as never))).toBeUndefined();
    st = await stayRow(r.value.stay.id);
    expect(st.paidAmount).toBe(r.value.stay.depositAmount);
    expect((await events("stay.confirmed")).length).toBeGreaterThanOrEqual(1);
  });

  it("slip upload with auto-approve runs the paid hook (strict) and confirms", async () => {
    const r = await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.deluxe, checkIn: "2026-11-16", checkOut: "2026-11-18", guests: 2, customer: s.guest(12), paymentMethod: "slip" }, opts));
    if (!r.ok) throw new Error(r.error);
    await s.tx((tx) => attachSlip(tx, s.tenantId, r.value.payment!.id, { url: "/uploads/t/slip.png" }, { autoApprove: true }));
    expect((await stayRow(r.value.stay.id)).status).toBe("confirmed");
  });

  it("expiry sweep releases the pending stay (closed handler) and frees the unit", async () => {
    const villa = (await s.tx((tx) => getUnitTypeById(tx, s.tenantId, s.types.villa)))!;
    const r = await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: villa.id, checkIn: "2027-02-01", checkOut: "2027-02-04", guests: 4, customer: s.guest(13), paymentMethod: "promptpay_qr" }, opts));
    if (!r.ok) throw new Error(r.error);
    expect(await s.tx((tx) => unitsAvailable(tx, s.tenantId, villa, "2027-02-01", "2027-02-04", { now: NOW }))).toBe(0);
    const res = await expireStalePayments(s.db, { now: new Date(Date.now() + 3 * 3_600_000), refTypes: ["stay"] });
    expect(res.expired).toBeGreaterThanOrEqual(1);
    expect((await paymentRow(r.value.payment!.id)).status).toBe("expired");
    const st = await stayRow(r.value.stay.id);
    expect([st.status, st.cancelledBy, st.cancelReason]).toEqual(["cancelled", "system", "หมดเวลาชำระเงิน"]);
    expect(await s.tx((tx) => unitsAvailable(tx, s.tenantId, villa, "2027-02-01", "2027-02-04", { now: NOW }))).toBe(1);
    // late money for the cancelled stay is flagged for a refund (target check), the stay stays cancelled
    const paid = await s.tx((tx) => markPaid(tx, s.tenantId, r.value.payment!.id, { verifiedBy: "admin" }));
    expect(paymentRefundRequired(paid)).toBe("การจองถูกยกเลิกแล้ว");
    expect((await stayRow(r.value.stay.id)).status).toBe("cancelled");
  });

  it("paid after the hold lapsed and another guest took the last unit → refundRequired, stay not confirmed", async () => {
    const villa = (await s.tx((tx) => getUnitTypeById(tx, s.tenantId, s.types.villa)))!;
    const a = await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: villa.id, checkIn: "2027-02-10", checkOut: "2027-02-12", guests: 4, customer: s.guest(14), paymentMethod: "promptpay_qr" }, opts));
    if (!a.ok) throw new Error(a.error);
    // 2 h later A's hold has lapsed → B books and pays
    const later = new Date(NOW.getTime() + 2 * 3_600_000);
    const b = await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: villa.id, checkIn: "2027-02-10", checkOut: "2027-02-12", guests: 4, customer: s.guest(15), paymentMethod: "promptpay_qr" }, { ...opts, now: later }));
    if (!b.ok) throw new Error(b.error);
    await s.tx((tx) => markPaid(tx, s.tenantId, b.value.payment!.id, { verifiedBy: "test" }));
    expect((await stayRow(b.value.stay.id)).status).toBe("confirmed");
    const paidA = await s.tx((tx) => markPaid(tx, s.tenantId, a.value.payment!.id, { verifiedBy: "test" }));
    expect(paymentRefundRequired(paidA)).toContain("ไม่ว่างแล้ว");
    expect((await stayRow(a.value.stay.id)).status).toBe("pending");
  });

  it("a superseded (renewed) payment cannot release the stay; the new one confirms it", async () => {
    const r = await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.deluxe, checkIn: "2026-11-18", checkOut: "2026-11-19", guests: 2, customer: s.guest(16), paymentMethod: "promptpay_qr" }, opts));
    if (!r.ok) throw new Error(r.error);
    const old = r.value.payment!;
    const renewed = await s.tx((tx) => renewStayPayment(tx, s.tenantId, r.value.stay.id, "slip", opts));
    expect(renewed.ok).toBe(true);
    if (!renewed.ok) return;
    expect((await paymentRow(old.id)).status).toBe("cancelled");
    expect((await stayRow(r.value.stay.id)).status).toBe("pending");
    // closing the old payment again (idempotent) must not touch the stay
    const oldRow = await paymentRow(old.id);
    await s.tx((tx) => onStayPaymentClosed(tx, oldRow as never, { status: "cancelled", reason: "x" }));
    expect((await stayRow(r.value.stay.id)).status).toBe("pending");
    await s.tx((tx) => markPaid(tx, s.tenantId, renewed.value.payment.id, { verifiedBy: "test" }));
    expect((await stayRow(r.value.stay.id)).status).toBe("confirmed");
  });

  it("access check: owner or access key may see the payment, strangers may not", async () => {
    const r = await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.deluxe, checkIn: "2026-11-19", checkOut: "2026-11-20", guests: 2, customer: s.guest(17), paymentMethod: "promptpay_qr" }, opts));
    if (!r.ok) throw new Error(r.error);
    const p = r.value.payment!;
    expect(await s.tx((tx) => canAccessPayment(tx, p, { accessKey: r.value.accessKey }))).toBe("access_key");
    expect(await s.tx((tx) => canAccessPayment(tx, p, { customerId: r.value.stay.customerId }))).toBe("customer");
    expect(await s.tx((tx) => canAccessPayment(tx, p, { accessKey: "nope" }))).toBeNull();
    expect(await s.tx((tx) => canAccessPayment(tx, p, {}))).toBeNull();
  });
});

describe("cancellation + front desk", () => {
  it("policy: free when far enough ahead, deposit kept inside the window", () => {
    const stay = { checkIn: "2026-10-30", paidAmount: 90000, depositAmount: 90000 };
    expect(evaluateCancellation(stay, CONFIG, NOW)).toEqual({ daysBefore: 15, free: true, refundDue: 90000, kept: 0 });
    expect(evaluateCancellation({ ...stay, checkIn: "2026-10-18" }, CONFIG, NOW)).toEqual({ daysBefore: 3, free: false, refundDue: 0, kept: 90000 });
    expect(evaluateCancellation({ ...stay, checkIn: "2026-10-18", paidAmount: 300000 }, CONFIG, NOW)).toEqual({ daysBefore: 3, free: false, refundDue: 210000, kept: 90000 });
    expect(evaluateCancellation({ ...stay, checkIn: "2026-10-22" }, CONFIG, NOW).free).toBe(true); // exactly 7 days
  });

  it("customer cancel within the window → free + refund due; open payments are voided", async () => {
    const r = await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.deluxe, checkIn: "2026-12-10", checkOut: "2026-12-12", guests: 2, customer: s.guest(18), paymentMethod: "promptpay_qr" }, opts));
    if (!r.ok) throw new Error(r.error);
    await s.tx((tx) => markPaid(tx, s.tenantId, r.value.payment!.id, { verifiedBy: "test" }));
    const c = await s.tx((tx) => cancelStay(tx, s.tenantId, r.value.stay.id, { by: "customer", reason: "แผนเปลี่ยน", config: CONFIG, now: NOW }));
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.value.policy).toMatchObject({ free: true, refundDue: r.value.stay.depositAmount });
    expect(c.value.stay.status).toBe("cancelled");
    expect(c.value.stay.cancelledBy).toBe("customer");
    expect((c.value.stay.meta as { cancellation: { free: boolean } }).cancellation.free).toBe(true);
    // cannot cancel twice
    expect(await s.tx((tx) => cancelStay(tx, s.tenantId, r.value.stay.id, { by: "customer", config: CONFIG, now: NOW }))).toMatchObject({ ok: false, error: "not_cancellable" });
    // an unpaid pending stay: the QR is voided on cancel
    const r2 = await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.deluxe, checkIn: "2026-10-17", checkOut: "2026-10-18", guests: 2, customer: s.guest(19), paymentMethod: "promptpay_qr" }, opts));
    if (!r2.ok) throw new Error(r2.error);
    const c2 = await s.tx((tx) => cancelStay(tx, s.tenantId, r2.value.stay.id, { by: "customer", config: CONFIG, now: NOW }));
    expect(c2.ok && c2.value.policy?.free).toBe(false); // 2 days ahead < 7
    expect((await paymentRow(r2.value.payment!.id)).status).toBe("cancelled");
  });

  it("transitions: confirm → check_in → check_out; no_show voids the open payment; invalid moves are refused", async () => {
    const r = await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.deluxe, checkIn: "2026-10-16", checkOut: "2026-10-17", guests: 2, customer: s.guest(20), paymentMethod: "slip" }, opts));
    if (!r.ok) throw new Error(r.error);
    const id = r.value.stay.id;
    expect(await s.tx((tx) => transitionStay(tx, s.tenantId, id, "check_out", { now: NOW }))).toMatchObject({ ok: false, error: "invalid_transition" });
    expect((await s.tx((tx) => transitionStay(tx, s.tenantId, id, "check_in", { now: NOW }))).ok).toBe(true);
    expect((await stayRow(id)).status).toBe("checked_in");
    expect((await s.tx((tx) => transitionStay(tx, s.tenantId, id, "check_out", { now: NOW }))).ok).toBe(true);
    const st = await stayRow(id);
    expect([st.status, st.checkedOutAt instanceof Date]).toEqual(["checked_out", true]);
    const ns = await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.deluxe, checkIn: "2026-10-16", checkOut: "2026-10-17", guests: 2, customer: s.guest(21), paymentMethod: "slip" }, opts));
    if (!ns.ok) throw new Error(ns.error);
    expect((await s.tx((tx) => transitionStay(tx, s.tenantId, ns.value.stay.id, "no_show", { now: NOW }))).ok).toBe(true);
    expect((await paymentRow(ns.value.payment!.id)).status).toBe("cancelled");
    const paid = await s.tx((tx) => markPaid(tx, s.tenantId, ns.value.payment!.id, { verifiedBy: "admin" }).catch((e) => e));
    expect(paid).toBeInstanceOf(Error); // cancelled payments are terminal
  });

  it("listCustomerStays splits upcoming / past for the signed-in guest", async () => {
    const r = await s.tx((tx) => createStay(tx, s.tenantId, { unitTypeId: s.types.deluxe, checkIn: "2027-01-05", checkOut: "2027-01-07", guests: 2, customer: s.guest(22), paymentMethod: "slip" }, opts));
    if (!r.ok) throw new Error(r.error);
    const cid = r.value.stay.customerId!;
    const up = await s.tx((tx) => listCustomerStays(tx, s.tenantId, cid, { scope: "upcoming", now: NOW }));
    expect(up.map((x) => x.number)).toContain(r.value.stay.number);
    expect(up[0]).toMatchObject({ typeSlug: "deluxe", nights: 2 });
    await s.tx((tx) => cancelPayment(tx, s.tenantId, r.value.payment!.id, "ทดสอบ"));
    expect((await stayRow(r.value.stay.id)).status).toBe("cancelled");
    const past = await s.tx((tx) => listCustomerStays(tx, s.tenantId, cid, { scope: "past", now: NOW }));
    expect(past.map((x) => x.number)).toContain(r.value.stay.number);
  });
});
