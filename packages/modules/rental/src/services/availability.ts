import { and, eq, gt, inArray, isNull, lt, or, sql, type Tx } from "@rentweb/db";
import { rentalStays } from "@rentweb/db";
import { listBlockedDates, listExtras, listRateRules, listUnitTypes, type BlockedDateRow, type UnitTypeRow } from "./catalog";
import { HOLDING_STAY_STATUSES, type RentalConfig } from "./config";
import { fromPrice, nightlyRate, quoteStay, type Quote, type QuoteError, type RateRuleLike } from "./pricing";
import { addDays, bkkDateString, diffDays, eachNight, monthEnd, parseYm } from "./time";

export interface OccupancyRow {
  id: string;
  unitTypeId: string;
  checkIn: string;
  checkOut: string;
  status: string;
}

/**
 * Stays holding inventory that overlap [from, to): confirmed / checked-in always, pending only while their hold lasts.
 * Check-out is exclusive, so "overlap" = checkIn < to AND checkOut > from.
 */
export async function loadOccupancy(tx: Tx, tenantId: string, opts: { unitTypeIds?: string[]; from: string; to: string; now?: Date; excludeStayId?: string | null }): Promise<OccupancyRow[]> {
  const now = opts.now ?? new Date();
  const where = [
    eq(rentalStays.tenantId, tenantId),
    inArray(rentalStays.status, [...HOLDING_STAY_STATUSES]),
    lt(rentalStays.checkIn, opts.to),
    gt(rentalStays.checkOut, opts.from),
    or(sql`${rentalStays.status} <> 'pending'`, isNull(rentalStays.holdUntil), gt(rentalStays.holdUntil, now))!,
  ];
  if (opts.unitTypeIds) {
    if (!opts.unitTypeIds.length) return [];
    where.push(inArray(rentalStays.unitTypeId, opts.unitTypeIds));
  }
  if (opts.excludeStayId) where.push(sql`${rentalStays.id} <> ${opts.excludeStayId}`);
  return tx.select({ id: rentalStays.id, unitTypeId: rentalStays.unitTypeId, checkIn: rentalStays.checkIn, checkOut: rentalStays.checkOut, status: rentalStays.status }).from(rentalStays).where(and(...where));
}

/** Units of the type still free on each night of [from, to): quantity - overlapping stays - blocked (blocked = 0). */
export function remainingByDate(type: Pick<UnitTypeRow, "id" | "quantity">, stays: OccupancyRow[], blocked: Pick<BlockedDateRow, "unitTypeId" | "date">[], from: string, to: string): Record<string, number> {
  const out: Record<string, number> = {};
  const mine = stays.filter((s) => s.unitTypeId === type.id);
  const blockedSet = new Set(blocked.filter((b) => b.unitTypeId === type.id).map((b) => b.date));
  for (const date of eachNight(from, to)) {
    if (blockedSet.has(date)) {
      out[date] = 0;
      continue;
    }
    let used = 0;
    for (const s of mine) if (s.checkIn <= date && date < s.checkOut) used++;
    out[date] = Math.max(0, type.quantity - used);
  }
  return out;
}

/** Units free for the whole stay = the minimum over its nights. */
export function remainingForStay(type: Pick<UnitTypeRow, "id" | "quantity">, stays: OccupancyRow[], blocked: Pick<BlockedDateRow, "unitTypeId" | "date">[], checkIn: string, checkOut: string): number {
  const perDate = remainingByDate(type, stays, blocked, checkIn, checkOut);
  const values = Object.values(perDate);
  if (!values.length) return 0;
  return Math.min(...values);
}

/** Live re-check used inside the booking transaction (after the advisory lock). */
export async function unitsAvailable(tx: Tx, tenantId: string, type: Pick<UnitTypeRow, "id" | "quantity">, checkIn: string, checkOut: string, opts: { now?: Date; excludeStayId?: string | null } = {}): Promise<number> {
  const [stays, blocked] = await Promise.all([loadOccupancy(tx, tenantId, { unitTypeIds: [type.id], from: checkIn, to: checkOut, now: opts.now, excludeStayId: opts.excludeStayId }), listBlockedDates(tx, tenantId, { unitTypeIds: [type.id], from: checkIn, to: addDays(checkOut, -1) })]);
  return remainingForStay(type, stays, blocked, checkIn, checkOut);
}

