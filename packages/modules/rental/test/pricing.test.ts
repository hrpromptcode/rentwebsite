import { describe, expect, it } from "vitest";
import { extraLineTotal, fromPrice, nightlyRate, quoteStay, roundBaht, type ExtraLike, type RateRuleLike, type UnitTypeLike } from "../src/services/pricing";
import { eachNight, diffDays, weekdayOf, formatThaiRange } from "../src/services/time";
import { CONFIG } from "./helpers";

const deluxe: UnitTypeLike = { id: "t-deluxe", basePrice: 300000, baseGuests: 2, maxGuests: 3, extraGuestPrice: 80000, minNights: 1, quantity: 3 };
const villa: UnitTypeLike = { id: "t-villa", basePrice: 1200000, baseGuests: 4, maxGuests: 6, extraGuestPrice: 150000, minNights: 2, quantity: 1 };

const rules: RateRuleLike[] = [
  { name: "ไฮซีซัน", unitTypeId: null, startDate: "2026-11-01", endDate: "2027-02-28", weekdays: null, mode: "percent", value: 25, priority: 10, active: true },
  { name: "สุดสัปดาห์", unitTypeId: null, startDate: null, endDate: null, weekdays: [5, 6], mode: "percent", value: 10, priority: 20, active: true },
  { name: "คริสต์มาส", unitTypeId: "t-villa", startDate: "2026-12-24", endDate: "2026-12-26", weekdays: null, mode: "price", value: 1800000, priority: 30, active: true },
  { name: "ปิดอยู่", unitTypeId: null, startDate: null, endDate: null, weekdays: null, mode: "percent", value: 99, priority: 0, active: false },
];

const extras: ExtraLike[] = [
  { id: "e-bf", name: "อาหารเช้า", price: 35000, pricing: "per_guest_night", active: true },
  { id: "e-pickup", name: "รถรับส่ง", price: 180000, pricing: "per_stay", active: true },
  { id: "e-bed", name: "เตียงเสริม", price: 90000, pricing: "per_night", active: true },
  { id: "e-off", name: "ปิดแล้ว", price: 1, pricing: "per_stay", active: false },
];

describe("time helpers", () => {
  it("check-out is exclusive: 3 nights 10→13 are 10, 11, 12", () => {
    expect(eachNight("2026-11-10", "2026-11-13")).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(diffDays("2026-11-10", "2026-11-13")).toBe(3);
    expect(eachNight("2026-11-13", "2026-11-10")).toEqual([]);
  });
  it("weekdays and Thai range labels", () => {
    expect(weekdayOf("2026-10-16")).toBe(5); // Friday
    expect(formatThaiRange("2026-11-10", "2026-11-13")).toBe("10–13 พ.ย. 2569");
    expect(formatThaiRange("2026-12-30", "2027-01-02")).toContain("ธ.ค.");
  });
});

describe("nightlyRate", () => {
  it("weekday in low season = base price", () => {
    expect(nightlyRate(deluxe, rules, "2026-10-20")).toEqual({ price: 300000, applied: [] }); // Tuesday
  });
  it("weekend +10% (Friday / Saturday only)", () => {
    expect(nightlyRate(deluxe, rules, "2026-10-16").price).toBe(330000); // Fri
    expect(nightlyRate(deluxe, rules, "2026-10-17").price).toBe(330000); // Sat
    expect(nightlyRate(deluxe, rules, "2026-10-18").price).toBe(300000); // Sun
  });
  it("high season +25% compounds with the weekend +10%", () => {
    expect(nightlyRate(deluxe, rules, "2026-12-01").price).toBe(375000); // Tue, Dec
    const sat = nightlyRate(deluxe, rules, "2026-12-05"); // Sat, Dec
    expect(sat.price).toBe(roundBaht(300000 * 1.25 * 1.1));
    expect(sat.applied).toEqual(["ไฮซีซัน", "สุดสัปดาห์"]);
  });
  it("a fixed-price rule replaces whatever came before it and only hits its type", () => {
    expect(nightlyRate(villa, rules, "2026-12-25").price).toBe(1800000); // Fri Christmas → fixed (after +25% and +10%)
    expect(nightlyRate(deluxe, rules, "2026-12-25").price).toBe(roundBaht(300000 * 1.25 * 1.1));
  });
  it("inactive rules are ignored and rates round to whole baht", () => {
    expect(nightlyRate({ ...deluxe, basePrice: 123456 }, rules, "2026-10-16").price % 100).toBe(0);
    expect(nightlyRate(deluxe, rules, "2026-10-20").applied).not.toContain("ปิดอยู่");
  });
  it("fromPrice picks the cheapest night over the horizon", () => {
    expect(fromPrice(deluxe, rules, "2026-10-15")).toBe(300000);
    expect(fromPrice(deluxe, rules, "2026-11-02")).toBe(375000); // all high season, Mon start → weekday
  });
});

