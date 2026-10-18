import { and, asc, count, desc, eq, gt, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { customers, payments, rentalStays, rentalUnitTypes, type Tx } from "@rentweb/db";
import { audit, fail, isUuid, ok, type Result } from "@rentweb/core";
import { createPayment, markFailed, markPaid, paymentRefundRequired, refundPayment, type PaymentMethod } from "@rentweb/core/payments";
import type { RentalConfig } from "../services/config";
import { cancelStay, lockStay, lockStayPayments, STAY_REF_TYPE, transitionStay, voidStayPayments, type PaymentRow, type StayRow } from "../services/stays";
import { bkkDateString } from "../services/time";
import type { Actor } from "./catalog";
import { ACTION_LABEL, type StayAdminAction, type StayTab } from "./labels";

export type { StayRow, PaymentRow };

/* -------------------------------------------------------------------------- */
/* list                                                                        */
/* -------------------------------------------------------------------------- */

export interface StayAdminRow {
  id: string;
  number: string;
  status: string;
  paymentStatus: string;
  source: string;
  guestName: string;
  guestPhone: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  total: number;
  paidAmount: number;
  depositAmount: number;
  unitNumber: string | null;
  unitTypeId: string;
  typeName: string;
  typeSlug: string;
  createdAt: Date;
  holdUntil: Date | null;
}

const OPEN = ["pending", "confirmed"] as const;

function tabCondition(tab: StayTab, today: string): SQL | undefined {
  switch (tab) {
    case "arrivals":
      return and(eq(rentalStays.checkIn, today), inArray(rentalStays.status, [...OPEN]));
    case "inhouse":
      return eq(rentalStays.status, "checked_in");
    case "upcoming":
      return and(gt(rentalStays.checkIn, today), inArray(rentalStays.status, [...OPEN]));
    case "departures":
      return and(eq(rentalStays.checkOut, today), inArray(rentalStays.status, ["checked_in", "checked_out"]));
    case "cancelled":
      return inArray(rentalStays.status, ["cancelled", "no_show"]);
    default:
      return undefined;
  }
}

export async function listStaysAdmin(tx: Tx, tenantId: string, f: { tab?: StayTab; q?: string | null; page?: number; perPage?: number; now?: Date } = {}): Promise<{ rows: StayAdminRow[]; total: number; page: number; pages: number }> {
  const tab = f.tab ?? "arrivals";
  const today = bkkDateString(f.now ?? new Date());
  const perPage = Math.min(100, Math.max(1, f.perPage ?? 25));
  const page = Math.max(1, f.page ?? 1);
  const conds: SQL[] = [eq(rentalStays.tenantId, tenantId)];
  const tc = tabCondition(tab, today);
  if (tc) conds.push(tc);
  const q = f.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(rentalStays.number, like), ilike(rentalStays.guestName, like), ilike(rentalStays.guestPhone, like), ilike(rentalStays.guestEmail, like), ilike(rentalStays.unitNumber, like))!);
  }
  const where = and(...conds);
  const order = tab === "cancelled" || tab === "all" ? [desc(rentalStays.createdAt)] : [asc(rentalStays.checkIn), asc(rentalStays.number)];
  const [rows, [c]] = await Promise.all([
    tx
      .select({
        id: rentalStays.id,
        number: rentalStays.number,
        status: rentalStays.status,
        paymentStatus: rentalStays.paymentStatus,
        source: rentalStays.source,
        guestName: rentalStays.guestName,
        guestPhone: rentalStays.guestPhone,
        checkIn: rentalStays.checkIn,
        checkOut: rentalStays.checkOut,
        nights: rentalStays.nights,
        guests: rentalStays.guests,
        total: rentalStays.total,
        paidAmount: rentalStays.paidAmount,
        depositAmount: rentalStays.depositAmount,
        unitNumber: rentalStays.unitNumber,
        unitTypeId: rentalStays.unitTypeId,
        typeName: rentalUnitTypes.name,
        typeSlug: rentalUnitTypes.slug,
        createdAt: rentalStays.createdAt,
        holdUntil: rentalStays.holdUntil,
      })
      .from(rentalStays)
      .innerJoin(rentalUnitTypes, and(eq(rentalUnitTypes.id, rentalStays.unitTypeId), eq(rentalUnitTypes.tenantId, tenantId)))
      .where(where)
      .orderBy(...order)
      .limit(perPage)
      .offset((page - 1) * perPage),
    tx.select({ c: count() }).from(rentalStays).where(where),
  ]);
  const total = Number(c?.c ?? 0);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function stayTabCounts(tx: Tx, tenantId: string, now: Date = new Date()): Promise<Record<StayTab, number>> {
  const today = bkkDateString(now);
  const [r] = await tx
    .select({
      arrivals: sql<number>`count(*) filter (where ${rentalStays.checkIn} = ${today} and ${rentalStays.status} in ('pending','confirmed'))::int`,
      inhouse: sql<number>`count(*) filter (where ${rentalStays.status} = 'checked_in')::int`,
      upcoming: sql<number>`count(*) filter (where ${rentalStays.checkIn} > ${today} and ${rentalStays.status} in ('pending','confirmed'))::int`,
      departures: sql<number>`count(*) filter (where ${rentalStays.checkOut} = ${today} and ${rentalStays.status} in ('checked_in','checked_out'))::int`,
      cancelled: sql<number>`count(*) filter (where ${rentalStays.status} in ('cancelled','no_show'))::int`,
      all: sql<number>`count(*)::int`,
    })
    .from(rentalStays)
    .where(eq(rentalStays.tenantId, tenantId));
  return { arrivals: Number(r?.arrivals ?? 0), inhouse: Number(r?.inhouse ?? 0), upcoming: Number(r?.upcoming ?? 0), departures: Number(r?.departures ?? 0), cancelled: Number(r?.cancelled ?? 0), all: Number(r?.all ?? 0) };
}

