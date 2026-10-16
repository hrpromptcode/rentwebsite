import { parseHours, pickupSlots, reservationSlots, parseDaySpec } from "../../../../packages/modules/restaurant/src/services/time";
const show = (x: unknown) => console.log(JSON.stringify(x));
show(parseHours([{ day: "ทุกวัน", time: "11:00 – 22:00 (ครัวปิด 21:30)" }]));
show(parseHours([{ day: "อังคาร – อาทิตย์", time: "08:00 – 18:00" }, { day: "จันทร์", time: "ปิด" }]));
show(parseHours([{ day: "จันทร์ – ศุกร์", time: "11:00 – 20:00" }, { day: "เสาร์ – อาทิตย์", time: "10:00 – 20:00" }]));
show(parseHours([{ day: "ทุกวัน", time: "10:00 – 22:00" }, { day: "วันพุธ", time: "ปิด" }]));
show([parseDaySpec("เสาร์ – อาทิตย์"), parseDaySpec("Mon-Fri"), parseDaySpec("แอดมิน"), parseDaySpec("จันทร์, พุธ, ศุกร์")]);
const h = parseHours([{ day: "ทุกวัน", time: "11:00 – 22:00 (ครัวปิด 21:30)" }]);
const s = pickupSlots({ hours: h, now: new Date("2026-10-14T12:58:00Z"), leadMinutes: 20, stepMinutes: 15, prepMinutes: 15 });
show(s.map((x) => x.label));
const cafe = parseHours([{ day: "อังคาร – อาทิตย์", time: "08:00 – 18:00" }, { day: "จันทร์", time: "ปิด" }]);
// 2026-10-18 is a Sunday → after close → Monday closed → Tuesday
show(pickupSlots({ hours: cafe, now: new Date("2026-10-18T12:00:00Z") }).slice(0, 2));
show(reservationSlots({ hours: cafe, ymd: "2026-10-19", now: new Date("2026-10-18T12:00:00Z") }));
