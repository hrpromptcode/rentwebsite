import { and, asc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { payments, withPlatform, type DbLike, type Tx } from "@rentweb/db";
import { emitEvent } from "../events";
import { isUuid } from "../utils";
import { promptpayPayload } from "./promptpay";
import { builtinTargetClosedReason } from "./targets";
import { closedHandlerRefTypes, closedHandlers, failedHandlers, paidHandlers, targetChecks, type PaymentRefType, type PaymentRow, type PaymentStatus } from "./registry";

/**
 * Shared payment layer used by every module (orders, bookings, top-ups, wallet top-ups, reservations…).
 *
 * Flow:   createPayment() → customer pays (QR / slip / card / cod / wallet)
 *         → markPaid() runs the module handler registered for payment.refType
 *         (e.g. "order" → fulfil order, "topup" → deliver game credits).
 *
 * State machine (every transition is a conditional UPDATE … WHERE status IN (…), so concurrent calls
 * cannot double-apply):
 *
 *   pending ──attachSlip──▶ pending_verification ──markPaid──▶ paid ──refundPayment──▶ partially_refunded / refunded
 *      │ │                        │      │
 *      │ └──────────markPaid──────┼──────┘ (open states: pending, pending_verification)
 *      │                          ├──markFailed──▶ failed  ──markPaid()──▶ paid   (money confirmed by admin / provider)
 *      ├──expiry sweep──▶ expired ─────────────────────markPaid()──▶ paid   (target closed → flagged for refund)
 *      └──cancelPayment──▶ cancelled (terminal)
 *
 * paid / partially_refunded / refunded / cancelled never go back to an open state; attachSlip (and its
 * auto-approval, markPaid({ strict: true })) only accepts open payments. API contract for modules: tooling/qa/bughunt/fixes/payments-api.md
 */

export type PaymentProvider = "bank_transfer" | "promptpay" | "opn" | "gbprimepay" | "stripe" | "cod" | "wallet" | "cash";
export type PaymentMethod = "slip" | "promptpay_qr" | "card" | "cod" | "wallet" | "cash" | "installment";

export {
  registerPaymentHandler,
  registerPaymentClosedHandler,
  registerPaymentTargetCheck,
  registerPaymentAccessCheck,
  hasPaymentClosedHandler,
  paymentHookSummary,
  refundRequired,
  type PaymentRow,
  type PaymentRefType,
  type PaymentStatus,
  type PaymentPaidResult,
  type PaymentPaidHandler,
  type PaymentFailedHandler,
  type PaymentClosedHandler,
  type PaymentClosedInfo,
  type PaymentTargetCheck,
  type PaymentAccessCheck,
  type PaymentAccessProof,
  type PaymentAccessVia,
} from "./registry";
export { canAccessPayment, isStrongPaymentAccess } from "./access";

/** Statuses a customer may still pay into (slip upload, QR, auto-approve). */
export const OPEN_PAYMENT_STATUSES = ["pending", "pending_verification"] as const satisfies readonly PaymentStatus[];
/** markPaid() default (money confirmed by an admin / provider): open states plus re-approving a rejected (failed) or expired payment. */
export const REOPENABLE_PAYMENT_STATUSES = ["pending", "pending_verification", "failed", "expired"] as const satisfies readonly PaymentStatus[];
const FAILABLE: PaymentStatus[] = ["pending", "pending_verification", "expired"];
const CANCELLABLE: PaymentStatus[] = ["pending", "pending_verification", "failed"];

export function isOpenPaymentStatus(status: string): boolean {
  return (OPEN_PAYMENT_STATUSES as readonly string[]).includes(status);
}

/** Thrown when a transition is not allowed from the payment's current status (e.g. a slip for a cancelled payment). */
export class PaymentStateError extends Error {
  readonly code = "payment_state" as const;
  constructor(
    readonly paymentId: string,
    readonly status: string,
    readonly action: string,
  ) {
    super(`payment ${paymentId} is ${status}: cannot ${action}`);
    this.name = "PaymentStateError";
  }
}

export function isPaymentStateError(err: unknown): err is PaymentStateError {
  return err instanceof PaymentStateError || (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "payment_state");
}

export interface TenantPaymentSettings {
  /** PromptPay ID (phone 0812345678 or 13-digit tax id) used to render QR codes */
  promptpayId?: string;
  promptpayName?: string;
  /** ADMIN_B2-09: owner opted in to use the contact phone (Thai mobile only) when promptpayId is empty */
  promptpayUseContactPhone?: boolean;
  bankAccounts?: Array<{ bank: string; name: string; number: string }>;
  enabled?: { promptpay?: boolean; bankTransfer?: boolean; cod?: boolean; card?: boolean; wallet?: boolean; cash?: boolean };
  /** auto-approve uploaded slips (development / trusted stores) */
  autoApproveSlips?: boolean;
  /** minutes before an unpaid QR payment expires */
  expiresMinutes?: number;
}

export function paymentSettings(settings: Record<string, unknown>): TenantPaymentSettings {
  return ((settings.payments as TenantPaymentSettings | undefined) ?? {}) as TenantPaymentSettings;
}

export interface CreatePaymentInput {
  refType: PaymentRefType;
  refId: string;
  amount: number; // satang
  provider: PaymentProvider;
  method: PaymentMethod;
  customerId?: string | null;
  currency?: string;
  /** unpaid payments with an expiry are expired by the sweep (expireStalePayments) once past expiresAt + grace */
  expiresMinutes?: number;
  /** needed for promptpay_qr */
  promptpayId?: string;
  metadata?: Record<string, unknown>;
}

export async function createPayment(tx: Tx, tenantId: string, input: CreatePaymentInput) {
  const qrPayload = input.method === "promptpay_qr" && input.promptpayId ? promptpayPayload(input.promptpayId, input.amount) : null;
  const expiresAt = input.expiresMinutes ? new Date(Date.now() + input.expiresMinutes * 60_000) : null;
  const [row] = await tx
    .insert(payments)
    .values({
      tenantId,
      refType: input.refType,
      refId: input.refId,
      customerId: input.customerId ?? null,
      provider: input.provider,
      method: input.method,
      status: "pending",
      amount: input.amount,
      currency: input.currency ?? "THB",
      qrPayload,
      expiresAt,
      providerPayload: input.metadata ?? null,
    })
    .returning();
  await emitEvent(tx, { tenantId, type: "payment.created", payload: { paymentId: row!.id, refType: input.refType, refId: input.refId, amount: input.amount } });
  return row!;
}

/** null for unknown ids, including ids that are not uuids (never reaches Postgres with garbage). */
export async function getPayment(tx: Tx, tenantId: string, paymentId: string) {
  if (!isUuid(paymentId) || !isUuid(tenantId)) return null;
  const [row] = await tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId))).limit(1);
  return row ?? null;
}

