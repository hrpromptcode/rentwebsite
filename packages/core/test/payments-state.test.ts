import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@rentweb/db/test-utils";
import { clinicPackages, eventsOutbox, orders, patientPackages, patients, payments, reservations, tenants, withTenant } from "@rentweb/db";
import {
  attachSlip,
  canAccessPayment,
  cancelPayment,
  createPayment,
  expireStalePayments,
  isPaymentStateError,
  isStrongPaymentAccess,
  markFailed,
  markPaid,
  paymentRefundRequired,
  refundPayment,
  refundRequired,
  registerPaymentClosedHandler,
  registerPaymentHandler,
  type PaymentClosedInfo,
} from "../src/payments";
import { builtinTargetClosedReason } from "../src/payments/targets";

/**
 * Regression tests for the payment state machine (COR-01, COR-02), refund flagging for closed targets,
 * cancel / expiry hooks (COR-33) and storefront access checks (SEC-009 / SEC-010).
 * refTypes used here ("order", "reservation", "invoice") get test handlers registered in this file only.
 */

let db: TestDb;
let tenantId: string;
const paidCalls: string[] = [];
const closedCalls: Array<{ id: string; info: PaymentClosedInfo }> = [];
let paidOutcome: "ok" | "refund" = "ok";

const tx = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(db, tenantId, fn);

async function newOrder(status = "pending", metadata: Record<string, unknown> = {}) {
  const [o] = await tx((t) => t.insert(orders).values({ tenantId, number: `#${Math.floor(Math.random() * 1e9)}`, status, total: 10000, metadata }).returning());
  return o!;
}
async function newPayment(refId: string, refType: "order" | "reservation" | "invoice" = "order", extra: { customerId?: string; expiresMinutes?: number } = {}) {
  return tx((t) => createPayment(t, tenantId, { refType, refId, amount: 10000, provider: "bank_transfer", method: "slip", ...extra }));
}
async function statusOf(id: string) {
  const [row] = await tx((t) => t.select().from(payments).where(eq(payments.id, id)));
  return row!;
}
async function expectStateError(p: Promise<unknown>) {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(isPaymentStateError(err)).toBe(true);
}

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [t] = await db.insert(tenants).values({ slug: "t-pay-state", name: "Pay", siteType: "shop" }).returning({ id: tenants.id });
  tenantId = t!.id;
  registerPaymentHandler("order", async (_tx, p) => {
    paidCalls.push(p.id);
    if (paidOutcome === "refund") return refundRequired("sold out");
  });
  registerPaymentClosedHandler("order", async (_tx, p, info) => {
    closedCalls.push({ id: p.id, info });
  });
});

