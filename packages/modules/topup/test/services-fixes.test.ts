import { beforeAll, describe, expect, it } from "vitest";
import { and, codeStock, customers, desc, eq, eventsOutbox, games, payments, sql, topupOrders, walletTopups, wallets, type Tx } from "@rentweb/db";
import { attachSlip, cancelPayment, expireStalePayments, getPayment, isPaymentStateError, markPaid, paymentHookSummary, paymentRefundRequired, canAccessPayment } from "@rentweb/core/payments";
import {
  cancelUnpaidTopupOrder,
  createTopupOrder,
  createWalletTopup,
  creditWallet,
  failOrder,
  failPaidOrder,
  fulfillOrder,
  getOrderById,
  getOrderByNumber,
  getOrderForCustomer,
  getWallet,
  getWalletTopup,
  reconcileWalletTopup,
  registerSupplierAdapter,
  safeFieldPattern,
  simulatedSupplierRef,
  recentFeed,
  topupFailureField,
  topupPaymentMethods,
  validatePlayerFields,
  type CreateTopupOrderInput,
  type SupplierAdapter,
} from "../src/services";
import { makeFixture, SETTINGS, type Fixture } from "./_fixture";

/**
 * Regression tests for the top-up SERVICES bug-hunt fixes (tooling/qa/bughunt/fixes/topup_services.md).
 * Each describe names the finding ids it pins.
 */

let f: Fixture;

function input(over: Partial<CreateTopupOrderInput> = {}): CreateTopupOrderInput {
  return {
    gameSlug: f.gameSlug,
    packageId: f.apiPackageId,
    playerFields: { uid: "987654321", server: "Asia" },
    paymentMethod: "slip",
    contact: "0812345678",
    customer: { id: f.customerId, tier: "member" },
    ip: "10.9.0.1",
    settings: f.settings,
    config: { maxOrdersPerHour: 500, otpRequiredFirstOrder: false },
    ...over,
  };
}

async function create(over: Partial<CreateTopupOrderInput> = {}) {
  const r = await f.tx((tx) => createTopupOrder(tx, f.tenantId, input(over)));
  if (!r.ok) throw new Error(`create failed: ${r.code} ${r.error}`);
  return r.value;
}

const outbox = (type: string) => f.tx((tx) => tx.select().from(eventsOutbox).where(and(eq(eventsOutbox.tenantId, f.tenantId), eq(eventsOutbox.type, type))).orderBy(desc(eventsOutbox.createdAt)));
const countCustomers = () => f.tx(async (tx) => Number((await tx.select({ n: sql<number>`count(*)` }).from(customers).where(eq(customers.tenantId, f.tenantId)))[0]!.n));

/** Flaky supplier for SERVICES-11 (fixture packages use the supplier with provider "manual"). */
const calls: string[] = [];
let mode: "throw" | "ok" = "ok";
const remembered = new Map<string, string>();
const flaky: SupplierAdapter = {
  key: "qa-flaky",
  async submit(i) {
    calls.push(`submit:${i.idempotencyKey}`);
    remembered.set(i.idempotencyKey, `QA-${i.idempotencyKey}`);
    if (mode === "throw") throw new Error("socket hang up"); // reached the supplier, answer lost
    return { status: "success", ref: `QA-${i.idempotencyKey}` };
  },
  async query(key) {
    calls.push(`query:${key}`);
    const ref = remembered.get(key);
    return ref ? { status: "success", ref } : { status: "not_found" };
  },
};

beforeAll(async () => {
  f = await makeFixture({ stockCodes: 1 });
  await f.tx((tx) => creditWallet(tx, f.tenantId, { customerId: f.customerId, amount: 1_000_000, reason: "topup" }));
});

