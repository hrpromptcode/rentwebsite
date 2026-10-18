import { and, asc, count, eq, gte, inArray, ne, sql, type SQL } from "drizzle-orm";
import { rentalBlockedDates, rentalExtras, rentalRateRules, rentalStays, rentalUnitTypes, type Tx } from "@rentweb/db";
import { audit, fail, ok, slugify, type Result } from "@rentweb/core";
import { loadOccupancy, remainingByDate } from "../services/availability";
import { listBlockedDates, listExtras, listRateRules, listUnitTypes, type BlockedDateRow, type ExtraRow, type RateRuleRow, type UnitTypeRow } from "../services/catalog";
import { HOLDING_STAY_STATUSES } from "../services/config";
import { nightlyRate } from "../services/pricing";
import { addDays, bkkDateString, eachNight, monthEnd, parseYm } from "../services/time";
import type { ExtraValues, RateRuleValues, UnitTypeValues } from "./schemas";

export interface Actor {
  userId: string;
  actorType: "user" | "superadmin";
}

export interface FieldError {
  field: string;
  message: string;
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}
function isFkViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23503" || e?.cause?.code === "23503";
}

/* -------------------------------------------------------------------------- */
/* unit types                                                                  */
/* -------------------------------------------------------------------------- */

export async function uniqueUnitTypeSlug(tx: Tx, tenantId: string, base: string, excludeId?: string | null): Promise<string> {
  const root = slugify(base) || "room";
  let candidate = root;
  for (let n = 2; n < 500; n++) {
    const conds: SQL[] = [eq(rentalUnitTypes.tenantId, tenantId), eq(rentalUnitTypes.slug, candidate)];
    if (excludeId) conds.push(ne(rentalUnitTypes.id, excludeId));
    const [row] = await tx.select({ id: rentalUnitTypes.id }).from(rentalUnitTypes).where(and(...conds)).limit(1);
    if (!row) return candidate;
    candidate = `${root}-${n}`;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export interface AdminUnitTypeRow extends UnitTypeRow {
  /** holding stays that have not checked out yet */
  upcomingStays: number;
}

export async function listUnitTypesAdmin(tx: Tx, tenantId: string, opts: { now?: Date } = {}): Promise<AdminUnitTypeRow[]> {
  const all = await listUnitTypes(tx, tenantId, { activeOnly: false });
  const ids = all.map((t) => t.id);
  const upcoming = new Map<string, number>();
  if (ids.length) {
    const today = bkkDateString(opts.now ?? new Date());
    const rows = await tx
      .select({ unitTypeId: rentalStays.unitTypeId, c: count() })
      .from(rentalStays)
      .where(and(eq(rentalStays.tenantId, tenantId), inArray(rentalStays.unitTypeId, ids), inArray(rentalStays.status, [...HOLDING_STAY_STATUSES]), gte(rentalStays.checkOut, today)))
      .groupBy(rentalStays.unitTypeId);
    for (const r of rows) upcoming.set(r.unitTypeId, Number(r.c));
  }
  return all.map((t) => ({ ...t, upcomingStays: upcoming.get(t.id) ?? 0 }));
}

export async function saveUnitType(tx: Tx, tenantId: string, id: string | null, v: UnitTypeValues, actor: Actor): Promise<Result<{ id: string; slug: string }, FieldError>> {
  const slug = await uniqueUnitTypeSlug(tx, tenantId, v.slug || v.name, id);
  const values = {
    name: v.name,
    slug,
    description: v.description,
    gallery: v.gallery,
    baseGuests: v.baseGuests,
    maxGuests: v.maxGuests,
    beds: v.beds,
    sizeSqm: v.sizeSqm,
    amenities: v.amenities,
    quantity: v.quantity,
    basePrice: v.basePrice,
    extraGuestPrice: v.extraGuestPrice,
    minNights: v.minNights,
    active: v.active,
    featured: v.featured,
    sort: v.sort,
  };
  try {
    if (id) {
      const [row] = await tx.update(rentalUnitTypes).set(values).where(and(eq(rentalUnitTypes.tenantId, tenantId), eq(rentalUnitTypes.id, id))).returning({ id: rentalUnitTypes.id, slug: rentalUnitTypes.slug });
      if (!row) return fail({ field: "_", message: "ไม่พบประเภทห้องพัก" });
      await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "rental.unit_type.update", targetType: "rental_unit_type", targetId: row.id, diff: { name: v.name, quantity: v.quantity, basePrice: v.basePrice, active: v.active } });
      return ok(row);
    }
    const [row] = await tx.insert(rentalUnitTypes).values({ tenantId, ...values }).returning({ id: rentalUnitTypes.id, slug: rentalUnitTypes.slug });
    await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "rental.unit_type.create", targetType: "rental_unit_type", targetId: row!.id, diff: { name: v.name, quantity: v.quantity, basePrice: v.basePrice } });
    return ok(row!);
  } catch (err) {
    if (isUniqueViolation(err)) return fail({ field: "slug", message: "slug นี้ถูกใช้แล้ว" });
    throw err;
  }
}