describe("state machine (COR-01 / COR-02)", () => {
  it("a cancelled payment cannot get a slip or be marked paid; the paid handler never runs", async () => {
    const o = await newOrder();
    const p = await newPayment(o.id);
    await tx((t) => cancelPayment(t, tenantId, p.id, "customer cancelled", { runHandler: false }));
    await expectStateError(tx((t) => attachSlip(t, tenantId, p.id, { url: "/uploads/x.png" }, { autoApprove: true })));
    await expectStateError(tx((t) => markPaid(t, tenantId, p.id, { verifiedBy: "admin" })));
    const row = await statusOf(p.id);
    expect(row.status).toBe("cancelled");
    expect(row.slipUrl).toBeNull();
    expect(paidCalls).not.toContain(p.id);
  });

  it("a refunded payment is terminal: no slip, no second paid handler run", async () => {
    const o = await newOrder();
    const p = await newPayment(o.id);
    await tx((t) => attachSlip(t, tenantId, p.id, { url: "/uploads/a.png" }, { autoApprove: true }));
    await tx((t) => refundPayment(t, tenantId, p.id));
    expect((await statusOf(p.id)).status).toBe("refunded");
    await expectStateError(tx((t) => attachSlip(t, tenantId, p.id, { url: "/uploads/b.png" }, { autoApprove: true })));
    await expectStateError(tx((t) => markPaid(t, tenantId, p.id)));
    await expectStateError(tx((t) => refundPayment(t, tenantId, p.id)));
    const row = await statusOf(p.id);
    expect(row.status).toBe("refunded");
    expect(row.refundedAmount).toBe(10000);
    expect(paidCalls.filter((id) => id === p.id)).toHaveLength(1);
  });

  it("markPaid is idempotent and auto-approval is strict (no re-opening a rejected slip)", async () => {
    const o = await newOrder();
    const p = await newPayment(o.id);
    await tx((t) => attachSlip(t, tenantId, p.id, { url: "/uploads/c.png" }));
    await tx((t) => markFailed(t, tenantId, p.id, "fake slip"));
    await expectStateError(tx((t) => markPaid(t, tenantId, p.id, { verifiedBy: "auto", strict: true })));
    await expectStateError(tx((t) => attachSlip(t, tenantId, p.id, { url: "/uploads/d.png" }, { autoApprove: true })));
    // an admin may re-approve a rejected slip (money confirmed)
    const paid = await tx((t) => markPaid(t, tenantId, p.id, { verifiedBy: "admin" }));
    expect(paid.status).toBe("paid");
    expect(paid.failureReason).toBeNull();
    await tx((t) => markPaid(t, tenantId, p.id, { verifiedBy: "admin" }));
    expect(paidCalls.filter((id) => id === p.id)).toHaveLength(1);
    await expectStateError(tx((t) => markFailed(t, tenantId, p.id, "too late")));
    await expectStateError(tx((t) => cancelPayment(t, tenantId, p.id, "too late")));
  });

  it("money for a cancelled order is flagged for refund instead of fulfilling it", async () => {
    const o = await newOrder("cancelled");
    const p = await newPayment(o.id);
    await tx((t) => attachSlip(t, tenantId, p.id, { url: "/uploads/e.png" }));
    const paid = await tx((t) => markPaid(t, tenantId, p.id, { verifiedBy: "admin" }));
    expect(paid.status).toBe("paid");
    expect(paymentRefundRequired(paid)).toBe("order cancelled");
    expect(paidCalls).not.toContain(p.id);
    const evs = await db.select().from(eventsOutbox).where(and(eq(eventsOutbox.type, "payment.refund_required")));
    expect(evs.some((e) => (e.payload as { paymentId?: string }).paymentId === p.id)).toBe(true);
  });

  it("built-in patient_package check: cancelled (expired unpaid purchase) and refunded are closed", async () => {
    const [pt] = await tx((t) => t.insert(patients).values({ tenantId, hn: `HN${Math.floor(Math.random() * 1e6)}`, firstName: "Test" }).returning());
    const [pk] = await tx((t) => t.insert(clinicPackages).values({ tenantId, name: "Pack", sessions: 5, price: 10000 }).returning());
    const pack = async (status: string) => {
      const [pp] = await tx((t) => t.insert(patientPackages).values({ tenantId, patientId: pt!.id, packageId: pk!.id, packageName: "Pack", sessionsTotal: 5, pricePaid: 10000, status }).returning());
      return pp!;
    };
    const reasonFor = async (status: string) => {
      const pp = await pack(status);
      const p = await tx((t) => createPayment(t, tenantId, { refType: "patient_package", refId: pp.id, amount: 10000, provider: "promptpay", method: "promptpay_qr" }));
      return tx((t) => builtinTargetClosedReason(t, p));
    };
    expect(await reasonFor("cancelled")).toBe("package cancelled");
    expect(await reasonFor("refunded")).toBe("package refunded");
    expect(await reasonFor("pending")).toBeNull();
    expect(await reasonFor("active")).toBeNull();
    // markPaid on a cancelled purchase (no module handler in this process) flags the refund instead of activating
    const pp = await pack("cancelled");
    const p = await tx((t) => createPayment(t, tenantId, { refType: "patient_package", refId: pp.id, amount: 10000, provider: "promptpay", method: "promptpay_qr" }));
    const paid = await tx((t) => markPaid(t, tenantId, p.id, { verifiedBy: "admin" }));
    expect(paymentRefundRequired(paid)).toBe("package cancelled");
  });

  it("a paid handler can return refundRequired()", async () => {
    const o = await newOrder();
    const p = await newPayment(o.id);
    paidOutcome = "refund";
    try {
      const paid = await tx((t) => markPaid(t, tenantId, p.id, { verifiedBy: "admin" }));
      expect(paymentRefundRequired(paid)).toBe("sold out");
      expect(paid.failureReason).toContain("sold out");
    } finally {
      paidOutcome = "ok";
    }
  });
});

