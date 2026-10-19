import { and, eq } from "drizzle-orm";
import { payments, type Tx } from "@rentweb/db";
import { emitEvent, isUuid } from "@rentweb/core";
import { paymentRefundRequired } from "@rentweb/core/payments";

/**
 * Flags a paid payment for a manual refund, exactly like markPaid does when a paid handler returns refundRequired
 * (providerPayload.refundRequired = { reason, at }, failureReason "ต้องคืนเงิน: …", event payment.refund_required).
 * Used when money cannot be applied outside markPaid (admin fail / retry, reconcile on read). No-op when already flagged.
 * Own file so wallet.ts and orders.ts can both use it without an import cycle (re-exported by orders.ts).
 */
export async function flagTopupPaymentRefund(tx: Tx, tenantId: string, paymentId: string, reason: string): Promise<boolean> {
  if (!isUuid(paymentId)) return false;
  const [p] = await tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId))).for("update");
  if (!p || (p.status !== "paid" && p.status !== "partially_refunded")) return false;
  if (paymentRefundRequired(p)) return false;
  const providerPayload = { ...((p.providerPayload ?? {}) as Record<string, unknown>), refundRequired: { reason, at: new Date().toISOString() } };
  await tx.update(payments).set({ providerPayload, failureReason: `ต้องคืนเงิน: ${reason}` }).where(and(eq(payments.tenantId, tenantId), eq(payments.id, p.id)));
  await emitEvent(tx, { tenantId, type: "payment.refund_required", payload: { paymentId: p.id, refType: p.refType, refId: p.refId, amount: p.amount, reason } });
  return true;
}
