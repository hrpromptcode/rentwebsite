import { beforeAll, describe, expect, it } from "vitest";
import { and, codeStock, eq, payments } from "@rentweb/db";
import { getPayment, markPaid } from "@rentweb/core/payments";
import {
  addToBlacklist,
  countAvailableStock,
  createTopupOrder,
  creditWallet,
  getOrderById,
  getOrderByNumber,
  getOrderForCustomer,
  getWallet,
  listCustomerOrders,
  onTopupPaid,
  recentFeed,
  reconcileTopupOrder,
  revealDeliveredCode,
  type CreateTopupOrderInput,
} from "../src/services";
import { makeFixture, type Fixture } from "./_fixture";

let f: Fixture;

function base(over: Partial<CreateTopupOrderInput> = {}): CreateTopupOrderInput {
  return {
    gameSlug: f.gameSlug,
    packageId: f.apiPackageId,
    playerFields: { uid: "987654321", server: "Asia" },
    paymentMethod: "wallet",
    contact: "0812345678",
    customer: { id: f.customerId, tier: "member" },
    ip: "10.0.0.1",
    settings: f.settings,
    config: { maxOrdersPerHour: 50 },
    ...over,
  };
}

beforeAll(async () => {
  f = await makeFixture({ stockCodes: 2 });
  // fund the member wallet generously
  await f.tx((tx) => creditWallet(tx, f.tenantId, { customerId: f.customerId, amount: 1_000_000, reason: "topup" }));
});

describe("createTopupOrder", () => {
  it("wallet + api package: debits, pays and fulfils in one call with a TP- number", async () => {
    const before = (await f.tx((tx) => getWallet(tx, f.tenantId, f.customerId)))!.balance;
    const r = await f.tx((tx) => createTopupOrder(tx, f.tenantId, base()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { order, payment, accessKey } = r.value;
    expect(order.number).toMatch(/^TP-10\d\d$/);
    expect(order.status).toBe("fulfilled");
    expect(order.supplierRef).toMatch(/^SIM-/);
    expect(order.supplierResponse).toMatchObject({ simulated: true });
    expect(order.price).toBe(3500);
    expect(order.deviceId).toBe(accessKey);
    expect(payment!.status).toBe("paid");
    expect(payment!.provider).toBe("wallet");
    const after = (await f.tx((tx) => getWallet(tx, f.tenantId, f.customerId)))!.balance;
    expect(after).toBe(before - 3500);
  });

  it("charges the tier price for vip customers", async () => {
    await f.tx((tx) => creditWallet(tx, f.tenantId, { customerId: f.vipCustomerId, amount: 10000, reason: "topup" }));
    const r = await f.tx((tx) => createTopupOrder(tx, f.tenantId, base({ customer: { id: f.vipCustomerId, tier: "vip" }, contact: "0898765432" })));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.order.price).toBe(3300);
  });

  it("guest + promptpay: pending order with a QR payment; markPaid fulfils it", async () => {
    const r = await f.tx((tx) => createTopupOrder(tx, f.tenantId, base({ customer: null, paymentMethod: "promptpay_qr", contact: "0866666666", ip: "10.0.0.2" })));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.order.status).toBe("pending_payment");
    expect(r.value.order.customerId).toBeTruthy(); // guest customer created from the phone
    expect(r.value.order.riskFlags).toContain("guest");
    expect(r.value.payment!.method).toBe("promptpay_qr");
    expect(r.value.payment!.qrPayload).toBeTruthy();
    expect(r.value.payment!.expiresAt).toBeTruthy();

    await f.tx((tx) => markPaid(tx, f.tenantId, r.value.payment!.id, { verifiedBy: "auto" }));
    const o = await f.tx((tx) => getOrderById(tx, f.tenantId, r.value.order.id));
    expect(o!.status).toBe("fulfilled");
    expect(o!.paidAt).toBeTruthy();
  });

  it("manual package goes to processing after payment", async () => {
    const r = await f.tx((tx) => createTopupOrder(tx, f.tenantId, base({ packageId: f.manualPackageId })));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.order.status).toBe("processing");
  });

  it("rejects missing / invalid player fields", async () => {
    const r = await f.tx((tx) => createTopupOrder(tx, f.tenantId, base({ playerFields: { server: "Asia" } })));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("missing_field");
    const r2 = await f.tx((tx) => createTopupOrder(tx, f.tenantId, base({ playerFields: { uid: "1", server: "Mars" } })));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe("invalid_field");
  });

  it("requires login for wallet payments", async () => {
    const r = await f.tx((tx) => createTopupOrder(tx, f.tenantId, base({ customer: null })));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("login_required");
  });

  it("fails with 'insufficient' and leaves no order when the wallet is too low", async () => {
    const poor = await f.tx((tx) => createTopupOrder(tx, f.tenantId, base({ customer: { id: f.vipCustomerId, tier: "vip" }, packageId: f.stockPackageId, contact: "0898765432" })));
    expect(poor.ok).toBe(false);
    if (!poor.ok) expect(poor.error).toBe("insufficient");
    const list = await f.tx((tx) => listCustomerOrders(tx, f.tenantId, f.vipCustomerId));
    expect(list.every((o) => o.packageId !== f.stockPackageId)).toBe(true);
    expect(await f.tx((tx) => countAvailableStock(tx, f.tenantId, f.stockPackageId))).toBe(2);
  });

  it("blocks blacklisted phones / ips / uids", async () => {
    await f.tx((tx) => addToBlacklist(tx, f.tenantId, { kind: "phone", value: "081-111-1111", reason: "test" }));
    await f.tx((tx) => addToBlacklist(tx, f.tenantId, { kind: "uid", value: "BADUID", reason: "test" }));
    const byPhone = await f.tx((tx) => createTopupOrder(tx, f.tenantId, base({ contact: "0811111111" })));
    expect(byPhone.ok).toBe(false);
    if (!byPhone.ok) expect(byPhone.error).toBe("blacklisted");
    const byUid = await f.tx((tx) => createTopupOrder(tx, f.tenantId, base({ playerFields: { uid: "baduid", server: "Asia" } })));
    expect(byUid.ok).toBe(false);
    if (!byUid.ok) expect(byUid.error).toBe("blacklisted");
  });
});

