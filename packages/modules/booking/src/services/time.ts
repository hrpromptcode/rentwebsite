/**
 * Asia/Bangkok date helpers. Thailand is UTC+07:00 with no DST, so the offset is applied by hand –
 * no extra dependency and no reliance on the server's local timezone.
 */

export const TIMEZONE = "Asia/Bangkok";
export const BKK_OFFSET_MS = 7 * 3_600_000;
export const DAY_MS = 86_400_000;

export interface Ymd {
  y: number;
  /** 1-12 */
  m: number;
  d: number;
}

export interface BkkParts extends Ymd {
  hh: number;
  mm: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

export function toBkkParts(date: Date): BkkParts {
  const t = new Date(date.getTime() + BKK_OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), hh: t.getUTCHours(), mm: t.getUTCMinutes(), weekday: t.getUTCDay() };
}

export function ymdToString({ y, m, d }: Ymd): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Calendar date (YYYY-MM-DD) of an instant in Bangkok. */
export function bkkDateString(date: Date): string {
  return ymdToString(toBkkParts(date));
}

export function parseYmd(s: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

export function parseYm(s: string): { y: number; m: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return { y, m: mo };
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Instant of 00:00 Bangkok time on that calendar date. */
export function bkkDayStart(ymd: Ymd): Date {
  return new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d) - BKK_OFFSET_MS);
}

/** Instant of HH:MM Bangkok time on that calendar date. */
export function bkkTime(ymd: Ymd, hh: number, mm: number): Date {
  return new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, hh, mm) - BKK_OFFSET_MS);
}

/** 0 = Sunday … 6 = Saturday (independent of timezone – computed from the civil date). */
export function weekdayOf(ymd: Ymd): number {
  return new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)).getUTCDay();
}

export function addDays(ymd: Ymd, n: number): Ymd {
  const t = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/**
 * Age in full years on the Bangkok calendar (COR-12: not the server's timezone – a birthday turns over at
 * 00:00 Asia/Bangkok). null for an unknown / impossible / future date.
 */
export function ageOn(birthDate: string | null | undefined, now: Date = new Date()): number | null {
  if (!birthDate) return null;
  const b = parseYmd(birthDate);
  if (!b) return null;
  const t = toBkkParts(now);
  let age = t.y - b.y;
  if (t.m < b.m || (t.m === b.m && t.d < b.d)) age--;
  return age >= 0 && age < 150 ? age : null;
}

/** b − a in whole days. */
export function diffDays(a: Ymd, b: Ymd): number {
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS);
}

/** "HH:MM" or "HH:MM:SS" (Postgres time) → minutes since midnight. */
export function parseHm(s: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(s.trim());
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToHm(min: number): string {
  const hh = Math.floor(min / 60) % 24;
  const mm = min % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** "HH:mm" in Bangkok. */
export function formatBkkTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const p = toBkkParts(d);
  return `${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`;
}

export const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"] as const;
export const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."] as const;
export const THAI_WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"] as const;
export const THAI_WEEKDAYS_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] as const;

/** Buddhist-era Thai date, e.g. "พฤหัสบดี 16 ตุลาคม 2569" (optionally "· 10:30"). */
export function formatThaiDate(date: Date | string, opts: { weekday?: boolean; time?: boolean; short?: boolean } = {}): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const p = toBkkParts(d);
  const month = opts.short ? THAI_MONTHS_SHORT[p.m - 1] : THAI_MONTHS[p.m - 1];
  const year = opts.short ? String(p.y + 543).slice(-2) : String(p.y + 543);
  let out = `${p.d} ${month} ${year}`;
  if (opts.weekday) out = `${opts.short ? THAI_WEEKDAYS_SHORT[p.weekday] + "." : THAI_WEEKDAYS[p.weekday]} ${out}`;
  if (opts.time) out += ` · ${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`;
  return out;
}

/** "YYYY-MM-DD" → "16 ต.ค. 2569" */
export function formatThaiYmd(ymd: string, opts: { weekday?: boolean; short?: boolean } = {}): string {
  const p = parseYmd(ymd);
  if (!p) return ymd;
  return formatThaiDate(bkkDayStart(p), { ...opts, time: false });
}

/** Thai label for the part of day a slot starts in. */
export function dayPartOf(date: Date | string): "morning" | "afternoon" | "evening" {
  const p = toBkkParts(typeof date === "string" ? new Date(date) : date);
  if (p.hh < 12) return "morning";
  if (p.hh < 17) return "afternoon";
  return "evening";
}

/** Google-calendar style UTC stamp for .ics files: 20261016T033000Z */
export function icsStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