export interface StayKpis {
  arrivalsToday: number;
  departuresToday: number;
  inHouse: number;
  awaitingPayment: number;
  /** paid amounts of stays checking in this month (not cancelled) */
  revenueMonth: number;
  occupancyToday: { booked: number; total: number };
}

export async function stayKpis(tx: Tx, tenantId: string, now: Date = new Date()): Promise<StayKpis> {
  const today = bkkDateString(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  const [r] = await tx
    .select({
      arrivalsToday: sql<number>`count(*) filter (where ${rentalStays.checkIn} = ${today} and ${rentalStays.status} in ('pending','confirmed','checked_in'))::int`,
      departuresToday: sql<number>`count(*) filter (where ${rentalStays.checkOut} = ${today} and ${rentalStays.status} in ('checked_in','checked_out'))::int`,
      inHouse: sql<number>`count(*) filter (where ${rentalStays.status} = 'checked_in')::int`,
      awaitingPayment: sql<number>`count(*) filter (where ${rentalStays.status} = 'pending')::int`,
      revenueMonth: sql<number>`coalesce(sum(${rentalStays.paidAmount}) filter (where ${rentalStays.checkIn} >= ${monthStart} and ${rentalStays.status} not in ('cancelled','no_show')), 0)::bigint`,
      bookedToday: sql<number>`count(*) filter (where ${rentalStays.checkIn} <= ${today} and ${rentalStays.checkOut} > ${today} and ${rentalStays.status} in ('confirmed','checked_in'))::int`,
    })
    .from(rentalStays)
    .where(eq(rentalStays.tenantId, tenantId));
  const [u] = await tx.select({ total: sql<number>`coalesce(sum(${rentalUnitTypes.quantity}), 0)::int` }).from(rentalUnitTypes).where(and(eq(rentalUnitTypes.tenantId, tenantId), eq(rentalUnitTypes.active, true)));
  return {
    arrivalsToday: Number(r?.arrivalsToday ?? 0),
    departuresToday: Number(r?.departuresToday ?? 0),
    inHouse: Number(r?.inHouse ?? 0),
    awaitingPayment: Number(r?.awaitingPayment ?? 0),
    revenueMonth: Number(r?.revenueMonth ?? 0),
    occupancyToday: { booked: Number(r?.bookedToday ?? 0), total: Number(u?.total ?? 0) },
  };
}

/* -------------------------------------------------------------------------- */
/* detail                                                                      */
/* -------------------------------------------------------------------------- */

export interface StayTimelineItem {
  at: Date;
  label: string;
  tone: "default" | "success" | "warning" | "destructive" | "muted";
}

export interface StayAdminDetail {
  stay: StayRow;
  type: typeof rentalUnitTypes.$inferSelect;
  customer: { id: string; name: string | null; phone: string | null; email: string | null; tier: string; createdAt: Date } | null;
  payments: PaymentRow[];
  /** the live payment: the stay's current one, else the newest */
  payment: PaymentRow | null;
  timeline: StayTimelineItem[];
  history: StayAdminRow[];
  balanceDue: number;
}

export async function getStayAdmin(tx: Tx, tenantId: string, id: string): Promise<StayAdminDetail | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx
    .select({ stay: rentalStays, type: rentalUnitTypes })
    .from(rentalStays)
    .innerJoin(rentalUnitTypes, and(eq(rentalUnitTypes.id, rentalStays.unitTypeId), eq(rentalUnitTypes.tenantId, tenantId)))
    .where(and(eq(rentalStays.tenantId, tenantId), eq(rentalStays.id, id)))
    .limit(1);
  if (!row) return null;
  const { stay, type } = row;
  const [customer] = stay.customerId
    ? await tx.select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email, tier: customers.tier, createdAt: customers.createdAt }).from(customers).where(and(eq(customers.tenantId, tenantId), eq(customers.id, stay.customerId))).limit(1)
    : [];
  const pays = await tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.refType, STAY_REF_TYPE), eq(payments.refId, stay.id))).orderBy(desc(payments.createdAt));
  const payment = pays.find((p) => p.id === stay.paymentId) ?? pays[0] ?? null;
  const timeline: StayTimelineItem[] = [{ at: stay.createdAt, label: `สร้างการจอง (${stay.source === "online" ? "ออนไลน์" : stay.source})`, tone: "muted" }];
  for (const p of pays) {
    if (p.paidAt) timeline.push({ at: p.paidAt, label: `รับชำระ ${(p.amount / 100).toLocaleString("th-TH")} บาท (${p.method})`, tone: "success" });
    if (p.status === "failed" && p.failureReason) timeline.push({ at: p.updatedAt, label: `สลิปไม่ผ่าน: ${p.failureReason}`, tone: "destructive" });
  }
  if (stay.confirmedAt) timeline.push({ at: stay.confirmedAt, label: "ยืนยันการจอง", tone: "success" });
  if (stay.checkedInAt) timeline.push({ at: stay.checkedInAt, label: "เช็กอิน", tone: "default" });
  if (stay.checkedOutAt) timeline.push({ at: stay.checkedOutAt, label: "เช็กเอาต์", tone: "muted" });
  if (stay.cancelledAt) timeline.push({ at: stay.cancelledAt, label: `${stay.status === "no_show" ? "ไม่มาเข้าพัก" : "ยกเลิก"}${stay.cancelReason ? `: ${stay.cancelReason}` : ""}${stay.cancelledBy ? ` (${stay.cancelledBy === "customer" ? "ลูกค้า" : stay.cancelledBy === "system" ? "ระบบ" : "ที่พัก"})` : ""}`, tone: "destructive" });
  timeline.sort((a, b) => a.at.getTime() - b.at.getTime());
  const history = stay.customerId
    ? (
        await listStaysAdmin(tx, tenantId, { tab: "all", perPage: 100 })
      ).rows
        .filter((s) => s.id !== stay.id)
        .slice(0, 100)
        .filter((s) => s.guestPhone && s.guestPhone === stay.guestPhone)
        .slice(0, 5)
    : [];
  return { stay, type, customer: customer ?? null, payments: pays, payment, timeline, history, balanceDue: Math.max(0, stay.total - stay.paidAmount) };
}

