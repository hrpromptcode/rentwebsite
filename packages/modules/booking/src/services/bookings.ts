import { and, asc, desc, eq, gte, inArray, lt, nextCounter, or, sql, type Tx } from "@rentweb/db";
import { bookings, payments, services, staff, staffServices } from "@rentweb/db";
import { emitEvent, fail, ok, randomToken, safeEqual, type Result } from "@rentweb/core";
import { upsertGuestCustomer } from "@rentweb/core/customer";
import { createPayment, enabledMethods, listPaymentsFor, paymentSettings, resolvePromptpayId, type PaymentMethod, type PaymentProvider } from "@rentweb/core/payments";
import { getServiceById, type ServiceWithCategory } from "./catalog";
import type { BookingConfig } from "./config";
import { RELEASED_BOOKING_STATUSES } from "./config";
import { computeSlots, freeStaffAt, isGroupService, loadAvailabilityData, pickLeastBookedStaff, toSlotService, type SlotEngineInput } from "./availability";
import { bkkDateString, bkkDayStart, DAY_MS, parseYmd } from "./time";

export type BookingRow = typeof bookings.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;

/** Extra data stored in bookings.answers (jsonb). */
export interface BookingAnswers {
  accessKey?: string;
  paymentId?: string;
  preferredStaffId?: string | null;
  [k: string]: unknown;
}

export interface BookingOpts {
  config: BookingConfig;
  /** tenant settings (payments block) */
  settings: Record<string, unknown>;
  now?: Date;
}

export interface CreateBookingInput {
  serviceId: string;
  /** null / undefined = ใครก็ได้ */
  staffId?: string | null;
  /** ISO instant of the slot start */
  start: string;
  customer: { id?: string | null; name: string; phone: string; email?: string | null };
  note?: string | null;
  partySize?: number;
  /** deposit payment method; defaults to the first enabled method */
  paymentMethod?: PaymentMethod | null;
  source?: string;
  /** internal: set by rescheduleBooking – carries payment state over and skips payment creation */
  rescheduleOf?: BookingRow | null;
}

export type CreateBookingError = "service_not_found" | "staff_not_found" | "invalid_slot" | "slot_taken" | "invalid_customer";

export interface CreateBookingResult {
  booking: BookingRow;
  accessKey: string;
  payment: PaymentRow | null;
}

function answersOf(b: Pick<BookingRow, "answers">): BookingAnswers {
  return (b.answers ?? {}) as BookingAnswers;
}

function isExclusionViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string; message?: string }; message?: string } | null;
  const code = e?.code ?? e?.cause?.code;
  const msg = `${e?.message ?? ""} ${e?.cause?.message ?? ""}`;
  return code === "23P01" || /bookings_no_overlap|exclusion constraint/i.test(msg);
}

const PROVIDER_FOR: Record<PaymentMethod, PaymentProvider> = {
  promptpay_qr: "promptpay",
  slip: "bank_transfer",
  cash: "cash",
  cod: "cod",
  wallet: "wallet",
  card: "opn",
  installment: "opn",
};

/** Creates the deposit payment for a booking and remembers its id in answers.paymentId. */
export async function createBookingPayment(tx: Tx, tenantId: string, booking: BookingRow, method: PaymentMethod | null | undefined, settings: Record<string, unknown>): Promise<PaymentRow> {
  const allowed = enabledMethods(settings);
  const m: PaymentMethod = method && allowed.includes(method as (typeof allowed)[number]) ? method : allowed[0]!;
  const payment = await createPayment(tx, tenantId, {
    refType: "booking",
    refId: booking.id,
    amount: booking.depositAmount,
    provider: PROVIDER_FOR[m],
    method: m,
    customerId: booking.customerId,
    promptpayId: resolvePromptpayId(settings) ?? undefined,
    expiresMinutes: paymentSettings(settings).expiresMinutes ?? 30,
    metadata: { bookingNumber: booking.number },
  });
  await tx
    .update(bookings)
    .set({ answers: { ...answersOf(booking), paymentId: payment.id } })
    .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, booking.id)));
  return payment;
}

/**
 * Creates a booking: re-validates the slot against the engine, picks a staff for "ใครก็ได้",
 * numbers it BK-1001…, attaches/creates the customer, snapshots price + deposit and (when a deposit
 * is due) opens a payment. The DB exclusion constraint is the final guard against double booking.
 */
