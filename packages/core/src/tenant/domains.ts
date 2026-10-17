/**
 * Custom-domain lifecycle (ADMIN_B2-11).
 *
 *  claim  → row `pending` with a per-claim TXT token. A pending/failed claim never routes traffic and never
 *           blocks another tenant: several tenants may claim the same hostname.
 *  verify → TXT `_rentweb.<host>` must equal THIS claim's token (proves DNS control) and the host must point
 *           at the platform (CNAME → `<slug>.<root>` / `cname.<root>`, or an apex A record in EDGE_IPS).
 *           Success makes the row `active` (a partial unique index allows one active row per hostname) and
 *           marks other tenants' open claims of the same hostname `failed`.
 *  route  → `resolveTenantByHost` only joins `status = 'active'` rows (see resolve.ts).
 *
 * Functions take the admin db (platform table, no RLS) and return results instead of throwing.
 */
import { and, eq, ne } from "drizzle-orm";
import { tenantDomains, tenants, type DbLike } from "@rentweb/db";
import { randomToken } from "../crypto";
import { rootDomain } from "../env";
import { invalidateHost } from "./resolve";

export type DomainStatus = "pending" | "verifying" | "active" | "failed";

/** Only verified domains may serve a storefront. */
export function isRoutableDomainStatus(status: string | null | undefined): boolean {
  return status === "active";
}

const HOSTNAME_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

/** "https://WWW.Shop.COM:443/some/path" → "www.shop.com" */
export function normalizeDomainInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

/** Thai error message, or null when the hostname may be claimed as a custom domain. */
export function validateCustomHostname(hostname: string): string | null {
  if (!HOSTNAME_RE.test(hostname)) return "ชื่อโดเมนไม่ถูกต้อง เช่น www.myshop.com";
  const root = rootDomain().toLowerCase();
  if (hostname === root || hostname.endsWith(`.${root}`)) return `โดเมนภายใต้ ${root} ถูกจัดการโดยระบบอยู่แล้ว`;
  return null;
}

export function txtRecordName(hostname: string): string {
  return `_rentweb.${hostname}`;
}

/** What the owner must add at their DNS provider. */
export function domainDnsInstructions(hostname: string, token: string, tenantSlug: string) {
  return {
    txt: { name: txtRecordName(hostname), value: token },
    cname: { name: hostname, value: `${tenantSlug}.${rootDomain()}` },
  };
}

export interface DomainDnsResolver {
  resolveTxt(name: string): Promise<string[][]>;
  resolveCname(name: string): Promise<string[]>;
  resolve4(name: string): Promise<string[]>;
}

async function systemResolver(): Promise<DomainDnsResolver> {
  const { promises } = await import("node:dns");
  return promises;
}

export interface DomainDnsCheck {
  txtOk: boolean;
  routeOk: boolean;
  /** Thai explanation of the first failing check (null when both pass). */
  error: string | null;
}

