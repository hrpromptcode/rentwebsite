import { beforeAll, describe, expect, it } from "vitest";
import { rentalBlockedDates, rentalStays } from "@rentweb/db";
import { availabilityCalendar, remainingByDate, remainingForStay, searchStays, unitsAvailable, type OccupancyRow } from "../src/services/availability";
import { getUnitTypeById } from "../src/services/catalog";
import { CONFIG, NOW, seedResort, type Seeded } from "./helpers";

let s: Seeded;
beforeAll(async () => {
  s = await seedResort();
});

describe("remainingByDate (pure)", () => {
  const type = { id: "T", quantity: 2 };
  const stays: OccupancyRow[] = [
    { id: "a", unitTypeId: "T", checkIn: "2026-11-10", checkOut: "2026-11-12", status: "confirmed" },
    { id: "b", unitTypeId: "T", checkIn: "2026-11-11", checkOut: "2026-11-14", status: "pending" },
    { id: "x", unitTypeId: "OTHER", checkIn: "2026-11-10", checkOut: "2026-11-20", status: "confirmed" },
  ];
  it("counts overlapping stays per night, check-out night excluded", () => {
    expect(remainingByDate(type, stays, [], "2026-11-09", "2026-11-15")).toEqual({
      "2026-11-09": 2,
      "2026-11-10": 1,
      "2026-11-11": 0,
      "2026-11-12": 1,
      "2026-11-13": 1,
      "2026-11-14": 2,
    });
  });
  it("blocked dates sell nothing and the stay minimum rules the range", () => {
    const blocked = [{ unitTypeId: "T", date: "2026-11-09" }];
    expect(remainingByDate(type, stays, blocked, "2026-11-09", "2026-11-10")).toEqual({ "2026-11-09": 0 });
    expect(remainingForStay(type, stays, [], "2026-11-12", "2026-11-14")).toBe(1);
    expect(remainingForStay(type, stays, [], "2026-11-10", "2026-11-12")).toBe(0);
    expect(remainingForStay(type, stays, [], "2026-11-14", "2026-11-16")).toBe(2);
    expect(remainingForStay(type, stays, [], "2026-11-16", "2026-11-16")).toBe(0); // zero nights
  });
});

describe("availability against the DB", () => {
  it("confirmed and unexpired pending stays hold units; lapsed holds and cancelled stays do not", async () => {
    const deluxe = (await s.tx((tx) => getUnitTypeById(tx, s.tenantId, s.types.deluxe)))!;
    const base = { tenantId: s.tenantId, unitTypeId: deluxe.id, guestName: "x", nights: 2, guests: 2, total: 0, accessKey: "k", checkIn: "2026-11-20", checkOut: "2026-11-22" };
    await s.tx((tx) =>
      tx.insert(rentalStays).values([
        { ...base, number: "AV-1", status: "confirmed" },
        { ...base, number: "AV-2", status: "pending", holdUntil: new Date(NOW.getTime() + 3_600_000) },
        { ...base, number: "AV-3", status: "pending", holdUntil: new Date(NOW.getTime() - 60_000) }, // lapsed
        { ...base, number: "AV-4", status: "cancelled" },
        { ...base, number: "AV-5", status: "no_show" },
      ]),
    );
    expect(await s.tx((tx) => unitsAvailable(tx, s.tenantId, deluxe, "2026-11-20", "2026-11-22", { now: NOW }))).toBe(1);
    // adjacent stays do not collide (check-out day = next check-in day)
    expect(await s.tx((tx) => unitsAvailable(tx, s.tenantId, deluxe, "2026-11-22", "2026-11-24", { now: NOW }))).toBe(3);
    expect(await s.tx((tx) => unitsAvailable(tx, s.tenantId, deluxe, "2026-11-18", "2026-11-20", { now: NOW }))).toBe(3);
    // once the fresh hold lapses too, only the confirmed stay counts
    expect(await s.tx((tx) => unitsAvailable(tx, s.tenantId, deluxe, "2026-11-20", "2026-11-22", { now: new Date(NOW.getTime() + 2 * 3_600_000) }))).toBe(2);
  });

  it("a blocked date hides the type for any range touching it", async () => {
    const villa = (await s.tx((tx) => getUnitTypeById(tx, s.tenantId, s.types.villa)))!;
    await s.tx((tx) => tx.insert(rentalBlockedDates).values({ tenantId: s.tenantId, unitTypeId: villa.id, date: "2026-11-05", reason: "ซ่อมสระ" }));
    expect(await s.tx((tx) => unitsAvailable(tx, s.tenantId, villa, "2026-11-04", "2026-11-06", { now: NOW }))).toBe(0);
    expect(await s.tx((tx) => unitsAvailable(tx, s.tenantId, villa, "2026-11-05", "2026-11-07", { now: NOW }))).toBe(0);
    expect(await s.tx((tx) => unitsAvailable(tx, s.tenantId, villa, "2026-11-03", "2026-11-05", { now: NOW }))).toBe(1); // checks out on the blocked day
    expect(await s.tx((tx) => unitsAvailable(tx, s.tenantId, villa, "2026-11-06", "2026-11-08", { now: NOW }))).toBe(1);
  });

  it("availabilityCalendar: per-date remaining + price, past dates not bookable, blocked flagged", async () => {
    const villa = (await s.tx((tx) => getUnitTypeById(tx, s.tenantId, s.types.villa)))!;
    const days = await s.tx((tx) => availabilityCalendar(tx, s.tenantId, { type: villa, month: "2026-11", config: CONFIG, now: NOW }));
    expect(days).toHaveLength(30);
    const d5 = days.find((d) => d.date === "2026-11-05")!;
    expect(d5).toMatchObject({ remaining: 0, blocked: true, bookable: false });
    const d6 = days.find((d) => d.date === "2026-11-06")!; // Friday in high season
    expect(d6).toMatchObject({ remaining: 1, bookable: true, price: 1650000 });
    const oct = await s.tx((tx) => availabilityCalendar(tx, s.tenantId, { type: villa, month: "2026-10", config: CONFIG, now: NOW }));
    expect(oct.find((d) => d.date === "2026-10-14")?.past).toBe(true);
    expect(oct.find((d) => d.date === "2026-10-15")?.bookable).toBe(true);
  });

  it("searchStays lists every active type with units left and a quote or the reason it cannot take the request", async () => {
    const r = await s.tx((tx) => searchStays(tx, s.tenantId, { checkIn: "2026-11-20", checkOut: "2026-11-22", guests: 2, config: CONFIG, now: NOW }));
    const deluxe = r.find((x) => x.type.slug === "deluxe")!;
    expect(deluxe.remaining).toBe(1);
    expect(deluxe.quote?.total).toBe(825000); // Fri 20 Nov (×1.25×1.1 = 4,125) + Sat 21 Nov (4,125)
    const villa = r.find((x) => x.type.slug === "villa")!;
    expect(villa.remaining).toBe(1);
    expect(villa.quote?.nights).toBe(2);
    const oneNight = await s.tx((tx) => searchStays(tx, s.tenantId, { checkIn: "2026-11-20", checkOut: "2026-11-21", guests: 2, config: CONFIG, now: NOW }));
    expect(oneNight.find((x) => x.type.slug === "villa")).toMatchObject({ quote: null, error: "min_nights" });
    const blockedRange = await s.tx((tx) => searchStays(tx, s.tenantId, { checkIn: "2026-11-04", checkOut: "2026-11-06", guests: 2, config: CONFIG, now: NOW }));
    expect(blockedRange.find((x) => x.type.slug === "villa")?.remaining).toBe(0);
  });
});