export async function listPaymentsFor(tx: Tx, tenantId: string, refType: PaymentRefType, refId: string) {
  return tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.refType, refType), eq(payments.refId, refId)));
}

async function currentOrThrow(tx: Tx, tenantId: string, paymentId: string): Promise<PaymentRow> {
  const current = await getPayment(tx, tenantId, paymentId);
  if (!current) throw new Error("payment not found");
  return current;
}

/**
 * Attach an uploaded slip to an OPEN payment (pending / pending_verification) → pending_verification.
 * Auto-approves (markPaid, verifiedBy "auto") when asked. A paid payment is returned unchanged;
 * any other status (cancelled, expired, failed, refunded…) throws PaymentStateError.
 * Callers must authorise the uploader first (canAccessPayment).
 */
export async function attachSlip(
  tx: Tx,
  tenantId: string,
  paymentId: string,
  slip: { url: string; transRef?: string | null; verification?: Record<string, unknown> | null },
  opts: { autoApprove?: boolean } = {},
) {
  const [updated] = await tx
    .update(payments)
    .set({ slipUrl: slip.url, slipTransRef: slip.transRef ?? null, slipVerification: slip.verification ?? null, status: "pending_verification" })
    .where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId), inArray(payments.status, [...OPEN_PAYMENT_STATUSES])))
    .returning();
  if (!updated) {
    const current = await currentOrThrow(tx, tenantId, paymentId);
    if (current.status === "paid") return current;
    throw new PaymentStateError(paymentId, current.status, "attach a slip");
  }
  await emitEvent(tx, { tenantId, type: "payment.slip_uploaded", payload: { paymentId, refType: updated.refType, refId: updated.refId, amount: updated.amount } });
  if (opts.autoApprove) return markPaid(tx, tenantId, paymentId, { verifiedBy: "auto", strict: true });
  return updated;
}

