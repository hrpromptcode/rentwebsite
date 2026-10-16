import { and, asc, count, eq, gte, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { availabilityOverrides, availabilityRules, bookings, serviceCategories, services, staff, staffServices, type Tx } from "@rentweb/db";
import { audit, fail, ok, slugify, type Result } from "@rentweb/core";
import type { ServiceWithCategory } from "../services/catalog";
import { listServices, listStaff } from "../services/catalog";
import { BKK_OFFSET_MS, minutesToHm, parseHm } from "../services/time";
import type { ScheduleDay, ServiceValues, StaffValues } from "./schemas";
import { DEFAULT_CLOSE_MIN, DEFAULT_OPEN_MIN } from "./labels";

export interface Actor {
  userId: string;
  actorType: "user" | "superadmin";
}

export interface FieldError {
  field: string;
  message: string;
}

/* -------------------------------------------------------------------------- */
/* slugs                                                                       */
/* -------------------------------------------------------------------------- */

type SlugTable = typeof services | typeof staff | typeof serviceCategories;

async function uniqueSlug(tx: Tx, tenantId: string, table: SlugTable, base: string, excludeId?: string | null): Promise<string> {
  const root = slugify(base) || "item";
  let candidate = root;
  for (let n = 2; n < 500; n++) {
    const conds: SQL[] = [eq(table.tenantId, tenantId), eq(table.slug, candidate)];
    if (excludeId) conds.push(ne(table.id, excludeId));
    const [row] = await tx.select({ id: table.id }).from(table).where(and(...conds)).limit(1);
    if (!row) return candidate;
    candidate = `${root}-${n}`;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export const uniqueServiceSlug = (tx: Tx, tenantId: string, base: string, excludeId?: string | null) => uniqueSlug(tx, tenantId, services, base, excludeId);
export const uniqueStaffSlug = (tx: Tx, tenantId: string, base: string, excludeId?: string | null) => uniqueSlug(tx, tenantId, staff, base, excludeId);

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}
function isFkViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23503" || e?.cause?.code === "23503";
}

/* -------------------------------------------------------------------------- */
/* services                                                                    */
/* -------------------------------------------------------------------------- */

export interface AdminServiceRow extends ServiceWithCategory {
  staffCount: number;
  upcomingBookings: number;
}

export async function listServicesAdmin(tx: Tx, tenantId: string, opts: { q?: string | null; categoryId?: string | null; status?: "all" | "active" | "inactive" | null } = {}): Promise<AdminServiceRow[]> {
  const all = await listServices(tx, tenantId, { includeInactive: true });
  const ids = all.map((s) => s.id);
  const staffCounts = new Map<string, number>();
  const upcoming = new Map<string, number>();
  if (ids.length) {
    const sc = await tx
      .select({ serviceId: staffServices.serviceId, c: count() })
      .from(staffServices)
      .innerJoin(staff, eq(staffServices.staffId, staff.id))
      .where(and(eq(staffServices.tenantId, tenantId), eq(staff.active, true), inArray(staffServices.serviceId, ids)))
      .groupBy(staffServices.serviceId);
    for (const r of sc) staffCounts.set(r.serviceId, Number(r.c));
    const ub = await tx
      .select({ serviceId: bookings.serviceId, c: count() })
      .from(bookings)
      .where(and(eq(bookings.tenantId, tenantId), gte(bookings.startsAt, new Date()), inArray(bookings.status, ["pending", "confirmed", "checked_in", "in_progress"]), inArray(bookings.serviceId, ids)))
      .groupBy(bookings.serviceId);
    for (const r of ub) upcoming.set(r.serviceId, Number(r.c));
  }
  const q = opts.q?.trim().toLowerCase();
  return all
    .filter((s) => (opts.status === "active" ? s.active : opts.status === "inactive" ? !s.active : true))
    .filter((s) => (opts.categoryId ? s.categoryId === opts.categoryId : true))
    .filter((s) => (q ? s.name.toLowerCase().includes(q) || s.slug.includes(q) || (s.categoryName ?? "").toLowerCase().includes(q) : true))
    .map((s) => ({ ...s, staffCount: staffCounts.get(s.id) ?? 0, upcomingBookings: upcoming.get(s.id) ?? 0 }));
}

export async function saveService(tx: Tx, tenantId: string, id: string | null, v: ServiceValues, actor: Actor): Promise<Result<{ id: string; slug: string }, FieldError>> {
  if (v.categoryId) {
    const [cat] = await tx.select({ id: serviceCategories.id }).from(serviceCategories).where(and(eq(serviceCategories.tenantId, tenantId), eq(serviceCategories.id, v.categoryId))).limit(1);
    if (!cat) return fail({ field: "categoryId", message: "ไม่พบหมวดหมู่" });
  }
  const slug = await uniqueServiceSlug(tx, tenantId, v.slug || v.name, id);
  const values = {
    categoryId: v.categoryId,
    name: v.name,
    slug,
    description: v.description,
    image: v.image,
    durationMin: v.durationMin,
    bufferBeforeMin: v.bufferBeforeMin,
    bufferAfterMin: v.bufferAfterMin,
    price: v.price,
    priceNote: v.priceNote,
    depositRequired: v.depositRequired,
    depositAmount: v.depositRequired ? v.depositAmount : 0,
    capacity: v.capacity,
    requiresStaff: v.requiresStaff,
    active: v.active,
    featured: v.featured,
    sort: v.sort,
  };
  try {
    if (id) {
      const [row] = await tx.update(services).set(values).where(and(eq(services.tenantId, tenantId), eq(services.id, id))).returning({ id: services.id, slug: services.slug });
      if (!row) return fail({ field: "_", message: "ไม่พบบริการ" });
      await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "service.update", targetType: "service", targetId: row.id, diff: { name: v.name, price: v.price, active: v.active } });
      return ok(row);
    }
    const [row] = await tx.insert(services).values({ tenantId, ...values }).returning({ id: services.id, slug: services.slug });
    await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "service.create", targetType: "service", targetId: row!.id, diff: { name: v.name, price: v.price } });
    return ok(row!);
  } catch (err) {
    if (isUniqueViolation(err)) return fail({ field: "slug", message: "slug นี้ถูกใช้แล้ว" });
    throw err;
  }
}