describe("payment hooks are registered (SERVICES-01, STOREFRONT-08, ADMIN-01)", () => {
  it("closed / target / access hooks exist for topup and wallet_topup", () => {
    const h = paymentHookSummary();
    for (const k of ["topup", "wallet_topup"]) {
      expect(h.paid).toContain(k);
      expect(h.closed).toContain(k);
      expect(h.access).toContain(k);
    }
    expect(h.target).toContain("topup");
  });

  it("the expiry sweep expires a lapsed QR payment and cancels its pending order", async () => {
    const { order, payment } = await create({ paymentMethod: "promptpay_qr" });
    await f.tx((tx) => tx.update(payments).set({ expiresAt: new Date(Date.now() - 2 * 3600_000) }).where(eq(payments.id, payment!.id)));
    const r = await expireStalePayments(f.db as never, { graceMinutes: 0, refTypes: ["topup"] });
    expect(r.expired).toBeGreaterThanOrEqual(1);
    const p = await f.tx((tx) => getPayment(tx, f.tenantId, payment!.id));
    const o = await f.tx((tx) => getOrderById(tx, f.tenantId, order.id));
    expect(p!.status).toBe("expired");
    expect(o!.status).toBe("cancelled");
    expect(o!.failureReason).toBe("หมดเวลาชำระเงิน");
    const ev = (await outbox("topup.cancelled")).find((e) => e.payload.orderId === order.id);
    expect(ev?.payload).toMatchObject({ number: order.number, by: "system", expired: true, accessKey: order.deviceId });
    // late money for the expired order → flagged for a refund, never fulfilled
    const late = await f.tx((tx) => markPaid(tx, f.tenantId, payment!.id, { verifiedBy: "admin" }));
    expect(paymentRefundRequired(late)).toMatch(/ยกเลิก/);
    expect((await f.tx((tx) => getOrderById(tx, f.tenantId, order.id)))!.status).toBe("cancelled");
  });

  it("cancelPayment() cancels the pending order; a superseded payment does not", async () => {
    const a = await create();
    await f.tx((tx) => cancelPayment(tx, f.tenantId, a.payment!.id, "qa cancel"));
    expect((await f.tx((tx) => getOrderById(tx, f.tenantId, a.order.id)))!.status).toBe("cancelled");

    const b = await create();
    // point the order at another payment: the old one is no longer current
    const other = await f.tx(async (tx) => {
      const [p] = await tx.insert(payments).values({ tenantId: f.tenantId, refType: "topup", refId: b.order.id, provider: "bank_transfer", method: "slip", status: "pending", amount: b.order.price }).returning();
      await tx.update(topupOrders).set({ paymentId: p!.id }).where(eq(topupOrders.id, b.order.id));
      return p!;
    });
    await f.tx((tx) => cancelPayment(tx, f.tenantId, b.payment!.id, "old payment"));
    expect((await f.tx((tx) => getOrderById(tx, f.tenantId, b.order.id)))!.status).toBe("pending_payment");
    expect(other.id).toBeTruthy();
  });

  it("wallet top-up: expiry → expired, cancel → cancelled", async () => {
    const t1 = await f.tx((tx) => createWalletTopup(tx, f.tenantId, { customerId: f.customerId, amount: 5000, method: "promptpay_qr", settings: f.settings }));
    const t2 = await f.tx((tx) => createWalletTopup(tx, f.tenantId, { customerId: f.customerId, amount: 5000, method: "slip", settings: f.settings }));
    if (!t1.ok || !t2.ok) throw new Error("wallet topup");
    await f.tx((tx) => tx.update(payments).set({ expiresAt: new Date(Date.now() - 2 * 3600_000) }).where(eq(payments.id, t1.value.payment.id)));
    await expireStalePayments(f.db as never, { graceMinutes: 0, refTypes: ["wallet_topup"] });
    await f.tx((tx) => cancelPayment(tx, f.tenantId, t2.value.payment.id, "ลูกค้ายกเลิก"));
    expect((await f.tx((tx) => getWalletTopup(tx, f.tenantId, t1.value.topup.id)))!.status).toBe("expired");
    expect((await f.tx((tx) => getWalletTopup(tx, f.tenantId, t2.value.topup.id)))!.status).toBe("cancelled");
  });

  it("access: owner or ?k= key for topup; only the wallet owner for wallet_topup", async () => {
    const { order, payment } = await create();
    expect(await f.tx((tx) => canAccessPayment(tx, payment!, { accessKey: order.deviceId }))).toBe("access_key");
    expect(await f.tx((tx) => canAccessPayment(tx, payment!, { customerId: f.customerId }))).toBe("customer");
    expect(await f.tx((tx) => canAccessPayment(tx, payment!, { customerId: f.vipCustomerId, accessKey: "nope" }))).toBeNull();
    const t = await f.tx((tx) => createWalletTopup(tx, f.tenantId, { customerId: f.customerId, amount: 5000, method: "slip", settings: f.settings }));
    if (!t.ok) throw new Error("wallet topup");
    expect(await f.tx((tx) => canAccessPayment(tx, t.value.payment, { customerId: f.customerId }))).toBe("customer");
    expect(await f.tx((tx) => canAccessPayment(tx, t.value.payment, { customerId: f.vipCustomerId }))).toBeNull();
  });
});

