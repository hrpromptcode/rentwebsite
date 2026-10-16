import { qualified } from "./sql";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { bookings, customers, nextCounter, payments, serviceCategories, services, staff, staffServices, type Tx } from "@rentweb/db";
import { audit, emitEvent, fail, ok, randomToken, type Result } from "@rentweb/core";
import { upsertGuestCustomer } from "@rentweb/core/customer";
import { createPayment, listPaymentsFor, markFailed, markPaid, refundPayment, type PaymentMethod } from "@rentweb/core/payments";
import { computeSlots, freeStaffAt, isGroupService, loadAvailabilityData, pickLeastBookedStaff, toSlotService, type Slot, type SlotEngineInput } from "../services/availability";
import { cancelBooking, type BookingRow } from "../services/bookings";
import { getServiceById, type ServiceWithCategory } from "../services/catalog";
import type { BookingConfig } from "../services/config";
import { bkkDateString, bkkDayStart, DAY_MS, parseHm, parseYmd, weekdayOf } from "../services/time";
import { availabilityRules } from "@rentweb/db";
import type { Actor } from "./catalog";
import { CANCELLABLE_STATUSES, DEFAULT_CLOSE_MIN, DEFAULT_OPEN_MIN, RESCHEDULABLE_STATUSES, type BookingAction } from "./labels";

export type { BookingRow };
export type PaymentRow = typeof payments.$inferSelect;

/* -------------------------------------------------------------------------- */
/* calendar                                                                    */
/* -------------------------------------------------------------------------- */

export interface CalendarBooking {
  id: string;
  number: string;
  status: string;
  source: string;
  startsAt: Date;
  endsAt: Date;
  customerName: string;
  customerPhone: string | null;
  serviceId: string;
  serviceName: string;
  staffId: string | null;
  staffName: string | null;
  staffColor: string | null;
  price: number;
  depositAmount: number;
  paymentStatus: string;
  partySize: number;
  note: string | null;
}

export interface CalendarFilters {
  from: Date;
  to: Date;
  /** "none" = bookings without staff */
  staffId?: string | null;
  status?: string | null;
  q?: string | null;
}

export async function listBookingsBetween(tx: Tx, tenantId: string, f: CalendarFilters): Promise<CalendarBooking[]> {
  const conds: SQL[] = [eq(bookings.tenantId, tenantId), lt(bookings.startsAt, f.to), gte(bookings.endsAt, f.from)];
  if (f.staffId === "none") conds.push(isNull(bookings.staffId));
  else if (f.staffId) conds.push(eq(bookings.staffId, f.staffId));
  if (f.status && f.status !== "all") {
    if (f.status === "active") conds.push(inArray(bookings.status, ["pending", "confirmed", "checked_in", "in_progress"]));
    else conds.push(eq(bookings.status, f.status));
  }
  const q = f.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(bookings.customerName, like), ilike(bookings.customerPhone, like), ilike(bookings.number, like), ilike(services.name, like))!);
  }
  const rows = await tx
    .select({
      id: bookings.id,
      number: bookings.number,
      status: bookings.status,
      source: bookings.source,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      customerName: bookings.customerName,
      customerPhone: bookings.customerPhone,
      serviceId: bookings.serviceId,
      serviceName: services.name,
      staffId: bookings.staffId,
      staffName: staff.name,
      staffColor: staff.color,
      price: bookings.price,
      depositAmount: bookings.depositAmount,
      paymentStatus: bookings.paymentStatus,
      partySize: bookings.partySize,
      note: bookings.note,
    })
    .from(bookings)
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .leftJoin(staff, eq(bookings.staffId, staff.id))
    .where(and(...conds))
    .orderBy(asc(bookings.startsAt), asc(bookings.number))
    .limit(1000);
  return rows;
}

export interface DayHours {
  /** minutes since midnight */
  openMin: number;
  closeMin: number;
  /** false when the shop has no rule for that weekday at all */
  open: boolean;
}