export async function createBooking(tx: Tx, tenantId: string, input: CreateBookingInput, opts: BookingOpts): Promise<Result<CreateBookingResult, CreateBookingError>> {
  const now = opts.now ?? new Date();
  const service = await getServiceById(tx, tenantId, input.serviceId);
  if (!service || !service.active) return fail("service_not_found");

  const start = new Date(input.start);
  if (Number.isNaN(start.getTime())) return fail("invalid_slot");
  const date = bkkDateString(start);
  const ymd = parseYmd(date)!;
  const dayStart = bkkDayStart(ymd);
  const group = isGroupService(service);

  // group services have no DB-level guard → serialise concurrent purchases on the service row
  if (group) await tx.execute(sql`select id from ${services} where ${services.id} = ${service.id} for update`);

  const data = await loadAvailabilityData(tx, tenantId, { serviceId: service.id, from: new Date(dayStart.getTime() - DAY_MS), to: new Date(dayStart.getTime() + 2 * DAY_MS) });
  const engine: SlotEngineInput = { config: opts.config, service: toSlotService(service), date, staffId: input.staffId ?? null, now, ...data };

  let staffId: string | null = null;
  if (group) {
    const slot = computeSlots(engine).find((s) => s.start === start.toISOString());
    if (!slot) return fail("invalid_slot");
    if (!slot.available || slot.remaining < (input.partySize ?? 1)) return fail("slot_taken");
  } else if (input.staffId) {
    if (!data.eligibleStaffIds.includes(input.staffId)) return fail("staff_not_found");
    const slot = computeSlots(engine).find((s) => s.start === start.toISOString());
    if (!slot) return fail("invalid_slot");
    if (!slot.available) return fail("slot_taken");
    staffId = input.staffId;
  } else {
    const slot = computeSlots({ ...engine, staffId: null }).find((s) => s.start === start.toISOString());
    if (!slot) return fail("invalid_slot");
    const free = freeStaffAt(engine, start.toISOString());
    staffId = pickLeastBookedStaff(engine, free);
    if (!staffId) return fail("slot_taken");
  }

  // customer
  let customerId = input.customer.id ?? null;
  if (!customerId) {
    const guest = await upsertGuestCustomer(tx, tenantId, { phone: input.customer.phone, email: input.customer.email, name: input.customer.name });
    if (!guest) return fail("invalid_customer");
    customerId = guest.id;
  }

  // price snapshot (staff override when present)
  let price = service.price;
  if (staffId) {
    const [link] = await tx
      .select({ priceOverride: staffServices.priceOverride })
      .from(staffServices)
      .where(and(eq(staffServices.tenantId, tenantId), eq(staffServices.staffId, staffId), eq(staffServices.serviceId, service.id)))
      .limit(1);
    if (link?.priceOverride != null) price = link.priceOverride;
  }
  const prev = input.rescheduleOf ?? null;
  const depositAmount = prev ? prev.depositAmount : opts.config.depositEnabled && service.depositRequired ? service.depositAmount : 0;
  const paymentStatus = prev ? prev.paymentStatus : "unpaid";
  const needsDeposit = depositAmount > 0 && paymentStatus === "unpaid";
  const status = needsDeposit ? "pending" : "confirmed";
  const end = new Date(start.getTime() + service.durationMin * 60_000);
  const accessKey = randomToken(16);
  const number = `BK-${await nextCounter(tx, tenantId, "booking", 1000)}`;
  const answers: BookingAnswers = { accessKey, preferredStaffId: group ? (input.staffId ?? null) : undefined };
  if (prev) answers.paymentId = answersOf(prev).paymentId;

  let booking: BookingRow;
  try {
    // nested transaction = savepoint, so an exclusion violation does not poison the caller's transaction
    booking = await tx.transaction(async (inner) => {
      const [row] = await inner
        .insert(bookings)
        .values({
          tenantId,
          number,
          customerId,
          serviceId: service.id,
          staffId,
          startsAt: start,
          endsAt: end,
          status,
          source: input.source ?? "online",
          customerName: input.customer.name.trim(),
          customerPhone: input.customer.phone.trim() || null,
          customerEmail: input.customer.email?.trim() || null,
          partySize: input.partySize ?? 1,
          price: prev ? prev.price : price,
          depositAmount,
          paymentStatus,
          note: input.note?.trim() || null,
          answers,
          confirmedAt: status === "confirmed" ? now : null,
          rescheduledFromId: prev?.id ?? null,
        })
        .returning();
      return row!;
    });
  } catch (err) {
    if (isExclusionViolation(err)) return fail("slot_taken");
    throw err;
  }

  let payment: PaymentRow | null = null;
  if (needsDeposit && !prev) {
    payment = await createBookingPayment(tx, tenantId, booking, input.paymentMethod ?? null, opts.settings);
    booking = { ...booking, answers: { ...answers, paymentId: payment.id } };
  }

  await emitEvent(tx, {
    tenantId,
    type: "booking.created",
    payload: { bookingId: booking.id, number, serviceId: service.id, staffId, startsAt: start.toISOString(), customerId, depositAmount, status, rescheduledFromId: prev?.id ?? null },
  });
  return ok({ booking, accessKey, payment });
}