describe("money is never accepted silently for an order that cannot be fulfilled (SERVICES-05, SERVICES-06, STOREFRONT-09)", () => {
  it("failOrder on an UNPAID order voids its payment (no later payment possible); failPaidOrder refuses with not_paid", async () => {
    const { order, payment } = await create();
    const refused = await f.tx((tx) => failPaidOrder(tx, f.tenantId, order.id, "qa"));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe("not_paid");

    const after = await f.tx((tx) => failOrder(tx, f.tenantId, order.id, "qa: failed while unpaid"));
    expect(after!.status).toBe("cancelled");
    expect((await f.tx((tx) => getPayment(tx, f.tenantId, payment!.id)))!.status).toBe("cancelled");
    let err: unknown = null;
    await f.tx((tx) => markPaid(tx, f.tenantId, payment!.id, { verifiedBy: "admin" })).catch((e) => (err = e));
    expect(isPaymentStateError(err)).toBe(true);
    await expect(f.tx((tx) => attachSlip(tx, f.tenantId, payment!.id, { url: "/uploads/x.png" }))).rejects.toThrow();
  });

  it("legacy data: money for a FAILED order with a still-open payment is flagged (target check)", async () => {
    const { order, payment } = await create();
    await f.tx((tx) => tx.update(topupOrders).set({ status: "failed" }).where(eq(topupOrders.id, order.id)));
    const paid = await f.tx((tx) => markPaid(tx, f.tenantId, payment!.id, { verifiedBy: "auto", strict: true }));
    expect(paid.status).toBe("paid");
    expect(paymentRefundRequired(paid)).toContain(order.number);
    expect(paid.failureReason).toMatch(/^ต้องคืนเงิน: /);
    expect((await outbox("payment.refund_required")).some((e) => e.payload.paymentId === payment!.id)).toBe(true);
    expect((await f.tx((tx) => getOrderById(tx, f.tenantId, order.id)))!.status).toBe("failed");
  });

  it("out of stock when the slip is approved → order failed AND the payment flagged (SERVICES-06)", async () => {
    // the single fixture code is sold to a wallet order first
    const pending = await create({ packageId: f.stockPackageId });
    const winner = await create({ packageId: f.stockPackageId, paymentMethod: "wallet" });
    expect(winner.order.status).toBe("fulfilled");
    const paid = await f.tx((tx) => markPaid(tx, f.tenantId, pending.payment!.id, { verifiedBy: "auto", strict: true }));
    expect(paid.status).toBe("paid");
    expect(paymentRefundRequired(paid)).toBe("สินค้าหมด");
    expect(paid.failureReason).toBe("ต้องคืนเงิน: สินค้าหมด");
    const o = await f.tx((tx) => getOrderById(tx, f.tenantId, pending.order.id));
    expect(o!.status).toBe("failed");
    expect(o!.supplierResponse).toMatchObject({ refundRequired: true, refundVia: "slip" });
    expect((await outbox("payment.refund_required")).filter((e) => e.payload.paymentId === pending.payment!.id)).toHaveLength(1);
    const failedEv = (await outbox("topup.failed")).find((e) => e.payload.orderId === pending.order.id);
    expect(failedEv?.payload).toMatchObject({ refundRequired: true, refunded: false, reasonText: "สินค้าหมด", gameName: "Test Legends", accessKey: pending.order.deviceId });

    // the shop restocks and retries: fulfilled, refund flag cleared on the order and the payment
    await f.tx(async (tx) => {
      const { encryptToString } = await import("@rentweb/core/crypto");
      await tx.insert(codeStock).values({ tenantId: f.tenantId, packageId: f.stockPackageId, codeEncrypted: encryptToString("CODE-R-1") });
      await tx.update(topupOrders).set({ status: "paid" }).where(eq(topupOrders.id, pending.order.id));
    });
    const retried = await f.tx((tx) => fulfillOrder(tx, f.tenantId, pending.order.id));
    expect(retried!.status).toBe("fulfilled");
    expect(retried!.supplierResponse).not.toHaveProperty("refundRequired");
    const p2 = await f.tx((tx) => getPayment(tx, f.tenantId, pending.payment!.id));
    expect(paymentRefundRequired(p2!)).toBeNull();
    expect(p2!.failureReason).toBeNull();
  });

  it("an admin failing a PAID slip order flags the payment once (STOREFRONT-09)", async () => {
    const { order, payment } = await create({ packageId: f.manualPackageId });
    await f.tx((tx) => markPaid(tx, f.tenantId, payment!.id, { verifiedBy: "admin" }));
    expect((await f.tx((tx) => getOrderById(tx, f.tenantId, order.id)))!.status).toBe("processing");
    const r = await f.tx((tx) => failPaidOrder(tx, f.tenantId, order.id, "ลูกค้ากรอก UID ผิด", { by: "admin-1" }));
    expect(r.ok && r.value.refundRequired && !r.value.refunded).toBe(true);
    const p = await f.tx((tx) => getPayment(tx, f.tenantId, payment!.id));
    expect(paymentRefundRequired(p!)).toBe("ลูกค้ากรอก UID ผิด");
    const again = await f.tx((tx) => failPaidOrder(tx, f.tenantId, order.id, "again"));
    expect(!again.ok && again.error).toBe("closed");
    expect((await outbox("payment.refund_required")).filter((e) => e.payload.paymentId === payment!.id)).toHaveLength(1);
  });

  it("a second payment for an already paid order is flagged as ชำระซ้ำ", async () => {
    const { order, payment } = await create({ packageId: f.manualPackageId });
    await f.tx((tx) => markPaid(tx, f.tenantId, payment!.id, { verifiedBy: "admin" }));
    const dup = await f.tx(async (tx) => {
      const [p] = await tx.insert(payments).values({ tenantId: f.tenantId, refType: "topup", refId: order.id, provider: "bank_transfer", method: "slip", status: "pending", amount: order.price }).returning();
      return markPaid(tx, f.tenantId, p!.id, { verifiedBy: "admin" });
    });
    expect(paymentRefundRequired(dup)).toMatch(/^ชำระซ้ำ/);
  });

  it("wallet order whose refund cannot be credited (frozen) is flagged instead of throwing", async () => {
    const w = await create({ packageId: f.manualPackageId, paymentMethod: "wallet" });
    expect(w.order.status).toBe("processing");
    await f.tx((tx) => tx.update(wallets).set({ frozen: true }).where(and(eq(wallets.tenantId, f.tenantId), eq(wallets.customerId, f.customerId))));
    const r = await f.tx((tx) => failPaidOrder(tx, f.tenantId, w.order.id, "out_of_stock"));
    await f.tx((tx) => tx.update(wallets).set({ frozen: false }).where(and(eq(wallets.tenantId, f.tenantId), eq(wallets.customerId, f.customerId))));
    expect(r.ok && r.value.refundRequired).toBe(true);
    expect(paymentRefundRequired((await f.tx((tx) => getPayment(tx, f.tenantId, w.order.paymentId!)))!)).toBe("สินค้าหมด");
  });
});

