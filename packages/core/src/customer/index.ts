import { and, desc, eq, gt, gte, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { customers, customerOtps, customerSessions, type Tx } from "@rentweb/db";
import { randomOtp, randomToken, safeEqual, sha256 } from "../crypto";
import { isUuid, normalizeThaiPhone } from "../utils";

export { clientIp, isHttpsRequest, normalizeIp, trustedProxyHops } from "./request-meta";

/**
 * Storefront customer authentication (per tenant). Cookie name is the same on every host –
 * cookies are already scoped by hostname, so tenant A's cookie never reaches tenant B.
 *
 * Identity rules (account-takeover hardening, SS-02 / SBR-017):
 * - A customer's phone / e-mail is only written when the record is created: by an OTP login for
 *   that exact value, or by a guest flow creating a brand-new record.
 * - Guest flows (checkout, booking, reservation) are unverified: they look a customer up by ONE
 *   key (phone first, else e-mail), never add or change identity fields on an existing record,
 *   and a new guest record only gets that one key. The other contact stays on the order/booking.
 *   Otherwise anyone could attach their own e-mail to a stranger's phone-only account at
 *   checkout and then sign into that account with an e-mail OTP.
 */
export const CUSTOMER_COOKIE = "rw_customer";
export const SESSION_DAYS = 60;
export const OTP_TTL_MIN = 5;
/** Wrong guesses allowed per code. */
export const OTP_MAX_ATTEMPTS = 5;
/** Minimum gap between two codes for the same phone / e-mail. */
export const OTP_REQUEST_COOLDOWN_SEC = 60;
/** Codes per phone / e-mail per hour. */
export const OTP_MAX_REQUESTS_PER_HOUR = 5;
/** Codes per client IP per hour (per tenant). */
export const OTP_MAX_REQUESTS_PER_IP_HOUR = 20;
/** Wrong guesses per phone / e-mail per hour across all codes – asking for a new code does not reset this. */
export const OTP_MAX_FAILED_PER_HOUR = 10;

const HOUR_MS = 3_600_000;

export interface CustomerSummary {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  lineUserId: string | null;
  tier: string;
  avatar: string | null;
}

type CustomerRow = typeof customers.$inferSelect;

function pickCustomer(c: CustomerRow): CustomerSummary {
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

export type OtpLimitReason = "cooldown" | "target_limit" | "ip_limit" | "locked";

/** Thrown by requestOtp when the phone/e-mail or the client IP asked for too many codes. */
export class OtpRateLimitError extends Error {
  readonly reason: OtpLimitReason;
  readonly retryAfterSec: number;
  constructor(reason: OtpLimitReason, retryAfterSec: number) {
    super(`otp rate limited (${reason}), retry in ${retryAfterSec}s`);
    this.name = "OtpRateLimitError";
    this.reason = reason;
    this.retryAfterSec = retryAfterSec;
  }
}

/** Serialises OTP request/verify for one tenant+target until the current transaction ends. */
async function lockOtpTarget(tx: Tx, tenantId: string, target: string) {
  const key = `otp:${tenantId}:${target}`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
}

type OtpWindowRow = { createdAt: Date; attempts: number; consumedAt: Date | null };

/** The target's codes from the last hour, newest first. */
async function otpWindow(tx: Tx, tenantId: string, target: string, now: number): Promise<OtpWindowRow[]> {
  return tx
    .select({ createdAt: customerOtps.createdAt, attempts: customerOtps.attempts, consumedAt: customerOtps.consumedAt })
    .from(customerOtps)
    .where(and(eq(customerOtps.tenantId, tenantId), eq(customerOtps.target, target), gte(customerOtps.createdAt, new Date(now - HOUR_MS))))
    .orderBy(desc(customerOtps.createdAt))
    .limit(100);
}

/** Wrong guesses in the window (the last attempt on a consumed code was the correct one). */
function failedGuesses(rows: OtpWindowRow[]): number {
  return rows.reduce((n, r) => n + Math.max(0, r.attempts - (r.consumedAt ? 1 : 0)), 0);
}

const isLoopback = (ip: string) => ip === "::1" || ip.startsWith("127.") || ip.startsWith("::ffff:127.");

const secondsUntil = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

/**
 * Creates an OTP for a phone/email. Returns the code so the caller can send it via SMS/email/LINE
 * (in development it is also printed to the server console). Throws OtpRateLimitError when the
 * target asks again within the cooldown, exceeded its hourly cap, is locked out after too many
 * wrong guesses, or the client IP exceeded its hourly cap.
 */
export async function requestOtp(tx: Tx, tenantId: string, target: OtpTarget, meta: { ip?: string | null } = {}): Promise<{ code: string; expiresAt: Date }> {
  await lockOtpTarget(tx, tenantId, target.value);
  const now = Date.now();
  const rows = await otpWindow(tx, tenantId, target.value, now);
  if (failedGuesses(rows) >= OTP_MAX_FAILED_PER_HOUR) {
    const oldest = rows[rows.length - 1]!.createdAt.getTime();
    throw new OtpRateLimitError("locked", secondsUntil(oldest + HOUR_MS - now));
  }
  const last = rows[0];
  if (last && now - last.createdAt.getTime() < OTP_REQUEST_COOLDOWN_SEC * 1000) {
    throw new OtpRateLimitError("cooldown", secondsUntil(last.createdAt.getTime() + OTP_REQUEST_COOLDOWN_SEC * 1000 - now));
  }
  if (rows.length >= OTP_MAX_REQUESTS_PER_HOUR) {
    const nth = rows[OTP_MAX_REQUESTS_PER_HOUR - 1]!.createdAt.getTime();
    throw new OtpRateLimitError("target_limit", secondsUntil(nth + HOUR_MS - now));
  }
  const ip = meta.ip?.trim() || null;
  // loopback = local dev or a proxy that does not forward the client IP; limiting it would cap the whole site
  if (ip && !isLoopback(ip)) {
    const [byIp] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(customerOtps)
      .where(and(eq(customerOtps.tenantId, tenantId), eq(customerOtps.ip, ip), gte(customerOtps.createdAt, new Date(now - HOUR_MS))));
    if (Number(byIp?.n ?? 0) >= OTP_MAX_REQUESTS_PER_IP_HOUR) throw new OtpRateLimitError("ip_limit", 15 * 60);
  }

  const code = randomOtp();
  const expiresAt = new Date(now + OTP_TTL_MIN * 60_000);
  await tx.insert(customerOtps).values({
    tenantId,
    target: target.value,
    channel: target.kind === "phone" ? "sms" : "email",
    codeHash: sha256(code),
    expiresAt,
    ip,
  });
  if (process.env.NODE_ENV !== "production") console.log(`[otp] ${target.value} → ${code}`);
  return { code, expiresAt };
}

export type VerifyResult =
  | { ok: true; customer: CustomerSummary; token: string; expiresAt: Date; isNew: boolean }
  | { ok: false; error: "invalid" | "expired" | "too_many" | "locked" | "blocked" };

/** Thai messages for VerifyResult errors (storefront login). */
export const OTP_VERIFY_ERROR_MESSAGES: Record<Extract<VerifyResult, { ok: false }>["error"], string> = {
  invalid: "รหัสไม่ถูกต้อง",
  expired: "รหัสหมดอายุ กรุณาขอรหัสใหม่",
  too_many: "ลองผิดหลายครั้งเกินไป กรุณาขอรหัสใหม่",
  locked: "ลองรหัสผิดหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง",
  blocked: "บัญชีนี้ถูกระงับการใช้งานโดยร้าน หากมีข้อสงสัยกรุณาติดต่อร้านโดยตรง",
};

/** Verifies an OTP, creates the customer on first login and opens a session. */
export async function verifyOtp(
  tx: Tx,
  tenantId: string,
  target: OtpTarget,
  code: string,
  meta: { name?: string | null; ip?: string | null; userAgent?: string | null } = {},
): Promise<VerifyResult> {
  await lockOtpTarget(tx, tenantId, target.value);
  const now = Date.now();
  if (failedGuesses(await otpWindow(tx, tenantId, target.value, now)) >= OTP_MAX_FAILED_PER_HOUR) return { ok: false, error: "locked" };

  const [latest] = await tx
    .select()
    .from(customerOtps)
    .where(and(eq(customerOtps.tenantId, tenantId), eq(customerOtps.target, target.value), isNull(customerOtps.consumedAt)))
    .orderBy(desc(customerOtps.createdAt))
    .limit(1);
  if (!latest) return { ok: false, error: "invalid" };
  if (latest.expiresAt.getTime() < now) return { ok: false, error: "expired" };
  // Take one attempt atomically BEFORE comparing, so parallel guesses can never exceed the cap
  // (a read-then-write counter loses increments under concurrency).
  const [attempt] = await tx
    .update(customerOtps)
    .set({ attempts: sql`${customerOtps.attempts} + 1` })
    .where(and(eq(customerOtps.id, latest.id), lt(customerOtps.attempts, OTP_MAX_ATTEMPTS), isNull(customerOtps.consumedAt)))
    .returning({ attempts: customerOtps.attempts });
  if (!attempt) return { ok: false, error: "too_many" };
  if (!safeEqual(latest.codeHash, sha256(code.trim()))) return { ok: false, error: "invalid" };
  const [consumed] = await tx
    .update(customerOtps)
    .set({ consumedAt: new Date() })
    .where(and(eq(customerOtps.id, latest.id), isNull(customerOtps.consumedAt)))
    .returning({ id: customerOtps.id });
  if (!consumed) return { ok: false, error: "invalid" };

  let customer = await findCustomerBy(tx, tenantId, target.kind, target.value);
  let isNew = false;
  // ADMIN_B2-13: a customer the shop blocked gets no session (and a clear message instead of a silent bounce)
  if (customer?.blockedAt) return { ok: false, error: "blocked" };
  if (!customer) {
    customer = await insertCustomer(tx, tenantId, target.kind, target.value, meta.name?.trim() || null);
    isNew = true;
  } else if (meta.name && !customer.name) {
    await tx.update(customers).set({ name: meta.name }).where(eq(customers.id, customer.id));
    customer = { ...customer, name: meta.name };
  }
  const session = await createCustomerSession(tx, tenantId, customer.id, meta);
  return { ok: true, customer: pickCustomer(customer), token: session.token, expiresAt: session.expiresAt, isNew };
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

async function findCustomerBy(tx: Tx, tenantId: string, kind: "phone" | "email", value: string): Promise<CustomerRow | undefined> {
  const [row] = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), kind === "phone" ? eq(customers.phone, value) : eq(customers.email, value)))
    .limit(1);
  return row;
}