export interface MarkPaidOptions {
  verifiedBy?: string;
  providerRef?: string | null;
  providerPayload?: Record<string, unknown>;
  /**
   * Only accept open payments (pending / pending_verification). Use for unverified confirmations
   * (auto-approved slips). Default false: a failed (rejected slip) or expired payment may also be marked
   * paid, because markPaid() means the money was confirmed by an admin or a payment provider.
   */
  strict?: boolean;
}

/**
 * Marks a payment paid exactly once and runs the module's paid handler.
 *  - from pending / pending_verification / failed / expired (only the first two with strict: true)
 *  - already paid → returned unchanged, handler not run again (idempotent)
 *  - refunded / partially_refunded / cancelled (and failed / expired with strict) → PaymentStateError
 *  - when the target is already cancelled/refunded (registerPaymentTargetCheck or the built-in check) or the
 *    paid handler returns { refundRequired }, the payment stays paid but is flagged for a manual refund
 *    (providerPayload.refundRequired + payment.refund_required event) instead of fulfilling the target.
 */
export async function markPaid(tx: Tx, tenantId: string, paymentId: string, opts: MarkPaidOptions = {}) {
  const from: readonly PaymentStatus[] = opts.strict ? OPEN_PAYMENT_STATUSES : REOPENABLE_PAYMENT_STATUSES;
  const set: Partial<typeof payments.$inferInsert> = { status: "paid", paidAt: new Date(), verifiedBy: opts.verifiedBy ?? null, failureReason: null };
  if (opts.providerRef != null) set.providerRef = opts.providerRef;
  if (opts.providerPayload) set.providerPayload = opts.providerPayload;
  const [updated] = await tx
    .update(payments)
    .set(set)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId), inArray(payments.status, [...from])))
    .returning();
  if (!updated) {
    const current = await currentOrThrow(tx, tenantId, paymentId);
    if (current.status === "paid") return current;
    throw new PaymentStateError(paymentId, current.status, "mark paid");
  }

  const check = targetChecks.get(updated.refType) ?? builtinTargetClosedReason;
  let refundReason = await check(tx, updated);
  if (!refundReason) {
    const handler = paidHandlers.get(updated.refType);
    const outcome = handler ? await handler(tx, updated) : undefined;
    if (outcome && typeof outcome === "object" && typeof outcome.refundRequired === "string") refundReason = outcome.refundRequired || "refund required";
  }
  await emitEvent(tx, { tenantId, type: "payment.paid", payload: { paymentId, refType: updated.refType, refId: updated.refId, amount: updated.amount } });
  if (refundReason) return flagRefundRequired(tx, updated, refundReason);
  return updated;
}

async function flagRefundRequired(tx: Tx, payment: PaymentRow, reason: string): Promise<PaymentRow> {
  const providerPayload = { ...(payment.providerPayload ?? {}), refundRequired: { reason, at: new Date().toISOString() } };
  const [row] = await tx
    .update(payments)
    .set({ providerPayload, failureReason: `ต้องคืนเงิน: ${reason}` })
    .where(and(eq(payments.tenantId, payment.tenantId), eq(payments.id, payment.id)))
    .returning();
  await emitEvent(tx, { tenantId: payment.tenantId, type: "payment.refund_required", payload: { paymentId: payment.id, refType: payment.refType, refId: payment.refId, amount: payment.amount, reason } });
  return row ?? payment;
}

