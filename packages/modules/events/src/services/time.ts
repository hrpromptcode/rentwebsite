/**
 * Asia/Bangkok time helpers for events (instants are stored as timestamptz; "day" logic uses the civil Bangkok date).
 * No Date arithmetic in local time: everything goes through UTC + the fixed +07:00 offset, so the server timezone never matters.
 */
export const BKK_OFFSET_MS = 7 * 3_600_000;
export const DAY_MS = 86_400_000;

export const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"] as const;
export const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."] as const;
export const THAI_WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"] as const;
export const THAI_WEEKDAYS_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."] as const;

export const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface BkkParts {
  y: number;
  /** 1-12 */
  m: number;
  d: number;
  /** 0 = Sunday */
  weekday: number;
  hh: number;
  mm: number;
}

/** Civil Bangkok parts of an instant. */
export function bkkParts(date: Date): BkkParts {
  const t = new Date(date.getTime() + BKK_OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), weekday: t.getUTCDay(), hh: t.getUTCHours(), mm: t.getUTCMinutes() };
}

/** Civil Bangkok date (YYYY-MM-DD) of an instant. */
export function bkkDateString(date: Date = new Date()): string {
  const p = bkkParts(date);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Instant of 00:00 Bangkok on that civil date. */
export function bkkDayStart(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new Error(`bad date ${ymd}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - BKK_OFFSET_MS);
}

/** [start, end) of the Bangkok day that contains `date`. */
export function bkkDayBounds(date: Date): { start: Date; end: Date } {
  const start = bkkDayStart(bkkDateString(date));
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

export function isSameBkkDay(a: Date, b: Date): boolean {
  return bkkDateString(a) === bkkDateString(b);
}

/** Instant of "YYYY-MM-DD" + "HH:MM" Bangkok (used by admin forms / seeds). */
export function bkkDateTime(ymd: string, hm = "00:00"): Date {
  const base = bkkDayStart(ymd);
  const [h, m] = hm.split(":").map(Number);
  return new Date(base.getTime() + ((h ?? 0) * 60 + (m ?? 0)) * 60_000);
}

/** "YYYY-MM-DDTHH:MM" in Bangkok for <input type="datetime-local"> values. */
export function toBkkInputValue(date: Date | null | undefined): string {
  if (!date) return "";
  const p = bkkParts(date);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}T${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`;
}

/** Parses "YYYY-MM-DDTHH:MM" (datetime-local, Bangkok) back to an instant; null when malformed. */
export function fromBkkInputValue(v: string | null | undefined): Date | null {
  if (!v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(v.trim());
  if (!m) return null;
  const d = bkkDateTime(m[1]!, `${m[2]}:${m[3]}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const be = (y: number) => y + 543;

/** "ส. 24 ต.ค. 2569" (short) · "วันเสาร์ที่ 24 ตุลาคม 2569" (long) */
export function formatThaiDate(date: Date, style: "short" | "long" = "short"): string {
  const p = bkkParts(date);
  if (style === "long") return `วัน${THAI_WEEKDAYS[p.weekday]}ที่ ${p.d} ${THAI_MONTHS[p.m - 1]} ${be(p.y)}`;
  return `${THAI_WEEKDAYS_SHORT[p.weekday]} ${p.d} ${THAI_MONTHS_SHORT[p.m - 1]} ${be(p.y)}`;
}

/** "19:30 น." */
export function formatThaiTime(date: Date): string {
  const p = bkkParts(date);
  return `${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")} น.`;
}

/** "ส. 24 ต.ค. 2569 19:30 น." */
export function formatThaiDateTime(date: Date, style: "short" | "long" = "short"): string {
  return `${formatThaiDate(date, style)} ${formatThaiTime(date)}`;
}

/** Same day → "ส. 24 ต.ค. 2569 18:00–22:00 น."; across days → "ส. 24 ต.ค. 2569 18:00 น. – อา. 25 ต.ค. 2569 02:00 น." */
export function formatThaiSession(startsAt: Date, endsAt: Date | null | undefined): string {
  if (!endsAt) return formatThaiDateTime(startsAt);
  if (isSameBkkDay(startsAt, endsAt)) {
    const a = bkkParts(startsAt);
    const b = bkkParts(endsAt);
    return `${formatThaiDate(startsAt)} ${String(a.hh).padStart(2, "0")}:${String(a.mm).padStart(2, "0")}–${String(b.hh).padStart(2, "0")}:${String(b.mm).padStart(2, "0")} น.`;
  }
  return `${formatThaiDateTime(startsAt)} – ${formatThaiDateTime(endsAt)}`;
}

/** Date-only range for listings: "24 ต.ค. 2569" or "24–26 ต.ค. 2569" or "30 ต.ค. – 2 พ.ย. 2569". */
export function formatThaiDateRange(startsAt: Date, endsAt: Date | null | undefined): string {
  const a = bkkParts(startsAt);
  if (!endsAt || isSameBkkDay(startsAt, endsAt)) return `${a.d} ${THAI_MONTHS_SHORT[a.m - 1]} ${be(a.y)}`;
  const b = bkkParts(endsAt);
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${THAI_MONTHS_SHORT[a.m - 1]} ${be(a.y)}`;
  if (a.y === b.y) return `${a.d} ${THAI_MONTHS_SHORT[a.m - 1]} – ${b.d} ${THAI_MONTHS_SHORT[b.m - 1]} ${be(a.y)}`;
  return `${a.d} ${THAI_MONTHS_SHORT[a.m - 1]} ${be(a.y)} – ${b.d} ${THAI_MONTHS_SHORT[b.m - 1]} ${be(b.y)}`;
}

/** "อีก 3 วัน" / "วันนี้" / "ผ่านไปแล้ว" relative to `now` (Bangkok days). */
export function daysUntilLabel(startsAt: Date, now: Date = new Date()): string {
  const d = Math.round((bkkDayStart(bkkDateString(startsAt)).getTime() - bkkDayStart(bkkDateString(now)).getTime()) / DAY_MS);
  if (d < 0) return "ผ่านไปแล้ว";
  if (d === 0) return "วันนี้";
  if (d === 1) return "พรุ่งนี้";
  return `อีก ${d} วัน`;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
