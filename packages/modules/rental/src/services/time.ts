/**
 * Civil-date helpers for stays (YYYY-MM-DD, Asia/Bangkok). No Date arithmetic in local time: every
 * calculation goes through UTC midnight of the civil date, so the server timezone never matters.
 */
export const BKK_OFFSET_MS = 7 * 3_600_000;
export const DAY_MS = 86_400_000;

export interface Ymd {
  y: number;
  /** 1-12 */
  m: number;
  d: number;
}

export const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function parseYmd(s: string | null | undefined): Ymd | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

export function parseYm(s: string | null | undefined): { y: number; m: number } | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return { y, m: mo };
}

export function ymdToString({ y, m, d }: Ymd): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function isValidYmd(s: string | null | undefined): s is string {
  return !!parseYmd(s);
}

/** Civil Bangkok date of an instant. */
export function bkkDateString(date: Date = new Date()): string {
  const t = new Date(date.getTime() + BKK_OFFSET_MS);
  return ymdToString({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}

/** Instant of 00:00 Bangkok on that date. */
export function bkkDayStart(ymd: string): Date {
  const p = parseYmd(ymd)!;
  return new Date(Date.UTC(p.y, p.m - 1, p.d) - BKK_OFFSET_MS);
}

/** Instant of HH:MM Bangkok on that date. */
export function bkkTime(ymd: string, hm: string): Date {
  const p = parseYmd(ymd)!;
  const [h, m] = hm.split(":").map(Number);
  return new Date(Date.UTC(p.y, p.m - 1, p.d, h ?? 0, m ?? 0) - BKK_OFFSET_MS);
}

export function addDays(ymd: string, n: number): string {
  const p = parseYmd(ymd)!;
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return ymdToString({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}

/** b - a in whole days (negative when b is before a). */
export function diffDays(a: string, b: string): number {
  const pa = parseYmd(a)!;
  const pb = parseYmd(b)!;
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / DAY_MS);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOf(ymd: string): number {
  const p = parseYmd(ymd)!;
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}

/** Every date from `from` (inclusive) to `to` (exclusive) - the nights of a stay. */
export function eachNight(from: string, to: string): string[] {
  const n = diffDays(from, to);
  if (n <= 0) return [];
  return Array.from({ length: n }, (_, i) => addDays(from, i));
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" of the last day of the month. */
export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return ymdToString({ y, m, d: daysInMonth(y, m) });
}

export const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"] as const;
export const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."] as const;
export const THAI_WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"] as const;
export const THAI_WEEKDAYS_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] as const;

/** "16 ต.ค. 2569" / "พฤหัสบดี 16 ตุลาคม 2569" */
export function formatThaiYmd(ymd: string, opts: { weekday?: boolean; short?: boolean; year?: boolean } = {}): string {
  const p = parseYmd(ymd);
  if (!p) return ymd;
  const month = opts.short ? THAI_MONTHS_SHORT[p.m - 1] : THAI_MONTHS[p.m - 1];
  const year = opts.year === false ? "" : ` ${opts.short ? String(p.y + 543).slice(-2) : String(p.y + 543)}`;
  let out = `${p.d} ${month}${year}`;
  if (opts.weekday) out = `${opts.short ? THAI_WEEKDAYS_SHORT[weekdayOf(ymd)] + "." : THAI_WEEKDAYS[weekdayOf(ymd)]} ${out}`;
  return out;
}

/** "16-19 ต.ค. 2569" style range label (check-in to check-out). */
export function formatThaiRange(from: string, to: string): string {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return `${from} - ${to}`;
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${THAI_MONTHS_SHORT[a.m - 1]} ${a.y + 543}`;
  if (a.y === b.y) return `${a.d} ${THAI_MONTHS_SHORT[a.m - 1]} – ${b.d} ${THAI_MONTHS_SHORT[b.m - 1]} ${a.y + 543}`;
  return `${formatThaiYmd(from, { short: true })} – ${formatThaiYmd(to, { short: true })}`;
}

/** Buddhist-era Thai date-time of an instant, e.g. "16 ต.ค. 2569 · 14:05" */
export function formatThaiDateTime(date: Date | string, opts: { time?: boolean } = { time: true }): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const t = new Date(d.getTime() + BKK_OFFSET_MS);
  const ymd = ymdToString({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
  const base = formatThaiYmd(ymd, { short: true });
  return opts.time === false ? base : `${base} · ${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

export function nightsLabel(n: number): string {
  return `${n} คืน`;
}
