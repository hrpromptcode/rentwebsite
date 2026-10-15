import { and, eq } from "drizzle-orm";
import { payments, type Tx } from "@rentweb/db";
import { emitEvent } from "../events";
import { promptpayPayload } from "./promptpay";

/**
 * Shared payment layer used by every module (orders, bookings, top-ups, wallet top-ups, reservations…).
 *
 * Flow:   createPayment() → customer pays (QR / slip / card / cod / wallet)
 *         → markPaid() runs the module handler registered for payment.refType
 *         (e.g. "order" → fulfil order, "topup" → deliver game credits).
 */

export type PaymentRefType = "order" | "booking" | "topup" | "wallet_topup" | "rest_order" | "reservation" | "patient_package" | "invoice";
export type PaymentProvider = "bank_transfer" | "promptpay" | "opn" | "gbprimepay" | "stripe" | "cod" | "wallet" | "cash";
export type PaymentMethod = "slip" | "promptpay_qr" | "card" | "cod" | "wallet" | "cash" | "installment";

export interface TenantPaymentSettings {
  /** PromptPay ID (phone 0812345678 or 13-digit tax id) used to render QR codes */
  promptpayId?: string;
  promptpayName?: string;
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

export type PaymentPaidHandler = (tx: Tx, payment: typeof payments.$inferSelect) => Promise<void>;
export type PaymentFailedHandler = (tx: Tx, payment: typeof payments.$inferSelect, reason: string) => Promise<void>;

const paidHandlers = new Map<string, PaymentPaidHandler>();
const failedHandlers = new Map<string, PaymentFailedHandler>();

/** Modules call this once (in their register.ts) to react when a payment of their refType is paid. */
export function registerPaymentHandler(refType: PaymentRefType, onPaid: PaymentPaidHandler, onFailed?: PaymentFailedHandler) {
  paidHandlers.set(refType, onPaid);
  if (onFailed) failedHandlers.set(refType, onFailed);
}

export interface CreatePaymentInput {
  refType: PaymentRefType;
  refId: string;
  amount: number; // satang
  provider: PaymentProvider;
  method: PaymentMethod;
  customerId?: string | null;
  currency?: string;
  expiresMinutes?: number;
  /** needed for promptpay_qr */
  promptpayId?: string;
  metadata?: Record<string, unknown>;
}

export async function createPayment(tx: Tx, tenantId: string, input: CreatePaymentInput) {
  const qrPayload = input.method === "promptpay_qr" && input.promptpayId ? promptpayPayload(input.promptpayId, input.amount) : null;
  const expiresAt = input.expiresMinutes ? new Date(Date.now() + input.expiresMinutes * 60_000) : null;
  const status = input.method === "cod" || input.method === "cash" ? "pending" : "pending";
  const [row] = await tx
    .insert(payments)
    .values({
      tenantId,
      refType: input.refType,
      refId: input.refId,
      customerId: input.customerId ?? null,
      provider: input.provider,
      method: input.method,
      status,
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

export async function getPayment(tx: Tx, tenantId: string, paymentId: string) {
  const [row] = await tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId))).limit(1);
  return row ?? null;
}

export async function listPaymentsFor(tx: Tx, tenantId: string, refType: PaymentRefType, refId: string) {
  return tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.refType, refType), eq(payments.refId, refId)));
}

/** Attach an uploaded slip. Auto-approves when the tenant allows it, otherwise waits for admin verification. */
export async function attachSlip(
  tx: Tx,
  tenantId: string,
  paymentId: string,
  slip: { url: string; transRef?: string | null; verification?: Record<string, unknown> | null },
  opts: { autoApprove?: boolean } = {},
) {
  const payment = await getPayment(tx, tenantId, paymentId);
  if (!payment) throw new Error("payment not found");
  if (payment.status === "paid") return payment;
  const [updated] = await tx
    .update(payments)
    .set({ slipUrl: slip.url, slipTransRef: slip.transRef ?? null, slipVerification: slip.verification ?? null, status: "pending_verification" })
    .where(eq(payments.id, paymentId))
    .returning();
  await emitEvent(tx, { tenantId, type: "payment.slip_uploaded", payload: { paymentId, refType: payment.refType, refId: payment.refId } });
  if (opts.autoApprove) return markPaid(tx, tenantId, paymentId, { verifiedBy: "auto" });
  return updated!;
}

