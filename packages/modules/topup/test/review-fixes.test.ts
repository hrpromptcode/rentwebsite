import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { and, customers, eq, payments, walletTopups, wallets } from "@rentweb/db";
import { attachSlip, createPayment, expireStalePayments, getPayment, markPaid, paymentRefundRequired } from "@rentweb/core/payments";
import { CUSTOMER_BLOCKED_MESSAGE } from "@rentweb/core/customer";
import { thb } from "@rentweb/core/money";
import {
  createTopupOrder,
  createWalletTopup,
  creditWallet,
  getOrderById,
  getWalletTopup,
  reconcileWalletTopup,
  registerSupplierAdapter,
  renewTopupPayment,
  safeFieldPattern,
  simulatorAdapter,
  validatePlayerFields,
  supplierIdempotencyKey,
  topupFailureField,
  topupPaymentLapsed,
  type CreateTopupOrderInput,
  type SupplierAdapter,
} from "../src/services";
import { adminApproveSlip, adminCancelOrder, adminMarkRefunded, adminRejectSlip, getAdminTopupOrder, type Actor } from "../src/admin";
import { ERROR_LABEL, refusalLabel } from "../src/labels";
import { makeFixture, type Fixture } from "./_fixture";

/**
 * Regression tests for the independent review of the top-up fix wave (tooling/qa/bughunt/fixes/topup_review.md).
 * One describe per RV id.
 */

let f: Fixture;
const actor: Actor = { userId: "00000000-0000-4000-8000-0000000000b7", actorType: "user" };

