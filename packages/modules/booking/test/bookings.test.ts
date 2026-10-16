import { beforeAll, describe, expect, it } from "vitest";
import { and, bookings, eq, eventsOutbox, payments, tenants, withTenant } from "@rentweb/db";
import { markPaid, registerPaymentHandler } from "@rentweb/core/payments";
import { cancelBooking, createBooking, getBookingForCustomer, listCustomerBookings, onBookingPaid, rescheduleBooking } from "../src/services/bookings";
import { getSlotsForDate, toSlotService } from "../src/services/availability";
import { getServiceById } from "../src/services/catalog";
import { formatBkkTime } from "../src/services/time";
import { at, CONFIG, DAY, NOW, SETTINGS, seedSalon, type Seeded } from "./helpers";

let s: Seeded;
const opts = { config: CONFIG, settings: SETTINGS, now: NOW };
const guest = { name: "คุณทดสอบ", phone: "0812345678", email: "test@example.com" };

beforeAll(async () => {
  s = await seedSalon();
  registerPaymentHandler("booking", onBookingPaid);
});

describe("createBooking", () => {
  it("numbers bookings BK-1001…, confirms immediately without deposit and stores an access key", async () => {
    const r = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.thai60, staffId: s.staff.mali, start: at(DAY, "10:00"), customer: guest }, opts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.booking.number).toBe("BK-1001");
    expect(r.value.booking.status).toBe("confirmed");
    expect(r.value.booking.paymentStatus).toBe("unpaid");
    expect(r.value.booking.confirmedAt).toBeInstanceOf(Date);
    expect(r.value.booking.customerId).toBeTruthy();
    expect(r.value.booking.price).toBe(59000);
    expect(r.value.payment).toBeNull();
    expect(r.value.accessKey).toHaveLength(22);
    expect((r.value.booking.answers as { accessKey: string }).accessKey).toBe(r.value.accessKey);
    expect(formatBkkTime(r.value.booking.endsAt)).toBe("11:00");
    const detail = await s.tx((tx) => getBookingForCustomer(tx, s.tenantId, r.value.booking.id, { key: r.value.accessKey }));
    expect(detail?.service.slug).toBe("thai-60");
    expect(detail?.staff?.slug).toBe("mali");
    expect(await s.tx((tx) => getBookingForCustomer(tx, s.tenantId, r.value.booking.id, { key: "wrong" }))).toBeNull();
  });

  it("the same slot for the same staff → slot_taken, other staff still free", async () => {
    const dup = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.thai60, staffId: s.staff.mali, start: at(DAY, "10:00"), customer: guest }, opts));
    expect(dup).toEqual({ ok: false, error: "slot_taken", code: undefined });
    const other = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.thai60, staffId: s.staff.nam, start: at(DAY, "10:00"), customer: guest }, opts));
    expect(other.ok).toBe(true);
    if (other.ok) expect(other.value.booking.number).toBe("BK-1002");
  });

  it("'ใครก็ได้' picks the least-booked free staff", async () => {
    // 15:00 – Mali and Nam each have 1 booking today, Ann has 0 (she works from 13:00) → Ann
    const r = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.thai60, start: at(DAY, "15:00"), customer: guest }, opts));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.booking.staffId).toBe(s.staff.ann);
    // 10:00 – only Nam/Mali work mornings and both are busy → slot_taken
    const full = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.thai60, start: at(DAY, "10:00"), customer: guest }, opts));
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.error).toBe("slot_taken");
  });

  it("rejects slots outside working hours and in the past", async () => {
    const early = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.thai60, staffId: s.staff.ann, start: at(DAY, "11:00"), customer: guest }, opts));
    expect(early).toMatchObject({ ok: false, error: "invalid_slot" });
    const past = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.thai60, start: at("2026-10-14", "11:00"), customer: guest }, opts));
    expect(past).toMatchObject({ ok: false, error: "invalid_slot" });
  });

  it("the DB exclusion constraint is the last guard (race simulated with a row the engine cannot see)", async () => {
    // A booking inserted by another tenant that references Mali's staff id is invisible to tenant A's
    // engine (RLS) but still trips bookings_no_overlap → createBooking must surface slot_taken, not throw.
    const [other] = await s.db.insert(tenants).values({ slug: "other-tenant", name: "Other", siteType: "salon" }).returning({ id: tenants.id });
    await withTenant(s.db, other!.id, (tx) =>
      tx.insert(bookings).values({
        tenantId: other!.id,
        number: "X-1",
        serviceId: s.services.consult,
        staffId: s.staff.mali,
        startsAt: new Date(at(DAY, "18:00")),
        endsAt: new Date(at(DAY, "19:00")),
        status: "confirmed",
        customerName: "ghost",
      }),
    );
    const r = await s.tx(async (tx) => {
      const res = await createBooking(tx, s.tenantId, { serviceId: s.services.thai60, staffId: s.staff.mali, start: at(DAY, "18:00"), customer: guest }, opts);
      // transaction must still be usable after the savepoint rollback
      const svc = await getServiceById(tx, s.tenantId, s.services.thai60);
      return { res, svcOk: !!svc };
    });
    expect(r.res).toMatchObject({ ok: false, error: "slot_taken" });
    expect(r.svcOk).toBe(true);
  });

  it("capacity-2 per-person staffed service accepts two single-guest bookings (each with its own staff), then refuses", async () => {
    const mk = () => s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.couple, start: at(DAY, "19:00"), customer: guest }, opts));
    const a = await mk();
    const b = await mk();
    const c = await mk();
    expect(a.ok && b.ok).toBe(true);
    // SBR-004: staffed group bookings reserve a staff member per guest (they used to be stored without staff)
    if (a.ok && b.ok) {
      expect(a.value.booking.staffId).toBeTruthy();
      expect(b.value.booking.staffId).toBeTruthy();
      expect(a.value.booking.staffId).not.toBe(b.value.booking.staffId);
    }
    expect(c).toMatchObject({ ok: false, error: "slot_taken" });
    const slots = await s.tx(async (tx) => getSlotsForDate(tx, s.tenantId, { service: toSlotService((await getServiceById(tx, s.tenantId, s.services.couple))!), date: DAY, config: CONFIG, now: NOW }));
    expect(slots.find((x) => formatBkkTime(x.start) === "19:00")?.remaining).toBe(0);
  });
});