/** registerPaymentHandler("booking") – confirms the booking once the deposit / full amount is paid. Idempotent. */
export async function onBookingPaid(tx: Tx, payment: PaymentRow): Promise<void> {
  const [b] = await tx.select().from(bookings).where(and(eq(bookings.tenantId, payment.tenantId), eq(bookings.id, payment.refId))).limit(1);
  if (!b) return;
  const full = payment.amount >= b.price;
  if (b.paymentStatus === "paid" || (b.paymentStatus === "deposit_paid" && !full)) return; // already applied
  const paymentStatus = full ? "paid" : "deposit_paid";
  const confirmNow = b.status === "pending";
  const now = new Date();
  await tx
    .update(bookings)
    .set({ paymentStatus, status: confirmNow ? "confirmed" : b.status, confirmedAt: confirmNow ? now : b.confirmedAt, answers: { ...answersOf(b), paymentId: payment.id } })
    .where(eq(bookings.id, b.id));
  await emitEvent(tx, { tenantId: payment.tenantId, type: "booking.paid", payload: { bookingId: b.id, number: b.number, paymentId: payment.id, amount: payment.amount, paymentStatus } });
  if (confirmNow) await emitEvent(tx, { tenantId: payment.tenantId, type: "booking.confirmed", payload: { bookingId: b.id, number: b.number, startsAt: b.startsAt.toISOString(), customerId: b.customerId } });
}

/** Can the customer still cancel / reschedule under the cancelHours policy? */
export function canCustomerModify(b: Pick<BookingRow, "status" | "startsAt">, config: Pick<BookingConfig, "cancelHours">, now = new Date()): boolean {
  if (b.status !== "pending" && b.status !== "confirmed") return false;
  return b.startsAt.getTime() - now.getTime() >= config.cancelHours * 3_600_000;
}

export type CancelError = "not_found" | "already_cancelled" | "not_cancellable" | "too_late";

export async function cancelBooking(
  tx: Tx,
  tenantId: string,
  bookingId: string,
  opts: { by: "customer" | "admin" | "system"; reason?: string | null; config: BookingConfig; now?: Date },
): Promise<Result<BookingRow, CancelError>> {
  const now = opts.now ?? new Date();
  const [b] = await tx.select().from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId))).limit(1);
  if (!b) return fail("not_found");
  if (b.status === "cancelled") return fail("already_cancelled");
  if (b.status !== "pending" && b.status !== "confirmed") return fail("not_cancellable");
  if (opts.by === "customer" && !canCustomerModify(b, opts.config, now)) return fail("too_late");
  const [updated] = await tx
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: now, cancelledBy: opts.by, cancelReason: opts.reason?.trim() || null })
    .where(eq(bookings.id, b.id))
    .returning();
  await emitEvent(tx, { tenantId, type: "booking.cancelled", payload: { bookingId: b.id, number: b.number, by: opts.by, reason: opts.reason ?? null, startsAt: b.startsAt.toISOString(), customerId: b.customerId } });
  return ok(updated!);
}

export type RescheduleError = CancelError | CreateBookingError;

class RescheduleFailure extends Error {
  constructor(public readonly code: RescheduleError) {
    super(code);
  }
}