/** Checks the TXT ownership proof and that the hostname points at the platform. */
export async function checkCustomDomainDns(
  hostname: string,
  token: string,
  tenantSlug: string,
  resolver?: DomainDnsResolver,
): Promise<DomainDnsCheck> {
  const dns = resolver ?? (await systemResolver());
  const root = rootDomain().toLowerCase();
  const tokenValue = token.trim();
  const bare = tokenValue.replace(/^rentweb-verify=/, "");
  const txt = await dns.resolveTxt(txtRecordName(hostname)).catch(() => [] as string[][]);
  const txtOk =
    !!bare &&
    txt.some((parts) => {
      const v = parts.join("").trim();
      return v === tokenValue || v === bare || v === `rentweb-verify=${bare}`;
    });

  const targets = new Set([`${tenantSlug}.${root}`.toLowerCase(), `cname.${root}`]);
  const cnames = await dns.resolveCname(hostname).catch(() => [] as string[]);
  let routeOk = cnames.some((c) => targets.has(c.toLowerCase().replace(/\.$/, "")));
  if (!routeOk && cnames.length === 0) {
    // apex domains cannot CNAME: accept A records that point at our edge
    const edge = (process.env.EDGE_IPS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (edge.length) {
      const a = await dns.resolve4(hostname).catch(() => [] as string[]);
      routeOk = a.some((ip) => edge.includes(ip));
    }
  }
  const error = !txtOk
    ? `ไม่พบ TXT record ที่ ${txtRecordName(hostname)} ที่ตรงกับรหัสยืนยันของร้าน`
    : !routeOk
      ? `CNAME ของ ${hostname} ยังไม่ชี้ไปที่ ${tenantSlug}.${root}`
      : null;
  return { txtOk, routeOk, error };
}

export type ClaimDomainResult =
  | { ok: true; domain: { id: string; hostname: string; status: "pending"; verificationToken: string } }
  | { ok: false; code: "invalid" | "platform" | "taken" | "duplicate"; error: string };

export const DOMAIN_TAKEN_ERROR = "โดเมนนี้ถูกยืนยันและใช้งานโดยร้านอื่นแล้ว";

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** Adds a pending custom-domain claim for `tenantId`. Does not route anything until verified. */
export async function claimCustomDomain(db: DbLike, tenantId: string, rawHostname: string): Promise<ClaimDomainResult> {
  const hostname = normalizeDomainInput(rawHostname);
  const invalid = validateCustomHostname(hostname);
  if (invalid) return { ok: false, code: HOSTNAME_RE.test(hostname) ? "platform" : "invalid", error: invalid };

  const rows = await db
    .select({ id: tenantDomains.id, tenantId: tenantDomains.tenantId, status: tenantDomains.status })
    .from(tenantDomains)
    .where(eq(tenantDomains.hostname, hostname));
  if (rows.some((r) => r.tenantId !== tenantId && isRoutableDomainStatus(r.status))) return { ok: false, code: "taken", error: DOMAIN_TAKEN_ERROR };
  if (rows.some((r) => r.tenantId === tenantId)) return { ok: false, code: "duplicate", error: "ร้านนี้เพิ่มโดเมนนี้ไว้แล้ว" };

  const verificationToken = `rentweb-verify=${randomToken(16)}`;
  try {
    const [row] = await db
      .insert(tenantDomains)
      .values({ tenantId, hostname, kind: "custom", status: "pending", verificationToken })
      .returning({ id: tenantDomains.id });
    return { ok: true, domain: { id: row!.id, hostname, status: "pending", verificationToken } };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, code: "duplicate", error: "ร้านนี้เพิ่มโดเมนนี้ไว้แล้ว" };
    throw err;
  }
}

export type VerifyDomainResult =
  | { ok: true; status: "active"; hostname: string; message: string }
  | {
      ok: false;
      status: DomainStatus;
      code: "not_found" | "not_custom" | "txt_missing" | "cname_mismatch" | "taken";
      hostname?: string;
      error: string;
    };