describe("deposit + onBookingPaid", () => {
  let bookingId: string;
  let paymentId: string;

  it("creates a pending booking with a PromptPay payment when a deposit is required", async () => {
    const r = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.aroma90, staffId: s.staff.nam, start: at(DAY, "13:00"), customer: guest, paymentMethod: "promptpay_qr" }, opts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    bookingId = r.value.booking.id;
    expect(r.value.booking.status).toBe("pending");
    expect(r.value.booking.depositAmount).toBe(30000);
    expect(r.value.payment).not.toBeNull();
    paymentId = r.value.payment!.id;
    expect(r.value.payment!.amount).toBe(30000);
    expect(r.value.payment!.method).toBe("promptpay_qr");
    expect(r.value.payment!.qrPayload).toBeTruthy();
    expect((r.value.booking.answers as { paymentId: string }).paymentId).toBe(paymentId);
  });

  it("markPaid runs the handler → confirmed + deposit_paid, and a second call changes nothing", async () => {
    await s.tx((tx) => markPaid(tx, s.tenantId, paymentId, { verifiedBy: "test" }));
    const b1 = await s.tx((tx) => tx.select().from(bookings).where(eq(bookings.id, bookingId)).then((r) => r[0]!));
    expect(b1.status).toBe("confirmed");
    expect(b1.paymentStatus).toBe("deposit_paid");
    expect(b1.confirmedAt).toBeInstanceOf(Date);
    const countConfirmed = () =>
      s.tx((tx) => tx.select().from(eventsOutbox).where(and(eq(eventsOutbox.tenantId, s.tenantId), eq(eventsOutbox.type, "booking.confirmed"))).then((r) => r.filter((e) => (e.payload as { bookingId: string }).bookingId === bookingId).length));
    expect(await countConfirmed()).toBe(1);
    // idempotent: calling the handler again (e.g. duplicate webhook) must not emit again
    await s.tx(async (tx) => {
      const [p] = await tx.select().from(payments).where(eq(payments.id, paymentId));
      await onBookingPaid(tx, p!);
      await markPaid(tx, s.tenantId, paymentId);
    });
    expect(await countConfirmed()).toBe(1);
    const b2 = await s.tx((tx) => tx.select().from(bookings).where(eq(bookings.id, bookingId)).then((r) => r[0]!));
    expect(b2.paymentStatus).toBe("deposit_paid");
  });
});