/** Visible hours of the day grid: business hours for the weekday, else the union of staff rules, else 09:00–21:00. */
export async function dayHours(tx: Tx, tenantId: string, date: string): Promise<DayHours> {
  const ymd = parseYmd(date);
  if (!ymd) return { openMin: DEFAULT_OPEN_MIN, closeMin: DEFAULT_CLOSE_MIN, open: true };
  const weekday = weekdayOf(ymd);
  const rules = await tx.select({ staffId: availabilityRules.staffId, startTime: availabilityRules.startTime, endTime: availabilityRules.endTime }).from(availabilityRules).where(and(eq(availabilityRules.tenantId, tenantId), eq(availabilityRules.weekday, weekday)));
  const biz = rules.filter((r) => r.staffId === null);
  const pool = biz.length ? biz : rules;
  if (!pool.length) return { openMin: DEFAULT_OPEN_MIN, closeMin: DEFAULT_CLOSE_MIN, open: rules.length === 0 && biz.length === 0 ? false : true };
  const openMin = Math.min(...pool.map((r) => parseHm(r.startTime)));
  const closeMin = Math.max(...pool.map((r) => parseHm(r.endTime)));
  return { openMin: Math.floor(openMin / 30) * 30, closeMin: Math.ceil(closeMin / 30) * 30, open: true };
}

export interface BookingKpis {
  total: number;
  pending: number;
  upcoming: number;
  completed: number;
  noShow: number;
  revenue: number;
}

export async function bookingKpis(tx: Tx, tenantId: string, from: Date, to: Date): Promise<BookingKpis> {
  const [row] = await tx
    .select({
      total: sql<number>`count(*) filter (where ${bookings.status} not in ('cancelled'))::int`,
      pending: sql<number>`count(*) filter (where ${bookings.status} = 'pending')::int`,
      upcoming: sql<number>`count(*) filter (where ${bookings.status} in ('confirmed','checked_in','in_progress'))::int`,
      completed: sql<number>`count(*) filter (where ${bookings.status} = 'completed')::int`,
      noShow: sql<number>`count(*) filter (where ${bookings.status} = 'no_show')::int`,
      revenue: sql<number>`coalesce(sum(${bookings.price}) filter (where ${bookings.status} = 'completed'), 0)::int`,
    })
    .from(bookings)
    .where(and(eq(bookings.tenantId, tenantId), gte(bookings.startsAt, from), lt(bookings.startsAt, to)));
  return { total: Number(row?.total ?? 0), pending: Number(row?.pending ?? 0), upcoming: Number(row?.upcoming ?? 0), completed: Number(row?.completed ?? 0), noShow: Number(row?.noShow ?? 0), revenue: Number(row?.revenue ?? 0) };
}

/* -------------------------------------------------------------------------- */
/* detail                                                                      */
/* -------------------------------------------------------------------------- */

export interface BookingTimelineItem {
  at: Date;
  label: string;
  tone: "default" | "success" | "warning" | "destructive" | "muted";
}

export interface AdminBookingDetail {
  booking: BookingRow;
  service: ServiceWithCategory | null;
  staff: typeof staff.$inferSelect | null;
  customer: { id: string; name: string | null; phone: string | null; email: string | null; tier: string; ordersCount: number; totalSpent: number } | null;
  payments: PaymentRow[];
  /** latest deposit payment */
  payment: PaymentRow | null;
  /** earlier bookings in the reschedule chain + the one that replaced this (if any) */
  rescheduledFrom: Pick<BookingRow, "id" | "number" | "startsAt" | "status"> | null;
  rescheduledTo: Pick<BookingRow, "id" | "number" | "startsAt" | "status"> | null;
  timeline: BookingTimelineItem[];
  /** other bookings of the same customer (recent) */
  customerHistory: Array<Pick<BookingRow, "id" | "number" | "startsAt" | "status" | "price"> & { serviceName: string }>;
}