describe("frozen wallet top-up (SERVICES-07)", () => {
  it("markPaid does not throw: payment paid + flagged, top-up rejected, never credited later", async () => {
    const t = await f.tx((tx) => createWalletTopup(tx, f.tenantId, { customerId: f.vipCustomerId, amount: 5000, bonusPercent: 2, method: "slip", settings: f.settings }));
    if (!t.ok) throw new Error("topup");
    await f.tx((tx) => tx.update(wallets).set({ frozen: true }).where(eq(wallets.id, t.value.topup.walletId)));
    const before = (await f.tx((tx) => getWallet(tx, f.tenantId, f.vipCustomerId)))!.balance;
    const paid = await f.tx((tx) => attachSlip(tx, f.tenantId, t.value.payment.id, { url: "/uploads/slip.png" }, { autoApprove: true }));
    expect(paid.status).toBe("paid");
    expect(paymentRefundRequired(paid)).toMatch(/ระงับ/);
    expect((await f.tx((tx) => getWalletTopup(tx, f.tenantId, t.value.topup.id)))!.status).toBe("rejected");
    await f.tx((tx) => tx.update(wallets).set({ frozen: false }).where(eq(wallets.id, t.value.topup.walletId)));
    const topup = (await f.tx((tx) => getWalletTopup(tx, f.tenantId, t.value.topup.id)))!;
    await f.tx((tx) => reconcileWalletTopup(tx, f.tenantId, topup));
    expect((await f.tx((tx) => getWallet(tx, f.tenantId, f.vipCustomerId)))!.balance).toBe(before);
  });
});

