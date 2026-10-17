import { and, asc, desc, eq, gte, inArray, lt, nextCounter, sql, type Tx } from "@rentweb/db";
import { payments, rentalStays, rentalUnitTypes, type StayMeta } from "@rentweb/db";
import { emitEvent, fail, isUuid, ok, randomToken, safeEqual, type Result } from "@rentweb/core";
import { isCustomerBlocked, upsertGuestCustomer } from "@rentweb/core/customer";
import {
  cancelPayment,
  createPayment,
  enabledMethods,
  getPayment,
  paymentSettings,
  refundRequired,
  resolvePromptpayId,
  type PaymentAccessProof,
  type PaymentAccessVia,
  type PaymentClosedInfo,
  type PaymentMethod,
  type PaymentPaidResult,
  type PaymentProvider,
} from "@rentweb/core/payments";
import { unitsAvailable } from "./availability";
import { getUnitTypeById, listExtras, listRateRules, type UnitTypeRow } from "./catalog";
import type { RentalConfig } from "./config";
import { quoteStay, type Quote, type QuoteError } from "./pricing";
import { addDays, bkkDateString, diffDays } from "./time";

export type StayRow = typeof rentalStays.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;

export const STAY_REF_TYPE = "stay" as const;

export interface StayOpts {
  config: RentalConfig;
  /** tenant settings (payments block) */
  settings: Record<string, unknown>;
  now?: Date;
}

export type PayOption = "deposit" | "full";

export interface CreateStayInput {
  unitTypeId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  extras?: Array<{ id: string; qty: number }>;
  customer: { id?: string | null; name: string; phone: string; email?: string | null };
  note?: string | null;
  /** promptpay_qr | slip | cash (pay at the property) */
  paymentMethod?: PaymentMethod | null;
  /** deposit (default when the policy allows) or the full amount online */
  payOption?: PayOption | null;
  source?: string;
}

export type CreateStayError = "unit_type_not_found" | QuoteError | "unavailable" | "invalid_customer" | "customer_blocked" | "payment_method";

