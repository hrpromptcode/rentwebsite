import { and, count, eq, gt, inArray, lt, notInArray } from "drizzle-orm";
import { diningTables, nextCounter, payments, reservations, type Tx } from "@rentweb/db";
import { emitEvent, fail, normalizeThaiPhone, ok, type Result } from "@rentweb/core";
import { createPayment } from "@rentweb/core/payments";
import { upsertGuestCustomer } from "@rentweb/core/customer";

export type Reservation = typeof reservations.$inferSelect;
export const RESERVATION_MINUTES = 90;
/** statuses that still hold a table */
const HOLDING = ["pending", "confirmed", "seated"] as const;

export interface AvailabilityInput {
  startsAt: Date;
  endsAt?: Date;
  zone?: string | null;
  partySize?: number;
  /** ignore this reservation when re-checking (edits) */
  excludeId?: string | null;
  durationMinutes?: number;
}

export interface Availability {
  available: boolean;
  /** tables in the zone (all zones when no zone given) */
  capacity: number;
  /** overlapping reservations still holding a table */
  booked: number;
  remaining: number;
  /** largest table in the zone, to warn big parties */
  maxSeats: number;
}

/**
 * Simple capacity check: a zone can hold as many overlapping reservations as it has active tables.
 * Overlap = existing.startsAt < new.endsAt AND existing.endsAt > new.startsAt.
 */
export async function checkAvailability(tx: Tx, tenantId: string, input: AvailabilityInput): Promise<Availability> {
  const endsAt = input.endsAt ?? new Date(input.startsAt.getTime() + (input.durationMinutes ?? RESERVATION_MINUTES) * 60_000);
  const tableConds = [eq(diningTables.tenantId, tenantId), eq(diningTables.active, true)];
  if (input.zone) tableConds.push(eq(diningTables.zone, input.zone));
  const tables = await tx.select({ seats: diningTables.seats }).from(diningTables).where(and(...tableConds));
  const capacity = tables.length;
  const maxSeats = tables.reduce((m, t) => Math.max(m, t.seats), 0);
  const conds = [eq(reservations.tenantId, tenantId), inArray(reservations.status, [...HOLDING]), lt(reservations.startsAt, endsAt), gt(reservations.endsAt, input.startsAt)];
  if (input.zone) conds.push(eq(reservations.zone, input.zone));
  if (input.excludeId) conds.push(notInArray(reservations.id, [input.excludeId]));
  const [row] = await tx.select({ n: count() }).from(reservations).where(and(...conds));
  const booked = Number(row?.n ?? 0);
  const remaining = Math.max(0, capacity - booked);
  return { available: capacity > 0 && remaining > 0, capacity, booked, remaining, maxSeats };
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
  now?: Date;
}

export interface CreatedReservation {
  reservation: Reservation;
  payment: typeof payments.$inferSelect | null;
}

export async function createReservation(tx: Tx, tenantId: string, input: CreateReservationInput): Promise<Result<CreatedReservation>> {
  const name = input.name.trim();
  if (!name) return fail("กรุณากรอกชื่อ", "name_required");
  const phone = normalizeThaiPhone(input.phone);
  if (!phone) return fail("กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง", "invalid_phone");
  const partySize = Math.floor(input.partySize);
  if (!Number.isFinite(partySize) || partySize < 1 || partySize > 40) return fail("จำนวนคนต้องอยู่ระหว่าง 1 ถึง 40", "invalid_party");
  const now = input.now ?? new Date();
  if (!(input.startsAt instanceof Date) || Number.isNaN(input.startsAt.getTime())) return fail("วันเวลาไม่ถูกต้อง", "invalid_time");
  if (input.startsAt.getTime() < now.getTime()) return fail("กรุณาเลือกเวลาในอนาคต", "past");
  const endsAt = new Date(input.startsAt.getTime() + (input.durationMinutes ?? RESERVATION_MINUTES) * 60_000);
  const zone = input.zone?.trim() || null;

  const avail = await checkAvailability(tx, tenantId, { startsAt: input.startsAt, endsAt, zone, partySize });
  if (!avail.available) return fail(zone ? `โซน${zone}เต็มในช่วงเวลานี้ ลองเลือกเวลาหรือโซนอื่น` : "ช่วงเวลานี้เต็มแล้ว ลองเลือกเวลาอื่น", "full");

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

  let payment: typeof payments.$inferSelect | null = null;
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
    await tx.update(reservations).set({ paymentId: payment.id }).where(eq(reservations.id, reservation!.id));
    reservation!.paymentId = payment.id;
  }

  await emitEvent(tx, {
    tenantId,
    type: "reservation.created",
    payload: { reservationId: reservation!.id, number, startsAt: input.startsAt.toISOString(), partySize, zone, status: reservation!.status, deposit, phone },
  });
  return ok({ reservation: reservation!, payment });
}

/** Payment handler for refType "reservation": confirms the booking once the deposit is in. Idempotent. */
export async function onReservationPaid(tx: Tx, payment: typeof payments.$inferSelect): Promise<void> {
  const tenantId = payment.tenantId;
  const [r] = await tx.select().from(reservations).where(and(eq(reservations.tenantId, tenantId), eq(reservations.id, payment.refId))).limit(1);
  if (!r) return;
  if (r.status !== "pending") return;
  await tx.update(reservations).set({ status: "confirmed", paymentId: payment.id }).where(eq(reservations.id, r.id));
  await emitEvent(tx, { tenantId, type: "reservation.paid", payload: { reservationId: r.id, number: r.number, amount: payment.amount, paymentId: payment.id, phone: r.phone } });
}

export async function cancelReservation(tx: Tx, tenantId: string, reservationId: string, reason?: string | null): Promise<Result<Reservation>> {
  const [r] = await tx.select().from(reservations).where(and(eq(reservations.tenantId, tenantId), eq(reservations.id, reservationId))).limit(1);
  if (!r) return fail("ไม่พบการจอง", "not_found");
  if (r.status === "cancelled") return ok(r);
  if (r.status === "completed" || r.status === "seated") return fail("การจองนี้ใช้งานแล้ว ไม่สามารถยกเลิกได้", "not_cancellable");
  const [updated] = await tx.update(reservations).set({ status: "cancelled" }).where(eq(reservations.id, r.id)).returning();
  await emitEvent(tx, { tenantId, type: "reservation.cancelled", payload: { reservationId: r.id, number: r.number, reason: reason ?? null, phone: r.phone } });
  return ok(updated!);
}

export async function getReservationByNumber(tx: Tx, tenantId: string, number: string): Promise<{ reservation: Reservation; payment: typeof payments.$inferSelect | null } | null> {
  const [r] = await tx.select().from(reservations).where(and(eq(reservations.tenantId, tenantId), eq(reservations.number, number.trim().toUpperCase()))).limit(1);
  if (!r) return null;
  let payment: typeof payments.$inferSelect | null = null;
  if (r.paymentId) {
    const [p] = await tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.id, r.paymentId))).limit(1);
    payment = p ?? null;
  }
  return { reservation: r, payment };
}

/** Customer-facing lookup guarded by the phone used when booking. */
export async function getReservationForCustomer(tx: Tx, tenantId: string, number: string, phone: string | null | undefined): Promise<Result<{ reservation: Reservation; payment: typeof payments.$inferSelect | null }>> {
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
