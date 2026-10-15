import { and, asc, eq, gt, lt, type Tx } from "@rentweb/db";
import { notInArray } from "drizzle-orm";
import { availabilityOverrides, availabilityRules, bookings, services, staff, staffServices } from "@rentweb/db";
import type { BookingConfig } from "./config";
import { RELEASED_BOOKING_STATUSES } from "./config";
import { addDays, bkkDayStart, bkkTime, daysInMonth, DAY_MS, diffDays, parseHm, parseYm, parseYmd, toBkkParts, weekdayOf, ymdToString, type Ymd } from "./time";

/* ------------------------------------------------------------------ */
/* Pure slot engine                                                    */
/* ------------------------------------------------------------------ */

export interface SlotService {
  id: string;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  /** >1 = class / group – bookings share the slot and are stored without staff */
  capacity: number;
  requiresStaff: boolean;
}

export interface RuleInput {
  staffId: string | null;
  weekday: number;
  /** "HH:MM" or "HH:MM:SS" */
  startTime: string;
  endTime: string;
}

export interface OverrideInput {
  staffId: string | null;
  startsAt: Date;
  endsAt: Date;
  kind: string; // closed | open
}

export interface BookingInput {
  staffId: string | null;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
  partySize?: number;
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
}

export interface SlotEngineInput {
  config: Pick<BookingConfig, "slotMinutes" | "minNoticeHours" | "maxAdvanceDays">;
  service: SlotService;
  /** YYYY-MM-DD in Asia/Bangkok */
  date: string;
  /** specific staff; null / undefined = "ใครก็ได้" (merge every eligible staff) */
  staffId?: string | null;
  /** staff that perform this service (active + online), in display order */
  eligibleStaffIds: string[];
  rules: RuleInput[];
  overrides: OverrideInput[];
  /** non-cancelled bookings that touch the day (± buffers) */
  bookings: BookingInput[];
  now?: Date;
}

export interface Slot {
  /** ISO instant */
  start: string;
  end: string;
  /** staff the slot belongs to; null for "any staff" merges and group services */
  staffId: string | null;
  available: boolean;
  /** seats left (capacity services) or number of free staff ("any staff") – 0/1 for a specific staff */
  remaining: number;
}

interface Interval {
  start: number;
  end: number;
}

