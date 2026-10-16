import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "@rentweb/db/test-utils";
import { customerOtps, customers, tenants, withTenant, type Tx } from "@rentweb/db";
import { and, eq } from "drizzle-orm";
import {
  OTP_MAX_ATTEMPTS,
  OtpRateLimitError,
  requestOtp,
  upsertGuestCustomer,
  verifyOtp,
  type OtpTarget,
} from "../src/customer";
import { randomOtp, sha256 } from "../src/crypto";

let db: TestDb;
let tenantId: string;
let seq = 0;
/** Unique Thai mobile number per call. */
const phone = () => `08${String(10_000_000 + ++seq).slice(-8)}`;
const tx = <T>(fn: (t: Tx) => Promise<T>) => withTenant(db, tenantId, fn);

async function login(target: OtpTarget, name?: string) {
  const { code } = await tx((t) => requestOtp(t, tenantId, target));
  const res = await tx((t) => verifyOtp(t, tenantId, target, code, { name }));
  if (!res.ok) throw new Error(`login failed: ${res.error}`);
  return res;
}

async function customerRow(id: string) {
  const [row] = await tx((t) => t.select().from(customers).where(eq(customers.id, id)));
  return row!;
}

/** Insert an OTP row directly (to simulate history inside the rate-limit window). */
async function seedOtp(target: string, opts: { minutesAgo: number; attempts?: number; ip?: string | null; consumed?: boolean }) {
  const createdAt = new Date(Date.now() - opts.minutesAgo * 60_000);
  await tx((t) =>
    t.insert(customerOtps).values({
      tenantId,
      target,
      channel: target.includes("@") ? "email" : "sms",
      codeHash: sha256("999999"),
      attempts: opts.attempts ?? 0,
      expiresAt: new Date(createdAt.getTime() + 5 * 60_000),
      consumedAt: opts.consumed ? createdAt : null,
      ip: opts.ip ?? null,
      createdAt,
    }),
  );
}

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [t] = await db.insert(tenants).values({ slug: "t-auth", name: "Auth", siteType: "shop" }).returning({ id: tenants.id });
  tenantId = t!.id;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("guest checkout never links contacts to an existing customer (SS-02 / SBR-017)", () => {
  it("victim's phone + attacker's e-mail at guest checkout does not open the victim's account", async () => {
    const victimPhone = phone();
    const victim = await login({ kind: "phone", value: victimPhone }, "เหยื่อ");
    const attackerEmail = `attacker+${seq}@example.org`;

    const guest = await tx((t) => upsertGuestCustomer(t, tenantId, { phone: victimPhone, email: attackerEmail, name: "ผู้โจมตี" }));
    // the order may still be filed under the phone's customer, but the e-mail is NOT attached
    expect(guest?.id).toBe(victim.customer.id);
    const row = await customerRow(victim.customer.id);
    expect(row.email).toBeNull();
    expect(row.name).toBe("เหยื่อ"); // existing name is not overwritten either

    const attacker = await login({ kind: "email", value: attackerEmail });
    expect(attacker.customer.id).not.toBe(victim.customer.id);
    expect(attacker.isNew).toBe(true);
    expect(attacker.customer.phone).toBeNull();
  });

  it("an existing e-mail customer + a new phone at guest checkout does not attach the phone", async () => {
    const email = `owner+${seq}@example.org`;
    const owner = await login({ kind: "email", value: email });
    const strangerPhone = phone();
    const guest = await tx((t) => upsertGuestCustomer(t, tenantId, { phone: strangerPhone, email }));
    expect(guest?.id).not.toBe(owner.customer.id);
    expect((await customerRow(owner.customer.id)).phone).toBeNull();
    // the stranger phone's OTP login lands on the guest record, never on the e-mail owner's
    const viaPhone = await login({ kind: "phone", value: strangerPhone });
    expect(viaPhone.customer.id).toBe(guest!.id);
    expect(viaPhone.customer.email).toBeNull();
  });

  it("a new guest record stores only one key, so its other contact can never be used to log in", async () => {
    const p = phone();
    const email = `guest+${seq}@example.org`;
    const guest = await tx((t) => upsertGuestCustomer(t, tenantId, { phone: p, email, name: "Guest" }));
    const row = await customerRow(guest!.id);
    expect(row.phone).toBe(p);
    expect(row.email).toBeNull();
    const viaEmail = await login({ kind: "email", value: email });
    expect(viaEmail.customer.id).not.toBe(guest!.id);
  });

  it("e-mail-only guest flows are keyed by the e-mail", async () => {
    const email = `only+${seq}@example.org`;
    const a = await tx((t) => upsertGuestCustomer(t, tenantId, { email: ` ${email.toUpperCase()} ` }));
    const b = await tx((t) => upsertGuestCustomer(t, tenantId, { email }));
    expect(a?.id).toBe(b?.id);
    expect((await login({ kind: "email", value: email })).customer.id).toBe(a!.id);
  });

  it("COR-28: a second guest order with a new phone and an already-used e-mail does not crash", async () => {
    const email = `shared+${seq}@example.org`;
    const first = await tx((t) => upsertGuestCustomer(t, tenantId, { phone: phone(), email }));
    const second = await tx((t) => upsertGuestCustomer(t, tenantId, { phone: phone(), email }));
    expect(first?.id).toBeTruthy();
    expect(second?.id).toBeTruthy();
    expect(second?.id).not.toBe(first?.id);
    // and an e-mail customer that already exists does not block a guest order either
    await login({ kind: "email", value: `known+${seq}@example.org` });
    await expect(tx((t) => upsertGuestCustomer(t, tenantId, { phone: phone(), email: `known+${seq}@example.org` }))).resolves.toBeTruthy();
  });

  it("returning customer: guest orders by phone, then the phone OTP login sees the same customer", async () => {
    const p = phone();
    const guest = await tx((t) => upsertGuestCustomer(t, tenantId, { phone: p, name: "ลูกค้าเดิม" }));
    const again = await tx((t) => upsertGuestCustomer(t, tenantId, { phone: `+66${p.slice(1)}` }));
    expect(again?.id).toBe(guest?.id);
    const res = await login({ kind: "phone", value: p });
    expect(res.customer.id).toBe(guest!.id);
    expect(res.isNew).toBe(false);
    expect(res.customer.name).toBe("ลูกค้าเดิม");
  });
});