export interface CalendarDay {
  date: string;
  /** units free that night */
  remaining: number;
  price: number;
  /** before today / beyond the booking horizon */
  past: boolean;
  blocked: boolean;
  bookable: boolean;
}

/**
 * Month view for one unit type: remaining units + nightly price per date (storefront calendar / admin occupancy).
 * `excludeStayId` lets a stay's own page show the calendar without counting itself.
 */
export async function availabilityCalendar(tx: Tx, tenantId: string, opts: { type: UnitTypeRow; month: string; config: RentalConfig; now?: Date; excludeStayId?: string | null }): Promise<CalendarDay[]> {
  const ym = parseYm(opts.month);
  if (!ym) return [];
  const now = opts.now ?? new Date();
  const today = bkkDateString(now);
  const from = `${opts.month}-01`;
  const last = monthEnd(opts.month);
  const to = addDays(last, 1);
  const horizon = addDays(today, opts.config.maxAdvanceDays);
  const [stays, blocked, rules] = await Promise.all([
    loadOccupancy(tx, tenantId, { unitTypeIds: [opts.type.id], from, to, now, excludeStayId: opts.excludeStayId }),
    listBlockedDates(tx, tenantId, { unitTypeIds: [opts.type.id], from, to: last }),
    listRateRules(tx, tenantId, { unitTypeId: opts.type.id }),
  ]);
  const remaining = remainingByDate(opts.type, stays, blocked, from, to);
  const blockedSet = new Set(blocked.map((b) => b.date));
  return eachNight(from, to).map((date) => {
    const past = date < today || date > horizon;
    const isBlocked = blockedSet.has(date);
    const rem = remaining[date] ?? 0;
    return { date, remaining: rem, price: nightlyRate(opts.type, rules, date).price, past, blocked: isBlocked, bookable: !past && !isBlocked && rem > 0 && opts.type.active };
  });
}

export interface SearchResult {
  type: UnitTypeRow;
  remaining: number;
  quote: Quote | null;
  error: QuoteError | null;
  fromPrice: number;
}

/**
 * Search results for a date range: every active type with the units left for the whole stay and its quote
 * (null + error when the type cannot take the request, e.g. too many guests / min nights).
 */
export async function searchStays(tx: Tx, tenantId: string, opts: { checkIn: string; checkOut: string; guests: number; config: RentalConfig; now?: Date }): Promise<SearchResult[]> {
  const now = opts.now ?? new Date();
  const today = bkkDateString(now);
  const types = await listUnitTypes(tx, tenantId, { activeOnly: true });
  if (!types.length) return [];
  const ids = types.map((t) => t.id);
  const [stays, blocked, rules, extras] = await Promise.all([
    loadOccupancy(tx, tenantId, { unitTypeIds: ids, from: opts.checkIn, to: opts.checkOut, now }),
    listBlockedDates(tx, tenantId, { unitTypeIds: ids, from: opts.checkIn, to: addDays(opts.checkOut, -1) }),
    listRateRules(tx, tenantId, {}),
    listExtras(tx, tenantId, { activeOnly: true }),
  ]);
  return types.map((type) => {
    const remaining = diffDays(opts.checkIn, opts.checkOut) > 0 ? remainingForStay(type, stays, blocked, opts.checkIn, opts.checkOut) : 0;
    const q = quoteStay(type, rules, extras, { checkIn: opts.checkIn, checkOut: opts.checkOut, guests: opts.guests, today }, opts.config);
    return { type, remaining, quote: q.ok ? q.quote : null, error: q.ok ? null : q.error, fromPrice: fromPrice(type, rules, today) };
  });
}

/** "from ฿x / night" for every active type (room grid, /rooms). */
export async function fromPrices(tx: Tx, tenantId: string, types: UnitTypeRow[], now: Date = new Date()): Promise<Record<string, number>> {
  const rules: RateRuleLike[] = await listRateRules(tx, tenantId, {});
  const today = bkkDateString(now);
  return Object.fromEntries(types.map((t) => [t.id, fromPrice(t, rules, today)]));
}