describe("stock fulfilment", () => {
  it("pops exactly one code per order, then fails + refunds the wallet when empty", async () => {
    const start = (await f.tx((tx) => getWallet(tx, f.tenantId, f.customerId)))!.balance;
    expect(await f.tx((tx) => countAvailableStock(tx, f.tenantId, f.stockPackageId))).toBe(2);

    const a = await f.tx((tx) => createTopupOrder(tx, f.tenantId, base({ packageId: f.stockPackageId })));
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.value.order.status).toBe("fulfilled");
    expect(a.value.order.deliveredCodeEncrypted).toBeTruthy();
    expect(revealDeliveredCode(a.value.order)).toBe("CODE-1-XXXX");
    expect(await f.tx((tx) => countAvailableStock(tx, f.tenantId, f.stockPackageId))).toBe(1);
    const sold = await f.tx((tx) => tx.select().from(codeStock).where(and(eq(codeStock.soldOrderId, a.value.order.id))));
    expect(sold).toHaveLength(1);
    expect(sold[0]!.status).toBe("sold");

    const b = await f.tx((tx) => createTopupOrder(tx, f.tenantId, base({ packageId: f.stockPackageId })));
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(revealDeliveredCode(b.value.order)).toBe("CODE-2-XXXX");
    expect(await f.tx((tx) => countAvailableStock(tx, f.tenantId, f.stockPackageId))).toBe(0);
    const afterTwo = (await f.tx((tx) => getWallet(tx, f.tenantId, f.customerId)))!.balance;
    expect(afterTwo).toBe(start - 2 * 10000);

    // third: the pre-check rejects it (no stock) without touching the wallet
    const c = await f.tx((tx) => createTopupOrder(tx, f.tenantId, base({ packageId: f.stockPackageId })));
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.error).toBe("out_of_stock");
    expect((await f.tx((tx) => getWallet(tx, f.tenantId, f.customerId)))!.balance).toBe(afterTwo);
  });

  it("a paid order that finds no code is failed and refunded to the wallet (race after pre-check)", async () => {
    // re-stock one code, place a pending promptpay order, then sell the code out from under it
    const { encryptToString } = await import("@rentweb/core/crypto");
    await f.tx((tx) => tx.insert(codeStock).values({ tenantId: f.tenantId, packageId: f.stockPackageId, codeEncrypted: encryptToString("CODE-3-XXXX") }));
    const balance0 = (await f.tx((tx) => getWallet(tx, f.tenantId, f.customerId)))!.balance;

    // wallet order whose stock disappears between pre-check and fulfilment: simulate by draining stock inside the same flow
    // → use a promptpay order (pending), drain the stock, then mark it paid
    const pending = await f.tx((tx) => createTopupOrder(tx, f.tenantId, base({ packageId: f.stockPackageId, paymentMethod: "promptpay_qr" })));
    expect(pending.ok).toBe(true);
    if (!pending.ok) return;
    const winner = await f.tx((tx) => createTopupOrder(tx, f.tenantId, base({ packageId: f.stockPackageId })));
    expect(winner.ok && winner.value.order.status === "fulfilled").toBe(true);
    expect(await f.tx((tx) => countAvailableStock(tx, f.tenantId, f.stockPackageId))).toBe(0);

    await f.tx((tx) => markPaid(tx, f.tenantId, pending.value.payment!.id, { verifiedBy: "auto" }));
    const lost = await f.tx((tx) => getOrderById(tx, f.tenantId, pending.value.order.id));
    expect(lost!.status).toBe("failed"); // promptpay → manual refund flagged
    expect(lost!.failureReason).toBe("out_of_stock");
    expect(lost!.supplierResponse).toMatchObject({ refundRequired: true, refundVia: "promptpay_qr" });

    // same scenario with a wallet payment refunds automatically
    await f.tx((tx) => tx.insert(codeStock).values({ tenantId: f.tenantId, packageId: f.stockPackageId, codeEncrypted: encryptToString("CODE-4-XXXX") }));
    const walletOrder = await f.tx((tx) => createTopupOrder(tx, f.tenantId, base({ packageId: f.stockPackageId })));
    expect(walletOrder.ok && walletOrder.value.order.status === "fulfilled").toBe(true);
    if (!walletOrder.ok) return;
    // force the "paid but no code" path on that order by resetting it and draining stock
    const { failOrder } = await import("../src/services");
    await f.tx(async (tx) => {
      const o = await getOrderById(tx, f.tenantId, walletOrder.value.order.id);
      expect(o!.status).toBe("fulfilled");
    });
    const beforeFail = (await f.tx((tx) => getWallet(tx, f.tenantId, f.customerId)))!.balance;
    const failed = await f.tx((tx) => failOrder(tx, f.tenantId, walletOrder.value.order.id, "out_of_stock"));
    expect(failed!.status).toBe("refunded");
    const afterFail = (await f.tx((tx) => getWallet(tx, f.tenantId, f.customerId)))!.balance;
    expect(afterFail).toBe(beforeFail + 10000);
    // refund is idempotent
    const again = await f.tx((tx) => failOrder(tx, f.tenantId, walletOrder.value.order.id, "out_of_stock"));
    expect(again!.status).toBe("refunded");
    expect((await f.tx((tx) => getWallet(tx, f.tenantId, f.customerId)))!.balance).toBe(afterFail);
    const payment = await f.tx((tx) => getPayment(tx, f.tenantId, walletOrder.value.order.paymentId!));
    expect(payment!.status).toBe("refunded");
    expect(balance0).toBeGreaterThan(0);
  });
});