export async function setServiceFlags(tx: Tx, tenantId: string, id: string, flags: { active?: boolean; featured?: boolean }, actor: Actor): Promise<boolean> {
  const [row] = await tx.update(services).set(flags).where(and(eq(services.tenantId, tenantId), eq(services.id, id))).returning({ id: services.id });
  if (row) await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "service.flags", targetType: "service", targetId: id, diff: flags });
  return !!row;
}

/** Hard delete – refused (→ error message) when bookings reference the service; deactivate instead. */
export async function deleteService(tx: Tx, tenantId: string, id: string, actor: Actor): Promise<Result<null, string>> {
  const [{ c } = { c: 0 }] = await tx.select({ c: count() }).from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.serviceId, id)));
  if (Number(c) > 0) return fail("บริการนี้มีประวัติการจองแล้ว ลบไม่ได้ – ปิดการใช้งานแทนเพื่อซ่อนจากหน้าร้าน");
  try {
    const rows = await tx.delete(services).where(and(eq(services.tenantId, tenantId), eq(services.id, id))).returning({ id: services.id });
    if (!rows.length) return fail("ไม่พบบริการ");
  } catch (err) {
    if (isFkViolation(err)) return fail("บริการนี้ถูกอ้างอิงอยู่ ลบไม่ได้ – ปิดการใช้งานแทน");
    throw err;
  }
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "service.delete", targetType: "service", targetId: id });
  return ok(null);
}

/* -------------------------------------------------------------------------- */
/* categories                                                                  */
/* -------------------------------------------------------------------------- */

export interface CategoryWithCount {
  id: string;
  name: string;
  slug: string;
  sort: number;
  serviceCount: number;
}

export async function listCategoriesAdmin(tx: Tx, tenantId: string): Promise<CategoryWithCount[]> {
  const rows = await tx
    .select({ id: serviceCategories.id, name: serviceCategories.name, slug: serviceCategories.slug, sort: serviceCategories.sort, serviceCount: sql<number>`(select count(*) from ${services} s where s.category_id = ${serviceCategories.id})::int` })
    .from(serviceCategories)
    .where(eq(serviceCategories.tenantId, tenantId))
    .orderBy(asc(serviceCategories.sort), asc(serviceCategories.name));
  return rows.map((r) => ({ ...r, serviceCount: Number(r.serviceCount) }));
}