/** True when the service is booked as a shared resource (class, couple room…) instead of per staff. */
export function isGroupService(service: Pick<SlotService, "capacity" | "requiresStaff">): boolean {
  return service.capacity > 1 || !service.requiresStaff;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

function subtractIntervals(windows: Interval[], closed: Interval[]): Interval[] {
  let out = windows;
  for (const c of closed) {
    const next: Interval[] = [];
    for (const w of out) {
      if (!overlaps(w, c)) {
        next.push(w);
        continue;
      }
      if (w.start < c.start) next.push({ start: w.start, end: c.start });
      if (c.end < w.end) next.push({ start: c.end, end: w.end });
    }
    out = next;
  }
  return out;
}

/** Day bounds + checks shared by every mode. Returns null when the day is not bookable at all. */
function dayContext(input: SlotEngineInput) {
  const ymd = parseYmd(input.date);
  if (!ymd) return null;
  const now = input.now ?? new Date();
  const today = toBkkParts(now);
  const offset = diffDays(today, ymd);
  if (offset < 0 || offset > input.config.maxAdvanceDays) return null;
  const dayStart = bkkDayStart(ymd).getTime();
  return {
    ymd,
    now,
    weekday: weekdayOf(ymd),
    dayStart,
    dayEnd: dayStart + DAY_MS,
    earliest: now.getTime() + input.config.minNoticeHours * 3_600_000,
  };
}

/**
 * Working windows for one staff (or the business when staffKey is null) on the given day:
 * staff rules override business-hours rules entirely when the staff has any rules of their own;
 * "open" overrides add windows, "closed" overrides cut them.
 */
export function workingWindows(input: SlotEngineInput, staffKey: string | null, ctx: { ymd: Ymd; weekday: number; dayStart: number; dayEnd: number }): Interval[] {
  const { rules, overrides } = input;
  let base: RuleInput[];
  if (staffKey) {
    const own = rules.filter((r) => r.staffId === staffKey);
    base = own.length ? own.filter((r) => r.weekday === ctx.weekday) : rules.filter((r) => r.staffId === null && r.weekday === ctx.weekday);
  } else {
    base = rules.filter((r) => r.staffId === null && r.weekday === ctx.weekday);
  }
  const toInterval = (r: RuleInput): Interval => ({
    start: bkkTime(ctx.ymd, Math.floor(parseHm(r.startTime) / 60), parseHm(r.startTime) % 60).getTime(),
    end: bkkTime(ctx.ymd, Math.floor(parseHm(r.endTime) / 60), parseHm(r.endTime) % 60).getTime(),
  });
  let windows = base.map(toInterval);
  const applies = (o: OverrideInput) => o.staffId === null || o.staffId === staffKey;
  for (const o of overrides) {
    if (o.kind !== "open" || !applies(o)) continue;
    windows.push({ start: Math.max(o.startsAt.getTime(), ctx.dayStart), end: Math.min(o.endsAt.getTime(), ctx.dayEnd) });
  }
  windows = mergeIntervals(windows);
  const closed = overrides.filter((o) => o.kind === "closed" && applies(o)).map((o) => ({ start: o.startsAt.getTime(), end: o.endsAt.getTime() }));
  return subtractIntervals(windows, closed);
}

function candidateStarts(windows: Interval[], durationMs: number, stepMs: number): number[] {
  const out: number[] = [];
  for (const w of windows) {
    for (let s = w.start; s + durationMs <= w.end; s += stepMs) out.push(s);
  }
  return out;
}

function bookingOccupied(b: BookingInput): Interval {
  return { start: b.startsAt.getTime() - (b.bufferBeforeMin ?? 0) * 60_000, end: b.endsAt.getTime() + (b.bufferAfterMin ?? 0) * 60_000 };
}

/** Slots for one specific staff member (capacity 1). */
export function computeStaffSlots(input: SlotEngineInput, staffId: string): Slot[] {
  const ctx = dayContext(input);
  if (!ctx) return [];
  if (!input.eligibleStaffIds.includes(staffId)) return [];
  const { service } = input;
  const durationMs = service.durationMin * 60_000;
  const stepMs = input.config.slotMinutes * 60_000;
  const windows = workingWindows(input, staffId, ctx);
  const own = input.bookings.filter((b) => b.staffId === staffId).map(bookingOccupied);
  const out: Slot[] = [];
  for (const s of candidateStarts(windows, durationMs, stepMs)) {
    if (s < ctx.earliest) continue; // min notice / past → hidden
    const e = s + durationMs;
    const occ: Interval = { start: s - service.bufferBeforeMin * 60_000, end: e + service.bufferAfterMin * 60_000 };
    const free = !own.some((b) => overlaps(occ, b));
    out.push({ start: new Date(s).toISOString(), end: new Date(e).toISOString(), staffId, available: free, remaining: free ? 1 : 0 });
  }
  return out;
}

/** Slots for a shared-capacity service (class / room): business hours, seats = capacity − overlapping bookings. */
export function computeGroupSlots(input: SlotEngineInput): Slot[] {
  const ctx = dayContext(input);
  if (!ctx) return [];
  const { service } = input;
  const durationMs = service.durationMin * 60_000;
  const stepMs = input.config.slotMinutes * 60_000;
  let windows = workingWindows(input, null, ctx);
  // no business-hours rules → union of eligible staff schedules
  if (!input.rules.some((r) => r.staffId === null)) windows = mergeIntervals(input.eligibleStaffIds.flatMap((id) => workingWindows(input, id, ctx)));
  const taken = input.bookings.filter((b) => b.serviceId === service.id && b.staffId === null);
  const out: Slot[] = [];
  for (const s of candidateStarts(windows, durationMs, stepMs)) {
    if (s < ctx.earliest) continue;
    const e = s + durationMs;
    const occ: Interval = { start: s - service.bufferBeforeMin * 60_000, end: e + service.bufferAfterMin * 60_000 };
    const used = taken.filter((b) => overlaps(occ, bookingOccupied(b))).reduce((n, b) => n + (b.partySize ?? 1), 0);
    const remaining = Math.max(0, service.capacity - used);
    out.push({ start: new Date(s).toISOString(), end: new Date(e).toISOString(), staffId: null, available: remaining > 0, remaining });
  }
  return out;
}

/**
 * Slot list for a date. `staffId` omitted = "ใครก็ได้": every eligible staff's slots merged,
 * `remaining` = number of staff free at that time.
 */
export function computeSlots(input: SlotEngineInput): Slot[] {
  if (isGroupService(input.service)) return computeGroupSlots(input);
  if (input.staffId) return computeStaffSlots(input, input.staffId);
  const byStart = new Map<string, Slot>();
  for (const id of input.eligibleStaffIds) {
    for (const s of computeStaffSlots(input, id)) {
      const cur = byStart.get(s.start);
      if (!cur) byStart.set(s.start, { ...s, staffId: null, remaining: s.remaining });
      else cur.remaining += s.remaining;
    }
  }
  return [...byStart.values()]
    .map((s) => ({ ...s, available: s.remaining > 0 }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Eligible staff who are free for a slot starting at `startIso` (used to pick a staff for "any" bookings). */
export function freeStaffAt(input: SlotEngineInput, startIso: string): string[] {
  const startMs = new Date(startIso).getTime();
  return input.eligibleStaffIds.filter((id) => computeStaffSlots(input, id).some((s) => new Date(s.start).getTime() === startMs && s.available));
}

/** Least-booked staff on that day among `candidates` (ties → first in display order). */
export function pickLeastBookedStaff(input: SlotEngineInput, candidates: string[]): string | null {
  if (!candidates.length) return null;
  const ymd = parseYmd(input.date);
  if (!ymd) return candidates[0]!;
  const dayStart = bkkDayStart(ymd).getTime();
  const dayEnd = dayStart + DAY_MS;
  const counts = new Map<string, number>();
  for (const b of input.bookings) {
    if (!b.staffId) continue;
    const t = b.startsAt.getTime();
    if (t >= dayStart && t < dayEnd) counts.set(b.staffId, (counts.get(b.staffId) ?? 0) + 1);
  }
  let best = candidates[0]!;
  for (const id of candidates) if ((counts.get(id) ?? 0) < (counts.get(best) ?? 0)) best = id;
  return best;
}

/* ------------------------------------------------------------------ */
/* DB loaders                                                           */
/* ------------------------------------------------------------------ */

export interface AvailabilityData {
  rules: RuleInput[];
  overrides: OverrideInput[];
  bookings: BookingInput[];
  eligibleStaffIds: string[];
}

/** Loads everything the engine needs for a service within [from, to). */
export async function loadAvailabilityData(tx: Tx, tenantId: string, opts: { serviceId: string; from: Date; to: Date }): Promise<AvailabilityData> {
  const pad = 6 * 3_600_000; // buffers never exceed a few hours
  const from = new Date(opts.from.getTime() - pad);
  const to = new Date(opts.to.getTime() + pad);
  const [rules, overrides, booked, eligible] = await Promise.all([
    tx.select({ staffId: availabilityRules.staffId, weekday: availabilityRules.weekday, startTime: availabilityRules.startTime, endTime: availabilityRules.endTime }).from(availabilityRules).where(eq(availabilityRules.tenantId, tenantId)),
    tx
      .select({ staffId: availabilityOverrides.staffId, startsAt: availabilityOverrides.startsAt, endsAt: availabilityOverrides.endsAt, kind: availabilityOverrides.kind })
      .from(availabilityOverrides)
      .where(and(eq(availabilityOverrides.tenantId, tenantId), lt(availabilityOverrides.startsAt, to), gt(availabilityOverrides.endsAt, from))),
    tx
      .select({
        staffId: bookings.staffId,
        serviceId: bookings.serviceId,
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
        partySize: bookings.partySize,
        bufferBeforeMin: services.bufferBeforeMin,
        bufferAfterMin: services.bufferAfterMin,
      })
      .from(bookings)
      .innerJoin(services, eq(bookings.serviceId, services.id))
      .where(and(eq(bookings.tenantId, tenantId), lt(bookings.startsAt, to), gt(bookings.endsAt, from), notInArray(bookings.status, [...RELEASED_BOOKING_STATUSES]))),
    tx
      .select({ id: staff.id })
      .from(staffServices)
      .innerJoin(staff, eq(staffServices.staffId, staff.id))
      .where(and(eq(staffServices.tenantId, tenantId), eq(staffServices.serviceId, opts.serviceId), eq(staff.active, true), eq(staff.acceptsOnlineBooking, true)))
      .orderBy(asc(staff.sort), asc(staff.name)),
  ]);
  return { rules, overrides, bookings: booked, eligibleStaffIds: eligible.map((e) => e.id) };
}

export function toSlotService(s: { id: string; durationMin: number; bufferBeforeMin: number; bufferAfterMin: number; capacity: number; requiresStaff: boolean }): SlotService {
  return { id: s.id, durationMin: s.durationMin, bufferBeforeMin: s.bufferBeforeMin, bufferAfterMin: s.bufferAfterMin, capacity: s.capacity, requiresStaff: s.requiresStaff };
}

/** Slots for one date (what /api/booking/slots returns). */
export async function getSlotsForDate(
  tx: Tx,
  tenantId: string,
  opts: { service: SlotService; date: string; staffId?: string | null; config: BookingConfig; now?: Date },
): Promise<Slot[]> {
  const ymd = parseYmd(opts.date);
  if (!ymd) return [];
  const from = bkkDayStart(ymd);
  const to = new Date(from.getTime() + DAY_MS);
  const data = await loadAvailabilityData(tx, tenantId, { serviceId: opts.service.id, from, to });
  return computeSlots({ config: opts.config, service: opts.service, date: opts.date, staffId: opts.staffId ?? null, now: opts.now, ...data });
}

export interface DayAvailability {
  date: string;
  available: boolean;
  /** number of available slots */
  count: number;
}

/** One entry per day of the month (what /api/booking/days returns – powers the calendar dots). */
export async function getDayAvailability(
  tx: Tx,
  tenantId: string,
  opts: { service: SlotService; month: string; staffId?: string | null; config: BookingConfig; now?: Date },
): Promise<DayAvailability[]> {
  const ym = parseYm(opts.month);
  if (!ym) return [];
  const first: Ymd = { y: ym.y, m: ym.m, d: 1 };
  const days = daysInMonth(ym.y, ym.m);
  const from = bkkDayStart(first);
  const to = new Date(from.getTime() + days * DAY_MS);
  const data = await loadAvailabilityData(tx, tenantId, { serviceId: opts.service.id, from, to });
  const out: DayAvailability[] = [];
  for (let i = 0; i < days; i++) {
    const date = ymdToString(addDays(first, i));
    const slots = computeSlots({ config: opts.config, service: opts.service, date, staffId: opts.staffId ?? null, now: opts.now, ...data });
    const count = slots.filter((s) => s.available).length;
    out.push({ date, available: count > 0, count });
  }
  return out;
}
