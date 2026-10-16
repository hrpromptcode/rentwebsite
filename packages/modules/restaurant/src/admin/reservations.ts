import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { nextCounter, payments, reservations, type Tx } from "@rentweb/db";
import { emitEvent, fail, normalizeThaiPhone, ok, type Result } from "@rentweb/core";
import { getPayment, markPaid } from "@rentweb/core/payments";
import { upsertGuestCustomer } from "@rentweb/core/customer";
import { cancelReservation, checkAvailability, lockReservations, markReservationNoShow, MAX_PARTY_SIZE, type Reservation } from "../services/reservations";
import { addDays, bangkokDate, bangkokParts } from "../services/time";
import { toPaymentInfo, type AdminPaymentInfo } from "./orders";
import { reservationTransitions, type ReservationNext } from "./labels";

export interface ReservationRow {
  id: string;
  number: string;
  name: string;
  phone: string;
  email: string | null;
  partySize: number;
  startsAt: string;
  endsAt: string;
  zone: string | null;
  status: string;
  depositAmount: number;
  note: string | null;
  occasion: string | null;
  createdAt: string;
  payment: AdminPaymentInfo | null;
}

function toRow(r: Reservation, p: typeof payments.$inferSelect | null | undefined): ReservationRow {
  return {
    id: r.id,
    number: r.number,
    name: r.name,
    phone: r.phone,
    email: r.email,
    partySize: r.partySize,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    zone: r.zone,
    status: r.status,
    depositAmount: r.depositAmount,
    note: r.note,
    occasion: r.occasion,
    createdAt: r.createdAt.toISOString(),
    payment: toPaymentInfo(p),
  };
}

/** Reservations starting on a Bangkok calendar day (YYYY-MM-DD), earliest first. */
export async function listReservationsForDay(tx: Tx, tenantId: string, ymd: string): Promise<ReservationRow[]> {
  const from = bangkokDate(ymd, "00:00");
  const to = bangkokDate(addDays(ymd, 1), "00:00");
  const rows = await tx
    .select()
    .from(reservations)
    .where(and(eq(reservations.tenantId, tenantId), gte(reservations.startsAt, from), lt(reservations.startsAt, to)))
    .orderBy(asc(reservations.startsAt), asc(reservations.createdAt));
  const paymentIds = rows.map((r) => r.paymentId).filter((x): x is string => !!x);
  const pays = paymentIds.length ? await tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), inArray(payments.id, paymentIds))) : [];
  const byId = new Map(pays.map((p) => [p.id, p]));
  return rows.map((r) => toRow(r, r.paymentId ? byId.get(r.paymentId) : null));
}

export interface DayCount {
  ymd: string;
  total: number;
  pending: number;
  confirmed: number;
  seated: number;
  guests: number;
}

/** Per-day counts for `days` days starting at `fromYmd` (holding statuses only). */
export async function reservationDayCounts(tx: Tx, tenantId: string, fromYmd: string, days = 7): Promise<DayCount[]> {
  const from = bangkokDate(fromYmd, "00:00");
  const to = bangkokDate(addDays(fromYmd, days), "00:00");
  const rows = await tx
    .select({ startsAt: reservations.startsAt, status: reservations.status, partySize: reservations.partySize })
    .from(reservations)
    .where(and(eq(reservations.tenantId, tenantId), gte(reservations.startsAt, from), lt(reservations.startsAt, to), inArray(reservations.status, ["pending", "confirmed", "seated", "completed"])));
  const out = new Map<string, DayCount>();
  for (let i = 0; i < days; i++) {
    const ymd = addDays(fromYmd, i);
    out.set(ymd, { ymd, total: 0, pending: 0, confirmed: 0, seated: 0, guests: 0 });
  }
  for (const r of rows) {
    const d = out.get(bangkokParts(r.startsAt).ymd);
    if (!d) continue;
    d.total++;
    d.guests += r.partySize;
    if (r.status === "pending") d.pending++;
    else if (r.status === "confirmed") d.confirmed++;
    else if (r.status === "seated") d.seated++;
  }
  return [...out.values()];
}


export async function setReservationStatus(tx: Tx, tenantId: string, id: string, next: ReservationNext, reason?: string | null): Promise<Result<Reservation>> {
  if (next === "cancelled") return cancelReservation(tx, tenantId, id, reason, { by: "staff" });
  const [r] = await tx.select().from(reservations).where(and(eq(reservations.tenantId, tenantId), eq(reservations.id, id))).limit(1);
  if (!r) return fail("ไม่พบการจอง", "not_found");
  if (r.status === next) return ok(r);
  if (!reservationTransitions(r.status).includes(next)) return fail(`ไม่สามารถเปลี่ยนสถานะจาก ${r.status} เป็น ${next}`, "invalid_transition");
  // a no-show never pays the deposit QR any more: void it so a late slip cannot be auto-approved (COR-34)
  if (next === "no_show") await markReservationNoShow(tx, tenantId, r);
  const [updated] = await tx.update(reservations).set({ status: next }).where(and(eq(reservations.tenantId, tenantId), eq(reservations.id, r.id))).returning();
  await emitEvent(tx, { tenantId, type: `reservation.${next}`, payload: { reservationId: r.id, number: r.number, phone: r.phone, name: r.name, startsAt: r.startsAt.toISOString(), partySize: r.partySize, from: r.status } });
  return ok(updated!);
}