describe("createTopupOrder guards (SERVICES-04/08/09/10, STOREFRONT-05/06/07)", () => {
  it("blocked customers are refused: signed in, and a guest typing their phone", async () => {
    const blocked = await f.tx(async (tx) => {
      const [c] = await tx.insert(customers).values({ tenantId: f.tenantId, phone: "0868000001", name: "Blocked", blockedAt: new Date() }).returning();
      return c!;
    });
    const signedIn = await f.tx((tx) => createTopupOrder(tx, f.tenantId, input({ customer: { id: blocked.id }, contact: "0868000001" })));
    expect(!signedIn.ok && signedIn.code).toBe("customer_blocked");
    if (!signedIn.ok) expect(signedIn.error).toBe("ขออภัย ไม่สามารถทำรายการได้ กรุณาติดต่อร้านโดยตรง");
    const guest = await f.tx((tx) => createTopupOrder(tx, f.tenantId, input({ customer: null, contact: "086-800-0001" })));
    expect(!guest.ok && guest.code).toBe("customer_blocked");
  });

  it("a guest order is never attached to the customer whose phone was typed, and writes no customers row", async () => {
    const n0 = await countCustomers();
    const g = await create({ customer: null, contact: "081-234-5678", ip: "10.9.9.1" }); // the member's phone
    expect(g.order.customerId).toBeNull();
    expect(g.order.contact).toBe("0812345678");
    expect(g.payment!.customerId).toBeNull();
    expect(await f.tx((tx) => getOrderForCustomer(tx, f.tenantId, { number: g.order.number, customerId: f.customerId }))).toBeNull();
    expect((await f.tx((tx) => getOrderForCustomer(tx, f.tenantId, { number: g.order.number, accessKey: g.accessKey })))?.id).toBe(g.order.id);
    await create({ customer: null, contact: "0869990001", ip: "10.9.9.2" }); // brand-new phone
    expect(await countCustomers()).toBe(n0);
  });

  it("refusals (otp_required, rate_limited, out_of_stock) leave no customers row", async () => {
    const n0 = await countCustomers();
    const otp = await f.tx((tx) => createTopupOrder(tx, f.tenantId, input({ customer: null, contact: "0868000003", config: { otpRequiredFirstOrder: true } })));
    expect(!otp.ok && otp.code).toBe("otp_required");
    const limited = await f.tx((tx) => createTopupOrder(tx, f.tenantId, input({ customer: null, contact: "0868000004", config: { maxOrdersPerHour: 1 } })));
    expect(!limited.ok && limited.code).toBe("rate_limited"); // the IP already has orders this hour
    expect(await countCustomers()).toBe(n0);
  });

  it("payment methods the shop disabled are refused server-side (SERVICES-08)", async () => {
    const none = { payments: { enabled: { promptpay: false, bankTransfer: false, wallet: false } } };
    for (const paymentMethod of ["promptpay_qr", "slip", "wallet"] as const) {
      const r = await f.tx((tx) => createTopupOrder(tx, f.tenantId, input({ paymentMethod, settings: none })));
      expect(!r.ok && r.code, paymentMethod).toBe("method_disabled");
    }
    const walletOff = await f.tx((tx) => createTopupOrder(tx, f.tenantId, input({ paymentMethod: "wallet", config: { walletEnabled: false } })));
    expect(!walletOff.ok && walletOff.code).toBe("method_disabled");
    expect(topupPaymentMethods(SETTINGS, { walletEnabled: true })).toEqual(["wallet", "promptpay_qr", "slip"]);
    expect(topupPaymentMethods({ payments: { promptpayId: "0899998888" } }, { walletEnabled: true })).toEqual(["promptpay_qr"]);
  });

  it("guests need a contact; without an IP they are limited per contact; repeat_ip counts the IP only (SERVICES-10)", async () => {
    const noContact = await f.tx((tx) => createTopupOrder(tx, f.tenantId, input({ customer: null, contact: null, ip: null })));
    expect(!noContact.ok && noContact.code).toBe("contact_required");
    const cfg = { maxOrdersPerHour: 2, otpRequiredFirstOrder: false };
    const results: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await f.tx((tx) => createTopupOrder(tx, f.tenantId, input({ customer: null, contact: "qa_line_id_10", ip: null, config: cfg })));
      results.push(r.ok ? "ok" : (r.code ?? r.error));
    }
    expect(results).toEqual(["ok", "ok", "rate_limited"]);
    // a signed-in customer on a fresh IP: no repeat_ip flag even with many own orders
    const fresh = await create({ ip: "10.77.0.1" });
    expect(fresh.order.riskFlags).not.toContain("repeat_ip");
    await create({ ip: "10.77.0.1", customer: { id: f.vipCustomerId }, contact: "0898765432" });
    await create({ ip: "10.77.0.1", customer: null, contact: "0861110001" });
    const fourth = await create({ ip: "10.77.0.1", customer: null, contact: "0861110002" });
    expect(fourth.order.riskFlags).toContain("repeat_ip");
  });
});