export async function saveCategory(tx: Tx, tenantId: string, id: string | null, v: { name: string; slug: string; sort: number }, actor: Actor): Promise<Result<{ id: string }, FieldError>> {
  const slug = await uniqueSlug(tx, tenantId, serviceCategories, v.slug || v.name, id);
  try {
    if (id) {
      const [row] = await tx.update(serviceCategories).set({ name: v.name, slug, sort: v.sort }).where(and(eq(serviceCategories.tenantId, tenantId), eq(serviceCategories.id, id))).returning({ id: serviceCategories.id });
      if (!row) return fail({ field: "_", message: "ไม่พบหมวดหมู่" });
      return ok(row);
    }
    const [row] = await tx.insert(serviceCategories).values({ tenantId, name: v.name, slug, sort: v.sort }).returning({ id: serviceCategories.id });
    await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "service_category.create", targetType: "service_category", targetId: row!.id, diff: { name: v.name } });
    return ok(row!);
  } catch (err) {
    if (isUniqueViolation(err)) return fail({ field: "slug", message: "slug นี้ถูกใช้แล้ว" });
    throw err;
  }
}

/** Services keep existing (category_id → null via FK). */
export async function deleteCategory(tx: Tx, tenantId: string, id: string, actor: Actor): Promise<boolean> {
  const rows = await tx.delete(serviceCategories).where(and(eq(serviceCategories.tenantId, tenantId), eq(serviceCategories.id, id))).returning({ id: serviceCategories.id });
  if (rows.length) await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "service_category.delete", targetType: "service_category", targetId: id });
  return rows.length > 0;
}

/* -------------------------------------------------------------------------- */
/* staff                                                                       */
/* -------------------------------------------------------------------------- */

export interface AdminStaffRow {
  id: string;
  name: string;
  slug: string;
  title: string | null;
  avatar: string | null;
  color: string;
  kind: string;
  acceptsOnlineBooking: boolean;
  active: boolean;
  sort: number;
  phone: string | null;
  email: string | null;
  serviceIds: string[];
  /** true when the staff has their own weekly rules (otherwise follows business hours) */
  hasOwnSchedule: boolean;
  todayBookings: number;
}

export async function listStaffAdmin(tx: Tx, tenantId: string, opts: { dayStart: Date; dayEnd: Date }): Promise<AdminStaffRow[]> {
  const rows = await listStaff(tx, tenantId, { includeInactive: true });
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [ownRules, today] = await Promise.all([
    tx.select({ staffId: availabilityRules.staffId }).from(availabilityRules).where(and(eq(availabilityRules.tenantId, tenantId), inArray(availabilityRules.staffId, ids))).groupBy(availabilityRules.staffId),
    tx
      .select({ staffId: bookings.staffId, c: count() })
      .from(bookings)
      .where(and(eq(bookings.tenantId, tenantId), inArray(bookings.staffId, ids), gte(bookings.startsAt, opts.dayStart), sql`${bookings.startsAt} < ${opts.dayEnd}`, inArray(bookings.status, ["pending", "confirmed", "checked_in", "in_progress", "completed"])))
      .groupBy(bookings.staffId),
  ]);
  const own = new Set(ownRules.map((r) => r.staffId));
  const todayMap = new Map(today.map((r) => [r.staffId, Number(r.c)]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    title: r.title,
    avatar: r.avatar,
    color: r.color,
    kind: r.kind,
    acceptsOnlineBooking: r.acceptsOnlineBooking,
    active: r.active,
    sort: r.sort,
    phone: r.phone,
    email: r.email,
    serviceIds: r.serviceIds,
    hasOwnSchedule: own.has(r.id),
    todayBookings: todayMap.get(r.id) ?? 0,
  }));
}

