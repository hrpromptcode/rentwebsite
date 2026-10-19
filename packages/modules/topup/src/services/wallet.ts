import { and, desc, eq, inArray } from "drizzle-orm";
import { payments, walletTopups, walletTransactions, wallets, type Tx } from "@rentweb/db";
import { audit, emitEvent, fail, isUuid, ok, percentOf, type Result } from "@rentweb/core";
import {
  createPayment,
  getPayment,
  paymentRefundRequired,
  paymentSettings,
  refundRequired,
  resolvePromptpayId,
  type PaymentAccessProof,
  type PaymentAccessVia,
  type PaymentClosedInfo,
  type PaymentMethod,
  type PaymentPaidResult,
} from "@rentweb/core/payments";
import { CUSTOMER_BLOCKED_CODE, CUSTOMER_BLOCKED_MESSAGE, isCustomerBlocked } from "@rentweb/core/customer";
import { flagTopupPaymentRefund } from "./refund-flag";

export type Wallet = typeof wallets.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type WalletTopup = typeof walletTopups.$inferSelect;

export type WalletReason = "topup" | "bonus" | "purchase" | "refund" | "adjustment";

export interface LedgerInput {
  customerId: string;
  /** satang, must be > 0 */
  amount: number;
  reason: WalletReason;
  refType?: string | null;
  refId?: string | null;
  note?: string | null;
  /** same key → the existing transaction is returned instead of writing twice */
  idempotencyKey?: string | null;
  createdBy?: string | null;
}

export interface LedgerResult {
  transaction: WalletTransaction;
  balance: number;
  /** true when the idempotency key already existed and nothing was written */
  duplicate: boolean;
}

/** Find-or-create the customer's wallet (one per tenant+customer). */
export async function getOrCreateWallet(tx: Tx, tenantId: string, customerId: string): Promise<Wallet> {
  await tx
    .insert(wallets)
    .values({ tenantId, customerId })
    .onConflictDoNothing({ target: [wallets.tenantId, wallets.customerId] });
  const [row] = await tx
    .select()
    .from(wallets)
    .where(and(eq(wallets.tenantId, tenantId), eq(wallets.customerId, customerId)))
    .limit(1);
  if (!row) throw new Error("wallet could not be created");
  return row;
}

export async function getWallet(tx: Tx, tenantId: string, customerId: string): Promise<Wallet | null> {
  const [row] = await tx
    .select()
    .from(wallets)
    .where(and(eq(wallets.tenantId, tenantId), eq(wallets.customerId, customerId)))
    .limit(1);
  return row ?? null;
}

async function findByIdempotencyKey(tx: Tx, tenantId: string, key: string | null | undefined): Promise<WalletTransaction | null> {
  if (!key) return null;
  const [row] = await tx
    .select()
    .from(walletTransactions)
    .where(and(eq(walletTransactions.tenantId, tenantId), eq(walletTransactions.idempotencyKey, key)))
    .limit(1);
  return row ?? null;
}

/** Locks the wallet row for the rest of the transaction (SELECT … FOR UPDATE). */
async function lockWallet(tx: Tx, tenantId: string, walletId: string): Promise<Wallet> {
  const [row] = await tx
    .select()
    .from(wallets)
    .where(and(eq(wallets.tenantId, tenantId), eq(wallets.id, walletId)))
    .for("update");
  if (!row) throw new Error("wallet not found");
  return row;
}