describe("cancel / reschedule policy", () => {
  it("customer cannot cancel inside cancelHours, can before; cancelling frees the slot", async () => {
    const r = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.thai60, staffId: s.staff.nam, start: at(DAY, "20:00"), customer: guest }, opts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const id = r.value.booking.id;
    // 20:00 Bangkok on DAY = 13:00Z; cancelHours 12 → too late from 01:00Z on DAY
    const late = await s.tx((tx) => cancelBooking(tx, s.tenantId, id, { by: "customer", config: CONFIG, now: new Date("2026-10-16T05:00:00.000Z") }));
    expect(late).toMatchObject({ ok: false, error: "too_late" });
    const admin = await s.tx((tx) => cancelBooking(tx, s.tenantId, id, { by: "admin", config: CONFIG, now: new Date("2026-10-16T05:00:00.000Z"), reason: "ร้านปิด" }));
    expect(admin.ok).toBe(true); // staff may cancel regardless of policy
    if (admin.ok) expect(admin.value.status).toBe("cancelled");

    const r2 = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.thai60, staffId: s.staff.nam, start: at(DAY, "20:00"), customer: guest }, opts));
    expect(r2.ok).toBe(true); // slot free again after cancel
    if (!r2.ok) return;
    const ok = await s.tx((tx) => cancelBooking(tx, s.tenantId, r2.value.booking.id, { by: "customer", config: CONFIG, now: NOW }));
    expect(ok.ok).toBe(true);
    const again = await s.tx((tx) => cancelBooking(tx, s.tenantId, r2.value.booking.id, { by: "customer", config: CONFIG, now: NOW }));
    expect(again).toMatchObject({ ok: false, error: "already_cancelled" });
  });

  it("reschedule creates a new booking linked to the old one and cancels the old", async () => {
    const r = await s.tx((tx) => createBooking(tx, s.tenantId, { serviceId: s.services.thai60, staffId: s.staff.nam, start: at(DAY, "16:00"), customer: guest }, opts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // shifting by 30 minutes overlaps the old booking – only works because the old one is cancelled first
    const moved = await s.tx((tx) => rescheduleBooking(tx, s.tenantId, r.value.booking.id, { start: at(DAY, "16:30"), by: "customer" }, opts));
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.value.booking.rescheduledFromId).toBe(r.value.booking.id);
    expect(moved.value.booking.staffId).toBe(s.staff.nam);
    expect(formatBkkTime(moved.value.booking.startsAt)).toBe("16:30");
    const old = await s.tx((tx) => tx.select().from(bookings).where(eq(bookings.id, r.value.booking.id)).then((x) => x[0]!));
    expect(old.status).toBe("cancelled");
    expect(old.cancelReason).toBe("rescheduled");
    // a failed reschedule rolls everything back (old booking stays active)
    const bad = await s.tx((tx) => rescheduleBooking(tx, s.tenantId, moved.value.booking.id, { start: at(DAY, "03:00"), by: "customer" }, opts));
    expect(bad).toMatchObject({ ok: false, error: "invalid_slot" });
    const still = await s.tx((tx) => tx.select().from(bookings).where(eq(bookings.id, moved.value.booking.id)).then((x) => x[0]!));
    expect(still.status).toBe("confirmed");
  });

  it("listCustomerBookings splits upcoming and past", async () => {
    const first = await s.tx((tx) => tx.select().from(bookings).where(eq(bookings.number, "BK-1001")).then((x) => x[0]!));
    const upcoming = await s.tx((tx) => listCustomerBookings(tx, s.tenantId, first.customerId!, { scope: "upcoming", now: NOW }));
    const past = await s.tx((tx) => listCustomerBookings(tx, s.tenantId, first.customerId!, { scope: "past", now: NOW }));
    expect(upcoming.some((b) => b.number === "BK-1001")).toBe(true);
    expect(upcoming.every((b) => b.status !== "cancelled")).toBe(true);
    expect(past.some((b) => b.status === "cancelled")).toBe(true);
    expect(upcoming[0]?.serviceName).toBeTruthy();
  });
});
