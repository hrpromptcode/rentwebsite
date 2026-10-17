import { and, asc, eq, gt, inArray, isNotNull, lt, notInArray } from "drizzle-orm";
import type { Tx } from "@rentweb/db";
import { availabilityOverrides, availabilityRules, bookings, serviceCategories, services, staff, staffServices } from "@rentweb/db";
import { computeSlots, sessionRulesOf, toSlotService, type BookingInput, type OverrideInput, type RuleInput } from "./availability";
import type { BookingConfig } from "./config";
import { RELEASED_BOOKING_STATUSES } from "./config";
import type { ServiceWithCategory } from "./catalog";
import { addDays, bkkDateString, bkkDayStart, bkkTime, DAY_MS, parseHm, parseYmd, weekdayOf, ymdToString, type Ymd } from "./time";

/*
 * Classes (course template): a class is a service with capacity > 1 and requiresStaff = false whose weekly timetable
 * is stored as availability_rules rows with service_id set (one row per weekly session, staff_id = instructor).
 * Enrolment is a normal booking of that service (seats = partySize); the slot engine yields one slot per session.
 */

export const CLASS_LEVELS = ["beginner", "intermediate", "advanced", "all"] as const;
export type ClassLevel = (typeof CLASS_LEVELS)[number];
export const LEVEL_LABELS: Record<ClassLevel, string> = { beginner: "เริ่มต้น", intermediate: "ระดับกลาง", advanced: "ขั้นสูง", all: "ทุกระดับ" };

export function isClassLevel(v: unknown): v is ClassLevel {
  return typeof v === "string" && (CLASS_LEVELS as readonly string[]).includes(v);
}

export function levelLabel(level: string | null | undefined): string | null {
  return isClassLevel(level) ? LEVEL_LABELS[level] : null;
}

/** A class is a shared-seat service (capacity > 1, no staff per guest). */
export function isClassService(s: { capacity: number; requiresStaff: boolean }): boolean {
  return s.capacity > 1 && !s.requiresStaff;
}

export interface ClassInstructor {
  id: string;
  slug: string;
  name: string;
  title: string | null;
  avatar: string | null;
  color: string;
}

export interface ClassSessionRule {
  id: string;
  serviceId: string;
  staffId: string | null;
  weekday: number;
  /** "HH:MM" */
  startTime: string;
  /** "HH:MM" (informational: the service duration is authoritative) */
  endTime: string;
}

export interface ClassItem extends ServiceWithCategory {
  instructors: ClassInstructor[];
  /** weekly sessions sorted by weekday + time */
  sessions: Array<{ weekday: number; startTime: string; instructor: ClassInstructor | null }>;
}

const hm = (t: string) => {
  const m = parseHm(t);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

function toInstructor(s: typeof staff.$inferSelect): ClassInstructor {
  return { id: s.id, slug: s.slug, name: s.name, title: s.title, avatar: s.avatar, color: s.color };
}

/** Session rules of the tenant (optionally one service), ordered for display. */
export async function listClassSessionRules(tx: Tx, tenantId: string, serviceId?: string | null): Promise<ClassSessionRule[]> {
  const conds = [eq(availabilityRules.tenantId, tenantId), isNotNull(availabilityRules.serviceId)];
  if (serviceId) conds.push(eq(availabilityRules.serviceId, serviceId));
  const rows = await tx
    .select({ id: availabilityRules.id, serviceId: availabilityRules.serviceId, staffId: availabilityRules.staffId, weekday: availabilityRules.weekday, startTime: availabilityRules.startTime, endTime: availabilityRules.endTime })
    .from(availabilityRules)
    .where(and(...conds))
    .orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startTime));
  return rows.map((r) => ({ id: r.id, serviceId: r.serviceId!, staffId: r.staffId, weekday: r.weekday, startTime: hm(r.startTime), endTime: hm(r.endTime) }));
}

export interface ListClassesOptions {
  level?: string | null;
  categorySlug?: string | null;
  featured?: boolean;
  /** only classes taught by this instructor (staff id) */
  instructorId?: string | null;
  limit?: number;
  includeInactive?: boolean;
}