async function writeLedger(tx: Tx, tenantId: string, type: "credit" | "debit", input: LedgerInput): Promise<Result<LedgerResult>> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) return fail("invalid_amount", "invalid_amount");
  // SERVICES-12: take the wallet row lock BEFORE the idempotency lookup. Two writers with the same key (double-clicked
  // admin adjust, concurrent markPaid / reconcile) serialise on the lock and the second one sees the first one's
  // committed transaction (READ COMMITTED re-reads per statement) → duplicate: true instead of a unique-violation 500.
  const wallet = await getOrCreateWallet(tx, tenantId, input.customerId);
  const locked = await lockWallet(tx, tenantId, wallet.id);
  const existing = await findByIdempotencyKey(tx, tenantId, input.idempotencyKey);
  if (existing) return ok({ transaction: existing, balance: existing.balanceAfter, duplicate: true });
  if (locked.frozen) return fail("frozen", "frozen");
  const balanceAfter = type === "credit" ? locked.balance + input.amount : locked.balance - input.amount;
  if (balanceAfter < 0) return fail("insufficient", "insufficient");

  const [transaction] = await tx
    .insert(walletTransactions)
    .values({
      tenantId,
      walletId: locked.id,
      type,
      amount: input.amount,
      balanceAfter,
      reason: input.reason,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      note: input.note ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  await tx.update(wallets).set({ balance: balanceAfter }).where(and(eq(wallets.tenantId, tenantId), eq(wallets.id, locked.id)));
  await audit(tx, {
    tenantId,
    actorType: input.createdBy ? "user" : "system",
    actorId: input.createdBy ?? null,
    action: `wallet.${type}`,
    targetType: "wallet",
    targetId: locked.id,
    diff: { amount: input.amount, reason: input.reason, refType: input.refType ?? null, refId: input.refId ?? null, balanceAfter },
  });
  return ok({ transaction: transaction!, balance: balanceAfter, duplicate: false });
}

/** Adds money to the ledger (top-up, bonus, refund, admin adjustment). */
export function creditWallet(tx: Tx, tenantId: string, input: LedgerInput) {
  return writeLedger(tx, tenantId, "credit", input);
}

/** Removes money from the ledger. Fails with "insufficient" instead of letting the balance go negative. */
export function debitWallet(tx: Tx, tenantId: string, input: LedgerInput) {
  return writeLedger(tx, tenantId, "debit", input);
}

export async function listTransactions(tx: Tx, tenantId: string, walletId: string, opts: { limit?: number } = {}): Promise<WalletTransaction[]> {
  return tx
    .select()
    .from(walletTransactions)
    .where(and(eq(walletTransactions.tenantId, tenantId), eq(walletTransactions.walletId, walletId)))
    .orderBy(desc(walletTransactions.createdAt), desc(walletTransactions.id))
    .limit(opts.limit ?? 50);
}

export interface CreateWalletTopupInput {
  customerId: string;
  /** satang */
  amount: number;
  method: Extract<PaymentMethod, "promptpay_qr" | "slip">;
  /** tenant settings (for PromptPay id) */
  settings: Record<string, unknown>;
  bonusPercent?: number;
  minAmount?: number;
  maxAmount?: number;
}

/** Creates a pending wallet top-up and its payment. Credit happens in onWalletTopupPaid. */
export async function createWalletTopup(tx: Tx, tenantId: string, input: CreateWalletTopupInput): Promise<Result<{ topup: WalletTopup; payment: typeof payments.$inferSelect }>> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) return fail("invalid_amount", "invalid_amount");
  if (input.amount < (input.minAmount ?? 0)) return fail("min_amount", "min_amount");
  if (input.maxAmount && input.amount > input.maxAmount) return fail("invalid_amount", "invalid_amount");
  // RV-08: a shop-blocked customer cannot spend the wallet (createTopupOrder refuses them) – do not take their money either
  if (await isCustomerBlocked(tx, tenantId, { customerId: input.customerId })) return fail(CUSTOMER_BLOCKED_MESSAGE, CUSTOMER_BLOCKED_CODE);
  const wallet = await getOrCreateWallet(tx, tenantId, input.customerId);
  if (wallet.frozen) return fail("frozen", "frozen");
  const bonus = percentOf(input.amount, input.bonusPercent ?? 0);
  const [topup] = await tx
    .insert(walletTopups)
    .values({ tenantId, walletId: wallet.id, amount: input.amount, bonus, method: input.method === "promptpay_qr" ? "promptpay" : "slip", status: "pending" })
    .returning();
  const payment = await createPayment(tx, tenantId, {
    refType: "wallet_topup",
    refId: topup!.id,
    amount: input.amount,
    provider: input.method === "promptpay_qr" ? "promptpay" : "bank_transfer",
    method: input.method,
    customerId: input.customerId,
    promptpayId: resolvePromptpayId(input.settings) ?? undefined,
    expiresMinutes: paymentSettings(input.settings).expiresMinutes ?? 30,
    metadata: { walletId: wallet.id, bonus },
  });
  const [updated] = await tx.update(walletTopups).set({ paymentId: payment.id }).where(and(eq(walletTopups.tenantId, tenantId), eq(walletTopups.id, topup!.id))).returning();
  await emitEvent(tx, { tenantId, type: "wallet.topup_created", payload: { walletTopupId: topup!.id, customerId: input.customerId, amount: input.amount, bonus } });
  return ok({ topup: updated!, payment });
}

