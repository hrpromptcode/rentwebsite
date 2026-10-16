import { and, asc, desc, eq, gte, inArray, lt, nextCounter, or, sql, type Tx } from "@rentweb/db";
import { bookings, payments, services, staff, staffServices } from "@rentweb/db";
import { emitEvent, fail, isUuid, ok, randomToken, safeEqual, type Result } from "@rentweb/core";
import { upsertGuestCustomer } from "@rentweb/core/customer";
import {
  cancelPayment,
  createPayment,
  enabledMethods,
  listPaymentsFor,
  paymentSettings,
  refundRequired,
  resolvePromptpayId,
  type PaymentClosedInfo,
  type PaymentMethod,
  type PaymentPaidResult,
  type PaymentProvider,
} from "@rentweb/core/payments";
import { getServiceById, type ServiceWithCategory } from "./catalog";
import type { BookingConfig } from "./config";
import { RELEASED_BOOKING_STATUSES } from "./config";
import { assignStaff, computeSlots, isGroupService, isPerPersonService, loadAvailabilityData, partySizeFor, toSlotService, type SlotEngineInput } from "./availability";
import { getPackageSummary, lockRedeemablePackage, redeemPackageSession, releasePackageSession, type RedeemablePackage } from "./clinic";
import { bkkDateString, bkkDayStart, DAY_MS, parseYmd } from "./time";

export type BookingRow = typeof bookings.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;

/** Extra data stored in bookings.answers (jsonb). */
export interface BookingAnswers {
  accessKey?: string;
  /** the booking's current deposit payment */
  paymentId?: string;
  preferredStaffId?: string | null;
  /** SBR-016: booking paid with a course session */
  patientPackageId?: string;
  packageName?: string;
  packageUsageId?: string;
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
  /** null / undefined = ใครก็ได้ (group services: preferred first staff) */
  staffId?: string | null;
  /** ISO instant of the slot start */
  start: string;
  customer: { id?: string | null; name: string; phone: string; email?: string | null };
  note?: string | null;
  /** guests (per-person group services); fixed packages and 1:1 services ignore it */
  partySize?: number;
  /** deposit payment method; defaults to the first enabled method */
  paymentMethod?: PaymentMethod | null;
  source?: string;
  /** SBR-016: pay with a session of this course (signed-in customer only) */
  patientPackageId?: string | null;
  /** internal: set by rescheduleBooking – carries price / payment state over and skips payment creation */
  rescheduleOf?: BookingRow | null;
}

export type CreateBookingError = "service_not_found" | "staff_not_found" | "invalid_slot" | "slot_taken" | "invalid_customer" | "package_not_usable";

export interface CreateBookingResult {
  booking: BookingRow;
  accessKey: string;
  payment: PaymentRow | null;
}

