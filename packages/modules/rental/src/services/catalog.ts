import { and, asc, desc, eq, gte, inArray, isNull, lte, or, type Tx } from "@rentweb/db";
import { rentalBlockedDates, rentalExtras, rentalRateRules, rentalUnitTypes } from "@rentweb/db";
import { isUuid } from "@rentweb/core";

export type UnitTypeRow = typeof rentalUnitTypes.$inferSelect;
export type RateRuleRow = typeof rentalRateRules.$inferSelect;
export type BlockedDateRow = typeof rentalBlockedDates.$inferSelect;
export type ExtraRow = typeof rentalExtras.$inferSelect;

/* ------------------------------------------------------------------ */
/* unit types                                                           */
/* ------------------------------------------------------------------ */

export async function listUnitTypes(tx: Tx, tenantId: string, opts: { activeOnly?: boolean; featuredOnly?: boolean; limit?: number } = {}): Promise<UnitTypeRow[]> {
  const where = [eq(rentalUnitTypes.tenantId, tenantId)];
  if (opts.activeOnly !== false) where.push(eq(rentalUnitTypes.active, true));
  if (opts.featuredOnly) where.push(eq(rentalUnitTypes.featured, true));
  const q = tx
    .select()
    .from(rentalUnitTypes)
    .where(and(...where))
    .orderBy(asc(rentalUnitTypes.sort), asc(rentalUnitTypes.basePrice), asc(rentalUnitTypes.createdAt));
  return opts.limit ? q.limit(opts.limit) : q;
}

export async function getUnitTypeBySlug(tx: Tx, tenantId: string, slug: string): Promise<UnitTypeRow | null> {
  const [row] = await tx
    .select()
    .from(rentalUnitTypes)
    .where(and(eq(rentalUnitTypes.tenantId, tenantId), eq(rentalUnitTypes.slug, slug)))
    .limit(1);
  return row ?? null;
}

export async function getUnitTypeById(tx: Tx, tenantId: string, id: string): Promise<UnitTypeRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx
    .select()
    .from(rentalUnitTypes)
    .where(and(eq(rentalUnitTypes.tenantId, tenantId), eq(rentalUnitTypes.id, id)))
    .limit(1);
  return row ?? null;
}

/* ------------------------------------------------------------------ */
/* extras                                                               */
/* ------------------------------------------------------------------ */

export async function listExtras(tx: Tx, tenantId: string, opts: { activeOnly?: boolean } = {}): Promise<ExtraRow[]> {
  const where = [eq(rentalExtras.tenantId, tenantId)];
  if (opts.activeOnly !== false) where.push(eq(rentalExtras.active, true));
  return tx
    .select()
    .from(rentalExtras)
    .where(and(...where))
    .orderBy(asc(rentalExtras.sort), asc(rentalExtras.createdAt));
}

/* ------------------------------------------------------------------ */
/* rate rules                                                           */
/* ------------------------------------------------------------------ */

/** Active rules that may apply to the type (its own + global), in application order (priority, then age). */
export async function listRateRules(tx: Tx, tenantId: string, opts: { unitTypeId?: string | null; activeOnly?: boolean } = {}): Promise<RateRuleRow[]> {
  const where = [eq(rentalRateRules.tenantId, tenantId)];
  if (opts.activeOnly !== false) where.push(eq(rentalRateRules.active, true));
  if (opts.unitTypeId) where.push(or(isNull(rentalRateRules.unitTypeId), eq(rentalRateRules.unitTypeId, opts.unitTypeId))!);
  return tx
    .select()
    .from(rentalRateRules)
    .where(and(...where))
    .orderBy(asc(rentalRateRules.priority), asc(rentalRateRules.createdAt));
}

/* ------------------------------------------------------------------ */
/* blocked dates                                                        */
/* ------------------------------------------------------------------ */

/** Blocked dates in [from, to) for the given types (all types when omitted). */
export async function listBlockedDates(tx: Tx, tenantId: string, opts: { unitTypeIds?: string[]; from: string; to: string }): Promise<BlockedDateRow[]> {
  const where = [eq(rentalBlockedDates.tenantId, tenantId), gte(rentalBlockedDates.date, opts.from), lte(rentalBlockedDates.date, opts.to)];
  if (opts.unitTypeIds) {
    if (!opts.unitTypeIds.length) return [];
    where.push(inArray(rentalBlockedDates.unitTypeId, opts.unitTypeIds));
  }
  return tx
    .select()
    .from(rentalBlockedDates)
    .where(and(...where))
    .orderBy(asc(rentalBlockedDates.date));
}

export async function listRecentBlocked(tx: Tx, tenantId: string, limit = 50): Promise<BlockedDateRow[]> {
  return tx.select().from(rentalBlockedDates).where(eq(rentalBlockedDates.tenantId, tenantId)).orderBy(desc(rentalBlockedDates.date)).limit(limit);
}