/** The refund flag set by markPaid when money arrived for a closed target (null when none). */
export function paymentRefundRequired(payment: Pick<PaymentRow, "providerPayload">): string | null {
  const flag = (payment.providerPayload as { refundRequired?: { reason?: unknown } } | null)?.refundRequired;
  return flag ? String(flag.reason ?? "refund required") : null;
}

/**
 * Rejects an open (or expired) payment → failed, then runs the module's failed handler.
 * Already failed → unchanged. paid / refunded / cancelled → PaymentStateError.
 */
export async function markFailed(tx: Tx, tenantId: string, paymentId: string, reason: string) {
  const [updated] = await tx
    .update(payments)
    .set({ status: "failed", failureReason: reason })
    .where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId), inArray(payments.status, FAILABLE)))
    .returning();
  if (!updated) {
    const current = await currentOrThrow(tx, tenantId, paymentId);
    if (current.status === "failed") return current;
    throw new PaymentStateError(paymentId, current.status, "mark failed");
  }
  const handler = failedHandlers.get(updated.refType);
  if (handler) await handler(tx, updated, reason);
  await emitEvent(tx, { tenantId, type: "payment.failed", payload: { paymentId, refType: updated.refType, refId: updated.refId, reason } });
  return updated;
}

/**
 * Refunds (part of) a paid payment under a row lock. Only paid / partially_refunded payments can be
 * refunded (PaymentStateError otherwise); the amount is capped at what is left.
 */
export async function refundPayment(tx: Tx, tenantId: string, paymentId: string, amount?: number, note?: string) {
  const [payment] = await tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId))).limit(1).for("update");
  if (!payment) throw new Error("payment not found");
  if (payment.status !== "paid" && payment.status !== "partially_refunded") throw new PaymentStateError(paymentId, payment.status, "refund");
  const remaining = payment.amount - payment.refundedAmount;
  const refundAmount = Math.min(amount ?? remaining, remaining);
  if (refundAmount <= 0) return payment;
  const total = payment.refundedAmount + refundAmount;
  const [updated] = await tx
    .update(payments)
    .set({ refundedAmount: total, status: total >= payment.amount ? "refunded" : "partially_refunded", failureReason: note ?? payment.failureReason })
    .where(eq(payments.id, paymentId))
    .returning();
  await emitEvent(tx, { tenantId, type: "payment.refunded", payload: { paymentId, refType: payment.refType, refId: payment.refId, amount: refundAmount } });
  return updated!;
}

export interface CancelPaymentOptions {
  /** run the module's closed handler (default true). Pass false when the module itself is cancelling the target. */
  runHandler?: boolean;
}

/**
 * Voids an unpaid payment (pending / pending_verification / failed) → cancelled (terminal: no slip, no
 * re-approval). Runs the module's closed handler ({ status: "cancelled" }) once and emits payment.cancelled.
 * Already cancelled / expired → returned unchanged. paid / refunded → PaymentStateError (refund instead).
 */
export async function cancelPayment(tx: Tx, tenantId: string, paymentId: string, reason: string, opts: CancelPaymentOptions = {}) {
  const [updated] = await tx
    .update(payments)
    .set({ status: "cancelled", failureReason: reason })
    .where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId), inArray(payments.status, CANCELLABLE)))
    .returning();
  if (!updated) {
    const current = await currentOrThrow(tx, tenantId, paymentId);
    if (current.status === "cancelled" || current.status === "expired") return current;
    throw new PaymentStateError(paymentId, current.status, "cancel");
  }
  if (opts.runHandler !== false) {
    const handler = closedHandlers.get(updated.refType);
    if (handler) await handler(tx, updated, { status: "cancelled", reason });
  }
  await emitEvent(tx, { tenantId, type: "payment.cancelled", payload: { paymentId, refType: updated.refType, refId: updated.refId, amount: updated.amount, reason } });
  return updated;
}