export async function getWalletTopup(tx: Tx, tenantId: string, id: string): Promise<WalletTopup | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx.select().from(walletTopups).where(and(eq(walletTopups.tenantId, tenantId), eq(walletTopups.id, id))).limit(1);
  return row ?? null;
}

export async function listWalletTopups(tx: Tx, tenantId: string, walletId: string, limit = 20): Promise<WalletTopup[]> {
  return tx
    .select()
    .from(walletTopups)
    .where(and(eq(walletTopups.tenantId, tenantId), eq(walletTopups.walletId, walletId)))
    .orderBy(desc(walletTopups.createdAt))
    .limit(limit);
}

async function lockWalletTopup(tx: Tx, tenantId: string, id: string): Promise<WalletTopup | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx.select().from(walletTopups).where(and(eq(walletTopups.tenantId, tenantId), eq(walletTopups.id, id))).for("update");
  return row ?? null;
}

/** Closes a top-up whose money cannot be credited ("rejected") and returns the refund flag for markPaid. */
async function refuseTopup(tx: Tx, tenantId: string, topupId: string, reason: string): Promise<{ refundRequired: string }> {
  await tx.update(walletTopups).set({ status: "rejected" }).where(and(eq(walletTopups.tenantId, tenantId), eq(walletTopups.id, topupId)));
  return refundRequired(reason);
}

/**
 * registerPaymentHandler("wallet_topup") – credits amount (+ bonus) exactly once (idempotency keys
 * wallet_topup:<id> and wallet_topup:<id>:bonus). Never throws for business reasons (SERVICES-07): money that cannot
 * be credited (top-up / wallet missing, wallet frozen, a different payment) comes back as refundRequired(reason), so
 * markPaid keeps the payment paid, flags it and notifies the shop; the top-up row is closed ("rejected") so a later
 * reconcile cannot credit it on top of the refund. A late payment for an expired / cancelled top-up is still
 * credited (the money belongs in the customer's wallet).
 */
export async function onWalletTopupPaid(tx: Tx, payment: typeof payments.$inferSelect): Promise<PaymentPaidResult> {
  const tenantId = payment.tenantId;
  // row lock so two concurrent paid / reconcile calls cannot both credit
  const topup = await lockWalletTopup(tx, tenantId, payment.refId);
  if (!topup) return refundRequired("ไม่พบรายการเติมเงินกระเป๋า");
  if (topup.status === "credited") return !topup.paymentId || topup.paymentId === payment.id ? undefined : refundRequired("ชำระซ้ำ: รายการเติมเงินนี้เข้ากระเป๋าแล้ว");
  if (topup.paymentId && topup.paymentId !== payment.id) return refundRequired("ชำระซ้ำ: ไม่ใช่รายการชำระเงินปัจจุบันของการเติมเงินนี้");
  const [wallet] = await tx.select().from(wallets).where(and(eq(wallets.tenantId, tenantId), eq(wallets.id, topup.walletId))).for("update");
  if (!wallet) return refuseTopup(tx, tenantId, topup.id, "ไม่พบกระเป๋าเงินของลูกค้า");
  if (wallet.frozen) return refuseTopup(tx, tenantId, topup.id, "กระเป๋าเงินถูกระงับ ต้องคืนเงินให้ลูกค้า (หรือปลดระงับแล้วปรับยอดเอง)");

  const main = await creditWallet(tx, tenantId, {
    customerId: wallet.customerId,
    amount: topup.amount,
    reason: "topup",
    refType: "wallet_topup",
    refId: topup.id,
    idempotencyKey: `wallet_topup:${topup.id}`,
    note: `เติมเงินผ่าน ${topup.method === "promptpay" ? "PromptPay" : "โอนเงิน"}`,
  });
  if (!main.ok) return refuseTopup(tx, tenantId, topup.id, `เติมเงินเข้ากระเป๋าไม่ได้ (${main.error})`);
  if (topup.bonus > 0) {
    // the wallet row is locked and not frozen, so the bonus cannot fail for a business reason; never block the main credit
    const bonus = await creditWallet(tx, tenantId, {
      customerId: wallet.customerId,
      amount: topup.bonus,
      reason: "bonus",
      refType: "wallet_topup",
      refId: topup.id,
      idempotencyKey: `wallet_topup:${topup.id}:bonus`,
      note: "โบนัสเติมเงิน",
    });
    if (!bonus.ok) await audit(tx, { tenantId, actorType: "system", action: "wallet.bonus_failed", targetType: "wallet_topup", targetId: topup.id, diff: { bonus: topup.bonus, error: bonus.error } });
  }
  await tx.update(walletTopups).set({ status: "credited", creditedAt: new Date() }).where(and(eq(walletTopups.tenantId, tenantId), eq(walletTopups.id, topup.id)));
  await emitEvent(tx, { tenantId, type: "wallet.credited", payload: { walletTopupId: topup.id, walletId: wallet.id, customerId: wallet.customerId, amount: topup.amount, bonus: topup.bonus, paymentId: payment.id } });
  return undefined;
}

