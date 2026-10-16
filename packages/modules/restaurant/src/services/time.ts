/**
 * Pure time helpers for Thailand (Asia/Bangkok, UTC+7, no DST).
 * All public functions are deterministic given `now`, so they are unit-testable.
 */
export const BANGKOK_TZ = "Asia/Bangkok";
const OFFSET = "+07:00";

export interface LocalParts {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
  weekday: number; // 0 = Sunday ... 6 = Saturday (JS convention)
  hh: number;
  mm: number;
  /** minutes since local midnight */
  minutes: number;
  /** YYYY-MM-DD */
  ymd: string;
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** Local calendar parts of an instant in Bangkok. */
export function bangkokParts(date: Date): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: BANGKOK_TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  const y = Number(map.year);
  const m = Number(map.month);
  const d = Number(map.day);
  const hh = Number(map.hour) % 24;
  const mm = Number(map.minute);
  return { y, m, d, weekday: WD[map.weekday!] ?? 0, hh, mm, minutes: hh * 60 + mm, ymd: `${y}-${pad2(m)}-${pad2(d)}` };
}

/** Instant for a Bangkok wall-clock time. `ymd` = YYYY-MM-DD, `hm` = HH:MM. */
export function bangkokDate(ymd: string, hm: string): Date {
  return new Date(`${ymd}T${hm}:00${OFFSET}`);
}

/** Add n days to a YYYY-MM-DD string (calendar arithmetic, no TZ pitfalls). */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
export function minutesToHm(min: number): string {
  return `${pad2(Math.floor(min / 60) % 24)}:${pad2(min % 60)}`;
}

export interface HoursRange {
  open: string; // HH:MM
  close: string; // HH:MM
  /** kitchen close / last order ("ครัวปิด 21:30"), when given (SBR-012) */
  lastOrder?: string;
  /**
   * per weekday (0 = Sunday) hours parsed from all entries ("จันทร์ – ศุกร์", "เสาร์ – อาทิตย์", "จันทร์: ปิด");
   * null = closed that day. Absent = the same hours every day.
   */
  byDay?: Array<HoursRange | null>;
}

type HoursEntry = { day?: string; time?: string };

const LAST_ORDER_RE = /(?:ครัวปิด(?:รับ)?(?:ออเดอร์)?|ออเดอร์สุดท้าย|รับออเดอร์ถึง|สั่งได้ถึง|สั่งอาหารได้ถึง|last\s*orders?|kitchen\s*clos\w*)\s*[:\-]?\s*(\d{1,2})[:.](\d{2})/i;
const DAY_TOKENS: Array<[RegExp, number]> = [
  [/อาทิตย์|\bsun(?:day)?\b/gi, 0],
  [/จันทร์|\bmon(?:day)?\b/gi, 1],
  [/อังคาร|\btue(?:s|sday)?\b/gi, 2],
  [/พุธ|\bwed(?:nesday)?\b/gi, 3],
  [/พฤหัส(?:บดี)?|\bthu(?:rs|rsday)?\b/gi, 4],
  [/ศุกร์|\bfri(?:day)?\b/gi, 5],
  [/เสาร์|\bsat(?:urday)?\b/gi, 6],
];

/** Weekdays named by an hours entry label: "ทุกวัน" / missing → all, "จันทร์ – ศุกร์" → 1..5, "เสาร์, อาทิตย์" → 6,0; null = unrecognised label. */
export function parseDaySpec(day: string | undefined | null): number[] | null {
  const label = (day ?? "").trim();
  if (!label || /ทุกวัน|every\s*day|daily|all\s*days/i.test(label)) return [0, 1, 2, 3, 4, 5, 6];
  const hits: Array<{ at: number; end: number; d: number }> = [];
  for (const [re, d] of DAY_TOKENS) for (const m of label.matchAll(re)) hits.push({ at: m.index ?? 0, end: (m.index ?? 0) + m[0].length, d });
  if (!hits.length) return null;
  hits.sort((a, b) => a.at - b.at);
  const out = new Set<number>();
  for (let i = 0; i < hits.length; i++) {
    const cur = hits[i]!;
    const next = hits[i + 1];
    if (next && /^\s*(?:[-–—~]|ถึง|to)\s*(?:วัน)?\s*$/i.test(label.slice(cur.end, next.at))) {
      for (let d = cur.d; ; d = (d + 1) % 7) {
        out.add(d);
        if (d === next.d) break;
      }
      i++;
    } else out.add(cur.d);
  }
  return [...out];
}

function parseRange(time: string | undefined): HoursRange | null | undefined {
  if (!time) return undefined;
  const last = time.match(LAST_ORDER_RE);
  const rest = last ? time.replace(last[0], " ") : time;
  const found = [...rest.matchAll(/(\d{1,2})[:.](\d{2})/g)].map((m) => `${pad2(Number(m[1]))}:${m[2]}`);
  if (found.length < 2) return /ปิด|closed|หยุด/i.test(time) ? null : undefined;
  return { open: found[0]!, close: found[1]!, ...(last ? { lastOrder: `${pad2(Number(last[1]))}:${last[2]}` } : {}) };
}

/**
 * Parses tenant `settings.contact.hours` ([{day, time: "11:00 - 22:00 (ครัวปิด 21:30)"}]): open/close of the first
 * entry (display), the kitchen's last-order time, and the hours of every weekday from all entries (days no entry
 * names are closed; the most specific entry wins). Falls back to 10:00-20:00.
 */
