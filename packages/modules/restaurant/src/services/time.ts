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
}

/**
 * Parses tenant `settings.contact.hours` ([{day, time: "11:00 - 22:00 (kitchen closes 21:30)"}]) into open/close.
 * Uses the first entry; falls back to 10:00-20:00.
 */
export function parseHours(hours: Array<{ day?: string; time?: string }> | undefined | null, fallback: HoursRange = { open: "10:00", close: "20:00" }): HoursRange {
  const first = hours?.find((h) => typeof h?.time === "string");
  if (!first?.time) return fallback;
  const found = [...first.time.matchAll(/(\d{1,2})[:.](\d{2})/g)].map((m) => `${pad2(Number(m[1]))}:${m[2]}`);
  if (found.length < 2) return fallback;
  return { open: found[0]!, close: found[1]! };
}

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
 * (rounded up to the step). Rolls to the next day when today has no slots left.
 */
export function pickupSlots(opts: { hours: HoursRange; now?: Date; leadMinutes?: number; stepMinutes?: number; maxDays?: number; dayLabels?: [string, string] }): Slot[] {
  const now = opts.now ?? new Date();
  const lead = opts.leadMinutes ?? 20;
  const step = opts.stepMinutes ?? 15;
  const maxDays = opts.maxDays ?? 2;
  const [today, tomorrow] = opts.dayLabels ?? ["วันนี้", "พรุ่งนี้"];
  const open = hmToMinutes(opts.hours.open);
  const close = hmToMinutes(opts.hours.close);
  const p = bangkokParts(now);
  const out: Slot[] = [];
  for (let dayOffset = 0; dayOffset < maxDays; dayOffset++) {
    const ymd = addDays(p.ymd, dayOffset);
    let start = open;
    if (dayOffset === 0) {
      const earliest = p.minutes + lead;
      start = Math.max(open, Math.ceil(earliest / step) * step);
    }
    for (let t = start; t <= close - step; t += step) {
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
  const open = hmToMinutes(opts.hours.open);
  const close = hmToMinutes(opts.hours.close);
  const p = bangkokParts(now);
  const out: string[] = [];
  if (opts.ymd < p.ymd) return out;
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