describe("outbox payloads (SERVICES-02, SERVICES-03)", () => {
  it("topup.paid / processing / fulfilled carry names, fulfilment, amount, contact and the guest access key", async () => {
    const manual = await create({ packageId: f.manualPackageId, customer: null, contact: "qa@example.com", ip: "10.5.5.5" });
    await f.tx((tx) => markPaid(tx, f.tenantId, manual.payment!.id, { verifiedBy: "admin" }));
    const paid = (await outbox("topup.paid")).find((e) => e.payload.orderId === manual.order.id)!;
    expect(paid.payload).toMatchObject({ number: manual.order.number, gameName: "Test Legends", packageName: "Manual Pack", fulfillment: "manual", amount: 5000, contact: "qa@example.com", email: "qa@example.com", accessKey: manual.accessKey });
    const api = await create({ customer: null, contact: "0861234567", ip: "10.5.5.6" });
    await f.tx((tx) => markPaid(tx, f.tenantId, api.payment!.id, { verifiedBy: "admin" }));
    const done = (await outbox("topup.fulfilled")).find((e) => e.payload.orderId === api.order.id)!;
    expect(done.payload).toMatchObject({ gameName: "Test Legends", packageName: "100 Gems", fulfillment: "api", phone: "0861234567", accessKey: api.accessKey });
    expect(JSON.stringify(done.payload)).not.toMatch(/CODE-/);
  });
});

