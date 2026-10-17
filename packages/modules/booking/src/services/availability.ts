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
  /** max guests served at the same time (>1 = class / group / room – bookings share the slot) */
  capacity: number;
  /** true = every guest is served by one staff member (a party of 2 needs 2 free staff) */
  requiresStaff: boolean;
  /** fixed guests per booking (package "for 2"); null = per person (party size chosen by the customer) */
  seatsPerBooking?: number | null;
}

export interface RuleInput {
  staffId: string | null;
  /** set = a recurring class session of that service (course template), not working hours; staffId = instructor */
  serviceId?: string | null;
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
  /** further staff serving the party (staffed group bookings) */
  extraStaffIds?: string[] | null;
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
  /** guests in the booking being planned (per-person group services); fixed packages ignore it */
  partySize?: number | null;
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

/*
 * Capacity × staff model (SBR-001 / SBR-004):
 *  - requiresStaff && capacity 1  → classic 1:1 appointment, one staff per booking (bookings_no_overlap guards it).
 *  - requiresStaff && capacity >1 → staffed group (couple massage, group treatment): capacity = guests served at
 *    the same time and EVERY guest needs one eligible staff free for the whole slot. The booking stores the first
 *    staff in staffId and the others in extraStaffIds; all of them are busy for other services.
 *  - !requiresStaff              → class / room / court: seats only (capacity), business hours.
 *  Party size per booking = seatsPerBooking (fixed package, priced per booking) or, when null, the guests the
 *  customer asks for (1..capacity, priced per guest). Writers serialise per tenant (lockTenantBookings) because
 *  seat counts and extra staff cannot be guarded by a DB constraint.
 */

/** True when the service is booked as a shared slot (class, couple room…) with seats instead of one staff. */
export function isGroupService(service: Pick<SlotService, "capacity" | "requiresStaff">): boolean {
  return service.capacity > 1 || !service.requiresStaff;
}

/** Staffed group service: seats AND one staff per guest. */
export function isStaffedGroupService(service: Pick<SlotService, "capacity" | "requiresStaff">): boolean {
  return service.requiresStaff && service.capacity > 1;
}

/** Group service priced per guest (no fixed package size). */
export function isPerPersonService(service: Pick<SlotService, "capacity" | "requiresStaff" | "seatsPerBooking">): boolean {
  return service.capacity > 1 && !service.seatsPerBooking;
}

/** Guests one booking takes: the fixed package size, else the requested party clamped to 1..capacity. */
export function partySizeFor(service: Pick<SlotService, "capacity" | "seatsPerBooking">, requested?: number | null): number {
  const cap = Math.max(1, service.capacity);
  if (service.seatsPerBooking && service.seatsPerBooking > 0) return Math.min(service.seatsPerBooking, cap);
  const n = typeof requested === "number" && Number.isFinite(requested) ? Math.floor(requested) : 1;
  return Math.min(Math.max(1, n), cap);
}

/** Every staff member a booking occupies (staffId + extraStaffIds). */
export function bookingStaffIds(b: Pick<BookingInput, "staffId" | "extraStaffIds">): string[] {
  const extra = b.extraStaffIds ?? [];
  return b.staffId ? [b.staffId, ...extra.filter((id) => id !== b.staffId)] : [...extra];
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
  const { overrides } = input;
  // class session rules (serviceId set) are a timetable, never working hours
  const rules = input.rules.filter((r) => !r.serviceId);
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
  const own = input.bookings.filter((b) => bookingStaffIds(b).includes(staffId)).map(bookingOccupied);
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

type DayCtx = NonNullable<ReturnType<typeof dayContext>>;

/** Is `staffId` free for the whole occupied interval of a slot starting at startMs (working window + own bookings)? */
function staffFreeFor(input: SlotEngineInput, ctx: DayCtx, staffId: string, startMs: number): boolean {
  if (startMs < ctx.earliest) return false;
  const { service } = input;
  const end = startMs + service.durationMin * 60_000;
  if (!workingWindows(input, staffId, ctx).some((w) => w.start <= startMs && end <= w.end)) return false;
  const occ: Interval = { start: startMs - service.bufferBeforeMin * 60_000, end: end + service.bufferAfterMin * 60_000 };
  return !input.bookings.some((b) => bookingStaffIds(b).includes(staffId) && overlaps(occ, bookingOccupied(b)));
}

/** Session rules (weekly timetable) of a service: `rules` rows whose serviceId is this service (course template). */
export function sessionRulesOf(rules: readonly RuleInput[], serviceId: string): RuleInput[] {
  return rules.filter((r) => r.serviceId === serviceId);
}

/** True when the service is booked per timetable session (has at least one session rule) instead of stepped slots. */
export function hasClassSessions(rules: readonly RuleInput[], serviceId: string): boolean {
  return rules.some((r) => r.serviceId === serviceId);
}

/**
 * Timetable sessions of one day: one candidate per session rule of that weekday (start = rule start, end = start +
 * duration), with the rule's instructor. A session is dropped when a "closed" override (business-wide or for the
 * instructor) overlaps it; "open" overrides never add sessions. Rules whose start is not strictly before their end
 * still count (end_time is informational – the service duration is authoritative).
 */
function sessionStarts(input: SlotEngineInput, ctx: DayCtx): Array<{ start: number; instructorId: string | null }> {
  const { service } = input;
  const durationMs = service.durationMin * 60_000;
  const out = new Map<number, string | null>();
  for (const r of sessionRulesOf(input.rules, service.id)) {
    if (r.weekday !== ctx.weekday) continue;
    const hm = parseHm(r.startTime);
    const start = bkkTime(ctx.ymd, Math.floor(hm / 60), hm % 60).getTime();
    const session: Interval = { start, end: start + durationMs };
    const closed = input.overrides.some((o) => o.kind === "closed" && (o.staffId === null || (r.staffId !== null && o.staffId === r.staffId)) && overlaps(session, { start: o.startsAt.getTime(), end: o.endsAt.getTime() }));
    if (closed) continue;
    if (!out.has(start)) out.set(start, r.staffId ?? null);
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([start, instructorId]) => ({ start, instructorId }));
}

/**
 * Slots for a shared-capacity service. Seats = capacity − guests of overlapping bookings of this service.
 * Classes / rooms (no staff) use business hours; staffed groups use the eligible staff schedules and are also
 * limited by the number of eligible staff free for the whole slot (one per guest).
 * A service with session rules (weekly class timetable) yields exactly one slot per session instead of stepped
 * slots; `staffId` on those slots is the session's instructor (informational – enrolments are not staff-bound).
 */
export function computeGroupSlots(input: SlotEngineInput): Slot[] {
  const ctx = dayContext(input);
  if (!ctx) return [];
  const { service } = input;
  const staffed = service.requiresStaff;
  const needed = partySizeFor(service, input.partySize);
  const durationMs = service.durationMin * 60_000;
  const stepMs = input.config.slotMinutes * 60_000;
  const sessions = hasClassSessions(input.rules, service.id);
  let candidates: Array<{ start: number; instructorId: string | null }>;
  if (sessions) candidates = sessionStarts(input, ctx);
  else {
    let windows: Interval[];
    if (staffed) windows = mergeIntervals(input.eligibleStaffIds.flatMap((id) => workingWindows(input, id, ctx)));
    else {
      windows = workingWindows(input, null, ctx);
      // no business-hours rules → union of eligible staff schedules
      if (!input.rules.some((r) => r.staffId === null && !r.serviceId)) windows = mergeIntervals(input.eligibleStaffIds.flatMap((id) => workingWindows(input, id, ctx)));
    }
    candidates = candidateStarts(windows, durationMs, stepMs).map((start) => ({ start, instructorId: null }));
  }
  const taken = input.bookings.filter((b) => b.serviceId === service.id && (staffed || b.staffId === null));
  const out: Slot[] = [];
  for (const { start: s, instructorId } of candidates) {
    if (s < ctx.earliest) continue;
    const e = s + durationMs;
    const occ: Interval = { start: s - service.bufferBeforeMin * 60_000, end: e + service.bufferAfterMin * 60_000 };
    const used = taken.filter((b) => overlaps(occ, bookingOccupied(b))).reduce((n, b) => n + (b.partySize ?? 1), 0);
    let remaining = Math.max(0, service.capacity - used);
    let available = remaining >= needed;
    if (staffed && !sessions) {
      const free = input.eligibleStaffIds.filter((id) => staffFreeFor(input, ctx, id, s));
      remaining = Math.min(remaining, free.length);
      available = remaining >= needed && (!input.staffId || free.includes(input.staffId));
    }
    // a timetable filtered by instructor (/schedule?instructor=) only lists that instructor's sessions
    if (sessions && input.staffId && instructorId !== input.staffId) continue;
    out.push({ start: new Date(s).toISOString(), end: new Date(e).toISOString(), staffId: sessions ? instructorId : null, available, remaining });
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

/** Eligible staff who are free for a slot starting at `startIso` (used to pick staff for "any" / group bookings). */
export function freeStaffAt(input: SlotEngineInput, startIso: string): string[] {
  const startMs = new Date(startIso).getTime();
  if (isStaffedGroupService(input.service)) {
    const ctx = dayContext(input);
    if (!ctx) return [];
    return input.eligibleStaffIds.filter((id) => staffFreeFor(input, ctx, id, startMs));
  }
  return input.eligibleStaffIds.filter((id) => computeStaffSlots(input, id).some((s) => new Date(s.start).getTime() === startMs && s.available));
}

/** `candidates` ordered least-booked first on that day (ties keep display order). */
export function rankStaffByLoad(input: SlotEngineInput, candidates: string[]): string[] {
  const ymd = parseYmd(input.date);
  if (!ymd) return [...candidates];
  const dayStart = bkkDayStart(ymd).getTime();
  const dayEnd = dayStart + DAY_MS;
  const counts = new Map<string, number>();
  for (const b of input.bookings) {
    const t = b.startsAt.getTime();
    if (t < dayStart || t >= dayEnd) continue;
    for (const id of bookingStaffIds(b)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return candidates
    .map((id, i) => ({ id, i, n: counts.get(id) ?? 0 }))
    .sort((a, b) => a.n - b.n || a.i - b.i)
    .map((x) => x.id);
}

/** Least-booked staff on that day among `candidates` (ties → first in display order). */
export function pickLeastBookedStaff(input: SlotEngineInput, candidates: string[]): string | null {
  return rankStaffByLoad(input, candidates)[0] ?? null;
}

/**
 * Staff for a booking of `partySize` guests starting at `startIso`: the preferred staff first (must be free),
 * then the least-booked free ones. null when not enough eligible staff are free. `exclude` drops staff that
 * turned out to be taken (exclusion-constraint retry).
 */
export function assignStaff(input: SlotEngineInput, startIso: string, partySize: number, preferred?: string | null, exclude?: ReadonlySet<string>): string[] | null {
  const free = freeStaffAt(input, startIso).filter((id) => !exclude?.has(id));
  const n = Math.max(1, partySize);
  if (preferred) {
    if (!free.includes(preferred)) return null;
    const ids = [preferred, ...rankStaffByLoad(input, free.filter((id) => id !== preferred))].slice(0, n);
    return ids.length === n ? ids : null;
  }
  const ids = rankStaffByLoad(input, free).slice(0, n);
  return ids.length === n ? ids : null;
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
    tx.select({ staffId: availabilityRules.staffId, serviceId: availabilityRules.serviceId, weekday: availabilityRules.weekday, startTime: availabilityRules.startTime, endTime: availabilityRules.endTime }).from(availabilityRules).where(eq(availabilityRules.tenantId, tenantId)),
    tx
      .select({ staffId: availabilityOverrides.staffId, startsAt: availabilityOverrides.startsAt, endsAt: availabilityOverrides.endsAt, kind: availabilityOverrides.kind })
      .from(availabilityOverrides)
      .where(and(eq(availabilityOverrides.tenantId, tenantId), lt(availabilityOverrides.startsAt, to), gt(availabilityOverrides.endsAt, from))),
    tx
      .select({
        staffId: bookings.staffId,
        extraStaffIds: bookings.extraStaffIds,
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

export function toSlotService(s: { id: string; durationMin: number; bufferBeforeMin: number; bufferAfterMin: number; capacity: number; requiresStaff: boolean; seatsPerBooking?: number | null }): SlotService {
  return { id: s.id, durationMin: s.durationMin, bufferBeforeMin: s.bufferBeforeMin, bufferAfterMin: s.bufferAfterMin, capacity: s.capacity, requiresStaff: s.requiresStaff, seatsPerBooking: s.seatsPerBooking ?? null };
}

/** Slots for one date (what /api/booking/slots returns). */
export async function getSlotsForDate(
  tx: Tx,
  tenantId: string,
  opts: { service: SlotService; date: string; staffId?: string | null; partySize?: number | null; config: BookingConfig; now?: Date },
): Promise<Slot[]> {
  const ymd = parseYmd(opts.date);
  if (!ymd) return [];
  const from = bkkDayStart(ymd);
  const to = new Date(from.getTime() + DAY_MS);
  const data = await loadAvailabilityData(tx, tenantId, { serviceId: opts.service.id, from, to });
  return computeSlots({ config: opts.config, service: opts.service, date: opts.date, staffId: opts.staffId ?? null, partySize: opts.partySize ?? null, now: opts.now, ...data });
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
  opts: { service: SlotService; month: string; staffId?: string | null; partySize?: number | null; config: BookingConfig; now?: Date },
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
    const slots = computeSlots({ config: opts.config, service: opts.service, date, staffId: opts.staffId ?? null, partySize: opts.partySize ?? null, now: opts.now, ...data });
    const count = slots.filter((s) => s.available).length;
    out.push({ date, available: count > 0, count });
  }
  return out;
}