/** Classes with their instructors (staff_services links) and weekly sessions. */
export async function listClasses(tx: Tx, tenantId: string, opts: ListClassesOptions = {}): Promise<ClassItem[]> {
  const conds = [eq(services.tenantId, tenantId), eq(services.requiresStaff, false), gt(services.capacity, 1)];
  if (!opts.includeInactive) conds.push(eq(services.active, true));
  if (opts.featured) conds.push(eq(services.featured, true));
  if (opts.level && isClassLevel(opts.level)) conds.push(eq(services.level, opts.level));
  if (opts.categorySlug) conds.push(eq(serviceCategories.slug, opts.categorySlug));
  const rows = await tx
    .select({ s: services, categoryName: serviceCategories.name, categorySlug: serviceCategories.slug })
    .from(services)
    .leftJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
    .where(and(...conds))
    .orderBy(asc(serviceCategories.sort), asc(services.sort), asc(services.name));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.s.id);
  const [links, rules] = await Promise.all([
    tx
      .select({ serviceId: staffServices.serviceId, st: staff })
      .from(staffServices)
      .innerJoin(staff, eq(staffServices.staffId, staff.id))
      .where(and(eq(staffServices.tenantId, tenantId), inArray(staffServices.serviceId, ids), eq(staff.active, true)))
      .orderBy(asc(staff.sort), asc(staff.name)),
    listClassSessionRules(tx, tenantId),
  ]);
  const staffById = new Map(links.map((l) => [l.st.id, toInstructor(l.st)]));
  // session instructors that are not linked through staff_services still need their name / avatar
  const unlinked = [...new Set(rules.filter((r) => ids.includes(r.serviceId) && r.staffId && !staffById.has(r.staffId)).map((r) => r.staffId!))];
  if (unlinked.length) {
    const extra = await tx.select().from(staff).where(and(eq(staff.tenantId, tenantId), inArray(staff.id, unlinked), eq(staff.active, true)));
    for (const s of extra) staffById.set(s.id, toInstructor(s));
  }
  const byService = new Map<string, ClassInstructor[]>();
  for (const l of links) byService.set(l.serviceId, [...(byService.get(l.serviceId) ?? []), toInstructor(l.st)]);
  let out = rows.map((r) => ({
    ...r.s,
    categoryName: r.categoryName,
    categorySlug: r.categorySlug,
    instructors: byService.get(r.s.id) ?? [],
    sessions: rules.filter((x) => x.serviceId === r.s.id).map((x) => ({ weekday: x.weekday, startTime: x.startTime, instructor: x.staffId ? (staffById.get(x.staffId) ?? null) : null })),
  }));
  if (opts.instructorId) out = out.filter((c) => c.instructors.some((i) => i.id === opts.instructorId) || c.sessions.some((s) => s.instructor?.id === opts.instructorId));
  return opts.limit ? out.slice(0, opts.limit) : out;
}

export async function getClassBySlug(tx: Tx, tenantId: string, slug: string): Promise<ClassItem | null> {
  const all = await listClasses(tx, tenantId, { includeInactive: true });
  return all.find((c) => c.slug === slug) ?? null;
}

export interface InstructorItem extends ClassInstructor {
  bio: string | null;
  acceptsOnlineBooking: boolean;
  /** classes this instructor teaches (linked or scheduled) */
  classes: Array<{ id: string; slug: string; name: string; level: string | null }>;
  /** number of weekly sessions they lead */
  weeklySessions: number;
}

/** Active instructors (staff) with the classes they teach, in display order. */
export async function listInstructors(tx: Tx, tenantId: string, opts: { limit?: number } = {}): Promise<InstructorItem[]> {
  const [team, classes] = await Promise.all([
    tx.select().from(staff).where(and(eq(staff.tenantId, tenantId), eq(staff.active, true))).orderBy(asc(staff.sort), asc(staff.name)),
    listClasses(tx, tenantId),
  ]);
  const out = team.map((t) => {
    const taught = classes.filter((c) => c.instructors.some((i) => i.id === t.id) || c.sessions.some((s) => s.instructor?.id === t.id));
    return {
      ...toInstructor(t),
      bio: t.bio,
      acceptsOnlineBooking: t.acceptsOnlineBooking,
      classes: taught.map((c) => ({ id: c.id, slug: c.slug, name: c.name, level: c.level })),
      weeklySessions: classes.reduce((n, c) => n + c.sessions.filter((s) => s.instructor?.id === t.id).length, 0),
    };
  });
  return opts.limit ? out.slice(0, opts.limit) : out;
}

