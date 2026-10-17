import { and, eq, gt, inArray, lt, notInArray, sql } from "drizzle-orm";
import { diningTables, nextCounter, payments, reservations, type Tx } from "@rentweb/db";
import { emitEvent, fail, isUuid, normalizeThaiPhone, ok, type Result } from "@rentweb/core";
import { cancelPayment, createPayment, getPayment, isPaymentStateError, refundRequired, type PaymentClosedInfo, type PaymentPaidResult } from "@rentweb/core/payments";
import { CUSTOMER_BLOCKED_CODE, CUSTOMER_BLOCKED_MESSAGE, isCustomerBlocked, upsertGuestCustomer } from "@rentweb/core/customer";
import { addDays, bangkokParts } from "./time";

export type Reservation = typeof reservations.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;
export const RESERVATION_MINUTES = 90;
/** default online booking window (days ahead, Bangkok calendar) – moduleConfig.restaurant.reservationMaxAdvanceDays */
export const RESERVATION_MAX_ADVANCE_DAYS = 60;
export const MAX_PARTY_SIZE = 40;
/** statuses that still hold a table */
const HOLDING = ["pending", "confirmed", "seated"] as const;
/** reservation numbers look like RS-1001 (COR-22) */
export const isReservationNumber = (n: unknown): n is string => typeof n === "string" && /^RS-\d{1,12}$/i.test(n.trim());

export interface AvailabilityInput {
  startsAt: Date;
  endsAt?: Date;
  zone?: string | null;
  /** guests in the new party (default 2) – a party needs as many tables as it takes to seat it (SBR-014) */
  partySize?: number;
  /** ignore this reservation when re-checking (edits) */
  excludeId?: string | null;
  durationMinutes?: number;
}

export interface Availability {
  available: boolean;
  /** active tables in the zone (all tables when no zone given) */
  capacity: number;
  /** tables in the zone already held at the busiest moment of the slot */
  booked: number;
  /** free tables in the zone at the busiest moment, never more than the free tables of the whole restaurant */
  remaining: number;
  /** largest table in the zone, to warn big parties */
  maxSeats: number;
  /** seats of all tables in the zone (largest party the zone could ever take) */
  totalSeats: number;
}

/* ───────────── seating model (COR-10 / SBR-013 / SBR-014) ───────────── */

export interface SeatTable {
  id: string;
  zone: string | null;
  seats: number;
}
export interface SeatParty {
  size: number;
  zone: string | null;
  tableId?: string | null;
}

/** Smallest single table that seats the party, else the fewest large tables pushed together (one zone only). */
function pickTables(pool: SeatTable[], size: number): SeatTable[] | null {
  const single = pool.filter((t) => t.seats >= size).sort((a, b) => a.seats - b.seats)[0];
  if (single) return [single];
  const sorted = [...pool].sort((a, b) => b.seats - a.seats);
  const out: SeatTable[] = [];
  let seats = 0;
  for (const t of sorted) {
    out.push(t);
    seats += t.seats;
    if (seats >= size) return out;
  }
  return null;
}

/** Best tables for a party inside one zone (zone-less parties: whichever zone needs the fewest tables / seats). */
function seatParty(free: SeatTable[], size: number, zone: string | null): SeatTable[] | null {
  if (zone) return pickTables(free.filter((t) => t.zone === zone), size);
  let best: SeatTable[] | null = null;
  for (const z of new Set(free.map((t) => t.zone))) {
    const pick = pickTables(free.filter((t) => t.zone === z), size);
    if (!pick) continue;
    const seats = (p: SeatTable[]) => p.reduce((s, t) => s + t.seats, 0);
    if (!best || pick.length < best.length || (pick.length === best.length && seats(pick) < seats(best))) best = pick;
  }
  return best;
}

/**
 * Greedy check whether every party can be seated at the same moment: parties with an assigned table first,
 * then zone parties, then zone-less ones (phone / admin bookings take whatever is left anywhere), biggest first.
 * A reservation for a zone that no longer has tables counts as zone-less. Returns the tables used.
 */