/**
 * registerPaymentClosedHandler("wallet_topup") – the unpaid payment expired (sweep) / was cancelled: a still-open
 * top-up whose current payment this is becomes "expired" / "cancelled". Idempotent.
 */
export async function onWalletTopupPaymentClosed(tx: Tx, payment: typeof payments.$inferSelect, info: PaymentClosedInfo): Promise<void> {
  const tenantId = payment.tenantId;
  const topup = await lockWalletTopup(tx, tenantId, payment.refId);
  if (!topup || (topup.status !== "pending" && topup.status !== "pending_verification")) return;
  if (topup.paymentId && topup.paymentId !== payment.id) return;
  await tx
    .update(walletTopups)
    .set({ status: info.status === "expired" ? "expired" : "cancelled" })
    .where(and(eq(walletTopups.tenantId, tenantId), eq(walletTopups.id, topup.id), inArray(walletTopups.status, ["pending", "pending_verification"])));
}

/** registerPaymentAccessCheck("wallet_topup") – only the signed-in owner of the wallet may poll / pay it. */
export async function walletTopupPaymentAccess(tx: Tx, payment: typeof payments.$inferSelect, proof: PaymentAccessProof): Promise<PaymentAccessVia | false | null> {
  if (!proof.customerId || !isUuid(payment.refId)) return false;
  const [row] = await tx
    .select({ customerId: wallets.customerId })
    .from(walletTopups)
    .innerJoin(wallets, and(eq(wallets.tenantId, walletTopups.tenantId), eq(wallets.id, walletTopups.walletId)))
    .where(and(eq(walletTopups.tenantId, payment.tenantId), eq(walletTopups.id, payment.refId)))
    .limit(1);
  return row && row.customerId === proof.customerId ? "customer" : false;
}

/**
 * Self-healing read: a wallet top-up whose payment is already paid but that was never credited
 * (paid handler not registered where the slip was verified) is credited now. Idempotent; a payment
 * that markPaid flagged for a refund is never credited.
 */
export async function reconcileWalletTopup(tx: Tx, tenantId: string, topup: WalletTopup): Promise<WalletTopup> {
  if (topup.status === "credited" || topup.status === "rejected" || !topup.paymentId) return topup;
  const payment = await getPayment(tx, tenantId, topup.paymentId);
  if (!payment || payment.status !== "paid" || paymentRefundRequired(payment)) return topup;
  const outcome = await onWalletTopupPaid(tx, payment);
  // RV-07: money the handler refused (frozen wallet …) is flagged on the payment, as markPaid would have done
  if (outcome && typeof outcome === "object" && outcome.refundRequired) await flagTopupPaymentRefund(tx, tenantId, payment.id, outcome.refundRequired);
  return (await getWalletTopup(tx, tenantId, topup.id)) ?? topup;
}