export async function getInstructorBySlug(tx: Tx, tenantId: string, slug: string): Promise<InstructorItem | null> {
  const all = await listInstructors(tx, tenantId);
  return all.find((i) => i.slug === slug) ?? null;
}

/* ------------------------------------------------------------------ */
/* weekly timetable                                                     */
/* ------------------------------------------------------------------ */

export interface TimetableSession {
  /** YYYY-MM-DD (Bangkok) */
  date: string;
  /** ISO instants */
  start: string;
  end: string;
  serviceId: string;
  serviceSlug: string;
  serviceName: string;
  image: string | null;
  level: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  durationMin: number;
  price: number;
  capacity: number;
  /** seats left (0 when full) */
  remaining: number;
  /** bookable now (future, inside the booking window, seats left) */
  available: boolean;
  /** why it is not bookable */
  state: "open" | "full" | "closed" | "past";
  instructor: ClassInstructor | null;
}

export interface TimetableOptions {
  /** first day, YYYY-MM-DD (Bangkok) */
  from: string;
  /** number of days (1 = one day, 7 = a week) */
  days: number;
  config: BookingConfig;
  now?: Date;
  instructorId?: string | null;
  level?: string | null;
  categorySlug?: string | null;
  serviceId?: string | null;
}

/** Monday of the week containing `date` (Bangkok), as YYYY-MM-DD. */
export function weekStartOf(date: string): string | null {
  const ymd = parseYmd(date);
  if (!ymd) return null;
  const wd = weekdayOf(ymd); // 0 = Sunday
  return ymdToString(addDays(ymd, wd === 0 ? -6 : 1 - wd));
}

/** Pure: the timetable sessions of one class on one day from its rules (ignores now / bookings). */
export function sessionsOnDay(rules: readonly RuleInput[], service: { id: string; durationMin: number }, ymd: Ymd): Array<{ start: Date; end: Date; instructorId: string | null }> {
  const wd = weekdayOf(ymd);
  const seen = new Map<number, string | null>();
  for (const r of sessionRulesOf(rules, service.id)) {
    if (r.weekday !== wd) continue;
    const m = parseHm(r.startTime);
    const t = bkkTime(ymd, Math.floor(m / 60), m % 60).getTime();
    if (!seen.has(t)) seen.set(t, r.staffId ?? null);
  }
  return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([t, instructorId]) => ({ start: new Date(t), end: new Date(t + service.durationMin * 60_000), instructorId }));
}

/**
 * Every class session in [from, from + days) with seats left, one query set for the whole range. Availability
 * ("available") comes from the same engine the booking wizard uses, so the timetable and /api/booking/slots agree.
 */