export async function saveStaff(tx: Tx, tenantId: string, id: string | null, v: StaffValues, actor: Actor): Promise<Result<{ id: string; slug: string }, FieldError>> {
  const slug = await uniqueStaffSlug(tx, tenantId, v.slug || v.name, id);
  const values = { name: v.name, slug, title: v.title, bio: v.bio, avatar: v.avatar, email: v.email, phone: v.phone, color: v.color, kind: v.kind, acceptsOnlineBooking: v.acceptsOnlineBooking, active: v.active, sort: v.sort };
  let staffId = id;
  try {
    if (id) {
      const [row] = await tx.update(staff).set(values).where(and(eq(staff.tenantId, tenantId), eq(staff.id, id))).returning({ id: staff.id });
      if (!row) return fail({ field: "_", message: "ไม่พบพนักงาน" });
    } else {
      const [row] = await tx.insert(staff).values({ tenantId, ...values }).returning({ id: staff.id });
      staffId = row!.id;
    }
  } catch (err) {
    if (isUniqueViolation(err)) return fail({ field: "slug", message: "slug นี้ถูกใช้แล้ว" });
    throw err;
  }
  // services: keep existing links (and their overrides), add new, remove dropped
  const wanted = new Set(v.serviceIds);
  if (wanted.size) {
    const valid = await tx.select({ id: services.id }).from(services).where(and(eq(services.tenantId, tenantId), inArray(services.id, [...wanted])));
    const validIds = new Set(valid.map((x) => x.id));
    for (const w of wanted) if (!validIds.has(w)) wanted.delete(w);
  }
  const existing = await tx.select({ serviceId: staffServices.serviceId }).from(staffServices).where(and(eq(staffServices.tenantId, tenantId), eq(staffServices.staffId, staffId!)));
  const have = new Set(existing.map((e) => e.serviceId));
  const toRemove = [...have].filter((s) => !wanted.has(s));
  const toAdd = [...wanted].filter((s) => !have.has(s));
  if (toRemove.length) await tx.delete(staffServices).where(and(eq(staffServices.tenantId, tenantId), eq(staffServices.staffId, staffId!), inArray(staffServices.serviceId, toRemove)));
  if (toAdd.length) await tx.insert(staffServices).values(toAdd.map((serviceId) => ({ tenantId, staffId: staffId!, serviceId })));
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: id ? "staff.update" : "staff.create", targetType: "staff", targetId: staffId!, diff: { name: v.name, active: v.active, services: wanted.size } });
  return ok({ id: staffId!, slug });
}

export async function setStaffFlags(tx: Tx, tenantId: string, id: string, flags: { active?: boolean; acceptsOnlineBooking?: boolean }, actor: Actor): Promise<boolean> {
  const [row] = await tx.update(staff).set(flags).where(and(eq(staff.tenantId, tenantId), eq(staff.id, id))).returning({ id: staff.id });
  if (row) await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "staff.flags", targetType: "staff", targetId: id, diff: flags });
  return !!row;
}

/** Deleting keeps past bookings (staff_id → null) but refuses when upcoming bookings exist. */
export async function deleteStaff(tx: Tx, tenantId: string, id: string, actor: Actor): Promise<Result<null, string>> {
  const [{ c } = { c: 0 }] = await tx
    .select({ c: count() })
    .from(bookings)
    .where(and(eq(bookings.tenantId, tenantId), eq(bookings.staffId, id), gte(bookings.endsAt, new Date()), inArray(bookings.status, ["pending", "confirmed", "checked_in", "in_progress"])));
  if (Number(c) > 0) return fail(`ยังมีคิวล่วงหน้า ${c} รายการของพนักงานคนนี้ ย้ายหรือยกเลิกคิวก่อน หรือปิดการใช้งานแทน`);
  const rows = await tx.delete(staff).where(and(eq(staff.tenantId, tenantId), eq(staff.id, id))).returning({ id: staff.id });
  if (!rows.length) return fail("ไม่พบพนักงาน");
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "staff.delete", targetType: "staff", targetId: id });
  return ok(null);
}

/* -------------------------------------------------------------------------- */
/* weekly schedule (availability_rules)                                        */
/* -------------------------------------------------------------------------- */

export interface WeekSchedule {
  /** null = business hours */
  staffId: string | null;
  /** staff only: false when the staff has no rules of their own (days mirror the business hours) */
  own: boolean;
  days: ScheduleDay[];
}