export async function getBookingAdmin(tx: Tx, tenantId: string, id: string): Promise<AdminBookingDetail | null> {
  const [b] = await tx.select().from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, id))).limit(1);
  if (!b) return null;
  const [service, st, cust, pays, from, to, history] = await Promise.all([
    getServiceById(tx, tenantId, b.serviceId),
    b.staffId ? tx.select().from(staff).where(and(eq(staff.tenantId, tenantId), eq(staff.id, b.staffId))).limit(1).then((r) => r[0] ?? null) : Promise.resolve(null),
    b.customerId
      ? tx
          .select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email, tier: customers.tier, ordersCount: customers.ordersCount, totalSpent: customers.totalSpent })
          .from(customers)
          .where(and(eq(customers.tenantId, tenantId), eq(customers.id, b.customerId)))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    listPaymentsFor(tx, tenantId, "booking", b.id),
    b.rescheduledFromId
      ? tx.select({ id: bookings.id, number: bookings.number, startsAt: bookings.startsAt, status: bookings.status }).from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, b.rescheduledFromId))).limit(1).then((r) => r[0] ?? null)
      : Promise.resolve(null),
    tx.select({ id: bookings.id, number: bookings.number, startsAt: bookings.startsAt, status: bookings.status }).from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.rescheduledFromId, b.id))).limit(1).then((r) => r[0] ?? null),
    b.customerId
      ? tx
          .select({ id: bookings.id, number: bookings.number, startsAt: bookings.startsAt, status: bookings.status, price: bookings.price, serviceName: services.name })
          .from(bookings)
          .innerJoin(services, eq(bookings.serviceId, services.id))
          .where(and(eq(bookings.tenantId, tenantId), eq(bookings.customerId, b.customerId), sql`${bookings.id} <> ${b.id}`))
          .orderBy(desc(bookings.startsAt))
          .limit(8)
      : Promise.resolve([]),
  ]);
  const sorted = [...pays].sort((a, c) => c.createdAt.getTime() - a.createdAt.getTime());
  const answers = (b.answers ?? {}) as { paymentId?: string };
  const payment = sorted.find((p) => p.id === answers.paymentId) ?? sorted[0] ?? null;
  const timeline: BookingTimelineItem[] = [{ at: b.createdAt, label: `สร้างการจอง (${b.source})`, tone: "muted" }];
  if (b.confirmedAt) timeline.push({ at: b.confirmedAt, label: "ยืนยันนัดแล้ว", tone: "success" });
  for (const p of sorted) {
    if (p.paidAt) timeline.push({ at: p.paidAt, label: `รับชำระ ${p.method === "cash" ? "เงินสด" : p.method === "slip" ? "โอนเงิน" : p.method === "promptpay_qr" ? "PromptPay" : p.method}`, tone: "success" });
    if (p.status === "failed") timeline.push({ at: p.updatedAt, label: `ปฏิเสธการชำระ${p.failureReason ? `: ${p.failureReason}` : ""}`, tone: "destructive" });
  }
  if (b.checkedInAt) timeline.push({ at: b.checkedInAt, label: "เช็กอิน", tone: "default" });
  if (b.completedAt) timeline.push({ at: b.completedAt, label: "ให้บริการเสร็จสิ้น", tone: "success" });
  if (b.cancelledAt) timeline.push({ at: b.cancelledAt, label: b.status === "no_show" ? "ไม่มาตามนัด" : `ยกเลิก (${b.cancelledBy ?? "-"})${b.cancelReason ? `: ${b.cancelReason}` : ""}`, tone: "destructive" });
  timeline.sort((a, c) => a.at.getTime() - c.at.getTime());
  return { booking: b, service, staff: st, customer: cust, payments: sorted, payment, rescheduledFrom: from, rescheduledTo: to, timeline, customerHistory: history };
}

/* -------------------------------------------------------------------------- */
/* status transitions                                                          */
/* -------------------------------------------------------------------------- */

const TRANSITIONS: Record<BookingAction, { from: string[]; to: string }> = {
  confirm: { from: ["pending"], to: "confirmed" },
  check_in: { from: ["confirmed", "pending"], to: "checked_in" },
  start: { from: ["confirmed", "checked_in"], to: "in_progress" },
  complete: { from: ["confirmed", "checked_in", "in_progress"], to: "completed" },
  no_show: { from: ["pending", "confirmed"], to: "no_show" },
};