describe("onTopupPaid idempotency + reads", () => {
  it("running the paid handler twice does not fulfil twice", async () => {
    const { encryptToString } = await import("@rentweb/core/crypto");
    await f.tx((tx) => tx.insert(codeStock).values([{ tenantId: f.tenantId, packageId: f.stockPackageId, codeEncrypted: encryptToString("CODE-5-XXXX") }, { tenantId: f.tenantId, packageId: f.stockPackageId, codeEncrypted: encryptToString("CODE-6-XXXX") }]));
    const r = await f.tx((tx) => createTopupOrder(tx, f.tenantId, base({ packageId: f.stockPackageId, paymentMethod: "slip" })));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const paid = await f.tx((tx) => markPaid(tx, f.tenantId, r.value.payment!.id, { verifiedBy: "auto" }));
    expect(await f.tx((tx) => countAvailableStock(tx, f.tenantId, f.stockPackageId))).toBe(1);
    await f.tx((tx) => onTopupPaid(tx, paid));
    await f.tx((tx) => onTopupPaid(tx, paid));
    expect(await f.tx((tx) => countAvailableStock(tx, f.tenantId, f.stockPackageId))).toBe(1);
    const o = await f.tx((tx) => getOrderById(tx, f.tenantId, r.value.order.id));
    expect(o!.status).toBe("fulfilled");
  });

  it("public lookup masks the player id and hides the code; owner / key get the full order", async () => {
    const r = await f.tx((tx) => createTopupOrder(tx, f.tenantId, base({ playerFields: { uid: "555566667777", server: "EU" } })));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pub = await f.tx((tx) => getOrderByNumber(tx, f.tenantId, r.value.order.number.toLowerCase()));
    expect(pub).toMatchObject({ number: r.value.order.number, player: "5555****", status: "fulfilled" });
    expect(pub).not.toHaveProperty("deliveredCodeEncrypted");
    expect(pub).not.toHaveProperty("contact");

    expect(await f.tx((tx) => getOrderForCustomer(tx, f.tenantId, { number: r.value.order.number }))).toBeNull();
    expect(await f.tx((tx) => getOrderForCustomer(tx, f.tenantId, { number: r.value.order.number, accessKey: "wrong" }))).toBeNull();
    expect((await f.tx((tx) => getOrderForCustomer(tx, f.tenantId, { number: r.value.order.number, accessKey: r.value.accessKey })))?.id).toBe(r.value.order.id);
    expect((await f.tx((tx) => getOrderForCustomer(tx, f.tenantId, { number: r.value.order.number, customerId: f.customerId })))?.id).toBe(r.value.order.id);
    expect(await f.tx((tx) => getOrderForCustomer(tx, f.tenantId, { number: r.value.order.number, customerId: f.vipCustomerId }))).toBeNull();
  });

  it("recentFeed lists paid orders newest first with masked ids", async () => {
    const feed = await f.tx((tx) => recentFeed(tx, f.tenantId, 5));
    expect(feed.length).toBeGreaterThan(0);
    expect(feed.length).toBeLessThanOrEqual(5);
    for (const item of feed) {
      expect(item.player).toMatch(/\*\*\*\*$/);
      expect(["paid", "processing", "fulfilled"]).toContain(item.status);
    }
  });
});