describe("cancel + expiry hooks (COR-33)", () => {
  it("cancelPayment runs the closed handler exactly once", async () => {
    const o = await newOrder();
    const p = await newPayment(o.id);
    const first = await tx((t) => cancelPayment(t, tenantId, p.id, "admin void"));
    const second = await tx((t) => cancelPayment(t, tenantId, p.id, "admin void"));
    expect(first.status).toBe("cancelled");
    expect(second.status).toBe("cancelled");
    expect(closedCalls.filter((c) => c.id === p.id)).toEqual([{ id: p.id, info: { status: "cancelled", reason: "admin void" } }]);
  });

  it("the sweep expires only stale pending payments whose refType has a closed handler", async () => {
    const o1 = await newOrder();
    const stale = await newPayment(o1.id, "order", { expiresMinutes: 30 });
    const o2 = await newOrder();
    const withSlip = await newPayment(o2.id, "order", { expiresMinutes: 30 });
    await tx((t) => attachSlip(t, tenantId, withSlip.id, { url: "/uploads/f.png" }));
    const o3 = await newOrder();
    const inGrace = await newPayment(o3.id, "order", { expiresMinutes: 30 });
    const noHandler = await newPayment(o3.id, "invoice", { expiresMinutes: 30 });
    const hourAgo = new Date(Date.now() - 3_600_000);
    for (const id of [stale.id, withSlip.id, noHandler.id]) await tx((t) => t.update(payments).set({ expiresAt: hourAgo }).where(eq(payments.id, id)));
    await tx((t) => t.update(payments).set({ expiresAt: new Date(Date.now() - 5 * 60_000) }).where(eq(payments.id, inGrace.id)));

    const r = await expireStalePayments(db, { graceMinutes: 15 });
    expect(r.errors).toBe(0);
    expect((await statusOf(stale.id)).status).toBe("expired");
    expect((await statusOf(withSlip.id)).status).toBe("pending_verification");
    expect((await statusOf(inGrace.id)).status).toBe("pending");
    expect((await statusOf(noHandler.id)).status).toBe("pending");
    expect(closedCalls.filter((c) => c.id === stale.id)).toEqual([{ id: stale.id, info: { status: "expired", reason: "หมดเวลาชำระเงิน" } }]);

    // running again changes nothing; an expired payment no longer accepts slips
    await expireStalePayments(db, { graceMinutes: 15 });
    expect(closedCalls.filter((c) => c.id === stale.id)).toHaveLength(1);
    await expectStateError(tx((t) => attachSlip(t, tenantId, stale.id, { url: "/uploads/g.png" }, { autoApprove: true })));
  });
});

describe("storefront access (SEC-009 / SEC-010)", () => {
  it("order: owner session or the access key, compared exactly", async () => {
    const o = await newOrder("pending", { accessKey: "K-123456789" });
    const p = await newPayment(o.id);
    const can = (proof: Parameters<typeof canAccessPayment>[2]) => tx((t) => canAccessPayment(t, p, proof));
    expect(await can({})).toBeNull();
    expect(await can({ accessKey: "K-12345678" })).toBeNull();
    expect(await can({ accessKey: "k-123456789" })).toBeNull();
    expect(await can({ accessKey: "K-123456789" })).toBe("access_key");
    expect(await can({ customerId: "01a13ec5-6a4d-73f9-b3e8-000000000001" })).toBeNull();
  });

  it("reservation: the phone used to book (weak proof, never auto-approves)", async () => {
    const [r] = await tx((t) =>
      t.insert(reservations).values({ tenantId, number: "R-1", name: "Guest", phone: "0812345678", partySize: 2, startsAt: new Date(), endsAt: new Date(Date.now() + 3_600_000) }).returning(),
    );
    const p = await newPayment(r!.id, "reservation");
    const via = await tx((t) => canAccessPayment(t, p, { phone: "081-234-5678" }));
    expect(via).toBe("phone");
    expect(isStrongPaymentAccess(via)).toBe(false);
    expect(await tx((t) => canAccessPayment(t, p, { phone: "0899999999" }))).toBeNull();
  });
});