/** Insert a customer keyed by ONE phone or e-mail; survives a concurrent insert of the same key. */
async function insertCustomer(tx: Tx, tenantId: string, kind: "phone" | "email", value: string, name: string | null): Promise<CustomerRow> {
  const [created] = await tx
    .insert(customers)
    .values({ tenantId, phone: kind === "phone" ? value : null, email: kind === "email" ? value : null, name, lastSeenAt: new Date() })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const existing = await findCustomerBy(tx, tenantId, kind, value);
  if (!existing) throw new Error(`customer insert conflicted but no row found for ${kind}`);
  return existing;
}

/**
 * Find-or-create a customer from contact details collected at checkout (guest flows).
 * The details are NOT verified, so this never writes a phone/e-mail onto an existing customer and
 * never links two contacts together: the customer is identified by the phone when one is given
 * (else by the e-mail), and a new guest record only stores that one key. The full contact stays
 * on the order/booking row itself.
 */
export async function upsertGuestCustomer(
  tx: Tx,
  tenantId: string,
  input: { phone?: string | null; email?: string | null; name?: string | null },
): Promise<CustomerSummary | null> {
  const phone = input.phone ? normalizeThaiPhone(input.phone) : null;
  const email = input.email?.trim().toLowerCase() || null;
  const key = phone ? ({ kind: "phone", value: phone } as const) : email ? ({ kind: "email", value: email } as const) : null;
  if (!key) return null;
  const name = input.name?.trim() || null;
  const existing = await findCustomerBy(tx, tenantId, key.kind, key.value);
  if (existing) {
    const patch: Partial<typeof customers.$inferInsert> = { lastSeenAt: new Date() };
    if (!existing.name && name) patch.name = name; // display name only – never identity fields
    await tx.update(customers).set(patch).where(eq(customers.id, existing.id));
    return pickCustomer({ ...existing, ...patch } as CustomerRow);
  }
  return pickCustomer(await insertCustomer(tx, tenantId, key.kind, key.value, name));
}