describe("OTP attempts and rate limits (COR-31 / SEC-007 / SS-03)", () => {
  it("compares at most OTP_MAX_ATTEMPTS guesses per code and burns the code afterwards", async () => {
    const target: OtpTarget = { kind: "phone", value: phone() };
    const { code } = await tx((t) => requestOtp(t, tenantId, target));
    const wrong = code === "000000" ? "111111" : "000000";
    const results: string[] = [];
    for (let i = 0; i < OTP_MAX_ATTEMPTS + 2; i++) {
      const r = await tx((t) => verifyOtp(t, tenantId, target, wrong));
      results.push(r.ok ? "ok" : r.error);
    }
    expect(results).toEqual([...Array(OTP_MAX_ATTEMPTS).fill("invalid"), "too_many", "too_many"]);
    const late = await tx((t) => verifyOtp(t, tenantId, target, code));
    expect(late.ok).toBe(false);
    const [row] = await tx((t) => t.select().from(customerOtps).where(and(eq(customerOtps.tenantId, tenantId), eq(customerOtps.target, target.value))));
    expect(row!.attempts).toBe(OTP_MAX_ATTEMPTS);
  });

  it("the correct code still works after a few wrong guesses", async () => {
    const target: OtpTarget = { kind: "phone", value: phone() };
    const { code } = await tx((t) => requestOtp(t, tenantId, target));
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < OTP_MAX_ATTEMPTS - 1; i++) await tx((t) => verifyOtp(t, tenantId, target, wrong));
    const ok = await tx((t) => verifyOtp(t, tenantId, target, code));
    expect(ok.ok).toBe(true);
  });

  it("refuses a second code inside the cooldown", async () => {
    const target: OtpTarget = { kind: "phone", value: phone() };
    await tx((t) => requestOtp(t, tenantId, target));
    const err = await tx((t) => requestOtp(t, tenantId, target)).catch((e) => e);
    expect(err).toBeInstanceOf(OtpRateLimitError);
    expect((err as OtpRateLimitError).reason).toBe("cooldown");
    expect((err as OtpRateLimitError).retryAfterSec).toBeGreaterThan(0);
  });

  it("caps codes per phone per hour", async () => {
    const p = phone();
    for (const m of [50, 40, 30, 20, 10]) await seedOtp(p, { minutesAgo: m });
    const err = await tx((t) => requestOtp(t, tenantId, { kind: "phone", value: p })).catch((e) => e);
    expect((err as OtpRateLimitError).reason).toBe("target_limit");
    // codes older than an hour do not count
    const q = phone();
    for (const m of [120, 110, 100, 90, 80]) await seedOtp(q, { minutesAgo: m });
    await expect(tx((t) => requestOtp(t, tenantId, { kind: "phone", value: q }))).resolves.toHaveProperty("code");
  });

  it("locks the target after too many wrong guesses across codes – a new code does not reset it", async () => {
    const p = phone();
    await seedOtp(p, { minutesAgo: 20, attempts: OTP_MAX_ATTEMPTS });
    await seedOtp(p, { minutesAgo: 10, attempts: OTP_MAX_ATTEMPTS });
    const err = await tx((t) => requestOtp(t, tenantId, { kind: "phone", value: p })).catch((e) => e);
    expect((err as OtpRateLimitError).reason).toBe("locked");
    const v = await tx((t) => verifyOtp(t, tenantId, { kind: "phone", value: p }, "999999"));
    expect(v).toEqual({ ok: false, error: "locked" });
  });

  it("successful logins do not count as failed guesses", async () => {
    const p = phone();
    for (const m of [40, 30, 20]) await seedOtp(p, { minutesAgo: m, attempts: 1, consumed: true });
    await expect(tx((t) => requestOtp(t, tenantId, { kind: "phone", value: p }))).resolves.toHaveProperty("code");
  });

  it("caps codes per client IP per hour", async () => {
    const ip = "203.0.113.77";
    for (let i = 0; i < 20; i++) await seedOtp(phone(), { minutesAgo: 30, ip });
    const err = await tx((t) => requestOtp(t, tenantId, { kind: "phone", value: phone() }, { ip })).catch((e) => e);
    expect((err as OtpRateLimitError).reason).toBe("ip_limit");
    await expect(tx((t) => requestOtp(t, tenantId, { kind: "phone", value: phone() }, { ip: "198.51.100.1" }))).resolves.toHaveProperty("code");
    const [stored] = await tx((t) => t.select().from(customerOtps).where(and(eq(customerOtps.tenantId, tenantId), eq(customerOtps.ip, "198.51.100.1"))));
    expect(stored?.ip).toBe("198.51.100.1");
  });
});

describe("OTP generation (SEC-006)", () => {
  it("uses the CSPRNG, not Math.random", () => {
    const spy = vi.spyOn(Math, "random");
    const codes = new Set(Array.from({ length: 200 }, () => randomOtp()));
    expect(spy).not.toHaveBeenCalled();
    for (const c of codes) expect(c).toMatch(/^[1-9]\d{5}$/);
    expect(codes.size).toBeGreaterThan(150);
  });
});