export async function transitionBooking(tx: Tx, tenantId: string, id: string, action: BookingAction, actor: Actor): Promise<Result<{ status: string }, string>> {
  const t = TRANSITIONS[action];
  if (!t) return fail("คำสั่งไม่ถูกต้อง");
  const [b] = await tx.select().from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, id))).limit(1).for("update");
  if (!b) return fail("ไม่พบการจอง");
  if (!t.from.includes(b.status)) return fail(`สถานะปัจจุบัน (${b.status}) เปลี่ยนเป็นขั้นนี้ไม่ได้`);
  const now = new Date();
  const patch: Partial<typeof bookings.$inferInsert> = { status: t.to };
  if (action === "confirm") patch.confirmedAt = now;
  if (action === "check_in") {
    patch.checkedInAt = now;
    if (!b.confirmedAt) patch.confirmedAt = now;
  }
  if (action === "start" && !b.checkedInAt) patch.checkedInAt = now;
  if (action === "complete") {
    patch.completedAt = now;
    if (!b.checkedInAt) patch.checkedInAt = now;
  }
  if (action === "no_show") {
    patch.cancelledAt = now;
    patch.cancelledBy = "admin";
    patch.cancelReason = "no_show";
  }
  await tx.update(bookings).set(patch).where(eq(bookings.id, b.id));
  const payload = { bookingId: b.id, number: b.number, startsAt: b.startsAt.toISOString(), customerId: b.customerId, staffId: b.staffId, serviceId: b.serviceId, by: actor.userId };
  const eventType = action === "confirm" ? "booking.confirmed" : action === "check_in" ? "booking.checked_in" : action === "start" ? "booking.started" : action === "complete" ? "booking.completed" : "booking.no_show";
  await emitEvent(tx, { tenantId, type: eventType, payload });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: `booking.${action}`, targetType: "booking", targetId: b.id, diff: { from: b.status, to: t.to } });
  return ok({ status: t.to });
}

export async function adminCancelBooking(tx: Tx, tenantId: string, id: string, reason: string, config: BookingConfig, actor: Actor): Promise<Result<null, string>> {
  const [b] = await tx.select({ status: bookings.status }).from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, id))).limit(1);
  if (!b) return fail("ไม่พบการจอง");
  if (!(CANCELLABLE_STATUSES as readonly string[]).includes(b.status)) return fail("การจองนี้อยู่ในสถานะที่ยกเลิกไม่ได้แล้ว");
  if (b.status === "checked_in") {
    // the shared service only cancels pending/confirmed; a checked-in customer that leaves is cancelled by the admin directly
    const now = new Date();
    await tx.update(bookings).set({ status: "cancelled", cancelledAt: now, cancelledBy: "admin", cancelReason: reason }).where(eq(bookings.id, id));
    await emitEvent(tx, { tenantId, type: "booking.cancelled", payload: { bookingId: id, by: "admin", reason } });
  } else {
    const r = await cancelBooking(tx, tenantId, id, { by: "admin", reason, config });
    if (!r.ok) return fail(r.error === "already_cancelled" ? "การจองนี้ถูกยกเลิกไปแล้ว" : "การจองนี้ยกเลิกไม่ได้");
  }
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "booking.cancel", targetType: "booking", targetId: id, diff: { reason } });
  return ok(null);
}

export async function setInternalNote(tx: Tx, tenantId: string, id: string, note: string | null): Promise<boolean> {
  const rows = await tx.update(bookings).set({ internalNote: note }).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, id))).returning({ id: bookings.id });
  return rows.length > 0;
}

/* -------------------------------------------------------------------------- */
/* deposit payments                                                            */
/* -------------------------------------------------------------------------- */

/** Approves a slip / records a cash deposit: markPaid runs the booking handler (→ confirmed + booking.confirmed). */
export async function approveDeposit(tx: Tx, tenantId: string, bookingId: string, paymentId: string, actor: Actor): Promise<Result<null, string>> {
  const [p] = await tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId), eq(payments.refType, "booking"), eq(payments.refId, bookingId))).limit(1);
  if (!p) return fail("ไม่พบรายการชำระเงินของการจองนี้");
  if (p.status === "paid") return fail("รายการนี้ยืนยันแล้ว");
  if (!["pending", "pending_verification"].includes(p.status)) return fail(`รายการอยู่ในสถานะ ${p.status} ยืนยันไม่ได้`);
  await markPaid(tx, tenantId, p.id, { verifiedBy: actor.userId });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "booking.deposit.approve", targetType: "payment", targetId: p.id, diff: { bookingId, amount: p.amount, method: p.method } });
  return ok(null);
}

export async function rejectDeposit(tx: Tx, tenantId: string, bookingId: string, paymentId: string, reason: string, actor: Actor): Promise<Result<null, string>> {
  const [p] = await tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId), eq(payments.refType, "booking"), eq(payments.refId, bookingId))).limit(1);
  if (!p) return fail("ไม่พบรายการชำระเงินของการจองนี้");
  if (p.status === "paid") return fail("รายการนี้ชำระแล้ว ปฏิเสธไม่ได้ (ใช้คืนเงินแทน)");
  await markFailed(tx, tenantId, p.id, reason);
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "booking.deposit.reject", targetType: "payment", targetId: p.id, diff: { bookingId, reason } });
  return ok(null);
}