function rulesToDays(rules: Array<{ weekday: number; startTime: string; endTime: string }>, fallback?: ScheduleDay[]): ScheduleDay[] {
  const days: ScheduleDay[] = [];
  for (let w = 0; w < 7; w++) {
    const own = rules.filter((r) => r.weekday === w);
    if (own.length) {
      const start = Math.min(...own.map((r) => parseHm(r.startTime)));
      const end = Math.max(...own.map((r) => parseHm(r.endTime)));
      days.push({ weekday: w, closed: false, start: minutesToHm(start), end: minutesToHm(end) });
    } else if (fallback) {
      const f = fallback[w]!;
      days.push({ weekday: w, closed: true, start: f.start, end: f.end });
    } else {
      days.push({ weekday: w, closed: true, start: minutesToHm(DEFAULT_OPEN_MIN), end: minutesToHm(DEFAULT_CLOSE_MIN) });
    }
  }
  return days;
}

/** Business hours (rules with staff_id null); every day closed = no rules yet (engine falls back to staff rules). */
export async function getBusinessHours(tx: Tx, tenantId: string): Promise<WeekSchedule> {
  const rules = await tx.select({ weekday: availabilityRules.weekday, startTime: availabilityRules.startTime, endTime: availabilityRules.endTime }).from(availabilityRules).where(and(eq(availabilityRules.tenantId, tenantId), isNull(availabilityRules.staffId)));
  return { staffId: null, own: rules.length > 0, days: rulesToDays(rules) };
}

/** Effective weekly schedule of a staff: own rules when present, otherwise the business hours. */
export async function getStaffSchedule(tx: Tx, tenantId: string, staffId: string): Promise<WeekSchedule> {
  const [own, biz] = await Promise.all([
    tx.select({ weekday: availabilityRules.weekday, startTime: availabilityRules.startTime, endTime: availabilityRules.endTime }).from(availabilityRules).where(and(eq(availabilityRules.tenantId, tenantId), eq(availabilityRules.staffId, staffId))),
    getBusinessHours(tx, tenantId),
  ]);
  if (own.length) return { staffId, own: true, days: rulesToDays(own, biz.days) };
  return { staffId, own: false, days: biz.days.map((d) => ({ ...d })) };
}

/** Replaces the weekly rules of a staff (or the business hours when staffId is null). `inherit` removes the staff's own rules. */
export async function saveSchedule(tx: Tx, tenantId: string, input: { staffId: string | null; inherit?: boolean; days: ScheduleDay[] }, actor: Actor): Promise<Result<null, string>> {
  if (input.staffId) {
    const [st] = await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.tenantId, tenantId), eq(staff.id, input.staffId))).limit(1);
    if (!st) return fail("ไม่พบพนักงาน");
  }
  const where = input.staffId ? and(eq(availabilityRules.tenantId, tenantId), eq(availabilityRules.staffId, input.staffId)) : and(eq(availabilityRules.tenantId, tenantId), isNull(availabilityRules.staffId));
  await tx.delete(availabilityRules).where(where);
  const open = input.inherit && input.staffId ? [] : input.days.filter((d) => !d.closed);
  if (open.length) await tx.insert(availabilityRules).values(open.map((d) => ({ tenantId, staffId: input.staffId, weekday: d.weekday, startTime: d.start, endTime: d.end })));
  await audit(tx, {
    tenantId,
    actorType: actor.actorType,
    actorId: actor.userId,
    action: input.staffId ? "staff.schedule" : "booking.business_hours",
    targetType: input.staffId ? "staff" : "tenant",
    targetId: input.staffId ?? tenantId,
    diff: { inherit: !!input.inherit, open: open.map((d) => `${d.weekday}:${d.start}-${d.end}`) },
  });
  return ok(null);
}

/* -------------------------------------------------------------------------- */
/* time off (availability_overrides, kind = closed)                            */
/* -------------------------------------------------------------------------- */

export interface TimeOffRow {
  id: string;
  staffId: string | null;
  staffName: string | null;
  startsAt: Date;
  endsAt: Date;
  kind: string;
  reason: string | null;
}

