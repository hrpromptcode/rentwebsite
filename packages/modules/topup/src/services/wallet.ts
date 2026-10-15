import { and, desc, eq } from "drizzle-orm";
import { payments, walletTopups, walletTransactions, wallets, type Tx } from "@rentweb/db";
import { audit, emitEvent, fail, ok, percentOf, type Result } from "@rentweb/core";
import { createPayment, getPayment, resolvePromptpayId, type PaymentMethod } from "@rentweb/core/payments";

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
  const existing = await findByIdempotencyKey(tx, tenantId, input.idempotencyKey);
  if (existing) return ok({ transaction: existing, balance: existing.balanceAfter, duplicate: true });

  const wallet = await getOrCreateWallet(tx, tenantId, input.customerId);
  const locked = await lockWallet(tx, tenantId, wallet.id);
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
    expiresMinutes: 30,
    metadata: { walletId: wallet.id, bonus },
  });
  const [updated] = await tx.update(walletTopups).set({ paymentId: payment.id }).where(eq(walletTopups.id, topup!.id)).returning();
  await emitEvent(tx, { tenantId, type: "wallet.topup_created", payload: { walletTopupId: topup!.id, customerId: input.customerId, amount: input.amount, bonus } });
  return ok({ topup: updated!, payment });
}

export async function getWalletTopup(tx: Tx, tenantId: string, id: string): Promise<WalletTopup | null> {
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

/**
 * Payment handler for refType "wallet_topup": credits amount (+ bonus) exactly once.
 * Idempotency keys: wallet_topup:<id> and wallet_topup:<id>:bonus.
 */
export async function onWalletTopupPaid(tx: Tx, payment: typeof payments.$inferSelect): Promise<void> {
  const tenantId = payment.tenantId;
  // row lock so two concurrent paid / reconcile calls cannot both credit
  const [topup] = await tx
    .select()
    .from(walletTopups)
    .where(and(eq(walletTopups.tenantId, tenantId), eq(walletTopups.id, payment.refId)))
    .for("update");
  if (!topup) return;
  if (topup.status === "credited") return;
  const [wallet] = await tx.select().from(wallets).where(and(eq(wallets.tenantId, tenantId), eq(wallets.id, topup.walletId))).limit(1);
  if (!wallet) return;

  const main = await creditWallet(tx, tenantId, {
    customerId: wallet.customerId,
    amount: topup.amount,
    reason: "topup",
    refType: "wallet_topup",
    refId: topup.id,
    idempotencyKey: `wallet_topup:${topup.id}`,
    note: `เติมเงินผ่าน ${topup.method === "promptpay" ? "PromptPay" : "โอนเงิน"}`,
  });
  if (!main.ok) throw new Error(`wallet credit failed: ${main.error}`);
  if (topup.bonus > 0) {
    const bonus = await creditWallet(tx, tenantId, {
      customerId: wallet.customerId,
      amount: topup.bonus,
      reason: "bonus",
      refType: "wallet_topup",
      refId: topup.id,
      idempotencyKey: `wallet_topup:${topup.id}:bonus`,
      note: "โบนัสเติมเงิน",
    });
    if (!bonus.ok) throw new Error(`wallet bonus failed: ${bonus.error}`);
  }
  await tx.update(walletTopups).set({ status: "credited", creditedAt: new Date() }).where(eq(walletTopups.id, topup.id));
  await emitEvent(tx, { tenantId, type: "wallet.credited", payload: { walletTopupId: topup.id, walletId: wallet.id, customerId: wallet.customerId, amount: topup.amount, bonus: topup.bonus } });
}

/**
 * Self-healing read: a wallet top-up whose payment is already paid but that was never credited
 * (paid handler not registered where the slip was verified) is credited now. Idempotent.
 */
export async function reconcileWalletTopup(tx: Tx, tenantId: string, topup: WalletTopup): Promise<WalletTopup> {
  if (topup.status === "credited" || !topup.paymentId) return topup;
  const payment = await getPayment(tx, tenantId, topup.paymentId);
  if (!payment || payment.status !== "paid") return topup;
  await onWalletTopupPaid(tx, payment);
  return (await getWalletTopup(tx, tenantId, topup.id)) ?? topup;
}