describe("quoteStay", () => {
  const today = "2026-10-15";
  it("nights × rate + extras, deposit 30% rounded to baht", () => {
    const r = quoteStay(deluxe, rules, extras, { checkIn: "2026-10-15", checkOut: "2026-10-18", guests: 2, extras: [{ id: "e-bf", qty: 1 }, { id: "e-pickup", qty: 1 }], today }, CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const q = r.quote;
    expect(q.nights).toBe(3);
    expect(q.nightly.map((n) => n.price)).toEqual([300000, 330000, 330000]); // Thu, Fri, Sat
    expect(q.roomTotal).toBe(960000);
    expect(q.extraGuestTotal).toBe(0);
    // breakfast per guest per night: 350 × 2 × 3 = 2,100 · pickup per stay 1,800
    expect(q.extras.map((e) => e.total)).toEqual([210000, 180000]);
    expect(q.extrasTotal).toBe(390000);
    expect(q.total).toBe(1350000);
    expect(q.deposit).toBe(405000);
    expect(q.appliedRules).toEqual(["สุดสัปดาห์"]);
  });
  it("extra guests above the included count are charged per night", () => {
    const r = quoteStay(deluxe, rules, extras, { checkIn: "2026-10-19", checkOut: "2026-10-21", guests: 3, today }, CONFIG);
    expect(r.ok && r.quote.extraGuestTotal).toBe(160000); // 1 extra × 800 × 2 nights
    expect(r.ok && r.quote.total).toBe(760000);
  });
  it("per-night extras multiply by nights, qty capped at 20", () => {
    expect(extraLineTotal(extras[2]!, 2, 3, 2)).toBe(540000);
    const r = quoteStay(deluxe, rules, extras, { checkIn: "2026-10-19", checkOut: "2026-10-21", guests: 1, extras: [{ id: "e-bed", qty: 50 }], today }, CONFIG);
    expect(r.ok && r.quote.extras[0]?.qty).toBe(20);
  });
  it("validation: dates, past, min / max nights, guests, unknown or inactive extras", () => {
    const base = { guests: 2, today };
    expect(quoteStay(deluxe, rules, extras, { ...base, checkIn: "2026-10-20", checkOut: "2026-10-20" }, CONFIG)).toEqual({ ok: false, error: "invalid_dates" });
    expect(quoteStay(deluxe, rules, extras, { ...base, checkIn: "2026-10-21", checkOut: "2026-10-20" }, CONFIG)).toEqual({ ok: false, error: "invalid_dates" });
    expect(quoteStay(deluxe, rules, extras, { ...base, checkIn: "2026-10-14", checkOut: "2026-10-16" }, CONFIG)).toEqual({ ok: false, error: "past_date" });
    expect(quoteStay(villa, rules, extras, { ...base, checkIn: "2026-10-20", checkOut: "2026-10-21" }, CONFIG)).toEqual({ ok: false, error: "min_nights" });
    expect(quoteStay(deluxe, rules, extras, { ...base, checkIn: "2026-10-20", checkOut: "2026-12-20" }, CONFIG)).toEqual({ ok: false, error: "max_nights" });
    expect(quoteStay(deluxe, rules, extras, { ...base, guests: 4, checkIn: "2026-10-20", checkOut: "2026-10-22" }, CONFIG)).toEqual({ ok: false, error: "too_many_guests" });
    expect(quoteStay(deluxe, rules, extras, { ...base, checkIn: "2026-10-20", checkOut: "2026-10-22", extras: [{ id: "e-off", qty: 1 }] }, CONFIG)).toEqual({ ok: false, error: "extra_not_found" });
    expect(quoteStay(deluxe, rules, extras, { ...base, checkIn: "2027-11-20", checkOut: "2027-11-22" }, CONFIG)).toEqual({ ok: false, error: "too_far" });
  });
  it("deposit policy: 100% = full total, 0% = nothing due", () => {
    const input = { checkIn: "2026-10-19", checkOut: "2026-10-21", guests: 2, today };
    expect(quoteStay(deluxe, rules, extras, input, { ...CONFIG, depositPercent: 100 })).toMatchObject({ ok: true, quote: { deposit: 600000 } });
    expect(quoteStay(deluxe, rules, extras, input, { ...CONFIG, depositPercent: 0 })).toMatchObject({ ok: true, quote: { deposit: 0 } });
  });
});