export function seatAll(tables: SeatTable[], parties: SeatParty[]): { ok: boolean; used: SeatTable[] } {
  const free = new Map(tables.map((t) => [t.id, t]));
  const used: SeatTable[] = [];
  const take = (ts: SeatTable[]) => {
    for (const t of ts) {
      free.delete(t.id);
      used.push(t);
    }
  };
  const zones = new Set(tables.map((t) => t.zone).filter(Boolean));
  const rest: SeatParty[] = [];
  for (const p of parties) {
    const assigned = p.tableId ? free.get(p.tableId) : undefined;
    if (!assigned) {
      rest.push({ size: p.size, zone: p.zone && zones.has(p.zone) ? p.zone : null });
      continue;
    }
    take([assigned]);
    if (assigned.seats >= p.size) continue;
    const extra = pickTables([...free.values()].filter((t) => t.zone === assigned.zone), p.size - assigned.seats);
    if (!extra) return { ok: false, used };
    take(extra);
  }
  const bySize = (a: SeatParty, b: SeatParty) => b.size - a.size;
  for (const p of [...rest.filter((r) => r.zone).sort(bySize), ...rest.filter((r) => !r.zone).sort(bySize)]) {
    const pick = seatParty([...free.values()], p.size, p.zone);
    if (!pick) return { ok: false, used };
    take(pick);
  }
  return { ok: true, used };
}

/**
 * Capacity check: the new party must fit together with every reservation that overlaps it, at each moment of
 * the slot (overlap = existing.startsAt < new.endsAt AND existing.endsAt > new.startsAt). Zone-less
 * reservations count against every zone (SBR-013); party size decides how many tables a booking needs (SBR-014).
 */
export async function checkAvailability(tx: Tx, tenantId: string, input: AvailabilityInput): Promise<Availability> {
  const endsAt = input.endsAt ?? new Date(input.startsAt.getTime() + (input.durationMinutes ?? RESERVATION_MINUTES) * 60_000);
  const zone = input.zone?.trim() || null;
  const size = Math.max(1, Math.floor(input.partySize ?? 2));
  const tables: SeatTable[] = await tx
    .select({ id: diningTables.id, zone: diningTables.zone, seats: diningTables.seats })
    .from(diningTables)
    .where(and(eq(diningTables.tenantId, tenantId), eq(diningTables.active, true)));
  const scope = zone ? tables.filter((t) => t.zone === zone) : tables;
  const capacity = scope.length;
  const maxSeats = scope.reduce((m, t) => Math.max(m, t.seats), 0);
  const totalSeats = scope.reduce((s, t) => s + t.seats, 0);

  const conds = [eq(reservations.tenantId, tenantId), inArray(reservations.status, [...HOLDING]), lt(reservations.startsAt, endsAt), gt(reservations.endsAt, input.startsAt)];
  if (input.excludeId && isUuid(input.excludeId)) conds.push(notInArray(reservations.id, [input.excludeId]));
  const overlapping = await tx
    .select({ startsAt: reservations.startsAt, endsAt: reservations.endsAt, partySize: reservations.partySize, zone: reservations.zone, tableId: reservations.tableId })
    .from(reservations)
    .where(and(...conds));

  // the table usage only changes when an overlapping reservation starts → check the slot start and those moments
  const moments = [input.startsAt.getTime(), ...overlapping.map((r) => r.startsAt.getTime()).filter((t) => t > input.startsAt.getTime() && t < endsAt.getTime())];
  const scopeIds = new Set(scope.map((t) => t.id));
  let available = capacity > 0;
  let booked = 0;
  let remaining = capacity;
  for (const at of moments) {
    const active: SeatParty[] = overlapping.filter((r) => r.startsAt.getTime() <= at && r.endsAt.getTime() > at).map((r) => ({ size: r.partySize, zone: r.zone, tableId: r.tableId }));
    const now = seatAll(tables, active);
    const usedInScope = now.used.filter((t) => scopeIds.has(t.id)).length;
    booked = Math.max(booked, now.ok ? usedInScope : capacity);
    const freeAll = now.ok ? tables.length - now.used.length : 0;
    remaining = Math.min(remaining, now.ok ? Math.max(0, Math.min(capacity - usedInScope, freeAll)) : 0);
    if (available && !seatAll(tables, [...active, { size, zone }]).ok) available = false;
  }
  if (!available) remaining = Math.min(remaining, 0);
  return { available, capacity, booked, remaining, maxSeats, totalSeats };
}

/**
 * Serialises reservation writes of a tenant (COR-10): a transaction holding this lock sees every reservation
 * committed before it, so check + insert can never over-book. Released at commit / rollback.
 */