export async function setUnitTypeFlags(tx: Tx, tenantId: string, id: string, flags: { active?: boolean; featured?: boolean }, actor: Actor): Promise<boolean> {
  const set: Partial<typeof rentalUnitTypes.$inferInsert> = {};
  if (flags.active !== undefined) set.active = flags.active;
  if (flags.featured !== undefined) set.featured = flags.featured;
  if (!Object.keys(set).length) return false;
  const [row] = await tx.update(rentalUnitTypes).set(set).where(and(eq(rentalUnitTypes.tenantId, tenantId), eq(rentalUnitTypes.id, id))).returning({ id: rentalUnitTypes.id });
  if (!row) return false;
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "rental.unit_type.flags", targetType: "rental_unit_type", targetId: id, diff: flags });
  return true;
}

/** Deletes a type that no stay references; otherwise the caller should deactivate it instead. */
export async function deleteUnitType(tx: Tx, tenantId: string, id: string, actor: Actor): Promise<Result<null, string>> {
  const [ref] = await tx.select({ c: count() }).from(rentalStays).where(and(eq(rentalStays.tenantId, tenantId), eq(rentalStays.unitTypeId, id)));
  if (Number(ref?.c ?? 0) > 0) return fail("มีการจองอ้างอิงประเภทห้องนี้อยู่ — ปิดการใช้งานแทนการลบ");
  try {
    const [row] = await tx.delete(rentalUnitTypes).where(and(eq(rentalUnitTypes.tenantId, tenantId), eq(rentalUnitTypes.id, id))).returning({ id: rentalUnitTypes.id, name: rentalUnitTypes.name });
    if (!row) return fail("ไม่พบประเภทห้องพัก");
    await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "rental.unit_type.delete", targetType: "rental_unit_type", targetId: id, diff: { name: row.name } });
    return ok(null);
  } catch (err) {
    if (isFkViolation(err)) return fail("มีข้อมูลอ้างอิงประเภทห้องนี้อยู่ — ปิดการใช้งานแทนการลบ");
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* extras                                                                      */
/* -------------------------------------------------------------------------- */

export async function listExtrasAdmin(tx: Tx, tenantId: string): Promise<ExtraRow[]> {
  return listExtras(tx, tenantId, { activeOnly: false });
}

export async function saveExtra(tx: Tx, tenantId: string, id: string | null, v: ExtraValues, actor: Actor): Promise<Result<{ id: string }, string>> {
  const values = { name: v.name, description: v.description, price: v.price, pricing: v.pricing, active: v.active, sort: v.sort };
  if (id) {
    const [row] = await tx.update(rentalExtras).set(values).where(and(eq(rentalExtras.tenantId, tenantId), eq(rentalExtras.id, id))).returning({ id: rentalExtras.id });
    if (!row) return fail("ไม่พบบริการเสริม");
    await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "rental.extra.update", targetType: "rental_extra", targetId: row.id, diff: values });
    return ok(row);
  }
  const [row] = await tx.insert(rentalExtras).values({ tenantId, ...values }).returning({ id: rentalExtras.id });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "rental.extra.create", targetType: "rental_extra", targetId: row!.id, diff: values });
  return ok(row!);
}

export async function deleteExtra(tx: Tx, tenantId: string, id: string, actor: Actor): Promise<boolean> {
  const [row] = await tx.delete(rentalExtras).where(and(eq(rentalExtras.tenantId, tenantId), eq(rentalExtras.id, id))).returning({ id: rentalExtras.id, name: rentalExtras.name });
  if (!row) return false;
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "rental.extra.delete", targetType: "rental_extra", targetId: id, diff: { name: row.name } });
  return true;
}

/* -------------------------------------------------------------------------- */
/* rate rules                                                                  */
/* -------------------------------------------------------------------------- */

export interface AdminRateRuleRow extends RateRuleRow {
  unitTypeName: string | null;
}