/* -------------------------------------------------------------------------- */
/* front desk actions                                                           */
/* -------------------------------------------------------------------------- */

export async function adminTransition(tx: Tx, tenantId: string, id: string, action: StayAdminAction, actor: Actor): Promise<Result<StayRow, string>> {
  const r = await transitionStay(tx, tenantId, id, action);
  if (!r.ok) return fail(r.error === "not_found" ? "ไม่พบการจอง" : `ทำรายการ “${ACTION_LABEL[action]}” กับสถานะปัจจุบันไม่ได้`);
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: `stay.${action}`, targetType: "stay", targetId: id, diff: { number: r.value.number } });
  return ok(r.value);
}

export async function adminCancelStay(tx: Tx, tenantId: string, id: string, reason: string, config: RentalConfig, actor: Actor): Promise<Result<StayRow, string>> {
  // a slip under review may be real money: the admin approves (→ refund flow) or rejects it before the stay can be cancelled
  if ((await lockStayPayments(tx, tenantId, id)).some((p) => p.status === "pending_verification")) return fail("มีสลิปรอตรวจสอบอยู่ — อนุมัติหรือปฏิเสธสลิปก่อนยกเลิกการจอง");
  const r = await cancelStay(tx, tenantId, id, { by: "admin", reason, config, actorId: actor.userId });
  if (!r.ok) return fail(r.error === "not_found" ? "ไม่พบการจอง" : "การจองนี้ยกเลิกไม่ได้แล้ว");
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "stay.cancel", targetType: "stay", targetId: id, diff: { number: r.value.stay.number, reason, paidAmount: r.value.stay.paidAmount } });
  return ok(r.value.stay);
}