/** Marks a payment paid (idempotent) and runs the module's paid handler. */
export async function markPaid(tx: Tx, tenantId: string, paymentId: string, opts: { verifiedBy?: string; providerRef?: string | null; providerPayload?: Record<string, unknown> } = {}) {
  const payment = await getPayment(tx, tenantId, paymentId);
  if (!payment) throw new Error("payment not found");
  if (payment.status === "paid") return payment;
  const [updated] = await tx
    .update(payments)
    .set({ status: "paid", paidAt: new Date(), verifiedBy: opts.verifiedBy ?? null, providerRef: opts.providerRef ?? payment.providerRef, providerPayload: opts.providerPayload ?? payment.providerPayload })
    .where(eq(payments.id, paymentId))
    .returning();
  const handler = paidHandlers.get(updated!.refType);
  if (handler) await handler(tx, updated!);
  await emitEvent(tx, { tenantId, type: "payment.paid", payload: { paymentId, refType: updated!.refType, refId: updated!.refId, amount: updated!.amount } });
  return updated!;
}

export async function markFailed(tx: Tx, tenantId: string, paymentId: string, reason: string) {
  const payment = await getPayment(tx, tenantId, paymentId);
  if (!payment) throw new Error("payment not found");
  const [updated] = await tx.update(payments).set({ status: "failed", failureReason: reason }).where(eq(payments.id, paymentId)).returning();
  const handler = failedHandlers.get(updated!.refType);
  if (handler) await handler(tx, updated!, reason);
  await emitEvent(tx, { tenantId, type: "payment.failed", payload: { paymentId, refType: updated!.refType, refId: updated!.refId, reason } });
  return updated!;
}

export async function refundPayment(tx: Tx, tenantId: string, paymentId: string, amount?: number, note?: string) {
  const payment = await getPayment(tx, tenantId, paymentId);
  if (!payment) throw new Error("payment not found");
  const refundAmount = Math.min(amount ?? payment.amount, payment.amount - payment.refundedAmount);
  const total = payment.refundedAmount + refundAmount;
  const [updated] = await tx
    .update(payments)
    .set({ refundedAmount: total, status: total >= payment.amount ? "refunded" : "partially_refunded", failureReason: note ?? payment.failureReason })
    .where(eq(payments.id, paymentId))
    .returning();
  await emitEvent(tx, { tenantId, type: "payment.refunded", payload: { paymentId, refType: payment.refType, refId: payment.refId, amount: refundAmount } });
  return updated!;
}

export { promptpayPayload, promptpayQrSvg, promptpayQrDataUrl } from "./promptpay";

/** PromptPay ID to render QR codes for: explicit setting, else the shop's contact phone (common in Thailand). */
export function resolvePromptpayId(settings: Record<string, unknown>): string | null {
  const p = paymentSettings(settings);
  if (p.promptpayId) return p.promptpayId;
  const contact = (settings.contact as { phone?: string } | undefined) ?? {};
  const digits = contact.phone?.replace(/[^0-9]/g, "") ?? "";
  return digits.length >= 9 ? digits : null;
}

/** Which methods a tenant accepts (defaults: PromptPay + bank slip on). */
export function enabledMethods(settings: Record<string, unknown>): Array<"promptpay_qr" | "slip" | "cod" | "cash" | "card" | "wallet"> {
  const p = paymentSettings(settings);
  const e = p.enabled ?? {};
  const out: Array<"promptpay_qr" | "slip" | "cod" | "cash" | "card" | "wallet"> = [];
  if ((e.promptpay ?? true) && resolvePromptpayId(settings)) out.push("promptpay_qr");
  if ((e.bankTransfer ?? true) && (p.bankAccounts?.length ?? 0) > 0) out.push("slip");
  if (e.cod) out.push("cod");
  if (e.cash) out.push("cash");
  if (e.card) out.push("card");
  if (e.wallet) out.push("wallet");
  if (!out.length) out.push("slip");
  return out;
}