export async function listRateRulesAdmin(tx: Tx, tenantId: string): Promise<AdminRateRuleRow[]> {
  const rows = await tx
    .select({ rule: rentalRateRules, unitTypeName: rentalUnitTypes.name })
    .from(rentalRateRules)
    .leftJoin(rentalUnitTypes, and(eq(rentalUnitTypes.id, rentalRateRules.unitTypeId), eq(rentalUnitTypes.tenantId, tenantId)))
    .where(eq(rentalRateRules.tenantId, tenantId))
    .orderBy(asc(rentalRateRules.priority), asc(rentalRateRules.createdAt));
  return rows.map((r) => ({ ...r.rule, unitTypeName: r.unitTypeName }));
}

export async function saveRateRule(tx: Tx, tenantId: string, id: string | null, v: RateRuleValues, actor: Actor): Promise<Result<{ id: string }, FieldError>> {
  if (v.unitTypeId) {
    const [t] = await tx.select({ id: rentalUnitTypes.id }).from(rentalUnitTypes).where(and(eq(rentalUnitTypes.tenantId, tenantId), eq(rentalUnitTypes.id, v.unitTypeId))).limit(1);
    if (!t) return fail({ field: "unitTypeId", message: "ไม่พบประเภทห้องพัก" });
  }
  const values = { name: v.name, unitTypeId: v.unitTypeId, startDate: v.startDate, endDate: v.endDate, weekdays: v.weekdays.length ? v.weekdays : null, mode: v.mode, value: v.value, priority: v.priority, active: v.active };
  if (id) {
    const [row] = await tx.update(rentalRateRules).set(values).where(and(eq(rentalRateRules.tenantId, tenantId), eq(rentalRateRules.id, id))).returning({ id: rentalRateRules.id });
    if (!row) return fail({ field: "_", message: "ไม่พบกฎราคา" });
    await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "rental.rate_rule.update", targetType: "rental_rate_rule", targetId: row.id, diff: values });
    return ok(row);
  }
  const [row] = await tx.insert(rentalRateRules).values({ tenantId, ...values }).returning({ id: rentalRateRules.id });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "rental.rate_rule.create", targetType: "rental_rate_rule", targetId: row!.id, diff: values });
  return ok(row!);
}

export async function setRateRuleActive(tx: Tx, tenantId: string, id: string, active: boolean, actor: Actor): Promise<boolean> {
  const [row] = await tx.update(rentalRateRules).set({ active }).where(and(eq(rentalRateRules.tenantId, tenantId), eq(rentalRateRules.id, id))).returning({ id: rentalRateRules.id });
  if (!row) return false;
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "rental.rate_rule.flags", targetType: "rental_rate_rule", targetId: id, diff: { active } });
  return true;
}

export async function deleteRateRule(tx: Tx, tenantId: string, id: string, actor: Actor): Promise<boolean> {
  const [row] = await tx.delete(rentalRateRules).where(and(eq(rentalRateRules.tenantId, tenantId), eq(rentalRateRules.id, id))).returning({ id: rentalRateRules.id, name: rentalRateRules.name });
  if (!row) return false;
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "rental.rate_rule.delete", targetType: "rental_rate_rule", targetId: id, diff: { name: row.name } });
  return true;
}

export interface RatePreview {
  type: UnitTypeRow;
  price: number;
  applied: string[];
}

/** Nightly price of every type on a date, with the rules that fired (rates page preview). */
export async function previewRates(tx: Tx, tenantId: string, date: string): Promise<RatePreview[]> {
  const [types, rules] = await Promise.all([listUnitTypes(tx, tenantId, { activeOnly: false }), listRateRules(tx, tenantId, {})]);
  return types.map((type) => ({ type, ...nightlyRate(type, rules, date) }));
}

/* -------------------------------------------------------------------------- */
/* blocked dates + occupancy calendar                                           */
/* -------------------------------------------------------------------------- */

export interface AdminBlockedRow extends BlockedDateRow {
  unitTypeName: string;
}

export async function listBlockedAdmin(tx: Tx, tenantId: string, opts: { from: string; to: string }): Promise<AdminBlockedRow[]> {
  const rows = await tx
    .select({ b: rentalBlockedDates, unitTypeName: rentalUnitTypes.name })
    .from(rentalBlockedDates)
    .innerJoin(rentalUnitTypes, and(eq(rentalUnitTypes.id, rentalBlockedDates.unitTypeId), eq(rentalUnitTypes.tenantId, tenantId)))
    .where(and(eq(rentalBlockedDates.tenantId, tenantId), gte(rentalBlockedDates.date, opts.from), sql`${rentalBlockedDates.date} <= ${opts.to}`))
    .orderBy(asc(rentalBlockedDates.date), asc(rentalUnitTypes.sort));
  return rows.map((r) => ({ ...r.b, unitTypeName: r.unitTypeName }));
}