/* ------------------------------------------------------------------ */
/* Blocked customers (ADMIN_B2-13)                                      */
/* ------------------------------------------------------------------ */

/** Polite Thai refusal for orders / bookings / reservations by a customer the shop blocked. */
export const CUSTOMER_BLOCKED_MESSAGE = "ขออภัย ไม่สามารถทำรายการได้ กรุณาติดต่อร้านโดยตรง";
export const CUSTOMER_BLOCKED_CODE = "customer_blocked";

/**
 * True when the shop blocked (customers.blocked_at) the customer behind ANY of the given identifiers: the
 * signed-in customer id, or a guest's phone / e-mail that belongs to a blocked customer record. Guest flows
 * call this before creating an order / booking / reservation, so a blocked customer cannot simply check out
 * as a guest with the same phone or e-mail.
 */
export async function isCustomerBlocked(
  tx: Tx,
  tenantId: string,
  who: { customerId?: string | null; phone?: string | null; email?: string | null },
): Promise<boolean> {
  const conds: SQL[] = [];
  if (who.customerId && isUuid(who.customerId)) conds.push(eq(customers.id, who.customerId));
  const phone = who.phone ? normalizeThaiPhone(who.phone) : null;
  if (phone) conds.push(eq(customers.phone, phone));
  const email = who.email?.trim().toLowerCase() || null;
  if (email) conds.push(sql`lower(${customers.email}) = ${email}`);
  if (!conds.length) return false;
  const [row] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), isNotNull(customers.blockedAt), conds.length === 1 ? conds[0]! : or(...conds)))
    .limit(1);
  return !!row;
}
