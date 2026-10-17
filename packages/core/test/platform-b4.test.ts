import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@rentweb/db/test-utils";
import { customerSessions, customers, tenants, withTenant, type Tx } from "@rentweb/db";
import { and, eq } from "drizzle-orm";
import { isCustomerBlocked, OTP_VERIFY_ERROR_MESSAGES, requestOtp, verifyOtp } from "../src/customer";
import { enabledMethods, onlinePaymentMethods, paymentSetupStatus, resolvePromptpayId, thaiMobilePromptpay } from "../src/payments";

describe("payment receivers (ADMIN_B2-04 / ADMIN_B2-09)", () => {
  const fresh = { contact: { phone: "02-123-4567" }, payments: { enabled: { promptpay: true, bankTransfer: true } } };

  it("no receiver → no method at all (no 'slip' fallback)", () => {
    expect(enabledMethods(fresh)).toEqual([]);
    expect(enabledMethods({})).toEqual([]);
    expect(onlinePaymentMethods(fresh)).toEqual([]);
    expect(paymentSetupStatus(fresh)).toEqual({ promptpayId: null, bankAccounts: 0, online: [], ready: false });
  });

  it("a bank account without a number is not a receiver", () => {
    expect(enabledMethods({ payments: { bankAccounts: [{ bank: "SCB", name: "x", number: "" }] } })).toEqual([]);
    expect(enabledMethods({ payments: { bankAccounts: [{ bank: "SCB", name: "x", number: "123-4-56789-0" }] } })).toEqual(["slip"]);
  });

  it("offline methods stay available when the owner enabled them", () => {
    expect(enabledMethods({ payments: { enabled: { cash: true, cod: true } } })).toEqual(["cod", "cash"]);
  });

  it("the contact phone is never a silent PromptPay receiver", () => {
    expect(resolvePromptpayId(fresh)).toBeNull(); // landline, no opt-in
    expect(resolvePromptpayId({ contact: { phone: "089-999-0005" } })).toBeNull(); // mobile, no opt-in
    expect(resolvePromptpayId({ contact: { phone: "02-123-4567" }, payments: { promptpayUseContactPhone: true } })).toBeNull(); // landline even with opt-in
    expect(resolvePromptpayId({ contact: { phone: "089-999-0005" }, payments: { promptpayUseContactPhone: true } })).toBe("0899990005");
    expect(enabledMethods({ contact: { phone: "089-999-0005" }, payments: { promptpayUseContactPhone: true } })).toEqual(["promptpay_qr"]);
  });

  it("explicit PromptPay IDs are normalised and must be a mobile / 13 / 15 digit ID", () => {
    expect(resolvePromptpayId({ payments: { promptpayId: "089-999-0006" } })).toBe("0899990006");
    expect(resolvePromptpayId({ payments: { promptpayId: "1-2345-67890-12-3" } })).toBe("1234567890123");
    expect(resolvePromptpayId({ payments: { promptpayId: "02-123-4567" } })).toBeNull();
    expect(thaiMobilePromptpay("+66 89 999 0006")).toBe("0899990006");
  });
});

describe("blocked customers (ADMIN_B2-13)", () => {
  let db: TestDb;
  let tenantId = "";
  const tx = <T>(fn: (t: Tx) => Promise<T>) => withTenant(db, tenantId, fn);

  beforeAll(async () => {
    ({ db } = await createTestDb());
    const [t] = await db.insert(tenants).values({ slug: "b4-block", name: "B4", siteType: "shop" }).returning();
    tenantId = t!.id;
    await tx((t) => t.insert(customers).values({ tenantId, phone: "0899990004", email: "blocked@example.com", name: "Blocked", blockedAt: new Date() }));
    await tx((t) => t.insert(customers).values({ tenantId, phone: "0899990009", name: "Fine" }));
  });

  it("isCustomerBlocked matches id, phone (any format) or e-mail (any case)", async () => {
    const [b] = await tx((t) => t.select().from(customers).where(eq(customers.phone, "0899990004")));
    expect(await tx((t) => isCustomerBlocked(t, tenantId, { customerId: b!.id }))).toBe(true);
    expect(await tx((t) => isCustomerBlocked(t, tenantId, { phone: "+66 89 999 0004" }))).toBe(true);
    expect(await tx((t) => isCustomerBlocked(t, tenantId, { phone: "0811111111", email: "BLOCKED@example.com" }))).toBe(true);
    expect(await tx((t) => isCustomerBlocked(t, tenantId, { phone: "0899990009" }))).toBe(false);
    expect(await tx((t) => isCustomerBlocked(t, tenantId, {}))).toBe(false);
  });

  it("OTP login of a blocked customer returns 'blocked' and opens no session", async () => {
    const target = { kind: "phone" as const, value: "0899990004" };
    const { code } = await tx((t) => requestOtp(t, tenantId, target));
    const res = await tx((t) => verifyOtp(t, tenantId, target, code));
    expect(res).toEqual({ ok: false, error: "blocked" });
    expect(OTP_VERIFY_ERROR_MESSAGES.blocked).toMatch(/ติดต่อร้าน/);
    const [b] = await tx((t) => t.select().from(customers).where(eq(customers.phone, "0899990004")));
    const sessions = await tx((t) => t.select().from(customerSessions).where(and(eq(customerSessions.tenantId, tenantId), eq(customerSessions.customerId, b!.id))));
    expect(sessions).toHaveLength(0);
  });

  it("other customers still log in", async () => {
    const target = { kind: "phone" as const, value: "0899990009" };
    const { code } = await tx((t) => requestOtp(t, tenantId, target));
    expect((await tx((t) => verifyOtp(t, tenantId, target, code))).ok).toBe(true);
  });
});
