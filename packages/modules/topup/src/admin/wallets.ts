import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { customers, walletTopups, walletTransactions, wallets, type Tx } from "@rentweb/db";
import { audit, fail, ok, type Result } from "@rentweb/core";
import { creditWallet, debitWallet, type Wallet, type WalletTransaction, type WalletTopup } from "../services/wallet";
import type { Actor } from "./orders";

export interface AdminWalletRow {
  id: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  tier: string;
  balance: number;
  frozen: boolean;
  lastTxAt: Date | null;
  lastTxType: string | null;
  lastTxAmount: number | null;
  createdAt: Date;
}

export async function listAdminWallets(tx: Tx, tenantId: string, f: { q?: string | null; page?: number; perPage?: number; frozen?: boolean | null } = {}): Promise<{ rows: AdminWalletRow[]; total: number; page: number; pages: number; totalBalance: number }> {
  const perPage = Math.min(100, Math.max(1, f.perPage ?? 25));
  const page = Math.max(1, f.page ?? 1);
  const conds: SQL[] = [eq(wallets.tenantId, tenantId)];
  const q = f.q?.trim();
  if (q) conds.push(or(ilike(customers.name, `%${q}%`), ilike(customers.phone, `%${q}%`), ilike(customers.email, `%${q}%`))!);
  if (f.frozen === true) conds.push(eq(wallets.frozen, true));
  const where = and(...conds);
  const lastTx = tx
    .select({
      walletId: walletTransactions.walletId,
      lastTxAt: sql<Date>`max(${walletTransactions.createdAt})`.as("last_tx_at"),
    })
    .from(walletTransactions)
    .where(eq(walletTransactions.tenantId, tenantId))
    .groupBy(walletTransactions.walletId)
    .as("last_tx");
  const [rows, [c], [sum]] = await Promise.all([
    tx
      .select({ w: wallets, customerName: customers.name, customerPhone: customers.phone, customerEmail: customers.email, tier: customers.tier, lastTxAt: lastTx.lastTxAt })
      .from(wallets)
      .innerJoin(customers, and(eq(customers.tenantId, tenantId), eq(customers.id, wallets.customerId)))
      .leftJoin(lastTx, eq(lastTx.walletId, wallets.id))
      .where(where)
      .orderBy(desc(sql`coalesce(${lastTx.lastTxAt}, ${wallets.updatedAt})`))
      .limit(perPage)
      .offset((page - 1) * perPage),
    tx
      .select({ c: count() })
      .from(wallets)
      .innerJoin(customers, and(eq(customers.tenantId, tenantId), eq(customers.id, wallets.customerId)))
      .where(where),
    tx
      .select({ s: sql<number>`coalesce(sum(${wallets.balance}), 0)::bigint` })
      .from(wallets)
      .where(eq(wallets.tenantId, tenantId)),
  ]);
  // last transaction type/amount for the visible page only
  const ids = rows.map((r) => r.w.id);
  const lastMap = new Map<string, { type: string; amount: number }>();
  if (ids.length) {
    const last = await tx
      .select({ walletId: walletTransactions.walletId, type: walletTransactions.type, amount: walletTransactions.amount })
      .from(walletTransactions)
      .where(and(eq(walletTransactions.tenantId, tenantId), inArray(walletTransactions.walletId, ids)))
      .orderBy(desc(walletTransactions.createdAt), desc(walletTransactions.id));
    for (const l of last) if (!lastMap.has(l.walletId)) lastMap.set(l.walletId, { type: l.type, amount: l.amount });
  }
  const total = Number(c?.c ?? 0);
  return {
    rows: rows.map(({ w, customerName, customerPhone, customerEmail, tier, lastTxAt }) => ({
      id: w.id,
      customerId: w.customerId,
      customerName,
      customerPhone,
      customerEmail,
      tier,
      balance: w.balance,
      frozen: w.frozen,
      lastTxAt: lastTxAt ? new Date(lastTxAt) : null,
      lastTxType: lastMap.get(w.id)?.type ?? null,
      lastTxAmount: lastMap.get(w.id)?.amount ?? null,
      createdAt: w.createdAt,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    totalBalance: Number(sum?.s ?? 0),
  };
}

export interface AdminWalletDetail {
  wallet: Wallet;
  customer: { id: string; name: string | null; phone: string | null; email: string | null; tier: string; blockedAt: Date | null };
  transactions: WalletTransaction[];
  topups: WalletTopup[];
  stats: { credited: number; debited: number; txCount: number };
}

export async function getAdminWallet(tx: Tx, tenantId: string, walletId: string): Promise<AdminWalletDetail | null> {
  const [row] = await tx
    .select({ w: wallets, c: { id: customers.id, name: customers.name, phone: customers.phone, email: customers.email, tier: customers.tier, blockedAt: customers.blockedAt } })
    .from(wallets)
    .innerJoin(customers, and(eq(customers.tenantId, tenantId), eq(customers.id, wallets.customerId)))
    .where(and(eq(wallets.tenantId, tenantId), eq(wallets.id, walletId)))
    .limit(1);
  if (!row) return null;
  const [transactions, topups, [stats]] = await Promise.all([
    tx
      .select()
      .from(walletTransactions)
      .where(and(eq(walletTransactions.tenantId, tenantId), eq(walletTransactions.walletId, walletId)))
      .orderBy(desc(walletTransactions.createdAt), desc(walletTransactions.id))
      .limit(100),
    tx
      .select()
      .from(walletTopups)
      .where(and(eq(walletTopups.tenantId, tenantId), eq(walletTopups.walletId, walletId)))
      .orderBy(desc(walletTopups.createdAt))
      .limit(20),
    tx
      .select({
        credited: sql<number>`coalesce(sum(${walletTransactions.amount}) filter (where ${walletTransactions.type} = 'credit'), 0)::bigint`,
        debited: sql<number>`coalesce(sum(${walletTransactions.amount}) filter (where ${walletTransactions.type} = 'debit'), 0)::bigint`,
        txCount: sql<number>`count(*)::int`,
      })
      .from(walletTransactions)
      .where(and(eq(walletTransactions.tenantId, tenantId), eq(walletTransactions.walletId, walletId))),
  ]);
  return { wallet: row.w, customer: row.c, transactions, topups, stats: { credited: Number(stats?.credited ?? 0), debited: Number(stats?.debited ?? 0), txCount: Number(stats?.txCount ?? 0) } };
}

/** Manual credit / debit by staff. `requestKey` makes a double-submitted dialog idempotent. */
export async function adjustWallet(tx: Tx, tenantId: string, walletId: string, input: { type: "credit" | "debit"; amount: number; reason: string; requestKey: string }, actor: Actor): Promise<Result<{ balance: number; duplicate: boolean }>> {
  const [w] = await tx.select().from(wallets).where(and(eq(wallets.tenantId, tenantId), eq(wallets.id, walletId))).limit(1);
  if (!w) return fail("ไม่พบกระเป๋าเงิน", "not_found");
  if (w.frozen) return fail("กระเป๋าถูกระงับอยู่ — ปลดระงับก่อนปรับยอด", "frozen");
  const fn = input.type === "credit" ? creditWallet : debitWallet;
  const r = await fn(tx, tenantId, {
    customerId: w.customerId,
    amount: input.amount,
    reason: "adjustment",
    refType: "admin",
    refId: actor.userId,
    note: input.reason,
    idempotencyKey: `adjust:${walletId}:${input.requestKey}`,
    createdBy: actor.userId,
  });
  if (!r.ok) return fail(r.error === "insufficient" ? "ยอดคงเหลือไม่พอสำหรับการหักเงิน" : r.error === "frozen" ? "กระเป๋าถูกระงับ" : "ปรับยอดไม่สำเร็จ", r.code);
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.wallet.adjust", targetType: "wallet", targetId: walletId, diff: { type: input.type, amount: input.amount, reason: input.reason, balanceAfter: r.value.balance, duplicate: r.value.duplicate } });
  return ok({ balance: r.value.balance, duplicate: r.value.duplicate });
}

export async function setWalletFrozen(tx: Tx, tenantId: string, walletId: string, frozen: boolean, actor: Actor): Promise<Result<null>> {
  const r = await tx
    .update(wallets)
    .set({ frozen })
    .where(and(eq(wallets.tenantId, tenantId), eq(wallets.id, walletId)))
    .returning({ id: wallets.id });
  if (!r.length) return fail("ไม่พบกระเป๋าเงิน", "not_found");
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: frozen ? "topup.wallet.freeze" : "topup.wallet.unfreeze", targetType: "wallet", targetId: walletId });
  return ok(null);
}