export function answersOf(b: Pick<BookingRow, "answers">): BookingAnswers {
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

/* ------------------------------------------------------------------ */
/* locking + payment helpers                                            */
/* ------------------------------------------------------------------ */

/**
 * Serialises booking writers of one tenant until the transaction ends (COR-27 / SBR-004): staff assignment
 * for "ใครก็ได้" and group bookings, seat counts and extra staff are read-then-write and only the first staff is
 * guarded by bookings_no_overlap. Re-entrant within a transaction.
 */
export async function lockTenantBookings(tx: Tx, tenantId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('rentweb.booking'), hashtext(${tenantId}))`);
}

/**
 * Locks and returns the booking's payment rows. Lock order is payments → booking, the same as
 * markPaid() → onBookingPaid(), so a cancel racing a slip approval cannot deadlock.
 */
export async function lockBookingPayments(tx: Tx, tenantId: string, bookingId: string): Promise<PaymentRow[]> {
  return tx
    .select()
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.refType, "booking"), eq(payments.refId, bookingId)))
    .orderBy(asc(payments.createdAt))
    .for("update");
}

/** Unpaid payments a closing booking voids. A slip under review (pending_verification) is kept for the admin to verify: approving it flags a refund, rejecting it fails it. */
const VOID_ON_CLOSE = ["pending", "failed"] as const;
/** Payments that follow a booking to its rescheduled successor (money, or a slip still under review). */
const MOVE_ON_RESCHEDULE = ["pending_verification", "paid", "partially_refunded", "refunded"] as const;

/** Voids the unpaid deposit payments of a booking that is being closed / replaced (payments-api 3.2: runHandler false). */
export async function voidBookingPayments(tx: Tx, tenantId: string, list: PaymentRow[], reason: string): Promise<number> {
  let n = 0;
  for (const p of list) {
    if (!(VOID_ON_CLOSE as readonly string[]).includes(p.status)) continue;
    await cancelPayment(tx, tenantId, p.id, reason, { runHandler: false });
    n++;
  }
  return n;
}

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
    // SBR-002: online deposits expire (the sweep then releases the slot); a cash deposit is settled at the counter
    expiresMinutes: m === "cash" ? undefined : (paymentSettings(settings).expiresMinutes ?? 30),
    metadata: { bookingNumber: booking.number },
  });
  await tx
    .update(bookings)
    .set({ answers: { ...answersOf(booking), paymentId: payment.id } })
    .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, booking.id)));
  return payment;
}

/* ------------------------------------------------------------------ */
/* create                                                               */
/* ------------------------------------------------------------------ */

/**
 * Creates a booking: re-validates the slot against the engine under the tenant booking lock, assigns staff
 * ("ใครก็ได้": least-booked free staff; staffed groups: one staff per guest), numbers it BK-1001…, attaches /
 * creates the customer, snapshots price + deposit (per guest for per-person services) and opens the deposit
 * payment. A course session (SBR-016) pays for the booking instead. The DB exclusion constraint is the final
 * guard for the first staff; on a violation the next free staff is tried before giving up (COR-27).
 */
export async function createBooking(tx: Tx, tenantId: string, input: CreateBookingInput, opts: BookingOpts): Promise<Result<CreateBookingResult, CreateBookingError>> {
  const now = opts.now ?? new Date();
  if (!isUuid(input.serviceId)) return fail("service_not_found");
  if (input.staffId && !isUuid(input.staffId)) return fail("staff_not_found");
  const service = await getServiceById(tx, tenantId, input.serviceId);
  if (!service || !service.active) return fail("service_not_found");

  const start = new Date(input.start);
  if (Number.isNaN(start.getTime())) return fail("invalid_slot");
  const iso = start.toISOString();
  const date = bkkDateString(start);
  const dayStart = bkkDayStart(parseYmd(date)!);
  const slotService = toSlotService(service);
  const group = isGroupService(slotService);
  const prev = input.rescheduleOf ?? null;
  const partySize = partySizeFor(slotService, input.partySize ?? prev?.partySize ?? 1);

  await lockTenantBookings(tx, tenantId);
  const data = await loadAvailabilityData(tx, tenantId, { serviceId: service.id, from: new Date(dayStart.getTime() - DAY_MS), to: new Date(dayStart.getTime() + 2 * DAY_MS) });
  const preferred = input.staffId ?? null;
  const engine: SlotEngineInput = { config: opts.config, service: slotService, date, staffId: preferred, partySize, now, ...data };

  if (preferred && slotService.requiresStaff && !data.eligibleStaffIds.includes(preferred)) return fail("staff_not_found");
  const slot = computeSlots(engine).find((s) => s.start === iso);
  if (!slot) return fail("invalid_slot");
  if (!slot.available || (group && slot.remaining < partySize)) return fail("slot_taken");

  /** staff for this attempt; [] for unstaffed classes / rooms */
  const pickStaff = (exclude: ReadonlySet<string>): string[] | null => {
    if (!slotService.requiresStaff) return [];
    if (group) return assignStaff(engine, iso, partySize, preferred, exclude);
    if (preferred) return exclude.has(preferred) ? null : [preferred];
    return assignStaff(engine, iso, 1, null, exclude);
  };
  let staffIds = pickStaff(new Set());
  if (!staffIds) return fail("slot_taken");

  // SBR-016: course session instead of payment
  let pkg: RedeemablePackage | null = null;
  if (input.patientPackageId && !prev) {
    if (!input.customer.id || partySize !== 1) return fail("package_not_usable");
    pkg = await lockRedeemablePackage(tx, tenantId, input.patientPackageId, { customer: { id: input.customer.id, phone: input.customer.phone, name: input.customer.name }, serviceId: service.id, now });
    if (!pkg) return fail("package_not_usable");
  }

  // customer
  let customerId = input.customer.id ?? null;
  if (!customerId) {
    const guest = await upsertGuestCustomer(tx, tenantId, { phone: input.customer.phone, email: input.customer.email, name: input.customer.name });
    if (!guest) return fail("invalid_customer");
    customerId = guest.id;
  }

  const perPerson = isPerPersonService(slotService);
  const priceFor = async (ids: string[]): Promise<number> => {
    if (prev) return prev.price;
    if (pkg) return 0;
    let unit = service.price;
    if (!group && ids[0]) {
      const [link] = await tx
        .select({ priceOverride: staffServices.priceOverride })
        .from(staffServices)
        .where(and(eq(staffServices.tenantId, tenantId), eq(staffServices.staffId, ids[0]), eq(staffServices.serviceId, service.id)))
        .limit(1);
      if (link?.priceOverride != null) unit = link.priceOverride;
    }
    return perPerson ? unit * partySize : unit;
  };
  const depositFor = (price: number): number => {
    if (prev) return prev.depositAmount;
    if (pkg || !opts.config.depositEnabled || !service.depositRequired) return 0;
    const d = service.depositAmount * (perPerson ? partySize : 1);
    return price > 0 ? Math.min(d, price) : d;
  };
  const paymentStatus = prev ? prev.paymentStatus : pkg ? "paid" : "unpaid";
  const end = new Date(start.getTime() + service.durationMin * 60_000);
  const accessKey = randomToken(16);
  const number = `BK-${await nextCounter(tx, tenantId, "booking", 1000)}`;
  const prevAnswers = prev ? answersOf(prev) : null;
  const answers: BookingAnswers = { accessKey };
  if (group) answers.preferredStaffId = preferred;
  if (prevAnswers?.patientPackageId) {
    answers.patientPackageId = prevAnswers.patientPackageId;
    answers.packageName = prevAnswers.packageName;
    answers.packageUsageId = prevAnswers.packageUsageId;
  } else if (pkg) {
    answers.patientPackageId = pkg.id;
    answers.packageName = pkg.packageName;
  }

  let booking: BookingRow | null = null;
  const excluded = new Set<string>();
  for (let attempt = 0; attempt < 10 && staffIds && !booking; attempt++) {
    const ids: string[] = staffIds;
    const price = await priceFor(ids);
    const depositAmount = depositFor(price);
    const status = depositAmount > 0 && paymentStatus === "unpaid" ? "pending" : "confirmed";
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
            staffId: ids[0] ?? null,
            extraStaffIds: ids.slice(1),
            startsAt: start,
            endsAt: end,
            status,
            source: input.source ?? "online",
            customerName: input.customer.name.trim(),
            customerPhone: input.customer.phone.trim() || null,
            customerEmail: input.customer.email?.trim() || null,
            partySize,
            price,
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
      if (!isExclusionViolation(err)) throw err;
      // the first staff is taken by a booking this engine could not see → try the next free staff
      if (!ids[0]) return fail("slot_taken");
      excluded.add(ids[0]);
      staffIds = pickStaff(excluded);
    }
  }
  if (!booking) return fail("slot_taken");

  if (pkg) {
    const used = await redeemPackageSession(tx, tenantId, pkg, booking);
    const withUsage: BookingAnswers = { ...answersOf(booking), packageUsageId: used.usageId };
    await tx.update(bookings).set({ answers: withUsage }).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, booking.id)));
    booking = { ...booking, answers: withUsage };
  }

  let payment: PaymentRow | null = null;
  if (!prev && booking.status === "pending" && booking.depositAmount > 0 && booking.paymentStatus === "unpaid") {
    payment = await createBookingPayment(tx, tenantId, booking, input.paymentMethod ?? null, opts.settings);
    booking = { ...booking, answers: { ...answersOf(booking), paymentId: payment.id } };
  }

  await emitEvent(tx, {
    tenantId,
    type: "booking.created",
    payload: {
      bookingId: booking.id,
      number,
      serviceId: service.id,
      serviceName: service.name,
      staffId: booking.staffId,
      extraStaffIds: booking.extraStaffIds,
      partySize,
      startsAt: iso,
      customerId,
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
      customerEmail: booking.customerEmail,
      accessKey,
      depositAmount: booking.depositAmount,
      status: booking.status,
      patientPackageId: answersOf(booking).patientPackageId ?? null,
      rescheduledFromId: prev?.id ?? null,
    },
  });
  return ok({ booking, accessKey, payment });
}

/* ------------------------------------------------------------------ */
/* payment hooks (registered in register.ts)                            */
/* ------------------------------------------------------------------ */

/**
 * registerPaymentHandler("booking") – confirms the booking once the deposit / full amount is paid (payments-api 3.1).
 * Idempotent for the booking's current payment. Money for a booking that is gone, cancelled, marked no-show or
 * already paid by another payment is flagged for a refund instead of being applied.
 */
export async function onBookingPaid(tx: Tx, payment: PaymentRow): Promise<PaymentPaidResult> {
  const tenantId = payment.tenantId;
  const [b] = await tx.select().from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, payment.refId))).limit(1).for("update");
  if (!b) return refundRequired("ไม่พบการจอง");
  if (b.status === "cancelled") return refundRequired("การจองถูกยกเลิกแล้ว");
  if (b.status === "no_show") return refundRequired("การจองถูกบันทึกว่าไม่มาตามนัด");
  if (b.paymentStatus === "refunded") return refundRequired("การจองนี้คืนเงินแล้ว");
  const answers = answersOf(b);
  if (b.paymentStatus === "paid" || b.paymentStatus === "deposit_paid") {
    // already applied: the same payment again (duplicate webhook / old data) is a no-op, another payment is a double payment
    return !answers.paymentId || answers.paymentId === payment.id ? undefined : refundRequired("ชำระซ้ำ");
  }
  const full = payment.amount >= b.price;
  const paymentStatus = full ? "paid" : "deposit_paid";
  const confirmNow = b.status === "pending";
  const now = new Date();
  await tx
    .update(bookings)
    .set({ paymentStatus, status: confirmNow ? "confirmed" : b.status, confirmedAt: confirmNow ? now : b.confirmedAt, answers: { ...answers, paymentId: payment.id } })
    .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, b.id)));
  await emitEvent(tx, { tenantId, type: "booking.paid", payload: { bookingId: b.id, number: b.number, paymentId: payment.id, amount: payment.amount, paymentStatus } });
  if (confirmNow)
    await emitEvent(tx, {
      tenantId,
      type: "booking.confirmed",
      payload: { bookingId: b.id, number: b.number, startsAt: b.startsAt.toISOString(), serviceId: b.serviceId, staffId: b.staffId, customerId: b.customerId, customerName: b.customerName, customerPhone: b.customerPhone, customerEmail: b.customerEmail, accessKey: answers.accessKey ?? null },
    });
}

/**
 * registerPaymentClosedHandler("booking") – the deposit payment was voided or expired (sweep) while the booking
 * still waited for it → the pending booking is cancelled by the system so its slot is free again (SBR-002,
 * payments-api 3.2). Idempotent; ignores bookings that are paid / confirmed / already closed and payments that
 * are no longer the booking's current payment (renewed QR, reschedule).
 */
export async function onBookingPaymentClosed(tx: Tx, payment: PaymentRow, info: PaymentClosedInfo): Promise<void> {
  const tenantId = payment.tenantId;
  const others = await lockBookingPayments(tx, tenantId, payment.refId);
  const [b] = await tx.select().from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, payment.refId))).limit(1).for("update");
  if (!b || b.status !== "pending" || b.paymentStatus !== "unpaid") return;
  const answers = answersOf(b);
  if (answers.paymentId && answers.paymentId !== payment.id) return;
  if (others.some((p) => p.id !== payment.id && p.status === "pending_verification")) return; // a slip for this booking is still under review
  const reason = info.status === "expired" ? "หมดเวลาชำระมัดจำ" : info.reason || "ยกเลิกรายการชำระมัดจำ";
  const now = new Date();
  await tx
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: now, cancelledBy: "system", cancelReason: reason })
    .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, b.id)));
  await voidBookingPayments(tx, tenantId, others.filter((p) => p.id !== payment.id), reason);
  await releasePackageSession(tx, tenantId, answers, { bookingId: b.id, now });
  await emitEvent(tx, {
    tenantId,
    type: "booking.cancelled",
    payload: { bookingId: b.id, number: b.number, by: "system", reason, startsAt: b.startsAt.toISOString(), customerId: b.customerId, customerName: b.customerName, customerPhone: b.customerPhone, customerEmail: b.customerEmail },
  });
}

export type RenewPaymentError = "not_payable";

/**
 * Re-issues the deposit payment (new QR) for a pending, unpaid booking: returns the live payment when there is
 * one, otherwise voids the expired / rejected one and creates a fresh payment. Not while a slip is under review.
 */
export async function renewBookingPayment(tx: Tx, tenantId: string, bookingId: string, method: PaymentMethod | null | undefined, settings: Record<string, unknown>, now = new Date()): Promise<Result<PaymentRow, RenewPaymentError>> {
  if (!isUuid(bookingId)) return fail("not_payable");
  const pays = await lockBookingPayments(tx, tenantId, bookingId);
  const [b] = await tx.select().from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId))).limit(1).for("update");
  if (!b || b.status !== "pending" || b.paymentStatus !== "unpaid" || b.depositAmount <= 0) return fail("not_payable");
  if (pays.some((p) => p.status === "pending_verification" || p.status === "paid")) return fail("not_payable");
  const current = answersOf(b).paymentId;
  const live = pays.find((p) => p.status === "pending" && (!p.expiresAt || p.expiresAt > now) && (!current || p.id === current));
  if (live) return ok(live);
  const last = [...pays].reverse()[0];
  await voidBookingPayments(tx, tenantId, pays, "ออก QR ใหม่");
  const payment = await createBookingPayment(tx, tenantId, b, method ?? ((last?.method as PaymentMethod | undefined) ?? null), settings);
  return ok(payment);
}

/* ------------------------------------------------------------------ */
/* cancel / reschedule                                                  */
/* ------------------------------------------------------------------ */

/** Can the customer still cancel / reschedule under the cancelHours policy? */
export function canCustomerModify(b: Pick<BookingRow, "status" | "startsAt">, config: Pick<BookingConfig, "cancelHours">, now = new Date()): boolean {
  if (b.status !== "pending" && b.status !== "confirmed") return false;
  return b.startsAt.getTime() - now.getTime() >= config.cancelHours * 3_600_000;
}

export type CancelError = "not_found" | "already_cancelled" | "not_cancellable" | "too_late";

/**
 * Cancels a booking (COR-08): the unpaid deposit payments are voided (cancelPayment, runHandler false) so a late
 * slip / QR payment can no longer confirm it, and a course session spent on it is given back. A slip still under
 * review stays for the admin (approving it flags a refund via the payment target check).
 */
export async function cancelBooking(
  tx: Tx,
  tenantId: string,
  bookingId: string,
  opts: { by: "customer" | "admin" | "system"; reason?: string | null; config: BookingConfig; now?: Date; /** admin: a checked-in customer that leaves */ allowCheckedIn?: boolean },
): Promise<Result<BookingRow, CancelError>> {
  if (!isUuid(bookingId)) return fail("not_found");
  const now = opts.now ?? new Date();
  const pays = await lockBookingPayments(tx, tenantId, bookingId);
  const [b] = await tx.select().from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId))).limit(1).for("update");
  if (!b) return fail("not_found");
  if (b.status === "cancelled") return fail("already_cancelled");
  const cancellable = b.status === "pending" || b.status === "confirmed" || (opts.allowCheckedIn === true && b.status === "checked_in");
  if (!cancellable) return fail("not_cancellable");
  if (opts.by === "customer" && !canCustomerModify(b, opts.config, now)) return fail("too_late");
  const reason = opts.reason?.trim() || null;
  const [updated] = await tx
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: now, cancelledBy: opts.by, cancelReason: reason })
    .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, b.id)))
    .returning();
  await voidBookingPayments(tx, tenantId, pays, `ยกเลิกการจอง ${b.number}`);
  await releasePackageSession(tx, tenantId, answersOf(b), { bookingId: b.id, now });
  await emitEvent(tx, {
    tenantId,
    type: "booking.cancelled",
    payload: { bookingId: b.id, number: b.number, by: opts.by, reason, startsAt: b.startsAt.toISOString(), customerId: b.customerId, customerName: b.customerName, customerPhone: b.customerPhone, customerEmail: b.customerEmail },
  });
  return ok(updated!);
}

/**
 * COR-09 / SBR-009: moves the payment state of a rescheduled booking to its successor. Unpaid QRs / rejected slips
 * of the old booking are voided; money (and a slip still under review) is re-pointed to the new booking so the
 * admin refunds / verifies the live booking; a new booking that still owes its deposit gets a fresh payment.
 */
export async function carryPaymentsOnReschedule(
  tx: Tx,
  tenantId: string,
  old: BookingRow,
  next: BookingRow,
  oldPayments: PaymentRow[],
  opts: { settings?: Record<string, unknown> | null } = {},
): Promise<{ booking: BookingRow; payment: PaymentRow | null }> {
  const currentId = answersOf(old).paymentId ?? null;
  const currentMethod = (oldPayments.find((p) => p.id === currentId)?.method ?? [...oldPayments].reverse()[0]?.method ?? null) as PaymentMethod | null;
  await voidBookingPayments(tx, tenantId, oldPayments, `เลื่อนนัดเป็น ${next.number}`);
  const moving = oldPayments.filter((p) => (MOVE_ON_RESCHEDULE as readonly string[]).includes(p.status));
  if (moving.length) {
    await tx
      .update(payments)
      .set({ refId: next.id })
      .where(and(eq(payments.tenantId, tenantId), eq(payments.refType, "booking"), eq(payments.refId, old.id), inArray(payments.status, [...MOVE_ON_RESCHEDULE])));
  }
  const moved = moving.find((p) => p.id === currentId) ?? [...moving].reverse()[0] ?? null;
  const needsDeposit = next.status === "pending" && next.paymentStatus === "unpaid" && next.depositAmount > 0;
  if (needsDeposit && moved?.status !== "pending_verification" && opts.settings) {
    const payment = await createBookingPayment(tx, tenantId, next, currentMethod, opts.settings);
    return { booking: { ...next, answers: { ...answersOf(next), paymentId: payment.id } }, payment };
  }
  const answers: BookingAnswers = { ...answersOf(next) };
  if (moved) answers.paymentId = moved.id;
  else delete answers.paymentId;
  await tx.update(bookings).set({ answers }).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, next.id)));
  return { booking: { ...next, answers }, payment: moved ? { ...moved, refId: next.id } : null };
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
  if (!isUuid(bookingId)) return fail("not_found");
  const now = opts.now ?? new Date();
  await lockTenantBookings(tx, tenantId);
  const oldPayments = await lockBookingPayments(tx, tenantId, bookingId);
  const [old] = await tx.select().from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId))).limit(1).for("update");
  if (!old) return fail("not_found");
  if (old.status === "cancelled") return fail("already_cancelled");
  if (old.status !== "pending" && old.status !== "confirmed") return fail("not_cancellable");
  if (input.by === "customer" && !canCustomerModify(old, opts.config, now)) return fail("too_late");
  const service = await getServiceById(tx, tenantId, old.serviceId);
  const group = !!service && isGroupService(service);
  // group bookings keep the customer's preference, not the auto-assigned first staff
  const staffId = input.staffId !== undefined ? input.staffId : group ? (answersOf(old).preferredStaffId ?? null) : old.staffId;
  try {
    const result = await tx.transaction(async (inner) => {
      await inner
        .update(bookings)
        .set({ status: "cancelled", cancelledAt: now, cancelledBy: input.by, cancelReason: "rescheduled" })
        .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, old.id)));
      const r = await createBooking(
        inner,
        tenantId,
        {
          serviceId: old.serviceId,
          staffId,
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
      const carried = await carryPaymentsOnReschedule(inner, tenantId, old, r.value.booking, oldPayments, { settings: opts.settings });
      await emitEvent(inner, { tenantId, type: "booking.rescheduled", payload: { fromBookingId: old.id, toBookingId: carried.booking.id, number: carried.booking.number, startsAt: input.start, by: input.by } });
      return { booking: carried.booking, accessKey: r.value.accessKey, payment: carried.payment };
    });
    return ok(result);
  } catch (err) {
    if (err instanceof RescheduleFailure) return fail(err.code);
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* reads                                                                */
/* ------------------------------------------------------------------ */

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
    .innerJoin(services, and(eq(bookings.serviceId, services.id), eq(services.tenantId, tenantId)))
    .leftJoin(staff, and(eq(bookings.staffId, staff.id), eq(staff.tenantId, tenantId)))
    .where(cond)
    .orderBy(opts.scope === "upcoming" ? asc(bookings.startsAt) : desc(bookings.startsAt))
    .limit(opts.limit ?? 50);
  return rows.map((r) => ({ ...r.b, serviceName: r.serviceName, serviceSlug: r.serviceSlug, serviceImage: r.serviceImage, staffName: r.staffName, staffAvatar: r.staffAvatar }));
}

export interface BookingDetail {
  booking: BookingRow;
  service: ServiceWithCategory;
  staff: typeof staff.$inferSelect | null;
  /** names of the further staff serving the party (staffed group bookings) */
  extraStaff: Array<{ id: string; name: string }>;
  /** the booking's current deposit payment (latest when none is marked) */
  payment: PaymentRow | null;
  accessKey: string | null;
  /** SBR-016: course the booking is paid with */
  package: { id: string; packageName: string; sessionsLeft: number; status: string } | null;
}

/** Booking page data – visible to the owner (signed in) or anyone holding the access key (?k=). */
export async function getBookingForCustomer(tx: Tx, tenantId: string, bookingId: string, auth: { customerId?: string | null; key?: string | null }): Promise<BookingDetail | null> {
  if (!isUuid(bookingId)) return null;
  const [b] = await tx.select().from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId))).limit(1);
  if (!b) return null;
  const answers = answersOf(b);
  const owner = !!auth.customerId && b.customerId === auth.customerId;
  const keyOk = !!auth.key && !!answers.accessKey && safeEqual(answers.accessKey, auth.key);
  if (!owner && !keyOk) return null;
  const service = await getServiceById(tx, tenantId, b.serviceId);
  if (!service) return null;
  const [st] = b.staffId ? await tx.select().from(staff).where(and(eq(staff.tenantId, tenantId), eq(staff.id, b.staffId))).limit(1) : [null];
  const extraStaff = b.extraStaffIds.length ? await tx.select({ id: staff.id, name: staff.name }).from(staff).where(and(eq(staff.tenantId, tenantId), inArray(staff.id, b.extraStaffIds))) : [];
  const list = await listPaymentsFor(tx, tenantId, "booking", b.id);
  const payment = list.find((p) => p.id === answers.paymentId) ?? list.sort((a, c) => c.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  const pkg = answers.patientPackageId ? await getPackageSummary(tx, tenantId, answers.patientPackageId) : null;
  return { booking: b, service, staff: st ?? null, extraStaff, payment, accessKey: answers.accessKey ?? null, package: pkg };
}

export async function getBookingById(tx: Tx, tenantId: string, bookingId: string): Promise<BookingRow | null> {
  if (!isUuid(bookingId)) return null;
  const [b] = await tx.select().from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId))).limit(1);
  return b ?? null;
}