export async function setStayNotes(tx: Tx, tenantId: string, id: string, patch: { internalNote?: string | null; unitNumber?: string | null }, actor: Actor): Promise<boolean> {
  const set: Partial<typeof rentalStays.$inferInsert> = {};
  if (patch.internalNote !== undefined) set.internalNote = patch.internalNote;
  if (patch.unitNumber !== undefined) set.unitNumber = patch.unitNumber;
  if (!Object.keys(set).length) return false;
  const [row] = await tx.update(rentalStays).set(set).where(and(eq(rentalStays.tenantId, tenantId), eq(rentalStays.id, id))).returning({ id: rentalStays.id });
  if (!row) return false;
  if (patch.unitNumber !== undefined) await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "stay.assign_unit", targetType: "stay", targetId: id, diff: { unitNumber: patch.unitNumber } });
  return true;
}

/* -------------------------------------------------------------------------- */
/* money                                                                       */
/* -------------------------------------------------------------------------- */

async function stayPayment(tx: Tx, tenantId: string, stayId: string, paymentId: string): Promise<PaymentRow | null> {
  const [p] = await tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId), eq(payments.refType, STAY_REF_TYPE), eq(payments.refId, stayId))).limit(1);
  return p ?? null;
}

/** Approves a slip / records a QR as paid: markPaid runs onStayPaid (confirm or refundRequired when the unit is gone). */
export async function approveStayPayment(tx: Tx, tenantId: string, stayId: string, paymentId: string, actor: Actor): Promise<Result<null, string>> {
  const p = await stayPayment(tx, tenantId, stayId, paymentId);
  if (!p) return fail("ไม่พบรายการชำระเงินของการจองนี้");
  if (p.status === "paid") return fail("รายการนี้ยืนยันแล้ว");
  if (!["pending", "pending_verification"].includes(p.status)) return fail(`รายการอยู่ในสถานะ ${p.status} ยืนยันไม่ได้`);
  const paid = await markPaid(tx, tenantId, p.id, { verifiedBy: actor.userId });
  const refund = paymentRefundRequired(paid);
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "stay.payment.approve", targetType: "payment", targetId: p.id, diff: { stayId, amount: p.amount, method: p.method, refundRequired: refund } });
  if (refund) return fail(`บันทึกรับเงินแล้ว แต่ต้องคืนเงินลูกค้า: ${refund}`);
  return ok(null);
}