/** Blocks (insert, duplicates ignored) or unblocks (delete) every date of the inclusive range for one type. */
export async function setBlockedDates(tx: Tx, tenantId: string, input: { unitTypeId: string; from: string; to: string; blocked: boolean; reason?: string | null }, actor: Actor): Promise<Result<{ changed: number }, string>> {
  const [type] = await tx.select({ id: rentalUnitTypes.id, name: rentalUnitTypes.name }).from(rentalUnitTypes).where(and(eq(rentalUnitTypes.tenantId, tenantId), eq(rentalUnitTypes.id, input.unitTypeId))).limit(1);
  if (!type) return fail("ไม่พบประเภทห้องพัก");
  const dates = eachNight(input.from, addDays(input.to, 1));
  if (!dates.length) return fail("ช่วงวันที่ไม่ถูกต้อง");
  let changed = 0;
  if (input.blocked) {
    const rows = await tx
      .insert(rentalBlockedDates)
      .values(dates.map((date) => ({ tenantId, unitTypeId: type.id, date, reason: input.reason ?? null })))
      .onConflictDoNothing()
      .returning({ id: rentalBlockedDates.id });
    changed = rows.length;
  } else {
    const rows = await tx.delete(rentalBlockedDates).where(and(eq(rentalBlockedDates.tenantId, tenantId), eq(rentalBlockedDates.unitTypeId, type.id), inArray(rentalBlockedDates.date, dates))).returning({ id: rentalBlockedDates.id });
    changed = rows.length;
  }
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: input.blocked ? "rental.block" : "rental.unblock", targetType: "rental_unit_type", targetId: type.id, diff: { from: input.from, to: input.to, reason: input.reason ?? null, changed } });
  return ok({ changed });
}

export interface OccupancyDay {
  date: string;
  /** units with a holding stay that night */
  booked: number;
  remaining: number;
  blocked: boolean;
  past: boolean;
}

export interface OccupancyStay {
  id: string;
  number: string;
  guestName: string;
  status: string;
  checkIn: string;
  checkOut: string;
  unitTypeId: string;
  unitNumber: string | null;
  paymentStatus: string;
}

export interface OccupancyMonth {
  month: string;
  today: string;
  types: Array<{ type: UnitTypeRow; days: OccupancyDay[] }>;
  stays: OccupancyStay[];
}

/** Month grid for the admin calendar: per type and date how many units are taken / free / blocked, plus the stays themselves. */
export async function occupancyMonth(tx: Tx, tenantId: string, month: string, now: Date = new Date()): Promise<OccupancyMonth | null> {
  if (!parseYm(month)) return null;
  const today = bkkDateString(now);
  const from = `${month}-01`;
  const last = monthEnd(month);
  const to = addDays(last, 1);
  const types = await listUnitTypes(tx, tenantId, { activeOnly: false });
  const ids = types.map((t) => t.id);
  const [occ, blocked] = await Promise.all([loadOccupancy(tx, tenantId, { unitTypeIds: ids, from, to, now }), listBlockedDates(tx, tenantId, { unitTypeIds: ids, from, to: last })]);
  const stays = occ.length
    ? await tx
        .select({ id: rentalStays.id, number: rentalStays.number, guestName: rentalStays.guestName, status: rentalStays.status, checkIn: rentalStays.checkIn, checkOut: rentalStays.checkOut, unitTypeId: rentalStays.unitTypeId, unitNumber: rentalStays.unitNumber, paymentStatus: rentalStays.paymentStatus })
        .from(rentalStays)
        .where(and(eq(rentalStays.tenantId, tenantId), inArray(rentalStays.id, occ.map((o) => o.id))))
        .orderBy(asc(rentalStays.checkIn), asc(rentalStays.number))
    : [];
  const blockedByType = new Map<string, Set<string>>();
  for (const b of blocked) blockedByType.set(b.unitTypeId, new Set([...(blockedByType.get(b.unitTypeId) ?? []), b.date]));
  return {
    month,
    today,
    types: types.map((type) => {
      const remaining = remainingByDate(type, occ, blocked, from, to);
      const blockedSet = blockedByType.get(type.id) ?? new Set<string>();
      const mine = occ.filter((o) => o.unitTypeId === type.id);
      return {
        type,
        days: eachNight(from, to).map((date) => ({ date, booked: mine.filter((s) => s.checkIn <= date && date < s.checkOut).length, remaining: remaining[date] ?? 0, blocked: blockedSet.has(date), past: date < today })),
      };
    }),
    stays,
  };
}
