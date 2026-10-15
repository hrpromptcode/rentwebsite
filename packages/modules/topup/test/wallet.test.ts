import { beforeAll, describe, expect, it } from "vitest";
import { eq, payments, walletTransactions, wallets } from "@rentweb/db";
import { markPaid } from "@rentweb/core/payments";
import { createWalletTopup, creditWallet, debitWallet, getOrCreateWallet, getWallet, getWalletTopup, listTransactions, reconcileWalletTopup } from "../src/services";
import { makeFixture, type Fixture } from "./_fixture";

let f: Fixture;

beforeAll(async () => {
  f = await makeFixture();
});

describe("wallet ledger", () => {
  it("creates one wallet per customer and starts at 0", async () => {
    const w1 = await f.tx((tx) => getOrCreateWallet(tx, f.tenantId, f.customerId));
    const w2 = await f.tx((tx) => getOrCreateWallet(tx, f.tenantId, f.customerId));
    expect(w1.id).toBe(w2.id);
    expect(w1.balance).toBe(0);
  });

  it("credit then debit keeps balance and balanceAfter consistent", async () => {
    const c = await f.tx((tx) => creditWallet(tx, f.tenantId, { customerId: f.customerId, amount: 50000, reason: "topup" }));
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.value.balance).toBe(50000);
    expect(c.value.transaction.type).toBe("credit");
    expect(c.value.transaction.balanceAfter).toBe(50000);

    const d = await f.tx((tx) => debitWallet(tx, f.tenantId, { customerId: f.customerId, amount: 12000, reason: "purchase", refType: "topup_order", refId: "x" }));
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.value.balance).toBe(38000);
    const w = await f.tx((tx) => getWallet(tx, f.tenantId, f.customerId));
    expect(w!.balance).toBe(38000);
  });

  it("rejects a debit larger than the balance with 'insufficient' and writes nothing", async () => {
    const before = await f.tx((tx) => getWallet(tx, f.tenantId, f.customerId));
    const r = await f.tx((tx) => debitWallet(tx, f.tenantId, { customerId: f.customerId, amount: before!.balance + 1, reason: "purchase" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("insufficient");
    const after = await f.tx((tx) => getWallet(tx, f.tenantId, f.customerId));
    expect(after!.balance).toBe(before!.balance);
  });

  it("rejects non-positive amounts", async () => {
    const r = await f.tx((tx) => creditWallet(tx, f.tenantId, { customerId: f.customerId, amount: 0, reason: "topup" }));
    expect(r.ok).toBe(false);
    const r2 = await f.tx((tx) => debitWallet(tx, f.tenantId, { customerId: f.customerId, amount: -5, reason: "purchase" }));
    expect(r2.ok).toBe(false);
  });

  it("is idempotent on idempotencyKey: the same key returns the existing transaction", async () => {
    const key = `test:${Date.now()}`;
    const a = await f.tx((tx) => creditWallet(tx, f.tenantId, { customerId: f.customerId, amount: 1000, reason: "bonus", idempotencyKey: key }));
    const b = await f.tx((tx) => creditWallet(tx, f.tenantId, { customerId: f.customerId, amount: 1000, reason: "bonus", idempotencyKey: key }));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.value.duplicate).toBe(true);
    expect(b.value.transaction.id).toBe(a.value.transaction.id);
    expect(b.value.balance).toBe(a.value.balance);
    const rows = await f.tx((tx) => tx.select().from(walletTransactions).where(eq(walletTransactions.idempotencyKey, key)));
    expect(rows).toHaveLength(1);
  });

  it("database constraints back the invariants (balance >= 0, amount > 0)", async () => {
    const w = await f.tx((tx) => getOrCreateWallet(tx, f.tenantId, f.customerId));
    await expect(f.tx((tx) => tx.update(wallets).set({ balance: -1 }).where(eq(wallets.id, w.id)))).rejects.toThrow();
    await expect(
      f.tx((tx) => tx.insert(walletTransactions).values({ tenantId: f.tenantId, walletId: w.id, type: "credit", amount: 0, balanceAfter: w.balance, reason: "adjustment" })),
    ).rejects.toThrow();
  });

  it("lists transactions newest first", async () => {
    const w = await f.tx((tx) => getOrCreateWallet(tx, f.tenantId, f.customerId));
    const list = await f.tx((tx) => listTransactions(tx, f.tenantId, w.id, { limit: 10 }));
    expect(list.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < list.length; i++) expect(list[i - 1]!.createdAt.getTime()).toBeGreaterThanOrEqual(list[i]!.createdAt.getTime());
  });
});