export async function listTimetable(tx: Tx, tenantId: string, opts: TimetableOptions): Promise<TimetableSession[]> {
  const first = parseYmd(opts.from);
  if (!first || opts.days < 1) return [];
  const now = opts.now ?? new Date();
  const today = bkkDateString(now);
  const rangeFrom = bkkDayStart(first);
  const rangeTo = new Date(rangeFrom.getTime() + opts.days * DAY_MS);
  const classes = (await listClasses(tx, tenantId, { level: opts.level, categorySlug: opts.categorySlug }))
    .filter((c) => c.sessions.length > 0)
    .filter((c) => (opts.serviceId ? c.id === opts.serviceId : true));
  if (!classes.length) return [];
  const pad = 6 * 3_600_000;
  const [rules, overrides, booked] = await Promise.all([
    tx.select({ staffId: availabilityRules.staffId, serviceId: availabilityRules.serviceId, weekday: availabilityRules.weekday, startTime: availabilityRules.startTime, endTime: availabilityRules.endTime }).from(availabilityRules).where(eq(availabilityRules.tenantId, tenantId)),
    tx
      .select({ staffId: availabilityOverrides.staffId, startsAt: availabilityOverrides.startsAt, endsAt: availabilityOverrides.endsAt, kind: availabilityOverrides.kind })
      .from(availabilityOverrides)
      .where(and(eq(availabilityOverrides.tenantId, tenantId), lt(availabilityOverrides.startsAt, new Date(rangeTo.getTime() + pad)), gt(availabilityOverrides.endsAt, new Date(rangeFrom.getTime() - pad)))),
    tx
      .select({ staffId: bookings.staffId, extraStaffIds: bookings.extraStaffIds, serviceId: bookings.serviceId, startsAt: bookings.startsAt, endsAt: bookings.endsAt, partySize: bookings.partySize, bufferBeforeMin: services.bufferBeforeMin, bufferAfterMin: services.bufferAfterMin })
      .from(bookings)
      .innerJoin(services, eq(bookings.serviceId, services.id))
      .where(and(eq(bookings.tenantId, tenantId), inArray(bookings.serviceId, classes.map((c) => c.id)), lt(bookings.startsAt, new Date(rangeTo.getTime() + pad)), gt(bookings.endsAt, new Date(rangeFrom.getTime() - pad)), notInArray(bookings.status, [...RELEASED_BOOKING_STATUSES]))),
  ]);
  const ruleInputs: RuleInput[] = rules;
  const overrideInputs: OverrideInput[] = overrides;
  const bookingInputs: BookingInput[] = booked;
  const instructorsById = new Map<string, ClassInstructor>();
  for (const c of classes) {
    for (const i of c.instructors) instructorsById.set(i.id, i);
    for (const s of c.sessions) if (s.instructor) instructorsById.set(s.instructor.id, s.instructor);
  }
  // instructors that are not linked to any class via staff_services still need a name
  const missing = new Set<string>();
  for (const r of ruleInputs) if (r.serviceId && r.staffId && !instructorsById.has(r.staffId)) missing.add(r.staffId);
  if (missing.size) {
    const extra = await tx.select().from(staff).where(and(eq(staff.tenantId, tenantId), inArray(staff.id, [...missing])));
    for (const s of extra) instructorsById.set(s.id, toInstructor(s));
  }

  const out: TimetableSession[] = [];
  for (let d = 0; d < opts.days; d++) {
    const ymd = addDays(first, d);
    const date = ymdToString(ymd);
    const past = date < today;
    for (const c of classes) {
      const slotService = toSlotService(c);
      const sessions = sessionsOnDay(ruleInputs, c, ymd).filter((s) => !opts.instructorId || s.instructorId === opts.instructorId);
      if (!sessions.length) continue;
      const slots = past ? [] : computeSlots({ config: opts.config, service: slotService, date, staffId: null, partySize: 1, now, eligibleStaffIds: [], rules: ruleInputs, overrides: overrideInputs, bookings: bookingInputs });
      for (const s of sessions) {
        const slot = slots.find((x) => x.start === s.start.toISOString());
        const used = bookingInputs.filter((b) => b.serviceId === c.id && b.startsAt.getTime() < s.end.getTime() && b.endsAt.getTime() > s.start.getTime()).reduce((n, b) => n + (b.partySize ?? 1), 0);
        const remaining = Math.max(0, c.capacity - used);
        const available = !!slot && slot.available;
        const state: TimetableSession["state"] = past || s.end.getTime() < now.getTime() ? "past" : available ? "open" : remaining <= 0 ? "full" : "closed";
        out.push({
          date,
          start: s.start.toISOString(),
          end: s.end.toISOString(),
          serviceId: c.id,
          serviceSlug: c.slug,
          serviceName: c.name,
          image: c.image,
          level: c.level,
          categoryName: c.categoryName,
          categorySlug: c.categorySlug,
          durationMin: c.durationMin,
          price: c.price,
          capacity: c.capacity,
          remaining,
          available,
          state,
          instructor: s.instructorId ? (instructorsById.get(s.instructorId) ?? null) : null,
        });
      }
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.serviceName.localeCompare(b.serviceName));
}

/** The next `limit` bookable (or at least future) sessions of one class, scanning up to `maxAdvanceDays`. */
export async function upcomingSessions(tx: Tx, tenantId: string, serviceId: string, opts: { config: BookingConfig; now?: Date; limit?: number }): Promise<TimetableSession[]> {
  const now = opts.now ?? new Date();
  const all = await listTimetable(tx, tenantId, { from: bkkDateString(now), days: Math.min(opts.config.maxAdvanceDays + 1, 60), config: opts.config, now, serviceId });
  return all.filter((s) => s.state !== "past").slice(0, opts.limit ?? 6);
}