export async function refundDeposit(tx: Tx, tenantId: string, bookingId: string, paymentId: string, note: string | null, actor: Actor): Promise<Result<null, string>> {
  const [p] = await tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId), eq(payments.refType, "booking"), eq(payments.refId, bookingId))).limit(1);
  if (!p) return fail("ไม่พบรายการชำระเงิน");
  if (p.status !== "paid") return fail("คืนเงินได้เฉพาะรายการที่ชำระแล้ว");
  await refundPayment(tx, tenantId, p.id, undefined, note ?? undefined);
  await tx.update(bookings).set({ paymentStatus: "refunded" }).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId)));
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "booking.deposit.refund", targetType: "payment", targetId: p.id, diff: { bookingId, amount: p.amount, note } });
  return ok(null);
}

/** Records a deposit paid at the counter (cash) for a pending booking without a usable payment row. */
export async function recordCashDeposit(tx: Tx, tenantId: string, bookingId: string, actor: Actor): Promise<Result<null, string>> {
  const [b] = await tx.select().from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId))).limit(1);
  if (!b) return fail("ไม่พบการจอง");
  if (b.paymentStatus !== "unpaid" || b.depositAmount <= 0) return fail("การจองนี้ไม่มีมัดจำค้างชำระ");
  const p = await createPayment(tx, tenantId, { refType: "booking", refId: b.id, amount: b.depositAmount, provider: "cash", method: "cash" as PaymentMethod, customerId: b.customerId, metadata: { bookingNumber: b.number, by: actor.userId } });
  await tx
    .update(bookings)
    .set({ answers: { ...((b.answers ?? {}) as Record<string, unknown>), paymentId: p.id } })
    .where(eq(bookings.id, b.id));
  await markPaid(tx, tenantId, p.id, { verifiedBy: actor.userId });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "booking.deposit.cash", targetType: "payment", targetId: p.id, diff: { bookingId, amount: b.depositAmount } });
  return ok(null);
}

/* -------------------------------------------------------------------------- */
/* admin slots + walk-in / reschedule                                          */
/* -------------------------------------------------------------------------- */

/** Engine input for the back-office: every active staff linked to the service counts, online flag ignored. */
async function adminEngine(tx: Tx, tenantId: string, service: ServiceWithCategory, date: string, staffId: string | null, config: BookingConfig, now: Date): Promise<SlotEngineInput> {
  const ymd = parseYmd(date)!;
  const dayStart = bkkDayStart(ymd);
  const data = await loadAvailabilityData(tx, tenantId, { serviceId: service.id, from: new Date(dayStart.getTime() - DAY_MS), to: new Date(dayStart.getTime() + 2 * DAY_MS) });
  const linked = await tx
    .select({ id: staff.id })
    .from(staffServices)
    .innerJoin(staff, eq(staffServices.staffId, staff.id))
    .where(and(eq(staffServices.tenantId, tenantId), eq(staffServices.serviceId, service.id), eq(staff.active, true)))
    .orderBy(asc(staff.sort), asc(staff.name));
  return { config, service: toSlotService(service), date, staffId, now, ...data, eligibleStaffIds: linked.map((l) => l.id) };
}

export async function adminSlotsForDate(tx: Tx, tenantId: string, opts: { serviceId: string; date: string; staffId?: string | null; config: BookingConfig; now?: Date }): Promise<{ slots: Slot[]; service: ServiceWithCategory } | null> {
  if (!parseYmd(opts.date)) return null;
  const service = await getServiceById(tx, tenantId, opts.serviceId);
  if (!service) return null;
  const engine = await adminEngine(tx, tenantId, service, opts.date, opts.staffId ?? null, opts.config, opts.now ?? new Date());
  return { slots: computeSlots(engine), service };
}

export interface AdminCreateInput {
  serviceId: string;
  staffId: string | null;
  start: string;
  customer: { id: string | null; name: string; phone: string | null; email: string | null };
  note: string | null;
  partySize: number;
  source: "walk_in" | "admin";
  /** reschedule: carry price / deposit / payment state from the old booking */
  rescheduleOf?: BookingRow | null;
}

function isExclusionViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string; message?: string }; message?: string } | null;
  const code = e?.code ?? e?.cause?.code;
  return code === "23P01" || /bookings_no_overlap|exclusion constraint/i.test(`${e?.message ?? ""} ${e?.cause?.message ?? ""}`);
}

/**
 * Back-office booking: validated against the same slot engine (no notice period, offline staff allowed),
 * status "confirmed" immediately (walk-ins pay at the counter – no deposit payment is opened).
 */
export async function createAdminBooking(tx: Tx, tenantId: string, input: AdminCreateInput, config: BookingConfig, actor: Actor): Promise<Result<BookingRow, string>> {
  const now = new Date();
  const service = await getServiceById(tx, tenantId, input.serviceId);
  if (!service) return fail("ไม่พบบริการ");
  const start = new Date(input.start);
  if (Number.isNaN(start.getTime())) return fail("เวลาไม่ถูกต้อง");
  const date = bkkDateString(start);
  const group = isGroupService(service);
  if (group) await tx.execute(sql`select id from ${services} where ${services.id} = ${service.id} for update`);
  const engine = await adminEngine(tx, tenantId, service, date, input.staffId, config, now);
  const iso = start.toISOString();
  let staffId: string | null = null;
  if (group) {
    const slot = computeSlots(engine).find((s) => s.start === iso);
    if (!slot) return fail("เวลานี้อยู่นอกเวลาทำการ");
    if (!slot.available || slot.remaining < input.partySize) return fail("เวลานี้เต็มแล้ว");
  } else if (input.staffId) {
    if (!engine.eligibleStaffIds.includes(input.staffId)) return fail("พนักงานคนนี้ไม่ได้ให้บริการนี้ (เพิ่มในหน้า พนักงาน ก่อน)");
    const slot = computeSlots(engine).find((s) => s.start === iso);
    if (!slot) return fail("เวลานี้อยู่นอกตารางงานของพนักงาน");
    if (!slot.available) return fail("พนักงานไม่ว่างในเวลานี้");
    staffId = input.staffId;
  } else {
    if (!engine.eligibleStaffIds.length) return fail("ยังไม่มีพนักงานที่ให้บริการนี้");
    const slot = computeSlots({ ...engine, staffId: null }).find((s) => s.start === iso);
    if (!slot) return fail("เวลานี้อยู่นอกเวลาทำการ");
    staffId = pickLeastBookedStaff(engine, freeStaffAt(engine, iso));
    if (!staffId) return fail("ไม่มีพนักงานว่างในเวลานี้");
  }

  let customerId = input.customer.id;
  if (!customerId && (input.customer.phone || input.customer.email)) {
    const guest = await upsertGuestCustomer(tx, tenantId, { phone: input.customer.phone, email: input.customer.email, name: input.customer.name });
    customerId = guest?.id ?? null;
  }

  let price = service.price;
  if (staffId) {
    const [link] = await tx.select({ priceOverride: staffServices.priceOverride }).from(staffServices).where(and(eq(staffServices.tenantId, tenantId), eq(staffServices.staffId, staffId), eq(staffServices.serviceId, service.id))).limit(1);
    if (link?.priceOverride != null) price = link.priceOverride;
  }
  const prev = input.rescheduleOf ?? null;
  const end = new Date(start.getTime() + service.durationMin * 60_000);
  const number = `BK-${await nextCounter(tx, tenantId, "booking", 1000)}`;
  const prevAnswers = (prev?.answers ?? {}) as Record<string, unknown>;
  const answers: Record<string, unknown> = { accessKey: randomToken(16), createdBy: actor.userId };
  if (prev?.answers && prevAnswers.paymentId) answers.paymentId = prevAnswers.paymentId;
  const status = prev && prev.status === "pending" ? "pending" : "confirmed";
  let row: BookingRow;
  try {
    row = await tx.transaction(async (inner) => {
      const [r] = await inner
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
          source: prev ? prev.source : input.source,
          customerName: input.customer.name.trim(),
          customerPhone: input.customer.phone,
          customerEmail: input.customer.email,
          partySize: input.partySize,
          price: prev ? prev.price : price,
          depositAmount: prev ? prev.depositAmount : 0,
          paymentStatus: prev ? prev.paymentStatus : "unpaid",
          note: input.note,
          internalNote: prev?.internalNote ?? null,
          answers,
          confirmedAt: status === "confirmed" ? now : null,
          rescheduledFromId: prev?.id ?? null,
        })
        .returning();
      return r!;
    });
  } catch (err) {
    if (isExclusionViolation(err)) return fail("เวลานี้เพิ่งถูกจองไป กรุณาเลือกเวลาอื่น");
    throw err;
  }
  await emitEvent(tx, { tenantId, type: "booking.created", payload: { bookingId: row.id, number, serviceId: service.id, staffId, startsAt: iso, customerId, status, source: row.source, rescheduledFromId: prev?.id ?? null } });
  if (status === "confirmed") await emitEvent(tx, { tenantId, type: "booking.confirmed", payload: { bookingId: row.id, number, startsAt: iso, customerId } });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: prev ? "booking.reschedule" : "booking.create", targetType: "booking", targetId: row.id, diff: { number, serviceId: service.id, staffId, startsAt: iso, price: row.price, source: row.source } });
  return ok(row);
}