/** Approves the deposit slip/QR → payment handler confirms the reservation. */
export async function approveReservationDeposit(tx: Tx, tenantId: string, id: string, verifiedBy: string): Promise<Result<{ reservationId: string; paymentId: string | null }>> {
  const [r] = await tx.select().from(reservations).where(and(eq(reservations.tenantId, tenantId), eq(reservations.id, id))).limit(1);
  if (!r) return fail("ไม่พบการจอง", "not_found");
  if (r.status === "cancelled" || r.status === "no_show") return fail("การจองนี้ถูกยกเลิกแล้ว", "cancelled");
  const p = r.paymentId ? await getPayment(tx, tenantId, r.paymentId) : null;
  if (p && (p.status === "pending" || p.status === "pending_verification")) {
    await markPaid(tx, tenantId, p.id, { verifiedBy });
    return ok({ reservationId: r.id, paymentId: p.id });
  }
  if (r.status === "pending") {
    const s = await setReservationStatus(tx, tenantId, id, "confirmed");
    if (!s.ok) return s;
  }
  return ok({ reservationId: r.id, paymentId: p?.id ?? null });
}

export interface ManualReservationInput {
  name: string;
  phone: string;
  partySize: number;
  startsAt: Date;
  zone?: string | null;
  note?: string | null;
  occasion?: string | null;
  durationMinutes?: number;
  /** skip the capacity check (walk-ins, overbooking on purpose) */
  force?: boolean;
  createdBy?: string;
}

/** Staff-created reservation: confirmed immediately, no deposit, may be in the (recent) past for walk-ins. */
export async function createManualReservation(tx: Tx, tenantId: string, input: ManualReservationInput): Promise<Result<{ id: string; number: string }>> {
  const name = input.name.trim();
  if (!name) return fail("กรุณากรอกชื่อลูกค้า", "name_required");
  const phone = normalizeThaiPhone(input.phone);
  if (!phone) return fail("กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง", "invalid_phone");
  const partySize = Math.floor(input.partySize);
  if (!Number.isFinite(partySize) || partySize < 1 || partySize > MAX_PARTY_SIZE) return fail(`จำนวนคนต้องอยู่ระหว่าง 1 ถึง ${MAX_PARTY_SIZE}`, "invalid_party");
  if (!(input.startsAt instanceof Date) || Number.isNaN(input.startsAt.getTime())) return fail("วันเวลาไม่ถูกต้อง", "invalid_time");
  if (input.startsAt.getTime() < Date.now() - 6 * 3_600_000) return fail("เวลาย้อนหลังเกิน 6 ชั่วโมง", "past");
  const endsAt = new Date(input.startsAt.getTime() + (input.durationMinutes ?? 90) * 60_000);
  const zone = input.zone?.trim() || null;
  // serialise with storefront bookings so check + insert cannot over-book (COR-10)
  await lockReservations(tx, tenantId);
  if (!input.force) {
    const avail = await checkAvailability(tx, tenantId, { startsAt: input.startsAt, endsAt, zone, partySize });
    if (!avail.available) return fail(zone ? `โซน${zone}เต็มในช่วงเวลานี้ (${avail.booked}/${avail.capacity} โต๊ะ) ติ๊ก "ข้ามการตรวจสอบที่ว่าง" หากต้องการบันทึกต่อ` : `ช่วงเวลานี้เต็มแล้ว (${avail.booked}/${avail.capacity} โต๊ะ) ติ๊ก "ข้ามการตรวจสอบที่ว่าง" หากต้องการบันทึกต่อ`, "full");
  }
  const c = await upsertGuestCustomer(tx, tenantId, { phone, name });
  const number = `RS-${await nextCounter(tx, tenantId, "reservation", 1000)}`;
  const [row] = await tx
    .insert(reservations)
    .values({ tenantId, number, customerId: c?.id ?? null, name, phone, partySize, startsAt: input.startsAt, endsAt, zone, status: "confirmed", depositAmount: 0, note: input.note?.trim() || null, occasion: input.occasion?.trim() || null })
    .returning({ id: reservations.id, number: reservations.number });
  await emitEvent(tx, { tenantId, type: "reservation.created", payload: { reservationId: row!.id, number, startsAt: input.startsAt.toISOString(), partySize, zone, status: "confirmed", deposit: 0, phone, source: "admin", createdBy: input.createdBy ?? null } });
  return ok(row!);
}

export async function updateReservationNote(tx: Tx, tenantId: string, id: string, note: string | null): Promise<Result<{ id: string }>> {
  const [row] = await tx.update(reservations).set({ note: note?.trim() || null }).where(and(eq(reservations.tenantId, tenantId), eq(reservations.id, id))).returning({ id: reservations.id });
  if (!row) return fail("ไม่พบการจอง", "not_found");
  return ok(row);
}