export async function rejectStayPayment(tx: Tx, tenantId: string, stayId: string, paymentId: string, reason: string, actor: Actor): Promise<Result<null, string>> {
  const p = await stayPayment(tx, tenantId, stayId, paymentId);
  if (!p) return fail("ไม่พบรายการชำระเงินของการจองนี้");
  if (p.status === "paid") return fail("รายการนี้ชำระแล้ว ปฏิเสธไม่ได้ (ใช้คืนเงินแทน)");
  await markFailed(tx, tenantId, p.id, reason);
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "stay.payment.reject", targetType: "payment", targetId: p.id, diff: { stayId, reason } });
  return ok(null);
}

export async function refundStayPayment(tx: Tx, tenantId: string, stayId: string, paymentId: string, note: string | null, actor: Actor): Promise<Result<null, string>> {
  const p = await stayPayment(tx, tenantId, stayId, paymentId);
  if (!p) return fail("ไม่พบรายการชำระเงิน");
  if (p.status !== "paid") return fail("คืนเงินได้เฉพาะรายการที่ชำระแล้ว");
  await refundPayment(tx, tenantId, p.id, undefined, note ?? undefined);
  await tx.update(rentalStays).set({ paymentStatus: "refunded" }).where(and(eq(rentalStays.tenantId, tenantId), eq(rentalStays.id, stayId)));
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "stay.payment.refund", targetType: "payment", targetId: p.id, diff: { stayId, amount: p.amount, note } });
  return ok(null);
}

/**
 * Records money taken at the front desk: `due` = the amount that confirms a pending stay (its open QR / rejected slip is
 * voided first), `balance` = whatever is still owed on a confirmed / checked-in stay. markPaid runs onStayPaid.
 */
export async function recordCashStayPayment(tx: Tx, tenantId: string, stayId: string, which: "due" | "balance", actor: Actor): Promise<Result<{ amount: number }, string>> {
  if (!isUuid(stayId)) return fail("ไม่พบการจอง");
  const pays = await lockStayPayments(tx, tenantId, stayId);
  const stay = await lockStay(tx, tenantId, stayId);
  if (!stay) return fail("ไม่พบการจอง");
  if (stay.status === "cancelled" || stay.status === "no_show") return fail("การจองนี้ถูกยกเลิกแล้ว");
  if (pays.some((x) => x.status === "pending_verification")) return fail("มีสลิปรอตรวจสอบอยู่ — อนุมัติหรือปฏิเสธสลิปก่อน");
  const amount = which === "balance" ? stay.total - stay.paidAmount : stay.paymentStatus === "unpaid" ? stay.depositAmount || stay.total : 0;
  if (amount <= 0) return fail(which === "balance" ? "การจองนี้ชำระครบแล้ว" : "การจองนี้ไม่มีมัดจำค้างชำระ");
  if (which === "due") await voidStayPayments(tx, tenantId, pays, "รับชำระเป็นเงินสดที่ที่พัก");
  const p = await createPayment(tx, tenantId, { refType: STAY_REF_TYPE, refId: stay.id, amount, provider: "cash", method: "cash" as PaymentMethod, customerId: stay.customerId, metadata: { stayNumber: stay.number, by: actor.userId, kind: which } });
  // onStayPaid (via markPaid) adds the amount and points stay.paymentId at this payment; pre-setting paymentId here would
  // make the handler treat the balance payment as "the same payment again" and skip the paidAmount update.
  const paid = await markPaid(tx, tenantId, p.id, { verifiedBy: actor.userId });
  const refund = paymentRefundRequired(paid);
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "stay.payment.cash", targetType: "payment", targetId: p.id, diff: { stayId, amount, kind: which, refundRequired: refund } });
  if (refund) return fail(`บันทึกรับเงินแล้ว แต่ห้องไม่ว่างแล้ว: ${refund}`);
  return ok({ amount });
}

/** Pending stays whose hold lapsed (payment never arrived) – shown as a hint on the list page. */
export async function lapsedHoldCount(tx: Tx, tenantId: string, now: Date = new Date()): Promise<number> {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(rentalStays)
    .where(and(eq(rentalStays.tenantId, tenantId), eq(rentalStays.status, "pending"), lt(rentalStays.holdUntil, now), gte(rentalStays.checkOut, bkkDateString(now))));
  return Number(r?.n ?? 0);
}