/** Admin reschedule: cancels the old booking and books the new slot in one savepoint. */
export async function adminReschedule(tx: Tx, tenantId: string, id: string, input: { start: string; staffId?: string | null }, config: BookingConfig, actor: Actor): Promise<Result<BookingRow, string>> {
  const [old] = await tx.select().from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, id))).limit(1).for("update");
  if (!old) return fail("ไม่พบการจอง");
  if (!(RESCHEDULABLE_STATUSES as readonly string[]).includes(old.status)) return fail("เลื่อนนัดได้เฉพาะการจองที่รอยืนยันหรือยืนยันแล้ว");
  class Fail extends Error {}
  try {
    const created = await tx.transaction(async (inner) => {
      await inner.update(bookings).set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: "admin", cancelReason: "rescheduled" }).where(eq(bookings.id, old.id));
      const r = await createAdminBooking(
        inner,
        tenantId,
        {
          serviceId: old.serviceId,
          staffId: input.staffId === undefined ? old.staffId : input.staffId,
          start: input.start,
          customer: { id: old.customerId, name: old.customerName, phone: old.customerPhone, email: old.customerEmail },
          note: old.note,
          partySize: old.partySize,
          source: old.source === "admin" ? "admin" : "walk_in",
          rescheduleOf: old,
        },
        config,
        actor,
      );
      if (!r.ok) throw new Fail(r.error);
      await emitEvent(inner, { tenantId, type: "booking.rescheduled", payload: { fromBookingId: old.id, toBookingId: r.value.id, number: r.value.number, startsAt: input.start, by: "admin" } });
      return r.value;
    });
    return ok(created);
  } catch (err) {
    if (err instanceof Fail) return fail(err.message);
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* lookups for forms                                                           */
/* -------------------------------------------------------------------------- */

export interface CustomerHit {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  bookings: number;
}

export async function searchCustomers(tx: Tx, tenantId: string, q: string, limit = 8): Promise<CustomerHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const like = `%${term.replace(/[%_]/g, "")}%`;
  const rows = await tx
    .select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email, bookings: sql<number>`(select count(*) from ${bookings} b where b.customer_id = ${qualified(customers.id)})::int` })
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), or(ilike(customers.name, like), ilike(customers.phone, like), ilike(customers.email, like))))
    .orderBy(desc(customers.lastSeenAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, bookings: Number(r.bookings) }));
}

export interface ServiceOption {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  capacity: number;
  requiresStaff: boolean;
  categoryName: string | null;
  depositRequired: boolean;
}

export async function listServiceOptions(tx: Tx, tenantId: string): Promise<ServiceOption[]> {
  const rows = await tx
    .select({ id: services.id, name: services.name, durationMin: services.durationMin, price: services.price, capacity: services.capacity, requiresStaff: services.requiresStaff, categoryName: serviceCategories.name, depositRequired: services.depositRequired })
    .from(services)
    .leftJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
    .where(and(eq(services.tenantId, tenantId), eq(services.active, true)))
    .orderBy(asc(serviceCategories.sort), asc(services.sort), asc(services.name));
  return rows;
}

export async function countPendingDeposits(tx: Tx, tenantId: string): Promise<number> {
  const [r] = await tx
    .select({ c: count() })
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.refType, "booking"), eq(payments.status, "pending_verification")));
  return Number(r?.c ?? 0);
}
