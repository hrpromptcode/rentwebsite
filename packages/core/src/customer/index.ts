import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { customers, customerOtps, customerSessions, type Tx } from "@rentweb/db";
import { randomOtp, randomToken, safeEqual, sha256 } from "../crypto";
import { normalizeThaiPhone } from "../utils";

/**
 * Storefront customer authentication (per tenant). Cookie name is the same on every host –
 * cookies are already scoped by hostname, so tenant A's cookie never reaches tenant B.
 */
export const CUSTOMER_COOKIE = "rw_customer";
export const SESSION_DAYS = 60;
export const OTP_TTL_MIN = 5;
export const OTP_MAX_ATTEMPTS = 5;

export interface CustomerSummary {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  lineUserId: string | null;
  tier: string;
  avatar: string | null;
}

function pickCustomer(c: typeof customers.$inferSelect): CustomerSummary {
  return { id: c.id, name: c.name, email: c.email, phone: c.phone, lineUserId: c.lineUserId, tier: c.tier, avatar: c.avatar };
}

/** Resolve the customer behind a raw session token (null when missing/expired). */
export async function getCustomerByToken(tx: Tx, tenantId: string, token: string | undefined | null): Promise<CustomerSummary | null> {
  if (!token) return null;
  const hash = sha256(token);
  const [row] = await tx
    .select({ c: customers })
    .from(customerSessions)
    .innerJoin(customers, eq(customerSessions.customerId, customers.id))
    .where(and(eq(customerSessions.tenantId, tenantId), eq(customerSessions.tokenHash, hash), gt(customerSessions.expiresAt, new Date()), isNull(customers.blockedAt)))
    .limit(1);
  return row ? pickCustomer(row.c) : null;
}

export type OtpTarget = { kind: "phone"; value: string } | { kind: "email"; value: string };

export function parseOtpTarget(input: string): OtpTarget | null {
  const v = input.trim();
  if (v.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? { kind: "email", value: v.toLowerCase() } : null;
  const phone = normalizeThaiPhone(v);
  return phone ? { kind: "phone", value: phone } : null;
}

/**
 * Creates an OTP for a phone/email. Returns the code so the caller can send it via SMS/email/LINE
 * (in development it is also printed to the server console).
 */
export async function requestOtp(tx: Tx, tenantId: string, target: OtpTarget): Promise<{ code: string; expiresAt: Date }> {
  const code = randomOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60_000);
  await tx.insert(customerOtps).values({
    tenantId,
    target: target.value,
    channel: target.kind === "phone" ? "sms" : "email",
    codeHash: sha256(code),
    expiresAt,
  });
  if (process.env.NODE_ENV !== "production") console.log(`[otp] ${target.value} → ${code}`);
  return { code, expiresAt };
}

export type VerifyResult =
  | { ok: true; customer: CustomerSummary; token: string; expiresAt: Date; isNew: boolean }
  | { ok: false; error: "invalid" | "expired" | "too_many" };

/** Verifies an OTP, creates the customer on first login and opens a session. */
export async function verifyOtp(
  tx: Tx,
  tenantId: string,
  target: OtpTarget,
  code: string,
  meta: { name?: string | null; ip?: string | null; userAgent?: string | null } = {},
): Promise<VerifyResult> {
  const [latest] = await tx
    .select()
    .from(customerOtps)
    .where(and(eq(customerOtps.tenantId, tenantId), eq(customerOtps.target, target.value), isNull(customerOtps.consumedAt)))
    .orderBy(desc(customerOtps.createdAt))
    .limit(1);
  if (!latest) return { ok: false, error: "invalid" };
  if (latest.expiresAt < new Date()) return { ok: false, error: "expired" };
  if (latest.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, error: "too_many" };
  if (!safeEqual(latest.codeHash, sha256(code.trim()))) {
    await tx.update(customerOtps).set({ attempts: latest.attempts + 1 }).where(eq(customerOtps.id, latest.id));
    return { ok: false, error: "invalid" };
  }
  await tx.update(customerOtps).set({ consumedAt: new Date() }).where(eq(customerOtps.id, latest.id));

  const where = target.kind === "phone" ? eq(customers.phone, target.value) : eq(customers.email, target.value);
  let [customer] = await tx.select().from(customers).where(and(eq(customers.tenantId, tenantId), where)).limit(1);
  let isNew = false;
  if (!customer) {
    [customer] = await tx
      .insert(customers)
      .values({ tenantId, phone: target.kind === "phone" ? target.value : null, email: target.kind === "email" ? target.value : null, name: meta.name ?? null, lastSeenAt: new Date() })
      .returning();
    isNew = true;
  } else if (meta.name && !customer.name) {
    await tx.update(customers).set({ name: meta.name }).where(eq(customers.id, customer.id));
    customer = { ...customer, name: meta.name };
  }
  const session = await createCustomerSession(tx, tenantId, customer!.id, meta);
  return { ok: true, customer: pickCustomer(customer!), token: session.token, expiresAt: session.expiresAt, isNew };
}

export async function createCustomerSession(tx: Tx, tenantId: string, customerId: string, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await tx.insert(customerSessions).values({ tenantId, customerId, tokenHash: sha256(token), expiresAt, ip: meta.ip ?? null, userAgent: meta.userAgent ?? null });
  await tx.update(customers).set({ lastSeenAt: new Date() }).where(eq(customers.id, customerId));
  return { token, expiresAt };
}

export async function revokeCustomerSession(tx: Tx, tenantId: string, token: string) {
  await tx.delete(customerSessions).where(and(eq(customerSessions.tenantId, tenantId), eq(customerSessions.tokenHash, sha256(token))));
}

/** Find-or-create a customer from contact details collected at checkout (guest flows). */
export async function upsertGuestCustomer(
  tx: Tx,
  tenantId: string,
  input: { phone?: string | null; email?: string | null; name?: string | null },
): Promise<CustomerSummary | null> {
  const phone = input.phone ? normalizeThaiPhone(input.phone) : null;
  const email = input.email?.trim().toLowerCase() || null;
  if (!phone && !email) return null;
  const cond = phone ? eq(customers.phone, phone) : eq(customers.email, email!);
  const [existing] = await tx.select().from(customers).where(and(eq(customers.tenantId, tenantId), cond)).limit(1);
  if (existing) {
    const patch: Partial<typeof customers.$inferInsert> = { lastSeenAt: new Date() };
    if (!existing.name && input.name) patch.name = input.name;
    if (!existing.email && email) patch.email = email;
    await tx.update(customers).set(patch).where(eq(customers.id, existing.id));
    return pickCustomer({ ...existing, ...patch } as typeof customers.$inferSelect);
  }
  const [created] = await tx.insert(customers).values({ tenantId, phone, email, name: input.name ?? null, lastSeenAt: new Date() }).returning();
  return pickCustomer(created!);
}