/** Runs the DNS check for one of `tenantId`'s claims and activates it when ownership is proven. */
export async function verifyCustomDomain(
  db: DbLike,
  tenantId: string,
  domainId: string,
  opts: { resolver?: DomainDnsResolver } = {},
): Promise<VerifyDomainResult> {
  const [d] = await db
    .select({
      id: tenantDomains.id,
      hostname: tenantDomains.hostname,
      kind: tenantDomains.kind,
      status: tenantDomains.status,
      token: tenantDomains.verificationToken,
      slug: tenants.slug,
    })
    .from(tenantDomains)
    .innerJoin(tenants, eq(tenants.id, tenantDomains.tenantId))
    .where(and(eq(tenantDomains.id, domainId), eq(tenantDomains.tenantId, tenantId)))
    .limit(1);
  if (!d) return { ok: false, status: "failed", code: "not_found", error: "ไม่พบโดเมน" };
  if (d.kind !== "custom") return { ok: false, status: d.status, code: "not_custom", hostname: d.hostname, error: "โดเมนย่อยของระบบไม่ต้องยืนยัน" };
  if (d.status === "active") return { ok: true, status: "active", hostname: d.hostname, message: `โดเมน ${d.hostname} ใช้งานได้แล้ว` };

  const now = new Date();
  const [owner] = await db
    .select({ tenantId: tenantDomains.tenantId })
    .from(tenantDomains)
    .where(and(eq(tenantDomains.hostname, d.hostname), eq(tenantDomains.status, "active")))
    .limit(1);
  if (owner && owner.tenantId !== tenantId) {
    await db.update(tenantDomains).set({ status: "failed", lastCheckedAt: now, lastError: DOMAIN_TAKEN_ERROR }).where(eq(tenantDomains.id, d.id));
    return { ok: false, status: "failed", code: "taken", hostname: d.hostname, error: DOMAIN_TAKEN_ERROR };
  }

  let check: DomainDnsCheck;
  try {
    check = await checkCustomDomainDns(d.hostname, d.token ?? "", d.slug, opts.resolver);
  } catch (e) {
    check = { txtOk: false, routeOk: false, error: e instanceof Error ? e.message : "ตรวจสอบ DNS ไม่สำเร็จ" };
  }
  if (check.error) {
    await db.update(tenantDomains).set({ status: "failed", lastCheckedAt: now, lastError: check.error }).where(eq(tenantDomains.id, d.id));
    return { ok: false, status: "failed", code: check.txtOk ? "cname_mismatch" : "txt_missing", hostname: d.hostname, error: check.error };
  }

  try {
    await db
      .update(tenantDomains)
      .set({ status: "active", lastCheckedAt: now, verifiedAt: now, lastError: null, sslStatus: "pending" })
      .where(eq(tenantDomains.id, d.id));
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // another tenant won a concurrent verification of the same hostname
    await db.update(tenantDomains).set({ status: "failed", lastCheckedAt: now, lastError: DOMAIN_TAKEN_ERROR }).where(eq(tenantDomains.id, d.id));
    return { ok: false, status: "failed", code: "taken", hostname: d.hostname, error: DOMAIN_TAKEN_ERROR };
  }
  // ownership proven: every other open claim of this hostname is void
  await db
    .update(tenantDomains)
    .set({ status: "failed", lastCheckedAt: now, lastError: "โดเมนนี้ถูกยืนยันโดยร้านอื่นแล้ว" })
    .where(and(eq(tenantDomains.hostname, d.hostname), ne(tenantDomains.id, d.id), ne(tenantDomains.status, "active")));
  await invalidateHost(d.hostname);
  return { ok: true, status: "active", hostname: d.hostname, message: `ยืนยันโดเมน ${d.hostname} สำเร็จ` };
}

/** Deletes one of `tenantId`'s custom domains and drops the cached host → tenant mapping everywhere. */
export async function removeCustomDomain(
  db: DbLike,
  tenantId: string,
  domainId: string,
): Promise<{ ok: true; hostname: string } | { ok: false; error: string }> {
  const [d] = await db
    .select({ id: tenantDomains.id, kind: tenantDomains.kind, hostname: tenantDomains.hostname })
    .from(tenantDomains)
    .where(and(eq(tenantDomains.id, domainId), eq(tenantDomains.tenantId, tenantId)))
    .limit(1);
  if (!d) return { ok: false, error: "ไม่พบโดเมน" };
  if (d.kind !== "custom") return { ok: false, error: "ไม่สามารถลบโดเมนย่อยของระบบได้" };
  await db.delete(tenantDomains).where(eq(tenantDomains.id, d.id));
  await invalidateHost(d.hostname);
  return { ok: true, hostname: d.hostname };
}