describe("api fulfilment is idempotent per order (SERVICES-11)", () => {
  it("simulator: deterministic reference per order; a retry of a processing order keeps it", async () => {
    const r = await create({ paymentMethod: "wallet" });
    const key = r.order.id.replace(/-/g, ""); // RV-02: the order UUID, never the (reusable) number
    expect(r.order.supplierRef).toBe(simulatedSupplierRef(f.tenantId, key));
    expect(r.order.supplierResponse).toMatchObject({ simulated: true, idempotencyKey: key });
    await f.tx((tx) => tx.update(topupOrders).set({ status: "paid" }).where(eq(topupOrders.id, r.order.id)));
    const again = await f.tx((tx) => fulfillOrder(tx, f.tenantId, r.order.id));
    expect(again!.supplierRef).toBe(r.order.supplierRef);
    const attempts = (again!.supplierResponse as { attempts: Array<{ action: string }> }).attempts.map((a) => a.action);
    expect(attempts[0]).toBe("submit");
    expect(attempts[1]).toBe("query");
  });

  it("unknown outcome (transport error) stays processing; the retry queries first and never submits twice", async () => {
    registerSupplierAdapter("manual", flaky);
    try {
      mode = "throw";
      const r = await create({ paymentMethod: "wallet", playerFields: { uid: "111222333", server: "EU" } });
      expect(r.order.status).toBe("processing");
      const sr = r.order.supplierResponse as { attempts: Array<{ status: string }>; lastError: string };
      expect(sr.attempts.map((a) => a.status)).toEqual(["unknown"]);
      expect(sr.lastError).toMatch(/socket hang up/);
      mode = "ok";
      await f.tx((tx) => tx.update(topupOrders).set({ status: "paid" }).where(eq(topupOrders.id, r.order.id))); // admin "ลองใหม่"
      const done = await f.tx((tx) => fulfillOrder(tx, f.tenantId, r.order.id));
      const key = r.order.id.replace(/-/g, "");
      expect(done!.status).toBe("fulfilled");
      expect(done!.supplierRef).toBe(`QA-${key}`);
      expect(calls.filter((c) => c === `submit:${key}`)).toHaveLength(1);
      expect(calls).toContain(`query:${key}`);
    } finally {
      registerSupplierAdapter("manual", (await import("../src/services")).simulatorAdapter);
    }
  });
});

describe("public lookup by number is redacted (SERVICES-13)", () => {
  it("no payment method / failure reason without proof; the owner view keeps them", async () => {
    const r = await create({ packageId: f.manualPackageId, paymentMethod: "slip" });
    await f.tx((tx) => markPaid(tx, f.tenantId, r.payment!.id, { verifiedBy: "admin" }));
    await f.tx((tx) => failPaidOrder(tx, f.tenantId, r.order.id, "out_of_stock"));
    const pub = await f.tx((tx) => getOrderByNumber(tx, f.tenantId, r.order.number));
    expect(pub).toMatchObject({ number: r.order.number, status: "failed", paymentMethod: "", failureReason: null, redacted: true });
    expect(pub!.player).toMatch(/\*\*\*\*$/);
  });
});