export function parseHours(hours: HoursEntry[] | undefined | null, fallback: HoursRange = { open: "10:00", close: "20:00" }): HoursRange {
  const entries = (Array.isArray(hours) ? hours : []).filter((h) => typeof h?.time === "string");
  const parsed = entries.map((h) => ({ days: parseDaySpec(h.day), range: parseRange(h.time) }));
  const first = parsed.find((p) => p.range)?.range;
  if (!first) return fallback;
  const dayed = parsed.filter((p) => p.days && p.range !== undefined);
  if (!dayed.length || dayed.every((p) => p.days!.length === 7 && p.range)) return first;
  const byDay: Array<HoursRange | null> = [];
  for (let d = 0; d < 7; d++) {
    const match = dayed.filter((p) => p.days!.includes(d)).sort((a, b) => a.days!.length - b.days!.length)[0];
    byDay.push(match ? (match.range ?? null) : (parsed.find((p) => !p.days && p.range)?.range ?? null));
  }
  return { ...first, byDay };
}

/** Hours on a weekday (0 = Sunday); null when closed. */
export function hoursOnDay(hours: HoursRange, weekday: number): HoursRange | null {
  if (!hours.byDay) return hours;
  return hours.byDay[weekday] ?? null;
}

const weekdayOf = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();

export type MenuSchedule = Array<{ weekdays: number[]; start: string; end: string }>;

/** Empty schedule = always on. Otherwise any window matching the Bangkok weekday + time. */
export function isMenuOpen(schedule: MenuSchedule | null | undefined, now: Date): boolean {
  if (!schedule || schedule.length === 0) return true;
  const p = bangkokParts(now);
  return schedule.some((w) => {
    if (w.weekdays?.length && !w.weekdays.includes(p.weekday)) return false;
    const s = hmToMinutes(w.start);
    const e = hmToMinutes(w.end);
    return s <= e ? p.minutes >= s && p.minutes < e : p.minutes >= s || p.minutes < e; // supports overnight windows
  });
}

export interface Slot {
  /** ISO instant */
  value: string;
  /** "12:15" */
  label: string;
  /** day label (today / tomorrow / YYYY-MM-DD) */
  day: string;
  ymd: string;
}

/**
 * Pickup slots: every `stepMinutes` inside opening hours, starting at least `leadMinutes` after `now`
 * (rounded up to the step). The last slot is the kitchen's last-order time minus `prepMinutes` (SBR-012) and
 * never later than close - step. Closed days are skipped; rolls to the next open day when today has no slots left.
 */
export function pickupSlots(opts: { hours: HoursRange; now?: Date; leadMinutes?: number; stepMinutes?: number; prepMinutes?: number; maxDays?: number; dayLabels?: [string, string] }): Slot[] {
  const now = opts.now ?? new Date();
  const lead = opts.leadMinutes ?? 20;
  const step = opts.stepMinutes ?? 15;
  const prep = Math.max(0, opts.prepMinutes ?? 0);
  const maxDays = opts.maxDays ?? 2;
  const [today, tomorrow] = opts.dayLabels ?? ["วันนี้", "พรุ่งนี้"];
  const p = bangkokParts(now);
  const out: Slot[] = [];
  for (let dayOffset = 0; dayOffset < Math.max(maxDays, opts.hours.byDay ? 8 : maxDays); dayOffset++) {
    const ymd = addDays(p.ymd, dayOffset);
    const h = hoursOnDay(opts.hours, weekdayOf(ymd));
    if (!h) continue;
    const open = hmToMinutes(h.open);
    const close = hmToMinutes(h.close);
    const last = Math.min(close - step, (h.lastOrder ? hmToMinutes(h.lastOrder) : close) - prep);
    let start = open;
    if (dayOffset === 0) {
      const earliest = p.minutes + lead;
      start = Math.max(open, Math.ceil(earliest / step) * step);
    }
    for (let t = start; t <= last; t += step) {
      out.push({ value: bangkokDate(ymd, minutesToHm(t)).toISOString(), label: minutesToHm(t), day: dayOffset === 0 ? today : dayOffset === 1 ? tomorrow : ymd, ymd });
    }
    if (out.length) break; // only roll to the next day when today is empty
  }
  return out;
}

/** Reservation start times for a calendar day (HH:MM), leaving room for the full seating before close. */
export function reservationSlots(opts: { hours: HoursRange; ymd: string; now?: Date; durationMinutes?: number; stepMinutes?: number; leadMinutes?: number }): string[] {
  const now = opts.now ?? new Date();
  const dur = opts.durationMinutes ?? 90;
  const step = opts.stepMinutes ?? 30;
  const lead = opts.leadMinutes ?? 60;
  const p = bangkokParts(now);
  const out: string[] = [];
  if (opts.ymd < p.ymd) return out;
  const h = hoursOnDay(opts.hours, weekdayOf(opts.ymd));
  if (!h) return out; // closed that day
  const open = hmToMinutes(h.open);
  const close = hmToMinutes(h.close);
  for (let t = open; t + dur <= close; t += step) {
    if (opts.ymd === p.ymd && t < p.minutes + lead) continue;
    out.push(minutesToHm(t));
  }
  return out;
}

export function formatThaiDate(d: Date | string, withTime = false): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("th-TH", { timeZone: BANGKOK_TZ, dateStyle: "medium", ...(withTime ? { timeStyle: "short" as const } : {}) }).format(date);
}
export function formatThaiTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("th-TH", { timeZone: BANGKOK_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}
