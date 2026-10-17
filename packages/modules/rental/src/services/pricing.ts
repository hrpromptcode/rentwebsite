import type { StayExtraLine, StayNightLine } from "@rentweb/db";
import type { RentalConfig } from "./config";
import { diffDays, eachNight, weekdayOf } from "./time";

/** Shape shared by DB rows and in-memory rules (tests, previews). */
export interface RateRuleLike {
  id?: string;
  name: string;
  unitTypeId: string | null;
  startDate: string | null;
  endDate: string | null;
  weekdays: number[] | null;
  /** "percent" | "price" */
  mode: string;
  value: number;
  priority: number;
  active: boolean;
}

export interface UnitTypeLike {
  id: string;
  basePrice: number;
  baseGuests: number;
  maxGuests: number;
  extraGuestPrice: number;
  minNights: number;
  quantity: number;
}

export interface ExtraLike {
  id: string;
  name: string;
  price: number;
  /** per_stay | per_night | per_guest_night */
  pricing: string;
  active: boolean;
}

/** Hotels quote whole baht: round satang to the nearest 100. */
export function roundBaht(satang: number): number {
  return Math.max(0, Math.round(satang / 100) * 100);
}

export function ruleAppliesOn(rule: RateRuleLike, unitTypeId: string, date: string): boolean {
  if (!rule.active) return false;
  if (rule.unitTypeId && rule.unitTypeId !== unitTypeId) return false;
  if (rule.startDate && date < rule.startDate) return false;
  if (rule.endDate && date > rule.endDate) return false;
  if (rule.weekdays && rule.weekdays.length && !rule.weekdays.includes(weekdayOf(date))) return false;
  return true;
}

/** Price of one night: base, then every matching rule in order (percent rules compound, price rules replace). */
export function nightlyRate(type: UnitTypeLike, rules: RateRuleLike[], date: string): { price: number; applied: string[] } {
  let price = type.basePrice;
  const applied: string[] = [];
  const ordered = [...rules].sort((a, b) => a.priority - b.priority);
  for (const r of ordered) {
    if (!ruleAppliesOn(r, type.id, date)) continue;
    if (r.mode === "price") price = r.value;
    else price = Math.round((price * (100 + r.value)) / 100);
    applied.push(r.name);
  }
  return { price: roundBaht(price), applied };
}

/** Lowest nightly rate over the next `horizonDays` - the "from ฿x / night" label. */
export function fromPrice(type: UnitTypeLike, rules: RateRuleLike[], fromDate: string, horizonDays = 60): number {
  let min = Number.POSITIVE_INFINITY;
  for (const date of eachNight(fromDate, addDaysStr(fromDate, horizonDays))) {
    const p = nightlyRate(type, rules, date).price;
    if (p < min) min = p;
  }
  return Number.isFinite(min) ? min : roundBaht(type.basePrice);
}

function addDaysStr(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

export function extraLineTotal(extra: Pick<ExtraLike, "price" | "pricing">, qty: number, nights: number, guests: number): number {
  const q = Math.max(0, qty);
  if (extra.pricing === "per_night") return extra.price * q * nights;
  if (extra.pricing === "per_guest_night") return extra.price * q * guests * nights;
  return extra.price * q;
}

export type QuoteError = "invalid_dates" | "past_date" | "too_far" | "min_nights" | "max_nights" | "too_many_guests" | "extra_not_found";

export interface Quote {
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  nightly: StayNightLine[];
  roomTotal: number;
  extraGuests: number;
  extraGuestTotal: number;
  extras: StayExtraLine[];
  extrasTotal: number;
  total: number;
  deposit: number;
  depositPercent: number;
  /** names of rules that affected at least one night */
  appliedRules: string[];
}

export interface QuoteInput {
  checkIn: string;
  checkOut: string;
  guests: number;
  extras?: Array<{ id: string; qty: number }>;
  /** civil Bangkok date of "today" (default: now) */
  today: string;
}

/**
 * Pure price computation: nights x rate(date) + extra guests + add-ons; deposit from config.depositPercent.
 * Availability is NOT checked here (see availability.ts).
 */
export function quoteStay(type: UnitTypeLike, rules: RateRuleLike[], extras: ExtraLike[], input: QuoteInput, config: Pick<RentalConfig, "depositPercent" | "maxAdvanceDays" | "maxNights">): { ok: true; quote: Quote } | { ok: false; error: QuoteError } {
  const nights = diffDays(input.checkIn, input.checkOut);
  if (!Number.isFinite(nights) || nights <= 0) return { ok: false, error: "invalid_dates" };
  if (input.checkIn < input.today) return { ok: false, error: "past_date" };
  if (diffDays(input.today, input.checkOut) > config.maxAdvanceDays + 1) return { ok: false, error: "too_far" };
  if (nights < Math.max(1, type.minNights)) return { ok: false, error: "min_nights" };
  if (nights > config.maxNights) return { ok: false, error: "max_nights" };
  const guests = Math.max(1, Math.floor(input.guests || 1));
  if (guests > type.maxGuests) return { ok: false, error: "too_many_guests" };

  const applied = new Set<string>();
  const nightly: StayNightLine[] = eachNight(input.checkIn, input.checkOut).map((date) => {
    const r = nightlyRate(type, rules, date);
    r.applied.forEach((a) => applied.add(a));
    return { date, price: r.price };
  });
  const roomTotal = nightly.reduce((s, n) => s + n.price, 0);
  const extraGuests = Math.max(0, guests - type.baseGuests);
  const extraGuestTotal = roundBaht(extraGuests * type.extraGuestPrice * nights);

  const lines: StayExtraLine[] = [];
  for (const sel of input.extras ?? []) {
    const qty = Math.floor(sel.qty);
    if (!qty || qty < 1) continue;
    const ex = extras.find((e) => e.id === sel.id && e.active);
    if (!ex) return { ok: false, error: "extra_not_found" };
    const q = Math.min(qty, 20);
    lines.push({ id: ex.id, name: ex.name, pricing: ex.pricing, price: ex.price, qty: q, total: roundBaht(extraLineTotal(ex, q, nights, guests)) });
  }
  const extrasTotal = lines.reduce((s, l) => s + l.total, 0);
  const total = roomTotal + extraGuestTotal + extrasTotal;
  const pct = Math.min(100, Math.max(0, config.depositPercent));
  const deposit = pct === 0 ? 0 : pct === 100 ? total : Math.min(total, roundBaht((total * pct) / 100));
  return {
    ok: true,
    quote: { checkIn: input.checkIn, checkOut: input.checkOut, nights, guests, nightly, roomTotal, extraGuests, extraGuestTotal, extras: lines, extrasTotal, total, deposit, depositPercent: pct, appliedRules: [...applied] },
  };
}