describe("rate limit", () => {
  it("rejects the N+1th order per hour for the same customer / ip", async () => {
    const g = await makeFixture({ stockCodes: 0 });
    await g.tx((tx) => creditWallet(tx, g.tenantId, { customerId: g.customerId, amount: 100000, reason: "topup" }));
    const input = (): CreateTopupOrderInput => ({
      gameSlug: g.gameSlug,
      packageId: g.apiPackageId,
      playerFields: { uid: "1", server: "Asia" },
      paymentMethod: "wallet",
      customer: { id: g.customerId, tier: "member" },
      ip: "203.0.113.9",
      settings: g.settings,
      config: { maxOrdersPerHour: 3 },
    });
    for (let i = 0; i < 3; i++) {
      const r = await g.tx((tx) => createTopupOrder(tx, g.tenantId, input()));
      expect(r.ok, `order ${i + 1}`).toBe(true);
    }
    const fourth = await g.tx((tx) => createTopupOrder(tx, g.tenantId, input()));
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.error).toBe("rate_limited");
    // a guest from the same ip is also limited
    const guest = await g.tx((tx) => createTopupOrder(tx, g.tenantId, { ...input(), customer: null, paymentMethod: "promptpay_qr", contact: "0877777777" }));
    expect(guest.ok).toBe(false);
    if (!guest.ok) expect(guest.error).toBe("rate_limited");
  });
});

describe("reconcile (payment paid without the handler)", () => {
  it("fulfils a pending order whose payment row is already paid, and is a no-op afterwards", async () => {
    const r = await f.tx((tx) => createTopupOrder(tx, f.tenantId, base({ paymentMethod: "promptpay_qr", playerFields: { uid: "555000111", server: "EU" } })));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { order, payment } = r.value;
    // untouched while the payment is still pending
    const same = await f.tx((tx) => reconcileTopupOrder(tx, f.tenantId, order));
    expect(same.status).toBe("pending_payment");
    // simulate a slip verified in a process without this module's handler: payment paid, order not progressed
    await f.tx((tx) => tx.update(payments).set({ status: "paid", paidAt: new Date() }).where(eq(payments.id, payment!.id)));
    const fixed = await f.tx((tx) => reconcileTopupOrder(tx, f.tenantId, order));
    expect(fixed.status).toBe("fulfilled");
    expect(fixed.supplierRef).toMatch(/^SIM-/);
    const again = await f.tx((tx) => reconcileTopupOrder(tx, f.tenantId, fixed));
    expect(again.supplierRef).toBe(fixed.supplierRef);
    expect(again.fulfilledAt?.getTime()).toBe(fixed.fulfilledAt?.getTime());
  });
});
