import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@rentweb/db/test-utils";
import { withTenant, tenants, payments } from "@rentweb/db";
import { eq } from "drizzle-orm";
import { getCustomerByToken, requestOtp, verifyOtp, upsertGuestCustomer, revokeCustomerSession } from "../src/customer";
import { attachSlip, createPayment, markPaid, refundPayment, registerPaymentHandler } from "../src/payments";

let db: TestDb;
let tenantId: string;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [t] = await db.insert(tenants).values({ slug: "t-core", name: "Core", siteType: "shop" }).returning({ id: tenants.id });
  tenantId = t!.id;
});

describe("customer OTP auth", () => {
  it("issues and verifies an OTP, creating the customer and a session", async () => {
    const target = { kind: "phone" as const, value: "0812345678" };
    const { code } = await withTenant(db, tenantId, (tx) => requestOtp(tx, tenantId, target));
    expect(code).toMatch(/^\d{6}$/);
    const bad = await withTenant(db, tenantId, (tx) => verifyOtp(tx, tenantId, target, "000000"));
    expect(bad.ok).toBe(false);
    const ok = await withTenant(db, tenantId, (tx) => verifyOtp(tx, tenantId, target, code, { name: "สมชาย" }));
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.isNew).toBe(true);
    expect(ok.customer.phone).toBe("0812345678");
    const me = await withTenant(db, tenantId, (tx) => getCustomerByToken(tx, tenantId, ok.token));
    expect(me?.id).toBe(ok.customer.id);
    await withTenant(db, tenantId, (tx) => revokeCustomerSession(tx, tenantId, ok.token));
    expect(await withTenant(db, tenantId, (tx) => getCustomerByToken(tx, tenantId, ok.token))).toBeNull();
  });

  it("cannot reuse a consumed code", async () => {
    const target = { kind: "email" as const, value: "a@b.co" };
    const { code } = await withTenant(db, tenantId, (tx) => requestOtp(tx, tenantId, target));
    const first = await withTenant(db, tenantId, (tx) => verifyOtp(tx, tenantId, target, code));
    expect(first.ok).toBe(true);
    const second = await withTenant(db, tenantId, (tx) => verifyOtp(tx, tenantId, target, code));
    expect(second.ok).toBe(false);
  });

  it("guest upsert reuses the same customer by phone", async () => {
    const a = await withTenant(db, tenantId, (tx) => upsertGuestCustomer(tx, tenantId, { phone: "089 999 8888", name: "Guest" }));
    const b = await withTenant(db, tenantId, (tx) => upsertGuestCustomer(tx, tenantId, { phone: "+66899998888" }));
    expect(a?.id).toBe(b?.id);
  });
});

describe("payments", () => {
  it("creates a PromptPay payment, attaches a slip and runs the paid handler once", async () => {
    const calls: string[] = [];
    registerPaymentHandler("order", async (_tx, p) => {
      calls.push(p.id);
    });
    const payment = await withTenant(db, tenantId, (tx) =>
      createPayment(tx, tenantId, { refType: "order", refId: "01a13ec5-6a4d-73f9-b3e8-769776341e9b", amount: 59000, provider: "promptpay", method: "promptpay_qr", promptpayId: "0812345678", expiresMinutes: 30 }),
    );
    expect(payment.qrPayload).toContain("5406590.00");
    expect(payment.status).toBe("pending");

    const pending = await withTenant(db, tenantId, (tx) => attachSlip(tx, tenantId, payment.id, { url: "/uploads/slip.jpg" }));
    expect(pending.status).toBe("pending_verification");

    const paid = await withTenant(db, tenantId, (tx) => markPaid(tx, tenantId, payment.id, { verifiedBy: "test" }));
    expect(paid.status).toBe("paid");
    await withTenant(db, tenantId, (tx) => markPaid(tx, tenantId, payment.id));
    expect(calls).toEqual([payment.id]);

    const refunded = await withTenant(db, tenantId, (tx) => refundPayment(tx, tenantId, payment.id, 10000));
    expect(refunded.status).toBe("partially_refunded");
    const [row] = await withTenant(db, tenantId, (tx) => tx.select().from(payments).where(eq(payments.id, payment.id)));
    expect(row!.refundedAmount).toBe(10000);
  });

  it("auto-approves slips when asked", async () => {
    const payment = await withTenant(db, tenantId, (tx) => createPayment(tx, tenantId, { refType: "booking", refId: "01a13ec5-6a4d-73f9-b3e8-769776341e9c", amount: 50000, provider: "bank_transfer", method: "slip" }));
    const paid = await withTenant(db, tenantId, (tx) => attachSlip(tx, tenantId, payment.id, { url: "/uploads/x.jpg" }, { autoApprove: true }));
    expect(paid.status).toBe("paid");
  });
});