describe("player-field formats (STOREFRONT-12)", () => {
  const genshin = [
    { key: "uid", label: "UID", type: "text" as const, required: true, pattern: "\\d{9,10}", inputMode: "numeric" as const, hint: "ตัวเลข 9–10 หลัก" },
    { key: "server", label: "Server", type: "select" as const, required: true, options: ["Asia", "EU"] },
  ];
  it("validatePlayerFields enforces pattern / length with a Thai message naming the field", () => {
    expect(validatePlayerFields(genshin, { uid: " 812345678 ", server: "Asia" })).toEqual({ ok: true, value: { uid: "812345678", server: "Asia" } });
    const bad = validatePlayerFields(genshin, { uid: "ทดสอบ🙂", server: "Asia" });
    expect(bad).toMatchObject({ ok: false, code: "invalid_field", key: "uid", message: "UID ไม่ถูกต้อง (ตัวเลข 9–10 หลัก)" });
    expect(validatePlayerFields(genshin, { uid: "12345", server: "Asia" })).toMatchObject({ ok: false, code: "invalid_field" });
    expect(validatePlayerFields(genshin, { server: "Asia" })).toMatchObject({ ok: false, code: "missing_field", message: "กรุณากรอกUID" });
    const riot = [{ key: "riotid", label: "Riot ID#Tag", type: "text" as const, required: true, pattern: "[^#\\s][^#]{2,15}#[A-Za-z0-9]{3,5}" }];
    expect(validatePlayerFields(riot, { riotid: "NoTagHere" }).ok).toBe(false);
    expect(validatePlayerFields(riot, { riotid: "Player One#TH1" }).ok).toBe(true);
    expect(validatePlayerFields([{ key: "a", label: "A", type: "text" as const, maxLength: 5 }], { a: "123456" }).ok).toBe(false);
    expect(validatePlayerFields([{ key: "a", label: "A", type: "text" as const }], { a: "ab\u0000c" }).ok).toBe(false);
  });

  it("unsafe / invalid patterns are ignored instead of hanging the server", () => {
    expect(safeFieldPattern("(a+)+")).toBeNull();
    expect(safeFieldPattern("(\\d*){2,}")).toBeNull();
    expect(safeFieldPattern("(a)\\1")).toBeNull();
    expect(safeFieldPattern("[unclosed")).toBeNull();
    expect(safeFieldPattern("\\d{9,10}")?.test("812345678")).toBe(true);
    expect(safeFieldPattern("\\d{9,10}")?.test("8123456789012")).toBe(false);
  });

  it("createTopupOrder returns invalid_field with the field message", async () => {
    await f.tx((tx) => tx.update(games).set({ fields: genshin }).where(eq(games.id, f.gameId)));
    try {
      const r = await f.tx((tx) => createTopupOrder(tx, f.tenantId, input({ playerFields: { uid: "ทดสอบ🙂", server: "Asia" } })));
      expect(!r.ok && r.code).toBe("invalid_field");
      if (!r.ok) expect(r.error).toBe("UID ไม่ถูกต้อง (ตัวเลข 9–10 หลัก)");
      expect(topupFailureField(r)).toBe("uid"); // the form can mark the field
      expect(topupFailureField({ ok: false })).toBeUndefined();
      const okR = await f.tx((tx) => createTopupOrder(tx, f.tenantId, input({ playerFields: { uid: "812345678", server: "Asia" } })));
      expect(okR.ok).toBe(true);
    } finally {
      await f.tx((tx) => tx.update(games).set({ fields: [{ key: "uid", label: "UID", type: "text", required: true }, { key: "server", label: "Server", type: "select", required: true, options: ["Asia", "EU"] }] }).where(eq(games.id, f.gameId)));
    }
  });
});

describe("recentFeed limit (STOREFRONT-04 follow-up)", () => {
  it("a fractional / non-finite limit is truncated, never passed to SQL as a fraction", async () => {
    const a = await f.tx((tx) => recentFeed(tx, f.tenantId, 2.5));
    expect(a.length).toBeLessThanOrEqual(2);
    const b = await f.tx((tx) => recentFeed(tx, f.tenantId, Number.NaN));
    expect(b.length).toBeLessThanOrEqual(10);
  });
});

describe("cancelUnpaidTopupOrder (for admin / customer cancel)", () => {
  it("voids the payment through the payment layer and refuses a slip under review unless allowed", async () => {
    const a = await create();
    const ok1 = await f.tx((tx) => cancelUnpaidTopupOrder(tx, f.tenantId, a.order.id, { by: "admin", actorId: "admin-1" }));
    expect(ok1.ok && ok1.value.status).toBe("cancelled");
    expect((await f.tx((tx) => getPayment(tx, f.tenantId, a.payment!.id)))!.status).toBe("cancelled");
    expect((await outbox("payment.cancelled")).some((e) => e.payload.paymentId === a.payment!.id)).toBe(true);

    const b = await create();
    await f.tx((tx: Tx) => attachSlip(tx, f.tenantId, b.payment!.id, { url: "/uploads/s.png" }));
    const refused = await f.tx((tx) => cancelUnpaidTopupOrder(tx, f.tenantId, b.order.id, { by: "customer" }));
    expect(!refused.ok && refused.error).toBe("slip_pending");
    const forced = await f.tx((tx) => cancelUnpaidTopupOrder(tx, f.tenantId, b.order.id, { by: "admin", allowSlipPending: true, reason: "สลิปปลอม" }));
    expect(forced.ok && forced.value.failureReason).toBe("สลิปปลอม");
    const again = await f.tx((tx) => cancelUnpaidTopupOrder(tx, f.tenantId, b.order.id, { by: "admin" }));
    expect(!again.ok && again.error).toBe("not_pending");
    expect(walletTopups).toBeTruthy();
  });
});
