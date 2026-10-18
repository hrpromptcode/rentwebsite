import type { payments, Tx } from "@rentweb/db";

/**
 * Module hooks for the shared payment layer. Every map is keyed by payment.refType
 * ("order", "booking", "rest_order", ...). Modules register once from their register.ts;
 * the payment layer calls the hooks inside the same transaction as the status change.
 * Full contract: tooling/qa/bughunt/fixes/payments-api.md
 */

export type PaymentRow = typeof payments.$inferSelect;

export type PaymentRefType = "order" | "booking" | "topup" | "wallet_topup" | "rest_order" | "reservation" | "patient_package" | "invoice" | "stay" | "ticket_order";

export type PaymentStatus = "pending" | "pending_verification" | "paid" | "failed" | "refunded" | "partially_refunded" | "cancelled" | "expired";

/**
 * What a paid handler may return. `void` = fulfilled (or already fulfilled — handlers must be idempotent).
 * `{ refundRequired }` = the money arrived but the target can no longer be fulfilled (order cancelled /
 * refunded, slot gone…): the payment stays "paid", is flagged for a manual refund and the owner is notified.
 */
export type PaymentPaidResult = void | { refundRequired: string };

export type PaymentPaidHandler = (tx: Tx, payment: PaymentRow) => Promise<PaymentPaidResult>;
export type PaymentFailedHandler = (tx: Tx, payment: PaymentRow, reason: string) => Promise<void>;

export interface PaymentClosedInfo {
  /** "cancelled" = voided by cancelPayment(); "expired" = unpaid past expiresAt (sweep). */
  status: "cancelled" | "expired";
  reason: string;
}
/** Runs exactly once when an unpaid payment is cancelled or expires. Release stock / slots / tables here. */
export type PaymentClosedHandler = (tx: Tx, payment: PaymentRow, info: PaymentClosedInfo) => Promise<void>;

/**
 * Returns a reason when the payment's target is already closed (cancelled / refunded …) and must NOT be
 * fulfilled; null when it is fine to run the paid handler. Checked by markPaid() before the paid handler.
 */
export type PaymentTargetCheck = (tx: Tx, payment: PaymentRow) => Promise<string | null>;

/** Proof a storefront caller presents for a payment (all optional; any one valid proof grants access). */
export interface PaymentAccessProof {
  /** signed-in storefront customer id (from the customer session cookie) */
  customerId?: string | null;
  /** ?k= access key from the order / booking / top-up confirmation link */
  accessKey?: string | null;
  /** ?p= phone used for a restaurant pickup order or table reservation */
  phone?: string | null;
  /** restaurant table session token (rw_table cookie) */
  tableToken?: string | null;
}

/** How access was proven. "phone" is a weak proof (no auto-approval of slips). */
export type PaymentAccessVia = "customer" | "access_key" | "table" | "phone";

/** Return the proof kind that matched, false to deny, or null to fall back to the built-in check. */
export type PaymentAccessCheck = (tx: Tx, payment: PaymentRow, proof: PaymentAccessProof) => Promise<PaymentAccessVia | false | null>;

export const paidHandlers = new Map<string, PaymentPaidHandler>();
export const failedHandlers = new Map<string, PaymentFailedHandler>();
export const closedHandlers = new Map<string, PaymentClosedHandler>();
export const targetChecks = new Map<string, PaymentTargetCheck>();
export const accessChecks = new Map<string, PaymentAccessCheck>();

/** Modules call this once (in their register.ts) to react when a payment of their refType is paid / failed. */
export function registerPaymentHandler(refType: PaymentRefType, onPaid: PaymentPaidHandler, onFailed?: PaymentFailedHandler) {
  paidHandlers.set(refType, onPaid);
  if (onFailed) failedHandlers.set(refType, onFailed);
}

/** React to cancelPayment() / expiry of an unpaid payment (release stock, free the slot, cancel the target). */
export function registerPaymentClosedHandler(refType: PaymentRefType, onClosed: PaymentClosedHandler) {
  closedHandlers.set(refType, onClosed);
}

/** Override the built-in "is the target already cancelled/refunded?" check for a refType. */
export function registerPaymentTargetCheck(refType: PaymentRefType, check: PaymentTargetCheck) {
  targetChecks.set(refType, check);
}

/** Override / extend the built-in storefront access check for a refType (see canAccessPayment). */
export function registerPaymentAccessCheck(refType: PaymentRefType, check: PaymentAccessCheck) {
  accessChecks.set(refType, check);
}

export function hasPaymentClosedHandler(refType: string): boolean {
  return closedHandlers.has(refType);
}

/** refTypes that currently have a closed handler (the expiry sweep only expires these). */
export function closedHandlerRefTypes(): string[] {
  return [...closedHandlers.keys()];
}

/** Helper for paid handlers: `return refundRequired("order cancelled")`. */
export function refundRequired(reason: string): { refundRequired: string } {
  return { refundRequired: reason };
}

/** Which refTypes have which hooks registered in this process (worker / health checks / debugging). */
export function paymentHookSummary(): { paid: string[]; failed: string[]; closed: string[]; target: string[]; access: string[] } {
  return { paid: [...paidHandlers.keys()], failed: [...failedHandlers.keys()], closed: [...closedHandlers.keys()], target: [...targetChecks.keys()], access: [...accessChecks.keys()] };
}