function input(over: Partial<CreateTopupOrderInput> = {}): CreateTopupOrderInput {
  return {
    gameSlug: f.gameSlug,
    packageId: f.manualPackageId,
    playerFields: { uid: "987654321", server: "Asia" },
    paymentMethod: "slip",
    contact: "0812345678",
    customer: { id: f.customerId, tier: "member" },
    ip: "10.7.0.1",
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

beforeAll(async () => {
  f = await makeFixture({ stockCodes: 3 });
  await f.tx((tx) => creditWallet(tx, f.tenantId, { customerId: f.customerId, amount: 1_000_000, reason: "topup" }));
});

describe("refusal copy keeps the service's Thai message and marks the field (RV-01)", () => {
  it("customer_blocked / missing_field / invalid_field come back with specific copy; bare codes use the label", async () => {
    const blocked = await f.tx(async (tx) => {
      const [c] = await tx.insert(customers).values({ tenantId: f.tenantId, phone: "0867000101", name: "Blocked RV", blockedAt: new Date() }).returning();
      return createTopupOrder(tx, f.tenantId, input({ customer: { id: c!.id, tier: "member" }, contact: "0867000101" }));
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(refusalLabel(blocked.code, blocked.error)).toBe(CUSTOMER_BLOCKED_MESSAGE);
    expect(refusalLabel(blocked.code, blocked.error)).not.toBe(ERROR_LABEL.invalid);

    const missing = await f.tx((tx) => createTopupOrder(tx, f.tenantId, input({ playerFields: { server: "Asia" } })));
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(refusalLabel(missing.code, missing.error)).toBe("กรุณากรอกUID");
    expect(topupFailureField(missing)).toBe("uid");

    const badSelect = await f.tx((tx) => createTopupOrder(tx, f.tenantId, input({ playerFields: { uid: "1", server: "Mars" } })));
    expect(badSelect.ok).toBe(false);
    if (badSelect.ok) return;
    expect(refusalLabel(badSelect.code, badSelect.error)).toContain("Server");
    expect(topupFailureField(badSelect)).toBe("server");

    // a code without Thai copy never leaks as is
    expect(refusalLabel("rate_limited", "rate_limited")).toBe(ERROR_LABEL.rate_limited);
    expect(refusalLabel("contact_required", undefined)).toBe(ERROR_LABEL.contact_required);
    expect(refusalLabel("weird_code", "weird_code")).toBe(ERROR_LABEL.invalid);
  });
});

describe("supplier idempotency key survives a rolled-back order number (RV-02)", () => {
  it("the key is the order UUID: a rolled-back submit cannot swallow the next order that reuses TP-n", async () => {
    // a supplier that dedupes by key like a real one: a repeated key returns the first result and credits nothing
    const credited: string[] = [];
    const seen = new Map<string, string>();
    const dedupe: SupplierAdapter = {
      key: "qa-dedupe",
      async submit(i) {
        const known = seen.get(i.idempotencyKey);
        if (known) return { status: "success", ref: known };
        const ref = `REF-${seen.size + 1}`;
        seen.set(i.idempotencyKey, ref);
        credited.push(i.playerFields.uid!);
        return { status: "success", ref };
      },
      async query(key) {
        const ref = seen.get(key);
        return ref ? { status: "success", ref } : { status: "not_found" };
      },
    };
    registerSupplierAdapter("manual", dedupe);
    try {
      let rolledBackNumber = "";
      await expect(
        f.tx(async (tx) => {
          const r = await createTopupOrder(tx, f.tenantId, input({ packageId: f.apiPackageId, paymentMethod: "wallet", playerFields: { uid: "111000111", server: "Asia" } }));
          if (!r.ok) throw new Error(r.error);
          rolledBackNumber = r.value.order.number;
          expect(r.value.order.status).toBe("fulfilled");
          throw new Error("later step failed, whole transaction rolls back");
        }),
      ).rejects.toThrow(/rolls back/);
      const next = await create({ packageId: f.apiPackageId, paymentMethod: "wallet", playerFields: { uid: "222000222", server: "EU" } });
      expect(next.order.number).toBe(rolledBackNumber); // the counter rolled back with the transaction
      expect(next.order.status).toBe("fulfilled");
      expect(credited).toEqual(["111000111", "222000222"]); // the second customer really was topped up
      expect(next.order.supplierRef).toBe("REF-2");
      expect((next.order.supplierResponse as { idempotencyKey: string }).idempotencyKey).toBe(next.order.id.replace(/-/g, ""));
    } finally {
      registerSupplierAdapter("manual", simulatorAdapter);
    }
  });

  it("an order that already used a key keeps it (orders from before the change keep their number key)", () => {
    expect(supplierIdempotencyKey({ id: "0b6c1f7e-8d2a-4c1e-9f3b-1a2b3c4d5e6f", supplierResponse: { idempotencyKey: "TP-1001", attempts: [{}] } })).toBe("TP-1001");
    expect(supplierIdempotencyKey({ id: "0b6c1f7e-8d2a-4c1e-9f3b-1a2b3c4d5e6f", supplierResponse: null })).toBe("0b6c1f7e8d2a4c1e9f3b1a2b3c4d5e6f");
  });
});

describe("a rejected slip / lapsed QR can be paid again (RV-03)", () => {
  it("reject, renew, new open payment (slip upload works); the sweep still closes an unpaid renewal", async () => {
    const { order, payment } = await create();
    await f.tx((tx) => attachSlip(tx, f.tenantId, payment!.id, { url: "/uploads/slip-a.png" }));
    // under review: nothing to renew
    expect(await f.tx((tx) => renewTopupPayment(tx, f.tenantId, order.id, { settings: f.settings }))).toMatchObject({ ok: false, error: "slip_pending" });
    expect((await f.tx((tx) => adminRejectSlip(tx, f.tenantId, order.id, "ยอดไม่ตรง", actor))).ok).toBe(true);
    const failed = (await f.tx((tx) => getPayment(tx, f.tenantId, payment!.id)))!;
    expect(failed.status).toBe("failed");
    expect(topupPaymentLapsed(failed)).toBe(true);
    await expect(f.tx((tx) => attachSlip(tx, f.tenantId, failed.id, { url: "/uploads/slip-b.png" }))).rejects.toThrow(); // the dead end

    const renewed = await f.tx((tx) => renewTopupPayment(tx, f.tenantId, order.id, { settings: f.settings }));
    expect(renewed.ok).toBe(true);
    if (!renewed.ok) return;
    expect(renewed.value.payment.id).not.toBe(payment!.id);
    expect(renewed.value.payment.status).toBe("pending");
    expect(renewed.value.payment.expiresAt).toBeTruthy();
    expect(renewed.value.order.paymentId).toBe(renewed.value.payment.id);
    expect((await f.tx((tx) => getPayment(tx, f.tenantId, payment!.id)))!.status).toBe("cancelled");
    expect((await f.tx((tx) => getOrderById(tx, f.tenantId, order.id)))!.status).toBe("pending_payment"); // voiding the old one did not cancel the order

    // the fresh payment is open: a second renew is refused, a slip can be uploaded
    expect(await f.tx((tx) => renewTopupPayment(tx, f.tenantId, order.id, { settings: f.settings }))).toMatchObject({ ok: false, error: "payment_open" });
    const slipped = await f.tx((tx) => attachSlip(tx, f.tenantId, renewed.value.payment.id, { url: "/uploads/slip-c.png" }));
    expect(slipped.status).toBe("pending_verification");

    // an unpaid renewal is expired by the sweep and closes the order (it is the order's current payment)
    const second = await create();
    await f.tx((tx) => adminRejectSlip(tx, f.tenantId, second.order.id, "สลิปไม่ชัด", actor));
    const r2 = await f.tx((tx) => renewTopupPayment(tx, f.tenantId, second.order.id, { settings: f.settings }));
    if (!r2.ok) throw new Error(r2.error);
    await f.tx((tx) => tx.update(payments).set({ expiresAt: new Date(Date.now() - 3 * 3600_000) }).where(eq(payments.id, r2.value.payment.id)));
    await expireStalePayments(f.db as never, { graceMinutes: 0, refTypes: ["topup"] });
    expect((await f.tx((tx) => getOrderById(tx, f.tenantId, second.order.id)))!.status).toBe("cancelled");
  });

  it("a pending QR past its expiry is renewable; paid / closed orders and disabled methods are refused", async () => {
    const qr = await create({ paymentMethod: "promptpay_qr" });
    await f.tx((tx) => tx.update(payments).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(payments.id, qr.payment!.id)));
    const noMethods = { payments: { enabled: { promptpay: false, bankTransfer: false, wallet: true } } };
    expect(await f.tx((tx) => renewTopupPayment(tx, f.tenantId, qr.order.id, { settings: noMethods }))).toMatchObject({ ok: false, error: "method_disabled" });
    const r = await f.tx((tx) => renewTopupPayment(tx, f.tenantId, qr.order.id, { settings: f.settings }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.payment.method).toBe("promptpay_qr");

    const wallet = await create({ paymentMethod: "wallet" });
    expect(await f.tx((tx) => renewTopupPayment(tx, f.tenantId, wallet.order.id, { settings: f.settings }))).toMatchObject({ ok: false, error: "not_pending" });
    const cancelled = await create();
    await f.tx((tx) => adminCancelOrder(tx, f.tenantId, cancelled.order.id, null, actor));
    expect(await f.tx((tx) => renewTopupPayment(tx, f.tenantId, cancelled.order.id, { settings: f.settings }))).toMatchObject({ ok: false, error: "not_pending" });
  });
});

describe("late money for a cancelled order (RV-04, RV-05)", () => {
  it("approving the late slip reports the refund flag; the shop can record the refund once", async () => {
    const { order, payment } = await create({ paymentMethod: "promptpay_qr" });
    await f.tx((tx) => tx.update(payments).set({ expiresAt: new Date(Date.now() - 3 * 3600_000) }).where(eq(payments.id, payment!.id)));
    await expireStalePayments(f.db as never, { graceMinutes: 0, refTypes: ["topup"] });
    expect((await f.tx((tx) => getOrderById(tx, f.tenantId, order.id)))!.status).toBe("cancelled");

    const approved = await f.tx((tx) => adminApproveSlip(tx, f.tenantId, order.id, actor));
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.value.refundRequired).toMatch(/ยกเลิก/);
    expect(approved.value.order.status).toBe("cancelled"); // never fulfilled

    const detail = (await f.tx((tx) => getAdminTopupOrder(tx, f.tenantId, order.id)))!;
    expect(detail.paymentRefundReason).toMatch(/ยกเลิก/);
    expect(detail.refundRequired).toBe(false); // the order itself carries no flag, only the payment does

    const done = await f.tx((tx) => adminMarkRefunded(tx, f.tenantId, order.id, { note: "โอนคืน 10:00" }, actor));
    expect(done.ok).toBe(true);
    const p = (await f.tx((tx) => getPayment(tx, f.tenantId, payment!.id)))!;
    expect(p.status).toBe("refunded");
    expect(p.refundedAmount).toBe(p.amount);
    expect((await f.tx((tx) => getOrderById(tx, f.tenantId, order.id)))!.status).toBe("refunded");
    expect(await f.tx((tx) => adminMarkRefunded(tx, f.tenantId, order.id, { note: null }, actor))).toMatchObject({ ok: false, code: "already" });
  });

  it("an approval of a normal pending slip reports no refund; a cancelled order without money is not refundable", async () => {
    const { order, payment } = await create();
    await f.tx((tx) => attachSlip(tx, f.tenantId, payment!.id, { url: "/uploads/slip-ok.png" }));
    const approved = await f.tx((tx) => adminApproveSlip(tx, f.tenantId, order.id, actor));
    expect(approved).toMatchObject({ ok: true, value: { refundRequired: null } });
    if (approved.ok) expect(approved.value.order.status).toBe("processing"); // manual queue
    const other = await create();
    await f.tx((tx) => adminCancelOrder(tx, f.tenantId, other.order.id, null, actor));
    expect(await f.tx((tx) => adminMarkRefunded(tx, f.tenantId, other.order.id, { note: null }, actor))).toMatchObject({ ok: false, code: "bad_status" });
  });
});

describe("wallet top-ups (RV-07, RV-08)", () => {
  it("reconcile on read flags the payment when the wallet is frozen (money never silently kept)", async () => {
    const created = await f.tx((tx) => createWalletTopup(tx, f.tenantId, { customerId: f.vipCustomerId, amount: 50_000, method: "slip", settings: f.settings }));
    if (!created.ok) throw new Error(created.error);
    const { topup, payment } = created.value;
    await f.tx(async (tx) => {
      await tx.update(wallets).set({ frozen: true }).where(and(eq(wallets.tenantId, f.tenantId), eq(wallets.id, topup.walletId)));
      // paid somewhere the module's handler was not registered (what reconcile exists for)
      await tx.update(payments).set({ status: "paid", paidAt: new Date() }).where(eq(payments.id, payment.id));
    });
    const after = await f.tx(async (tx) => reconcileWalletTopup(tx, f.tenantId, (await getWalletTopup(tx, f.tenantId, topup.id))!));
    expect(after.status).toBe("rejected");
    const p = (await f.tx((tx) => getPayment(tx, f.tenantId, payment.id)))!;
    expect(paymentRefundRequired(p)).toMatch(/ระงับ/);
    expect((await f.tx((tx) => tx.select().from(walletTopups).where(eq(walletTopups.id, topup.id))))[0]!.creditedAt).toBeNull();
    await f.tx((tx) => tx.update(wallets).set({ frozen: false }).where(eq(wallets.id, topup.walletId)));
  });

  it("a blocked customer cannot open a wallet top-up", async () => {
    const r = await f.tx(async (tx) => {
      const [c] = await tx.insert(customers).values({ tenantId: f.tenantId, phone: "0867000202", name: "Blocked wallet", blockedAt: new Date() }).returning();
      return createWalletTopup(tx, f.tenantId, { customerId: c!.id, amount: 10_000, method: "promptpay_qr", settings: f.settings });
    });
    expect(r).toMatchObject({ ok: false, code: "customer_blocked", error: CUSTOMER_BLOCKED_MESSAGE });
  });
});

describe("shop-supplied player-field patterns cannot hang the server (RV-11)", () => {
  it("every template pattern is accepted and still works", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../../templates/src/topup.ts"), "utf8");
    const patterns = [...src.matchAll(/pattern: ("(?:[^"\\]|\\.)*")/g)].map((m) => JSON.parse(m[1]!) as string);
    expect(patterns.length).toBeGreaterThanOrEqual(8);
    for (const p of patterns) expect(safeFieldPattern(p), p).not.toBeNull();
    expect(safeFieldPattern(String.raw`[^#\s][^#]{2,15}#[A-Za-z0-9]{3,5}`)!.test("ผู้เล่น#TH1")).toBe(true);
    expect(safeFieldPattern(String.raw`(\d{3})+`)!.test("123456")).toBe(true); // exact inner repeat: fixed length per iteration
  });

  it("exponential / high-degree patterns are refused (alternation or nesting under a quantifier, > 4 variable quantifiers)", () => {
    for (const p of [String.raw`(a|aa)+`, String.raw`((a+))+`, String.raw`(\w|\d)*`, String.raw`(?:x|xy){2,}`, String.raw`(a(b|c))+`, String.raw`(?:\d+){3}`, String.raw`\d*\d*\d*\d*\d*x`, String.raw`(a)\1`, String.raw`a**`]) {
      expect(safeFieldPattern(p), p).toBeNull();
    }
    expect(safeFieldPattern(String.raw`\d*\d*\d*\d*x`)).not.toBeNull(); // 4 is the cap
  });

  it("worst-case input against accepted patterns stays fast", () => {
    const attack = ["a".repeat(119) + "!", "1".repeat(119) + "!", "ab".repeat(59) + "!"];
    for (const p of [String.raw`\d*\d*\d*\d*x`, String.raw`[a-z]+[a-z]+[a-z]+[a-z]+!x`, String.raw`(?:ab)*(?:ab)*(?:ab)*(?:ab)*c`, String.raw`\S{3,100}`]) {
      const t = Date.now();
      for (const v of attack) validatePlayerFields([{ key: "uid", label: "UID", type: "text", required: true, pattern: p }], { uid: v });
      expect(Date.now() - t, p).toBeLessThan(1500);
    }
  });
});

describe("short-payment refund reason in baht (RV-09)", () => {
  it("names the amounts in baht, not satang", async () => {
    const { order } = await create();
    const short = await f.tx(async (tx) => {
      const p = await createPayment(tx, f.tenantId, { refType: "topup", refId: order.id, amount: 1000, provider: "bank_transfer", method: "slip", customerId: f.customerId });
      return markPaid(tx, f.tenantId, p.id, { verifiedBy: "qa" });
    });
    const reason = paymentRefundRequired(short)!;
    expect(reason).toContain(thb(1000));
    expect(reason).toContain(thb(order.price));
    expect(reason).not.toContain("สตางค์");
    expect((await f.tx((tx) => getOrderById(tx, f.tenantId, order.id)))!.status).toBe("pending_payment");
  });
});