export interface CreateStayResult {
  stay: StayRow;
  accessKey: string;
  payment: PaymentRow | null;
  quote: Quote;
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

/** Grace after the payment expiry during which a pending stay still holds its unit (mirrors PAYMENT_EXPIRY_GRACE_MINUTES). */
const HOLD_GRACE_MIN = 15;

/* ------------------------------------------------------------------ */
/* helpers                                                              */
/* ------------------------------------------------------------------ */

/** Serialises writers of one unit type until the transaction ends: availability is read-then-write. */
export async function lockUnitType(tx: Tx, tenantId: string, unitTypeId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('rentweb.rental'), hashtext(${`${tenantId}:${unitTypeId}`}))`);
}

/** Online methods the stay can be paid with, plus cash when the policy offers pay-at-property. */
export function stayPaymentMethods(settings: Record<string, unknown>, config: Pick<RentalConfig, "allowPayAtProperty">): Array<"promptpay_qr" | "slip" | "cash"> {
  const enabled = enabledMethods(settings);
  const online = enabled.filter((m): m is "promptpay_qr" | "slip" => m === "promptpay_qr" || m === "slip");
  const cash = config.allowPayAtProperty && enabled.includes("cash") ? (["cash"] as const) : [];
  return [...online, ...cash];
}

/** Pay options the policy offers for a quote (empty = nothing to pay online). */
export function payOptionsFor(config: Pick<RentalConfig, "depositPercent" | "allowFullPayment">): PayOption[] {
  if (config.depositPercent <= 0) return [];
  if (config.depositPercent >= 100) return ["full"];
  return config.allowFullPayment ? ["deposit", "full"] : ["deposit"];
}

export function metaOf(s: Pick<StayRow, "meta">): StayMeta {
  return (s.meta ?? {}) as StayMeta;
}

export async function lockStay(tx: Tx, tenantId: string, id: string): Promise<StayRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx
    .select()
    .from(rentalStays)
    .where(and(eq(rentalStays.tenantId, tenantId), eq(rentalStays.id, id)))
    .limit(1)
    .for("update");
  return row ?? null;
}

/** Payment rows of a stay, locked (payments → stay lock order, same as markPaid → onStayPaid). */
export async function lockStayPayments(tx: Tx, tenantId: string, stayId: string): Promise<PaymentRow[]> {
  return tx
    .select()
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.refType, STAY_REF_TYPE), eq(payments.refId, stayId)))
    .orderBy(asc(payments.createdAt))
    .for("update");
}

const VOID_ON_CLOSE = ["pending", "failed"] as const;

/** Voids a closing stay's unpaid payments (payments-api 3.2: runHandler false). A slip under review is left for the admin. */
export async function voidStayPayments(tx: Tx, tenantId: string, list: PaymentRow[], reason: string): Promise<number> {
  let n = 0;
  for (const p of list) {
    if (!(VOID_ON_CLOSE as readonly string[]).includes(p.status)) continue;
    await cancelPayment(tx, tenantId, p.id, reason, { runHandler: false });
    n++;
  }
  return n;
}

async function createStayPayment(tx: Tx, tenantId: string, stay: StayRow, method: PaymentMethod, amount: number, opts: StayOpts): Promise<PaymentRow> {
  const payment = await createPayment(tx, tenantId, {
    refType: STAY_REF_TYPE,
    refId: stay.id,
    amount,
    provider: PROVIDER_FOR[method],
    method,
    customerId: stay.customerId,
    promptpayId: resolvePromptpayId(opts.settings) ?? undefined,
    // cash is settled at the front desk; online payments expire and the sweep releases the unit
    expiresMinutes: method === "cash" ? undefined : opts.config.holdMinutes,
    metadata: { stayNumber: stay.number, checkIn: stay.checkIn, checkOut: stay.checkOut },
  });
  await tx.update(rentalStays).set({ paymentId: payment.id }).where(and(eq(rentalStays.tenantId, tenantId), eq(rentalStays.id, stay.id)));
  return payment;
}

/* ------------------------------------------------------------------ */
/* create                                                               */
/* ------------------------------------------------------------------ */

/**
 * Creates a stay: quotes the dates, takes the unit-type lock, re-checks availability, numbers it ST-1001…,
 * attaches / creates the customer, snapshots the price breakdown and opens the payment (deposit or full).
 * Online payment → `pending` holding one unit until the payment expires (+ grace); cash / nothing to pay → `confirmed`.
 */
export async function createStay(tx: Tx, tenantId: string, input: CreateStayInput, opts: StayOpts): Promise<Result<CreateStayResult, CreateStayError>> {
  const now = opts.now ?? new Date();
  const today = bkkDateString(now);
  const type = await getUnitTypeById(tx, tenantId, input.unitTypeId);
  if (!type || !type.active) return fail("unit_type_not_found");
  const [rules, extras] = await Promise.all([listRateRules(tx, tenantId, { unitTypeId: type.id }), listExtras(tx, tenantId, { activeOnly: true })]);
  const q = quoteStay(type, rules, extras, { checkIn: input.checkIn, checkOut: input.checkOut, guests: input.guests, extras: input.extras, today }, opts.config);
  if (!q.ok) return fail(q.error);
  const quote = q.quote;

  await lockUnitType(tx, tenantId, type.id);
  const free = await unitsAvailable(tx, tenantId, type, quote.checkIn, quote.checkOut, { now });
  if (free < 1) return fail("unavailable");

  // customer
  let customerId = input.customer.id ?? null;
  if (await isCustomerBlocked(tx, tenantId, { customerId, phone: input.customer.phone, email: input.customer.email })) return fail("customer_blocked");
  if (!customerId) {
    const guest = await upsertGuestCustomer(tx, tenantId, { phone: input.customer.phone, email: input.customer.email, name: input.customer.name });
    if (!guest) return fail("invalid_customer");
    customerId = guest.id;
  }

  // what is due now, and how
  const methods = stayPaymentMethods(opts.settings, opts.config);
  const options = payOptionsFor(opts.config);
  const payOption: PayOption | null = options.length ? (input.payOption && options.includes(input.payOption) ? input.payOption : options[0]!) : null;
  const due = payOption === "full" ? quote.total : payOption === "deposit" ? quote.deposit : 0;
  let method: PaymentMethod | null = null;
  if (due > 0 && methods.length) {
    if (input.paymentMethod && !methods.includes(input.paymentMethod as "cash")) return fail("payment_method");
    method = (input.paymentMethod as PaymentMethod | null) ?? methods[0]!;
  }
  // nothing to pay online (no deposit policy, cash on arrival, or no payment receiver configured) → confirmed now
  const pendingOnline = due > 0 && method !== null && method !== "cash";
  const status = pendingOnline ? "pending" : "confirmed";
  const meta: StayMeta = { payOption: method === "cash" ? "cash" : (payOption ?? undefined) };
  if (due > 0 && !methods.length) meta.payAtProperty = true;

  const number = `ST-${await nextCounter(tx, tenantId, "stay", 1000)}`;
  const accessKey = randomToken(16);
  const [stay] = await tx
    .insert(rentalStays)
    .values({
      tenantId,
      number,
      unitTypeId: type.id,
      customerId,
      guestName: input.customer.name.trim(),
      guestPhone: input.customer.phone.trim() || null,
      guestEmail: input.customer.email?.trim() || null,
      checkIn: quote.checkIn,
      checkOut: quote.checkOut,
      nights: quote.nights,
      guests: quote.guests,
      status,
      source: input.source ?? "online",
      nightly: quote.nightly,
      extras: quote.extras,
      roomTotal: quote.roomTotal,
      extraGuestTotal: quote.extraGuestTotal,
      extrasTotal: quote.extrasTotal,
      total: quote.total,
      depositAmount: due,
      paidAmount: 0,
      paymentStatus: "unpaid",
      accessKey,
      note: input.note?.trim() || null,
      meta,
      holdUntil: pendingOnline ? new Date(now.getTime() + (opts.config.holdMinutes + HOLD_GRACE_MIN) * 60_000) : null,
      confirmedAt: status === "confirmed" ? now : null,
    })
    .returning();
  let row = stay!;

  let payment: PaymentRow | null = null;
  if (due > 0 && method) {
    payment = await createStayPayment(tx, tenantId, row, method, due, opts);
    row = { ...row, paymentId: payment.id };
  }

  await emitEvent(tx, {
    tenantId,
    type: "stay.created",
    payload: {
      stayId: row.id,
      number,
      unitTypeId: type.id,
      unitTypeName: type.name,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      nights: row.nights,
      guests: row.guests,
      total: row.total,
      amount: due,
      status,
      customerId,
      customerName: row.guestName,
      customerPhone: row.guestPhone,
      customerEmail: row.guestEmail,
      phone: row.guestPhone,
      email: row.guestEmail,
      accessKey,
      paymentMethod: method,
    },
  });
  return ok({ stay: row, accessKey, payment, quote });
}

/**
 * Issues a fresh payment for a pending stay whose QR expired / slip was rejected: the unit is re-checked
 * (another guest may have taken it while the hold lapsed), old open payments are voided, the hold is extended.
 */
export async function renewStayPayment(tx: Tx, tenantId: string, stayId: string, method: PaymentMethod | null, opts: StayOpts): Promise<Result<{ stay: StayRow; payment: PaymentRow }, "not_found" | "not_pending" | "unavailable" | "payment_method">> {
  const now = opts.now ?? new Date();
  const list = await lockStayPayments(tx, tenantId, stayId);
  const stay = await lockStay(tx, tenantId, stayId);
  if (!stay) return fail("not_found");
  if (stay.status !== "pending" || stay.paymentStatus !== "unpaid" || stay.depositAmount <= 0) return fail("not_pending");
  if (list.some((p) => p.status === "pending_verification")) return fail("not_pending");
  const methods = stayPaymentMethods(opts.settings, opts.config).filter((m) => m !== "cash");
  if (!methods.length) return fail("payment_method");
  const m: PaymentMethod = method && methods.includes(method as "slip") ? method : methods[0]!;
  const type = await getUnitTypeById(tx, tenantId, stay.unitTypeId);
  if (!type) return fail("not_found");
  await lockUnitType(tx, tenantId, type.id);
  if ((await unitsAvailable(tx, tenantId, type, stay.checkIn, stay.checkOut, { now, excludeStayId: stay.id })) < 1) return fail("unavailable");
  await voidStayPayments(tx, tenantId, list, "ออกรายการชำระเงินใหม่");
  const holdUntil = new Date(now.getTime() + (opts.config.holdMinutes + HOLD_GRACE_MIN) * 60_000);
  await tx.update(rentalStays).set({ holdUntil }).where(and(eq(rentalStays.tenantId, tenantId), eq(rentalStays.id, stay.id)));
  const payment = await createStayPayment(tx, tenantId, { ...stay, holdUntil }, m, stay.depositAmount, opts);
  return ok({ stay: { ...stay, holdUntil, paymentId: payment.id }, payment });
}

/* ------------------------------------------------------------------ */
/* payment hooks (registered in register.ts)                            */
/* ------------------------------------------------------------------ */

/**
 * registerPaymentHandler("stay") – money arrived: confirm a pending stay (if its unit is still free), otherwise
 * record the balance. Money for a gone / cancelled / no-show / already-paid stay is flagged for a refund.
 */
export async function onStayPaid(tx: Tx, payment: PaymentRow): Promise<PaymentPaidResult> {
  const tenantId = payment.tenantId;
  const stay = await lockStay(tx, tenantId, payment.refId);
  if (!stay) return refundRequired("ไม่พบการจองห้องพัก");
  if (stay.status === "cancelled") return refundRequired("การจองถูกยกเลิกแล้ว");
  if (stay.status === "no_show") return refundRequired("การจองถูกบันทึกว่าไม่มาเข้าพัก");
  if (stay.paymentStatus === "refunded") return refundRequired("การจองนี้คืนเงินแล้ว");
  if (stay.paymentStatus === "paid") return stay.paymentId === payment.id ? undefined : refundRequired("ชำระซ้ำ");
  if (stay.paymentStatus === "deposit_paid" && stay.paymentId === payment.id) return undefined; // same payment again

  let status = stay.status;
  let confirmedAt = stay.confirmedAt;
  if (stay.status === "pending") {
    const type = await getUnitTypeById(tx, tenantId, stay.unitTypeId);
    if (!type) return refundRequired("ไม่พบประเภทห้องพัก");
    await lockUnitType(tx, tenantId, type.id);
    // its own hold may have lapsed and another guest may hold the last unit now
    if ((await unitsAvailable(tx, tenantId, type, stay.checkIn, stay.checkOut, { excludeStayId: stay.id })) < 1) return refundRequired("ห้องพักไม่ว่างแล้วสำหรับวันที่เลือก");
    status = "confirmed";
    confirmedAt = new Date();
  }
  const paidAmount = stay.paidAmount + payment.amount;
  const paymentStatus = paidAmount >= stay.total ? "paid" : "deposit_paid";
  await tx
    .update(rentalStays)
    .set({ status, confirmedAt, paidAmount, paymentStatus, paymentId: payment.id, holdUntil: null })
    .where(and(eq(rentalStays.tenantId, tenantId), eq(rentalStays.id, stay.id)));
  await emitEvent(tx, {
    tenantId,
    type: "stay.confirmed",
    payload: { stayId: stay.id, number: stay.number, paymentId: payment.id, amount: payment.amount, total: stay.total, paidAmount, checkIn: stay.checkIn, checkOut: stay.checkOut, customerId: stay.customerId, customerName: stay.guestName, customerPhone: stay.guestPhone, customerEmail: stay.guestEmail, phone: stay.guestPhone, email: stay.guestEmail, accessKey: stay.accessKey },
  });
  return undefined;
}

/** registerPaymentClosedHandler("stay") – an unpaid payment expired / was cancelled: release the pending stay. */
export async function onStayPaymentClosed(tx: Tx, payment: PaymentRow, info: PaymentClosedInfo): Promise<void> {
  const tenantId = payment.tenantId;
  const stay = await lockStay(tx, tenantId, payment.refId);
  if (!stay || stay.status !== "pending" || stay.paymentStatus !== "unpaid") return;
  if (stay.paymentId && stay.paymentId !== payment.id) return; // superseded by a renewed payment
  const reason = info.status === "expired" ? "หมดเวลาชำระเงิน" : info.reason || "ยกเลิกรายการชำระเงิน";
  await tx
    .update(rentalStays)
    .set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: "system", cancelReason: reason, holdUntil: null })
    .where(and(eq(rentalStays.tenantId, tenantId), eq(rentalStays.id, stay.id)));
  await emitEvent(tx, { tenantId, type: "stay.cancelled", payload: { stayId: stay.id, number: stay.number, by: "system", reason, customerId: stay.customerId, customerName: stay.guestName, phone: stay.guestPhone, email: stay.guestEmail, accessKey: stay.accessKey } });
}

/** registerPaymentTargetCheck("stay") – reason the money can no longer be applied (payments-api 3.1). */
export async function stayClosedReason(tx: Tx, payment: PaymentRow): Promise<string | null> {
  const [stay] = await tx.select({ status: rentalStays.status, paymentStatus: rentalStays.paymentStatus }).from(rentalStays).where(and(eq(rentalStays.tenantId, payment.tenantId), eq(rentalStays.id, payment.refId))).limit(1);
  if (!stay) return null;
  if (stay.status === "cancelled") return "การจองถูกยกเลิกแล้ว";
  if (stay.status === "no_show") return "การจองถูกบันทึกว่าไม่มาเข้าพัก";
  if (stay.paymentStatus === "refunded") return "การจองนี้คืนเงินแล้ว";
  return null;
}

/** registerPaymentAccessCheck("stay") – the stay's owner or the holder of its access key may see / pay it. */
export async function stayPaymentAccess(tx: Tx, payment: PaymentRow, proof: PaymentAccessProof): Promise<PaymentAccessVia | false | null> {
  const [stay] = await tx.select({ customerId: rentalStays.customerId, accessKey: rentalStays.accessKey }).from(rentalStays).where(and(eq(rentalStays.tenantId, payment.tenantId), eq(rentalStays.id, payment.refId))).limit(1);
  if (!stay) return false;
  if (proof.customerId && stay.customerId && proof.customerId === stay.customerId) return "customer";
  if (proof.accessKey && safeEqual(proof.accessKey, stay.accessKey)) return "access_key";
  return false;
}

/* ------------------------------------------------------------------ */
/* cancellation                                                         */
/* ------------------------------------------------------------------ */

export interface CancellationPolicyResult {
  /** days between today and check-in */
  daysBefore: number;
  free: boolean;
  /** what the property owes back (paid - kept deposit, or everything when free) */
  refundDue: number;
  kept: number;
}

/** Applies moduleConfig.rental.freeCancelDays to a stay as of `now`. */
export function evaluateCancellation(stay: Pick<StayRow, "checkIn" | "paidAmount" | "depositAmount">, config: Pick<RentalConfig, "freeCancelDays">, now: Date = new Date()): CancellationPolicyResult {
  const daysBefore = diffDays(bkkDateString(now), stay.checkIn);
  const free = daysBefore >= config.freeCancelDays;
  const kept = free ? 0 : Math.min(stay.paidAmount, stay.depositAmount);
  return { daysBefore, free, refundDue: Math.max(0, stay.paidAmount - kept), kept };
}

export const CUSTOMER_CANCELLABLE = ["pending", "confirmed"] as const;

export function canCustomerCancel(stay: Pick<StayRow, "status" | "checkIn">, now: Date = new Date()): boolean {
  return (CUSTOMER_CANCELLABLE as readonly string[]).includes(stay.status) && stay.checkIn >= bkkDateString(now);
}

export type CancelStayError = "not_found" | "not_cancellable";

/** Cancels a pending / confirmed stay (customer: policy applied; admin / system: free-form reason). */
export async function cancelStay(tx: Tx, tenantId: string, stayId: string, input: { by: "customer" | "admin" | "system"; reason?: string | null; config: RentalConfig; now?: Date; actorId?: string | null }): Promise<Result<{ stay: StayRow; policy: CancellationPolicyResult | null }, CancelStayError>> {
  const now = input.now ?? new Date();
  const list = await lockStayPayments(tx, tenantId, stayId);
  const stay = await lockStay(tx, tenantId, stayId);
  if (!stay) return fail("not_found");
  if (input.by === "customer" ? !canCustomerCancel(stay, now) : !["pending", "confirmed", "checked_in"].includes(stay.status)) return fail("not_cancellable");
  const policy = input.by === "customer" ? evaluateCancellation(stay, input.config, now) : null;
  const reason = (input.reason ?? "").trim().slice(0, 500) || (input.by === "customer" ? "ลูกค้ายกเลิก" : "ยกเลิกโดยที่พัก");
  await voidStayPayments(tx, tenantId, list, reason);
  const meta: StayMeta = { ...metaOf(stay) };
  if (policy) meta.cancellation = { free: policy.free, refundDue: policy.refundDue, daysBefore: policy.daysBefore };
  const [row] = await tx
    .update(rentalStays)
    .set({ status: "cancelled", cancelledAt: now, cancelledBy: input.by === "admin" ? (input.actorId ?? "admin") : input.by, cancelReason: reason, holdUntil: null, meta })
    .where(and(eq(rentalStays.tenantId, tenantId), eq(rentalStays.id, stay.id)))
    .returning();
  await emitEvent(tx, {
    tenantId,
    type: "stay.cancelled",
    payload: { stayId: stay.id, number: stay.number, by: input.by, reason, refundDue: policy?.refundDue ?? null, paidAmount: stay.paidAmount, customerId: stay.customerId, customerName: stay.guestName, phone: stay.guestPhone, email: stay.guestEmail, accessKey: stay.accessKey },
  });
  return ok({ stay: row!, policy });
}

/* ------------------------------------------------------------------ */
/* transitions (front desk)                                             */
/* ------------------------------------------------------------------ */

export type StayAction = "confirm" | "check_in" | "check_out" | "no_show";

export const STAY_ACTIONS: Record<string, StayAction[]> = {
  pending: ["confirm", "check_in", "no_show"],
  confirmed: ["check_in", "no_show"],
  checked_in: ["check_out"],
  checked_out: [],
  cancelled: [],
  no_show: [],
};

export async function transitionStay(tx: Tx, tenantId: string, stayId: string, action: StayAction, opts: { now?: Date } = {}): Promise<Result<StayRow, "not_found" | "invalid_transition">> {
  const now = opts.now ?? new Date();
  const list = action === "no_show" ? await lockStayPayments(tx, tenantId, stayId) : [];
  const stay = await lockStay(tx, tenantId, stayId);
  if (!stay) return fail("not_found");
  if (!(STAY_ACTIONS[stay.status] ?? []).includes(action)) return fail("invalid_transition");
  const patch: Partial<typeof rentalStays.$inferInsert> =
    action === "confirm"
      ? { status: "confirmed", confirmedAt: now, holdUntil: null }
      : action === "check_in"
        ? { status: "checked_in", checkedInAt: now, confirmedAt: stay.confirmedAt ?? now, holdUntil: null }
        : action === "check_out"
          ? { status: "checked_out", checkedOutAt: now }
          : { status: "no_show", cancelledAt: now, cancelledBy: "admin", cancelReason: "ไม่มาเข้าพัก", holdUntil: null };
  if (action === "no_show") await voidStayPayments(tx, tenantId, list, "ไม่มาเข้าพัก");
  const [row] = await tx.update(rentalStays).set(patch).where(and(eq(rentalStays.tenantId, tenantId), eq(rentalStays.id, stay.id))).returning();
  await emitEvent(tx, { tenantId, type: `stay.${action === "confirm" ? "confirmed" : action === "check_in" ? "checked_in" : action === "check_out" ? "checked_out" : "no_show"}`, payload: { stayId: stay.id, number: stay.number, customerId: stay.customerId, customerName: stay.guestName, phone: stay.guestPhone, email: stay.guestEmail, accessKey: stay.accessKey, checkIn: stay.checkIn, checkOut: stay.checkOut } });
  return ok(row!);
}

/* ------------------------------------------------------------------ */
/* customer reads                                                       */
/* ------------------------------------------------------------------ */

export interface StayDetail {
  stay: StayRow;
  type: UnitTypeRow;
  payment: PaymentRow | null;
}

/** The stay for its owner or the holder of its access key (null otherwise - callers render "cannot open"). */
export async function getStayForCustomer(tx: Tx, tenantId: string, id: string, who: { customerId?: string | null; key?: string | null }): Promise<StayDetail | null> {
  if (!isUuid(id)) return null;
  const [stay] = await tx
    .select()
    .from(rentalStays)
    .where(and(eq(rentalStays.tenantId, tenantId), eq(rentalStays.id, id)))
    .limit(1);
  if (!stay) return null;
  const owner = !!who.customerId && !!stay.customerId && who.customerId === stay.customerId;
  const keyOk = !!who.key && safeEqual(who.key, stay.accessKey);
  if (!owner && !keyOk) return null;
  const [type] = await tx.select().from(rentalUnitTypes).where(and(eq(rentalUnitTypes.tenantId, tenantId), eq(rentalUnitTypes.id, stay.unitTypeId))).limit(1);
  if (!type) return null;
  const payment = stay.paymentId ? await getPayment(tx, tenantId, stay.paymentId) : null;
  return { stay, type, payment };
}

export interface StayListItem {
  id: string;
  number: string;
  status: string;
  paymentStatus: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  total: number;
  typeName: string;
  typeSlug: string;
  cover: string | null;
}

export async function listCustomerStays(tx: Tx, tenantId: string, customerId: string, opts: { scope: "upcoming" | "past"; limit?: number; now?: Date }): Promise<StayListItem[]> {
  const today = bkkDateString(opts.now ?? new Date());
  const upcoming = opts.scope === "upcoming";
  const rows = await tx
    .select({ stay: rentalStays, typeName: rentalUnitTypes.name, typeSlug: rentalUnitTypes.slug, gallery: rentalUnitTypes.gallery })
    .from(rentalStays)
    .innerJoin(rentalUnitTypes, eq(rentalUnitTypes.id, rentalStays.unitTypeId))
    .where(
      and(
        eq(rentalStays.tenantId, tenantId),
        eq(rentalStays.customerId, customerId),
        upcoming ? and(gte(rentalStays.checkOut, today), inArray(rentalStays.status, ["pending", "confirmed", "checked_in"])) : sql`(${rentalStays.checkOut} < ${today} or ${rentalStays.status} in ('checked_out','cancelled','no_show'))`,
      ),
    )
    .orderBy(upcoming ? asc(rentalStays.checkIn) : desc(rentalStays.checkIn))
    .limit(opts.limit ?? 50);
  return rows.map((r) => ({
    id: r.stay.id,
    number: r.stay.number,
    status: r.stay.status,
    paymentStatus: r.stay.paymentStatus,
    checkIn: r.stay.checkIn,
    checkOut: r.stay.checkOut,
    nights: r.stay.nights,
    guests: r.stay.guests,
    total: r.stay.total,
    typeName: r.typeName,
    typeSlug: r.typeSlug,
    cover: (r.gallery ?? [])[0] ?? null,
  }));
}

/** Pending stays whose hold has lapsed but whose payment is still open (housekeeping / tests): count only. */
export async function countLapsedHolds(tx: Tx, tenantId: string, now: Date = new Date()): Promise<number> {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(rentalStays)
    .where(and(eq(rentalStays.tenantId, tenantId), eq(rentalStays.status, "pending"), lt(rentalStays.holdUntil, now)));
  return Number(r?.n ?? 0);
}

export { addDays };