/**
 * Expires ONE payment if it is still "pending" and its expiresAt is at or before `now`; runs the module's
 * closed handler ({ status: "expired" }) and emits payment.expired. Returns null when nothing changed
 * (already paid / slip uploaded / not yet due / expired by a concurrent sweep).
 */
export async function expirePayment(tx: Tx, tenantId: string, paymentId: string, opts: { now?: Date; reason?: string } = {}) {
  const now = opts.now ?? new Date();
  const reason = opts.reason ?? "หมดเวลาชำระเงิน";
  const [updated] = await tx
    .update(payments)
    .set({ status: "expired", failureReason: reason })
    .where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId), eq(payments.status, "pending"), isNotNull(payments.expiresAt), lte(payments.expiresAt, now)))
    .returning();
  if (!updated) return null;
  const handler = closedHandlers.get(updated.refType);
  if (handler) await handler(tx, updated, { status: "expired", reason });
  await emitEvent(tx, { tenantId, type: "payment.expired", payload: { paymentId, refType: updated.refType, refId: updated.refId, amount: updated.amount, reason } });
  return updated;
}

export interface ExpirySweepOptions {
  now?: Date;
  /** minutes after expiresAt before a payment is expired (late QR payments / slow uploads). Default env PAYMENT_EXPIRY_GRACE_MINUTES or 15. */
  graceMinutes?: number;
  limit?: number;
  /** refTypes to expire. Default: those with a registered closed handler — a payment is never expired unless its module can release the target. */
  refTypes?: string[];
}

export interface ExpirySweepResult {
  expired: number;
  skipped: number;
  errors: number;
}

/**
 * Cross-tenant sweep for stale unpaid payments (status pending, expiresAt + grace in the past). Each payment
 * is expired in its own platform transaction together with its module's closed handler, so one failure never
 * blocks the batch and a payment is never left expired with its stock / slot still held.
 * Called by processOutbox() (worker + /api/internal/outbox).
 */