/** Overrides ending after `from` (default: start of today). staffId undefined = everyone, null = shop-wide only. */
export async function listTimeOff(tx: Tx, tenantId: string, opts: { staffId?: string | null; from?: Date; limit?: number } = {}): Promise<TimeOffRow[]> {
  const conds: SQL[] = [eq(availabilityOverrides.tenantId, tenantId), gte(availabilityOverrides.endsAt, opts.from ?? new Date(Date.now() - 86_400_000))];
  if (opts.staffId === null) conds.push(isNull(availabilityOverrides.staffId));
  else if (opts.staffId) conds.push(eq(availabilityOverrides.staffId, opts.staffId));
  const rows = await tx
    .select({ id: availabilityOverrides.id, staffId: availabilityOverrides.staffId, staffName: staff.name, startsAt: availabilityOverrides.startsAt, endsAt: availabilityOverrides.endsAt, kind: availabilityOverrides.kind, reason: availabilityOverrides.reason })
    .from(availabilityOverrides)
    .leftJoin(staff, eq(availabilityOverrides.staffId, staff.id))
    .where(and(...conds))
    .orderBy(asc(availabilityOverrides.startsAt))
    .limit(opts.limit ?? 100);
  return rows;
}

/** "YYYY-MM-DDTHH:MM" Bangkok wall time → instant. */
export function bkkLocalToDate(local: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return new Date(NaN);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) - BKK_OFFSET_MS);
}

/** Instant → "YYYY-MM-DDTHH:MM" Bangkok wall time (for datetime-local inputs). */
export function dateToBkkLocal(d: Date): string {
  const t = new Date(d.getTime() + BKK_OFFSET_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}T${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

export async function addTimeOff(tx: Tx, tenantId: string, input: { staffId: string | null; startsAt: string; endsAt: string; reason: string | null }, actor: Actor): Promise<Result<{ id: string; affected: number }, string>> {
  const startsAt = bkkLocalToDate(input.startsAt);
  const endsAt = bkkLocalToDate(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) return fail("ช่วงเวลาไม่ถูกต้อง");
  if (input.staffId) {
    const [st] = await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.tenantId, tenantId), eq(staff.id, input.staffId))).limit(1);
    if (!st) return fail("ไม่พบพนักงาน");
  }
  const [row] = await tx.insert(availabilityOverrides).values({ tenantId, staffId: input.staffId, startsAt, endsAt, kind: "closed", reason: input.reason }).returning({ id: availabilityOverrides.id });
  // how many live bookings fall in the range (admin should move them)
  const conds: SQL[] = [eq(bookings.tenantId, tenantId), sql`${bookings.startsAt} < ${endsAt}`, sql`${bookings.endsAt} > ${startsAt}`, inArray(bookings.status, ["pending", "confirmed", "checked_in", "in_progress"])];
  if (input.staffId) conds.push(eq(bookings.staffId, input.staffId));
  const [{ c } = { c: 0 }] = await tx.select({ c: count() }).from(bookings).where(and(...conds));
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "staff.time_off.add", targetType: "availability_override", targetId: row!.id, diff: { staffId: input.staffId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), reason: input.reason } });
  return ok({ id: row!.id, affected: Number(c) });
}

export async function removeTimeOff(tx: Tx, tenantId: string, id: string, actor: Actor): Promise<boolean> {
  const rows = await tx.delete(availabilityOverrides).where(and(eq(availabilityOverrides.tenantId, tenantId), eq(availabilityOverrides.id, id))).returning({ id: availabilityOverrides.id });
  if (rows.length) await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "staff.time_off.remove", targetType: "availability_override", targetId: id });
  return rows.length > 0;
}

/** Staff that can perform a service in the back-office: active, regardless of the online-booking flag. */
export async function listStaffForServiceAdmin(tx: Tx, tenantId: string, serviceId: string): Promise<Array<{ id: string; name: string; color: string; acceptsOnlineBooking: boolean }>> {
  return tx
    .select({ id: staff.id, name: staff.name, color: staff.color, acceptsOnlineBooking: staff.acceptsOnlineBooking })
    .from(staffServices)
    .innerJoin(staff, eq(staffServices.staffId, staff.id))
    .where(and(eq(staffServices.tenantId, tenantId), eq(staffServices.serviceId, serviceId), eq(staff.active, true)))
    .orderBy(asc(staff.sort), asc(staff.name));
}