/** Cancels the old booking and creates a new one (rescheduledFromId) in one savepoint – all or nothing. */
export async function rescheduleBooking(
  tx: Tx,
  tenantId: string,
  bookingId: string,
  input: { start: string; staffId?: string | null; by: "customer" | "admin" },
  opts: BookingOpts,
): Promise<Result<CreateBookingResult, RescheduleError>> {
  const now = opts.now ?? new Date();
  const [old] = await tx.select().from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId))).limit(1);
  if (!old) return fail("not_found");
  if (old.status === "cancelled") return fail("already_cancelled");
  if (old.status !== "pending" && old.status !== "confirmed") return fail("not_cancellable");
  if (input.by === "customer" && !canCustomerModify(old, opts.config, now)) return fail("too_late");
  try {
    const result = await tx.transaction(async (inner) => {
      await inner.update(bookings).set({ status: "cancelled", cancelledAt: now, cancelledBy: input.by, cancelReason: "rescheduled" }).where(eq(bookings.id, old.id));
      const r = await createBooking(
        inner,
        tenantId,
        {
          serviceId: old.serviceId,
          staffId: input.staffId === undefined ? old.staffId : input.staffId,
          start: input.start,
          customer: { id: old.customerId, name: old.customerName, phone: old.customerPhone ?? "", email: old.customerEmail },
          note: old.note,
          partySize: old.partySize,
          source: old.source,
          rescheduleOf: old,
        },
        { ...opts, now },
      );
      if (!r.ok) throw new RescheduleFailure(r.error);
      await emitEvent(inner, { tenantId, type: "booking.rescheduled", payload: { fromBookingId: old.id, toBookingId: r.value.booking.id, number: r.value.booking.number, startsAt: input.start, by: input.by } });
      return r.value;
    });
    return ok(result);
  } catch (err) {
    if (err instanceof RescheduleFailure) return fail(err.code);
    throw err;
  }
}

export interface BookingListItem extends BookingRow {
  serviceName: string;
  serviceSlug: string;
  serviceImage: string | null;
  staffName: string | null;
  staffAvatar: string | null;
}

export async function listCustomerBookings(tx: Tx, tenantId: string, customerId: string, opts: { scope: "upcoming" | "past"; now?: Date; limit?: number } = { scope: "upcoming" }): Promise<BookingListItem[]> {
  const now = opts.now ?? new Date();
  const base = and(eq(bookings.tenantId, tenantId), eq(bookings.customerId, customerId));
  const cond =
    opts.scope === "upcoming"
      ? and(base, gte(bookings.endsAt, now), inArray(bookings.status, ["pending", "confirmed", "checked_in", "in_progress"]))
      : and(base, or(lt(bookings.endsAt, now), inArray(bookings.status, ["completed", ...RELEASED_BOOKING_STATUSES])));
  const rows = await tx
    .select({ b: bookings, serviceName: services.name, serviceSlug: services.slug, serviceImage: services.image, staffName: staff.name, staffAvatar: staff.avatar })
    .from(bookings)
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .leftJoin(staff, eq(bookings.staffId, staff.id))
    .where(cond)
    .orderBy(opts.scope === "upcoming" ? asc(bookings.startsAt) : desc(bookings.startsAt))
    .limit(opts.limit ?? 50);
  return rows.map((r) => ({ ...r.b, serviceName: r.serviceName, serviceSlug: r.serviceSlug, serviceImage: r.serviceImage, staffName: r.staffName, staffAvatar: r.staffAvatar }));
}

export interface BookingDetail {
  booking: BookingRow;
  service: ServiceWithCategory;
  staff: typeof staff.$inferSelect | null;
  /** latest payment for this booking (deposit) */
  payment: PaymentRow | null;
  accessKey: string | null;
}

/** Booking page data – visible to the owner (signed in) or anyone holding the access key (?k=). */
export async function getBookingForCustomer(tx: Tx, tenantId: string, bookingId: string, auth: { customerId?: string | null; key?: string | null }): Promise<BookingDetail | null> {
  const [b] = await tx.select().from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId))).limit(1);
  if (!b) return null;
  const answers = answersOf(b);
  const owner = !!auth.customerId && b.customerId === auth.customerId;
  const keyOk = !!auth.key && !!answers.accessKey && safeEqual(answers.accessKey, auth.key);
  if (!owner && !keyOk) return null;
  const service = await getServiceById(tx, tenantId, b.serviceId);
  if (!service) return null;
  const [st] = b.staffId ? await tx.select().from(staff).where(and(eq(staff.tenantId, tenantId), eq(staff.id, b.staffId))).limit(1) : [null];
  const list = await listPaymentsFor(tx, tenantId, "booking", b.id);
  const payment = list.find((p) => p.id === answers.paymentId) ?? list.sort((a, c) => c.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  return { booking: b, service, staff: st ?? null, payment, accessKey: answers.accessKey ?? null };
}

export async function getBookingById(tx: Tx, tenantId: string, bookingId: string): Promise<BookingRow | null> {
  const [b] = await tx.select().from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId))).limit(1);
  return b ?? null;
}
