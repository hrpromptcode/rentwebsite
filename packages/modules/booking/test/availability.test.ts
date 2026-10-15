import { describe, expect, it } from "vitest";
import { computeSlots, freeStaffAt, type SlotEngineInput } from "../src/services/availability";
import { formatBkkTime } from "../src/services/time";
import { at, CONFIG, DAY, NOW } from "./helpers";

const SERVICE = { id: "svc", durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 15, capacity: 1, requiresStaff: true };

const businessHours = Array.from({ length: 7 }, (_, d) => ({ staffId: null, weekday: d, startTime: "10:00:00", endTime: "22:00:00" }));
const annRules = [1, 2, 3, 4, 5, 6].map((d) => ({ staffId: "ann", weekday: d, startTime: "13:00:00", endTime: "22:00:00" }));

function base(over: Partial<SlotEngineInput> = {}): SlotEngineInput {
  return { config: CONFIG, service: SERVICE, date: DAY, eligibleStaffIds: ["ann", "mali"], rules: [...businessHours, ...annRules], overrides: [], bookings: [], now: NOW, ...over };
}

const times = (slots: ReturnType<typeof computeSlots>, onlyAvailable = true) => slots.filter((s) => !onlyAvailable || s.available).map((s) => formatBkkTime(s.start));

describe("slot engine", () => {
  it("staff rules override business hours; staff without rules use business hours", () => {
    const ann = computeSlots(base({ staffId: "ann" }));
    const mali = computeSlots(base({ staffId: "mali" }));
    expect(times(ann)[0]).toBe("13:00");
    expect(times(mali)[0]).toBe("10:00");
    // last 60-min service must end by 22:00
    expect(times(ann).at(-1)).toBe("21:00");
    expect(times(mali).at(-1)).toBe("21:00");
    expect(ann.every((s) => s.staffId === "ann")).toBe(true);
  });

  it("a staff day off (no rule for that weekday) has no slots", () => {
    // 2026-10-18 is a Sunday – Ann has rules only Mon–Sat
    expect(computeSlots(base({ staffId: "ann", date: "2026-10-18" }))).toEqual([]);
    expect(times(computeSlots(base({ staffId: "mali", date: "2026-10-18" }))).length).toBeGreaterThan(0);
  });

  it("existing booking blocks its time and the buffer after it", () => {
    const booked = [{ staffId: "mali", serviceId: "svc", startsAt: new Date(at(DAY, "10:00")), endsAt: new Date(at(DAY, "11:00")), bufferAfterMin: 15 }];
    const slots = computeSlots(base({ staffId: "mali", bookings: booked }));
    const byTime = Object.fromEntries(slots.map((s) => [formatBkkTime(s.start), s.available]));
    expect(byTime["10:00"]).toBe(false);
    expect(byTime["10:30"]).toBe(false);
    // 11:00 start collides with the 15-min buffer after the existing booking
    expect(byTime["11:00"]).toBe(false);
    expect(byTime["11:30"]).toBe(true);
    // candidate's own buffer-after (15) is also respected: 09:00 would be fine but 09:30 → occupies till 10:45
    const earlier = computeSlots(base({ staffId: "mali", bookings: booked, rules: [{ staffId: null, weekday: 5, startTime: "08:00", endTime: "22:00" }] }));
    const e = Object.fromEntries(earlier.map((s) => [formatBkkTime(s.start), s.available]));
    expect(e["08:30"]).toBe(true); // 08:30–09:30 + buffer → 09:45 < 10:00
    expect(e["09:00"]).toBe(false); // 09:00–10:00 + buffer → 10:15 overlaps 10:00 booking
  });

  it("'ใครก็ได้' merges staff and counts how many are free", () => {
    const booked = [{ staffId: "mali", serviceId: "svc", startsAt: new Date(at(DAY, "14:00")), endsAt: new Date(at(DAY, "15:00")), bufferAfterMin: 15 }];
    const slots = computeSlots(base({ staffId: null, bookings: booked }));
    const at10 = slots.find((s) => formatBkkTime(s.start) === "10:00")!;
    const at14 = slots.find((s) => formatBkkTime(s.start) === "14:00")!;
    const at16 = slots.find((s) => formatBkkTime(s.start) === "16:00")!;
    expect(at10.remaining).toBe(1); // only Mali works mornings
    expect(at14.available).toBe(true);
    expect(at14.remaining).toBe(1); // Mali busy, Ann free
    expect(at16.remaining).toBe(2);
    expect(freeStaffAt(base({ bookings: booked }), at(DAY, "14:00"))).toEqual(["ann"]);
    expect(at10.staffId).toBeNull();
  });

  it("capacity 2 allows a second booking, blocks the third", () => {
    const couple = { ...SERVICE, id: "couple", durationMin: 120, bufferAfterMin: 0, capacity: 2 };
    const one = [{ staffId: null, serviceId: "couple", startsAt: new Date(at(DAY, "10:00")), endsAt: new Date(at(DAY, "12:00")) }];
    const s1 = computeSlots(base({ service: couple, bookings: one })).find((s) => formatBkkTime(s.start) === "10:00")!;
    expect(s1.available).toBe(true);
    expect(s1.remaining).toBe(1);
    const s2 = computeSlots(base({ service: couple, bookings: [...one, ...one] })).find((s) => formatBkkTime(s.start) === "10:00")!;
    expect(s2.available).toBe(false);
    expect(s2.remaining).toBe(0);
    // overlapping start also counts
    const s3 = computeSlots(base({ service: couple, bookings: [...one, ...one] })).find((s) => formatBkkTime(s.start) === "11:00")!;
    expect(s3.available).toBe(false);
  });

  it("a closed override removes the day (or part of it)", () => {
    const wholeDay = [{ staffId: null, startsAt: new Date(at(DAY, "00:00")), endsAt: new Date(at("2026-10-17", "00:00")), kind: "closed" }];
    expect(computeSlots(base({ overrides: wholeDay }))).toEqual([]);
    const lunch = [{ staffId: "mali", startsAt: new Date(at(DAY, "12:00")), endsAt: new Date(at(DAY, "13:00")), kind: "closed" }];
    const t = times(computeSlots(base({ staffId: "mali", overrides: lunch })));
    expect(t).not.toContain("11:30"); // would run into 12:00
    expect(t).not.toContain("12:00");
    expect(t).not.toContain("12:30");
    expect(t).toContain("13:00");
    expect(t).toContain("11:00");
  });

  it("minNotice hides slots too close to now; past days and days beyond maxAdvanceDays return nothing", () => {
    // now = 09:00 today; minNotice 1h → first slot today ≥ 10:00; with minNotice 3h → ≥ 12:00
    const today = "2026-10-15";
    expect(times(computeSlots(base({ staffId: "mali", date: today })))[0]).toBe("10:00");
    expect(times(computeSlots(base({ staffId: "mali", date: today, config: { ...CONFIG, minNoticeHours: 3 } })))[0]).toBe("12:00");
    expect(computeSlots(base({ date: "2026-10-14" }))).toEqual([]);
    expect(computeSlots(base({ date: "2026-11-20" }))).toEqual([]); // 36 days ahead > 30
    expect(computeSlots(base({ date: "2026-11-14" })).length).toBeGreaterThan(0); // exactly 30 days
  });
});