export async function expireStalePayments(db: DbLike, opts: ExpirySweepOptions = {}): Promise<ExpirySweepResult> {
  const result: ExpirySweepResult = { expired: 0, skipped: 0, errors: 0 };
  const refTypes = opts.refTypes ?? closedHandlerRefTypes();
  if (!refTypes.length) return result;
  const now = opts.now ?? new Date();
  const envGrace = Number(process.env.PAYMENT_EXPIRY_GRACE_MINUTES);
  const graceMinutes = opts.graceMinutes ?? (Number.isFinite(envGrace) && envGrace >= 0 ? envGrace : 15);
  const cutoff = new Date(now.getTime() - graceMinutes * 60_000);
  const due = await withPlatform(db, (tx) =>
    tx
      .select({ id: payments.id, tenantId: payments.tenantId })
      .from(payments)
      .where(and(eq(payments.status, "pending"), isNotNull(payments.expiresAt), lte(payments.expiresAt, cutoff), inArray(payments.refType, refTypes)))
      .orderBy(asc(payments.expiresAt))
      .limit(opts.limit ?? 50),
  );
  for (const p of due) {
    try {
      const row = await withPlatform(db, (tx) => expirePayment(tx, p.tenantId, p.id, { now: cutoff }));
      if (row) result.expired++;
      else result.skipped++;
    } catch (err) {
      result.errors++;
      if (process.env.NODE_ENV !== "production") console.error(`[payments] expiring ${p.id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return result;
}

export { promptpayPayload, promptpayQrSvg, promptpayQrDataUrl } from "./promptpay";

/** A 10-digit Thai mobile number (06 / 08 / 09) — the only kind of phone number that can be a PromptPay ID. */
export function thaiMobilePromptpay(raw: string | null | undefined): string | null {
  let d = (raw ?? "").replace(/[^0-9]/g, "");
  if (d.length === 11 && d.startsWith("66")) d = `0${d.slice(2)}`;
  return /^0[689][0-9]{8}$/.test(d) ? d : null;
}

/** Normalised PromptPay ID (mobile, 13-digit citizen / tax ID or 15-digit e-wallet ID), or null when it cannot be one. */
export function normalizeValidPromptpayId(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/[^0-9]/g, "");
  if (d.length === 13 || d.length === 15) return d;
  return thaiMobilePromptpay(d);
}

/**
 * PromptPay ID to render QR codes for (ADMIN_B2-09): the PromptPay ID the owner saved in Settings > Payments.
 * The shop's contact phone is used only when the owner opted in (payments.promptpayUseContactPhone) AND it is a
 * Thai mobile number — a landline or someone else's number never silently becomes the payment receiver.
 */
export function resolvePromptpayId(settings: Record<string, unknown>): string | null {
  const p = paymentSettings(settings);
  if (p.promptpayId?.trim()) return normalizeValidPromptpayId(p.promptpayId);
  if (p.promptpayUseContactPhone !== true) return null;
  const contact = (settings.contact as { phone?: string } | undefined) ?? {};
  return thaiMobilePromptpay(contact.phone);
}

/** Bank accounts that can actually receive a transfer (an account number is filled in). */
export function receivingBankAccounts(settings: Record<string, unknown>): Array<{ bank: string; name: string; number: string }> {
  return (paymentSettings(settings).bankAccounts ?? []).filter((a) => !!a && typeof a.number === "string" && !!a.number.trim());
}

/** Thai notice for storefronts / admin when no online payment receiver is configured (ADMIN_B2-04). */
export const PAYMENTS_NOT_CONFIGURED_MESSAGE = "ร้านยังไม่ได้ตั้งค่าช่องทางรับชำระเงิน";

/**
 * Which methods a tenant accepts (ADMIN_B2-04): a method must be enabled (PromptPay / bank transfer default on)
 * AND have a receiver — PromptPay needs a PromptPay ID, bank transfer (slip) needs an account number. There is
 * no fallback: with nothing configured the list is empty (offline methods cod / cash only when enabled), so no
 * flow can ask a customer for a payment that cannot be made.
 */
export function enabledMethods(settings: Record<string, unknown>): Array<"promptpay_qr" | "slip" | "cod" | "cash" | "card" | "wallet"> {
  const p = paymentSettings(settings);
  const e = p.enabled ?? {};
  const out: Array<"promptpay_qr" | "slip" | "cod" | "cash" | "card" | "wallet"> = [];
  if ((e.promptpay ?? true) && resolvePromptpayId(settings)) out.push("promptpay_qr");
  if ((e.bankTransfer ?? true) && receivingBankAccounts(settings).length > 0) out.push("slip");
  if (e.cod) out.push("cod");
  if (e.cash) out.push("cash");
  if (e.card) out.push("card");
  if (e.wallet) out.push("wallet");
  return out;
}

/** Online methods (PromptPay QR / bank-transfer slip) that can receive money now; empty = payments not set up. */
export function onlinePaymentMethods(settings: Record<string, unknown>): Array<"promptpay_qr" | "slip"> {
  return enabledMethods(settings).filter((m): m is "promptpay_qr" | "slip" => m === "promptpay_qr" || m === "slip");
}

/** For the admin dashboard checklist / settings: what will actually be used to take money. */
export function paymentSetupStatus(settings: Record<string, unknown>): { promptpayId: string | null; bankAccounts: number; online: Array<"promptpay_qr" | "slip">; ready: boolean } {
  const online = onlinePaymentMethods(settings);
  return { promptpayId: resolvePromptpayId(settings), bankAccounts: receivingBankAccounts(settings).length, online, ready: online.length > 0 };
}