export async function lockReservations(tx: Tx, tenantId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`rest_reservation:${tenantId}`}, 0))`);
}

/** Last Bangkok calendar day guests may book online (SBR-015). */
export function lastBookableDay(now: Date, maxAdvanceDays = RESERVATION_MAX_ADVANCE_DAYS): string {
  return addDays(bangkokParts(now).ymd, maxAdvanceDays);
}

export interface CreateReservationInput {
  name: string;
  phone: string;
  email?: string | null;
  partySize: number;
  startsAt: Date;
  zone?: string | null;
  occasion?: string | null;
  note?: string | null;
  customerId?: string | null;
  /** satang; 0 = no deposit, confirmed immediately */
  depositAmount?: number;
  paymentMethod?: "promptpay_qr" | "slip" | null;
  promptpayId?: string | null;
  durationMinutes?: number;
  /** booking window in days (default 60); null = no limit (staff) */
  maxAdvanceDays?: number | null;
  now?: Date;
}

export interface CreatedReservation {
  reservation: Reservation;
  payment: PaymentRow | null;
}

export async function createReservation(tx: Tx, tenantId: string, input: CreateReservationInput): Promise<Result<CreatedReservation>> {
  const name = input.name.trim();
  if (!name) return fail("กรุณากรอกชื่อ", "name_required");
  const phone = normalizeThaiPhone(input.phone);
  if (!phone) return fail("กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง", "invalid_phone");
  const partySize = Math.floor(input.partySize);
  if (!Number.isFinite(partySize) || partySize < 1 || partySize > MAX_PARTY_SIZE) return fail(`จำนวนคนต้องอยู่ระหว่าง 1 ถึง ${MAX_PARTY_SIZE}`, "invalid_party");
  const now = input.now ?? new Date();
  if (!(input.startsAt instanceof Date) || Number.isNaN(input.startsAt.getTime())) return fail("วันเวลาไม่ถูกต้อง", "invalid_time");
  if (input.startsAt.getTime() < now.getTime()) return fail("กรุณาเลือกเวลาในอนาคต", "past");
  const maxAdvance = input.maxAdvanceDays === undefined ? RESERVATION_MAX_ADVANCE_DAYS : input.maxAdvanceDays;
  if (maxAdvance !== null && bangkokParts(input.startsAt).ymd > lastBookableDay(now, maxAdvance)) return fail(`จองล่วงหน้าได้ไม่เกิน ${maxAdvance} วัน`, "too_far");
  const endsAt = new Date(input.startsAt.getTime() + (input.durationMinutes ?? RESERVATION_MINUTES) * 60_000);
  const zone = input.zone?.trim() || null;
  // ADMIN_B2-13: a customer the shop blocked cannot reserve (signed in, or a guest using their phone / e-mail)
  if (await isCustomerBlocked(tx, tenantId, { customerId: input.customerId ?? null, phone, email: input.email ?? null })) return fail(CUSTOMER_BLOCKED_MESSAGE, CUSTOMER_BLOCKED_CODE);

  await lockReservations(tx, tenantId);
  const avail = await checkAvailability(tx, tenantId, { startsAt: input.startsAt, endsAt, zone, partySize });
  if (!avail.available) {
    if (avail.capacity > 0 && partySize > avail.totalSeats) return fail(zone ? `โซน${zone}รองรับได้สูงสุด ${avail.totalSeats} ท่าน กรุณาเลือกโซนอื่นหรือติดต่อร้าน` : `ร้านรองรับได้สูงสุด ${avail.totalSeats} ท่านต่อการจอง กรุณาติดต่อร้าน`, "too_large");
    return fail(zone ? `โซน${zone}เต็มในช่วงเวลานี้ ลองเลือกเวลาหรือโซนอื่น` : "ช่วงเวลานี้เต็มแล้ว ลองเลือกเวลาอื่น", "full");
  }

  let customerId = input.customerId ?? null;
  if (!customerId) {
    const c = await upsertGuestCustomer(tx, tenantId, { phone, name, email: input.email ?? null });
    customerId = c?.id ?? null;
  }

  const deposit = Math.max(0, Math.round(input.depositAmount ?? 0));
  const method = deposit > 0 ? (input.paymentMethod ?? "promptpay_qr") : null;
  if (method === "promptpay_qr" && !input.promptpayId) return fail("ร้านยังไม่ได้ตั้งค่า PromptPay", "no_promptpay");

  const number = `RS-${await nextCounter(tx, tenantId, "reservation", 1000)}`;
  const [reservation] = await tx
    .insert(reservations)
    .values({
      tenantId,
      number,
      customerId,
      name,
      phone,
      email: input.email?.trim() || null,
      partySize,
      startsAt: input.startsAt,
      endsAt,
      zone,
      status: deposit > 0 ? "pending" : "confirmed",
      depositAmount: deposit,
      note: input.note?.trim() || null,
      occasion: input.occasion?.trim() || null,
    })
    .returning();

  let payment: PaymentRow | null = null;
  if (deposit > 0 && method) {
    payment = await createPayment(tx, tenantId, {
      refType: "reservation",
      refId: reservation!.id,
      amount: deposit,
      provider: method === "promptpay_qr" ? "promptpay" : "bank_transfer",
      method,
      customerId,
      promptpayId: input.promptpayId ?? undefined,
      expiresMinutes: 30,
      metadata: { number },
    });
    await tx.update(reservations).set({ paymentId: payment.id }).where(and(eq(reservations.tenantId, tenantId), eq(reservations.id, reservation!.id)));
    reservation!.paymentId = payment.id;
  }

  await emitEvent(tx, {
    tenantId,
    type: "reservation.created",
    payload: { reservationId: reservation!.id, number, startsAt: input.startsAt.toISOString(), partySize, zone, status: reservation!.status, deposit, phone, name: reservation!.name, email: reservation!.email },
  });
  return ok({ reservation: reservation!, payment });
}

/**
 * Payment handler for refType "reservation" (payments-api.md 3.1): confirms a pending reservation once its
 * deposit is in. Money for a reservation that can no longer use it (no-show, already paid by another payment)
 * is flagged for a refund instead; a cancelled one is caught by the built-in target check.
 */
export async function onReservationPaid(tx: Tx, payment: PaymentRow): Promise<PaymentPaidResult> {
  const tenantId = payment.tenantId;
  const [r] = await tx.select().from(reservations).where(and(eq(reservations.tenantId, tenantId), eq(reservations.id, payment.refId))).limit(1).for("update");
  if (!r) return refundRequired("ไม่พบการจองที่ชำระมัดจำ");
  if (r.status === "cancelled" || r.status === "no_show") return refundRequired(`การจอง ${r.number} ${r.status === "cancelled" ? "ถูกยกเลิกแล้ว" : "ลูกค้าไม่มาตามนัด"}`);
  if (r.paymentId && r.paymentId !== payment.id) {
    const current = await getPayment(tx, tenantId, r.paymentId);
    if (current && (current.status === "paid" || current.status === "partially_refunded" || current.status === "refunded")) return refundRequired(`มัดจำการจอง ${r.number} ชำระแล้ว (ชำระซ้ำ)`);
  }
  if (r.paymentId === payment.id && r.status !== "pending") return undefined; // re-run (idempotent)
  await tx
    .update(reservations)
    .set({ paymentId: payment.id, ...(r.status === "pending" ? { status: "confirmed" } : {}) })
    .where(and(eq(reservations.tenantId, tenantId), eq(reservations.id, r.id)));
  await emitEvent(tx, { tenantId, type: "reservation.paid", payload: { reservationId: r.id, number: r.number, amount: payment.amount, paymentId: payment.id, phone: r.phone } });
  return undefined;
}

/**
 * Closed handler for refType "reservation" (payments-api.md 3.2): the deposit QR was cancelled or expired →
 * the still-pending reservation is cancelled so the table is free again. Only when this payment is the
 * reservation's current payment. Idempotent.
 */
export async function onReservationPaymentClosed(tx: Tx, payment: PaymentRow, info: PaymentClosedInfo): Promise<void> {
  const tenantId = payment.tenantId;
  if (!isUuid(payment.refId)) return;
  const [r] = await tx.select().from(reservations).where(and(eq(reservations.tenantId, tenantId), eq(reservations.id, payment.refId))).limit(1).for("update");
  if (!r || r.status !== "pending" || r.paymentId !== payment.id) return;
  await tx.update(reservations).set({ status: "cancelled" }).where(and(eq(reservations.tenantId, tenantId), eq(reservations.id, r.id)));
  await emitEvent(tx, { tenantId, type: "reservation.cancelled", payload: { reservationId: r.id, number: r.number, reason: info.reason || "ไม่ได้ชำระมัดจำภายในเวลาที่กำหนด", by: "system", phone: r.phone, name: r.name } });
}

/**
 * Voids the reservation's unpaid deposit payment (COR-34) so a late slip / approval cannot take money for a
 * cancelled booking. Returns whether the deposit had already been paid (the shop then owes a refund).
 */
async function voidDeposit(tx: Tx, tenantId: string, r: Reservation, reason: string): Promise<{ depositPaid: boolean }> {
  if (!r.paymentId) return { depositPaid: false };
  const p = await getPayment(tx, tenantId, r.paymentId);
  if (!p) return { depositPaid: false };
  if (p.status === "pending" || p.status === "pending_verification" || p.status === "failed") {
    try {
      await cancelPayment(tx, tenantId, p.id, reason, { runHandler: false });
      return { depositPaid: false };
    } catch (err) {
      if (!isPaymentStateError(err)) throw err;
      const now = await getPayment(tx, tenantId, p.id);
      return { depositPaid: now?.status === "paid" };
    }
  }
  return { depositPaid: p.status === "paid" || p.status === "partially_refunded" };
}

export async function cancelReservation(tx: Tx, tenantId: string, reservationId: string, reason?: string | null, opts: { by?: "customer" | "staff" | "system" } = {}): Promise<Result<Reservation>> {
  if (!isUuid(reservationId)) return fail("ไม่พบการจอง", "not_found");
  const [r] = await tx.select().from(reservations).where(and(eq(reservations.tenantId, tenantId), eq(reservations.id, reservationId))).limit(1);
  if (!r) return fail("ไม่พบการจอง", "not_found");
  if (r.status === "cancelled") return ok(r);
  if (r.status === "completed" || r.status === "seated") return fail("การจองนี้ใช้งานแล้ว ไม่สามารถยกเลิกได้", "not_cancellable");
  // payment row first (same lock order as markPaid → onReservationPaid)
  const { depositPaid } = await voidDeposit(tx, tenantId, r, reason ? `ยกเลิกการจอง: ${reason}` : "ยกเลิกการจอง");
  const [updated] = await tx
    .update(reservations)
    .set({ status: "cancelled" })
    .where(and(eq(reservations.tenantId, tenantId), eq(reservations.id, r.id), notInArray(reservations.status, ["cancelled", "completed", "seated"])))
    .returning();
  if (!updated) return ok(r);
  await emitEvent(tx, {
    tenantId,
    type: "reservation.cancelled",
    payload: { reservationId: r.id, number: r.number, reason: reason ?? null, phone: r.phone, name: r.name, by: opts.by ?? null, depositPaid, depositAmount: depositPaid ? r.depositAmount : 0 },
  });
  return ok(updated);
}

/** No-show: the unpaid deposit QR is voided too (a paid deposit is kept by the shop). */
export async function markReservationNoShow(tx: Tx, tenantId: string, r: Reservation): Promise<void> {
  await voidDeposit(tx, tenantId, r, "ลูกค้าไม่มาตามนัด");
}

export async function getReservationByNumber(tx: Tx, tenantId: string, number: string): Promise<{ reservation: Reservation; payment: PaymentRow | null } | null> {
  if (!isReservationNumber(number)) return null;
  const [r] = await tx.select().from(reservations).where(and(eq(reservations.tenantId, tenantId), eq(reservations.number, number.trim().toUpperCase()))).limit(1);
  if (!r) return null;
  let payment: PaymentRow | null = null;
  if (r.paymentId) {
    const [p] = await tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.id, r.paymentId))).limit(1);
    payment = p ?? null;
  }
  return { reservation: r, payment };
}

/** Customer-facing lookup guarded by the phone used when booking. */
export async function getReservationForCustomer(tx: Tx, tenantId: string, number: string, phone: string | null | undefined): Promise<Result<{ reservation: Reservation; payment: PaymentRow | null }>> {
  const found = await getReservationByNumber(tx, tenantId, number);
  if (!found) return fail("ไม่พบการจอง", "not_found");
  const p = phone ? normalizeThaiPhone(phone) : null;
  if (!p || p !== found.reservation.phone) return fail("เบอร์โทรศัพท์ไม่ตรงกับการจอง", "forbidden");
  return ok(found);
}

/** Distinct zones that have active tables (for the reserve form). */
export async function listZones(tx: Tx, tenantId: string): Promise<Array<{ zone: string; tables: number; maxSeats: number }>> {
  const rows = await tx.select({ zone: diningTables.zone, seats: diningTables.seats }).from(diningTables).where(and(eq(diningTables.tenantId, tenantId), eq(diningTables.active, true)));
  const map = new Map<string, { zone: string; tables: number; maxSeats: number }>();
  for (const r of rows) {
    const z = r.zone ?? "";
    if (!z) continue;
    const cur = map.get(z) ?? { zone: z, tables: 0, maxSeats: 0 };
    cur.tables++;
    cur.maxSeats = Math.max(cur.maxSeats, r.seats);
    map.set(z, cur);
  }
  return [...map.values()];
}
