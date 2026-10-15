import { randomBytes } from "node:crypto";

/** URL-safe slug that keeps Thai characters (browsers percent-encode them). */
export function slugify(input: string, { allowUnicode = true }: { allowUnicode?: boolean } = {}): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/[\s_]+/g, "-");
  s = allowUnicode ? s.replace(/[^\p{L}\p{M}\p{N}-]+/gu, "") : s.replace(/[^a-z0-9-]+/g, "");
  s = s.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return s || randomSlug();
}

/** Tenant slugs must be DNS-safe (subdomain). */
export function tenantSlug(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return s.length >= 3 ? s : `${s}${randomSlug(4)}`.replace(/^-/, "");
}

export function randomSlug(len = 6): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

/** Human-friendly order numbers e.g. RW-240A7K */
export function shortCode(prefix = "", len = 6): string {
  return `${prefix}${randomSlug(len).toUpperCase()}`;
}

export function pad(n: number, width = 4): string {
  return String(n).padStart(width, "0");
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

/** Typed result for expected failures (stock out, slot taken…). */
export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E; code?: string };
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const fail = <E = string>(error: E, code?: string): Result<never, E> => ({ ok: false, error, code });

export const THAI_PHONE_RE = /^0[0-9]{8,9}$/;
export function normalizeThaiPhone(input: string): string | null {
  const digits = input.replace(/[^0-9+]/g, "");
  if (digits.startsWith("+66")) return `0${digits.slice(3)}`;
  if (digits.startsWith("66") && digits.length >= 11) return `0${digits.slice(2)}`;
  return THAI_PHONE_RE.test(digits) ? digits : null;
}

/** Buddhist-era aware date formatting for Thai UI. */
export function formatDate(
  d: Date | string,
  opts: { locale?: string; timeZone?: string; withTime?: boolean; dateStyle?: "short" | "medium" | "long" } = {},
): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const locale = opts.locale ?? "th-TH";
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : locale, {
    timeZone: opts.timeZone ?? "Asia/Bangkok",
    dateStyle: opts.dateStyle ?? "medium",
    ...(opts.withTime ? { timeStyle: "short" as const } : {}),
  }).format(date);
}