describe("wallet top-up via payment", () => {
  it("createWalletTopup → markPaid credits amount + bonus exactly once", async () => {
    const before = (await f.tx((tx) => getOrCreateWallet(tx, f.tenantId, f.vipCustomerId))).balance;
    const created = await f.tx((tx) =>
      createWalletTopup(tx, f.tenantId, { customerId: f.vipCustomerId, amount: 30000, method: "promptpay_qr", settings: f.settings, bonusPercent: 2, minAmount: 2000 }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.topup.bonus).toBe(600);
    expect(created.value.payment.refType).toBe("wallet_topup");
    expect(created.value.payment.qrPayload).toBeTruthy();

    await f.tx((tx) => markPaid(tx, f.tenantId, created.value.payment.id, { verifiedBy: "test" }));
    const w1 = await f.tx((tx) => getWallet(tx, f.tenantId, f.vipCustomerId));
    expect(w1!.balance).toBe(before + 30000 + 600);
    const t1 = await f.tx((tx) => getWalletTopup(tx, f.tenantId, created.value.topup.id));
    expect(t1!.status).toBe("credited");

    // second markPaid is a no-op in the payment layer; calling the handler path again must not double credit
    await f.tx((tx) => markPaid(tx, f.tenantId, created.value.payment.id, { verifiedBy: "test" }));
    const { onWalletTopupPaid } = await import("../src/services");
    await f.tx(async (tx) => onWalletTopupPaid(tx, created.value.payment));
    const w2 = await f.tx((tx) => getWallet(tx, f.tenantId, f.vipCustomerId));
    expect(w2!.balance).toBe(before + 30000 + 600);
  });

  it("enforces the minimum top-up", async () => {
    const r = await f.tx((tx) => createWalletTopup(tx, f.tenantId, { customerId: f.customerId, amount: 1000, method: "slip", settings: f.settings, minAmount: 2000 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("min_amount");
  });
});

describe("reconcile (payment paid without the handler)", () => {
  it("credits amount + bonus once for a paid-but-uncredited top-up", async () => {
    const before = (await f.tx((tx) => getOrCreateWallet(tx, f.tenantId, f.customerId))).balance;
    const created = await f.tx((tx) => createWalletTopup(tx, f.tenantId, { customerId: f.customerId, amount: 10000, method: "slip", settings: f.settings, bonusPercent: 2, minAmount: 2000 }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const untouched = await f.tx((tx) => reconcileWalletTopup(tx, f.tenantId, created.value.topup));
    expect(untouched.status).toBe("pending");
    expect((await f.tx((tx) => getWallet(tx, f.tenantId, f.customerId)))!.balance).toBe(before);

    await f.tx((tx) => tx.update(payments).set({ status: "paid", paidAt: new Date() }).where(eq(payments.id, created.value.payment.id)));
    const credited = await f.tx((tx) => reconcileWalletTopup(tx, f.tenantId, created.value.topup));
    expect(credited.status).toBe("credited");
    expect((await f.tx((tx) => getWallet(tx, f.tenantId, f.customerId)))!.balance).toBe(before + 10000 + 200);
    await f.tx((tx) => reconcileWalletTopup(tx, f.tenantId, credited));
    await f.tx((tx) => reconcileWalletTopup(tx, f.tenantId, created.value.topup)); // stale row, same key → no double credit
    expect((await f.tx((tx) => getWallet(tx, f.tenantId, f.customerId)))!.balance).toBe(before + 10000 + 200);
  });
});
