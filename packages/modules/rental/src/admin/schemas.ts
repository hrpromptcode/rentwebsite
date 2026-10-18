/** zod schemas shared by admin server actions and client forms (client-safe: zod + the pure date helpers). */
import { z } from "zod";
import { diffDays, isValidYmd } from "../services/time";

export type FormResult<T = unknown> = { ok: true; message?: string; data?: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = i.path.map(String).join(".") || "_";
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

const uuid = z.string().uuid({ message: "รหัสไม่ถูกต้อง" });
const optUuid = z.union([uuid, z.literal(""), z.null(), z.undefined()]).transform((v) => (v ? v : null));
const str = (max: number) => z.string().trim().max(max, `ยาวเกิน ${max} ตัวอักษร`);
const optStr = (max: number) =>
  str(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const intMin = (min: number, label: string) => z.coerce.number({ message: `${label}ต้องเป็นตัวเลข` }).int(`${label}ต้องเป็นจำนวนเต็ม`).min(min, `${label}ต้องไม่น้อยกว่า ${min}`);
/** satang */
const money = z.coerce.number({ message: "ราคาต้องเป็นตัวเลข" }).int("ราคาต้องเป็นจำนวนเต็ม (สตางค์)").min(0, "ราคาต้องไม่ติดลบ").max(10_000_000_000);
const slugRe = /^[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)*$/u;
export const slugField = z.string().trim().min(1, "กรุณากรอก slug").max(80, "slug ยาวเกิน 80 ตัวอักษร").regex(slugRe, "ใช้ได้เฉพาะตัวอักษร ตัวเลข และขีดกลาง");
const optSlug = z.union([slugField, z.literal("")]).optional().transform((v) => v || "");
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "รูปแบบเวลาไม่ถูกต้อง (HH:MM)");
const ymd = z.string().refine((v) => isValidYmd(v), "วันที่ไม่ถูกต้อง");
const optYmd = z.union([ymd, z.literal(""), z.null(), z.undefined()]).transform((v) => (v ? v : null));
const urlField = z.union([z.string().trim().url("ลิงก์ไม่ถูกต้อง"), z.string().trim().regex(/^\//, "ลิงก์ไม่ถูกต้อง")]);
const boolDefault = (d: boolean) => z.boolean().optional().transform((v) => v ?? d);

/* -------------------------------- unit types -------------------------------- */

export const unitTypeSchema = z
  .object({
    name: str(160).min(1, "กรุณากรอกชื่อประเภทห้อง"),
    slug: optSlug,
    description: optStr(5000),
    gallery: z.array(urlField).max(12, "ใส่รูปได้ไม่เกิน 12 รูป").default([]),
    baseGuests: intMin(1, "จำนวนผู้เข้าพักที่รวมในราคา").max(50),
    maxGuests: intMin(1, "จำนวนผู้เข้าพักสูงสุด").max(50),
    beds: optStr(120),
    sizeSqm: z
      .union([intMin(1, "ขนาดห้อง").max(10_000), z.literal(""), z.null(), z.undefined()])
      .transform((v) => (typeof v === "number" ? v : null)),
    amenities: z.array(str(60).min(1)).max(40, "สิ่งอำนวยความสะดวกไม่เกิน 40 รายการ").default([]),
    quantity: intMin(1, "จำนวนห้อง").max(500),
    basePrice: money.min(100, "กรุณาระบุราคาต่อคืน"),
    extraGuestPrice: money.default(0),
    minNights: intMin(1, "จำนวนคืนขั้นต่ำ").max(30).default(1),
    active: boolDefault(true),
    featured: boolDefault(false),
    sort: intMin(0, "ลำดับ").max(9999).default(0),
  })
  .superRefine((v, ctx) => {
    if (v.maxGuests < v.baseGuests) ctx.addIssue({ code: "custom", path: ["maxGuests"], message: "ผู้เข้าพักสูงสุดต้องไม่น้อยกว่าจำนวนที่รวมในราคา" });
    if (v.maxGuests > v.baseGuests && v.extraGuestPrice < 0) ctx.addIssue({ code: "custom", path: ["extraGuestPrice"], message: "ราคาผู้เข้าพักเพิ่มไม่ถูกต้อง" });
  });
export type UnitTypeInput = z.input<typeof unitTypeSchema>;
export type UnitTypeValues = z.output<typeof unitTypeSchema>;

/* ---------------------------------- extras ---------------------------------- */

export const extraSchema = z.object({
  name: str(120).min(1, "กรุณากรอกชื่อบริการเสริม"),
  description: optStr(300),
  price: money,
  pricing: z.enum(["per_stay", "per_night", "per_guest_night"], { message: "เลือกวิธีคิดราคา" }),
  active: boolDefault(true),
  sort: intMin(0, "ลำดับ").max(9999).default(0),
});
export type ExtraInput = z.input<typeof extraSchema>;
export type ExtraValues = z.output<typeof extraSchema>;

/* -------------------------------- rate rules -------------------------------- */

export const rateRuleSchema = z
  .object({
    name: str(120).min(1, "กรุณาตั้งชื่อกฎราคา"),
    unitTypeId: optUuid,
    startDate: optYmd,
    endDate: optYmd,
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    mode: z.enum(["percent", "price"], { message: "เลือกรูปแบบการปรับราคา" }),
    value: z.coerce.number({ message: "ค่าต้องเป็นตัวเลข" }).int("ค่าต้องเป็นจำนวนเต็ม"),
    priority: intMin(0, "ลำดับการใช้").max(999).default(10),
    active: boolDefault(true),
  })
  .superRefine((v, ctx) => {
    if (v.startDate && v.endDate && v.endDate < v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม" });
    if (v.mode === "percent" && (v.value < -90 || v.value > 500)) ctx.addIssue({ code: "custom", path: ["value"], message: "เปอร์เซ็นต์ต้องอยู่ระหว่าง -90 ถึง 500" });
    if (v.mode === "price" && v.value < 100) ctx.addIssue({ code: "custom", path: ["value"], message: "กรุณาระบุราคาต่อคืน" });
    if (!v.startDate && !v.endDate && !v.weekdays.length && !v.unitTypeId) ctx.addIssue({ code: "custom", path: ["startDate"], message: "ระบุช่วงวันที่ วันในสัปดาห์ หรือประเภทห้องอย่างน้อยหนึ่งอย่าง" });
  });
export type RateRuleInput = z.input<typeof rateRuleSchema>;
export type RateRuleValues = z.output<typeof rateRuleSchema>;

/* ------------------------------- blocked dates ------------------------------- */

export const blockSchema = z
  .object({
    unitTypeId: uuid,
    from: ymd,
    to: ymd,
    reason: optStr(200),
    blocked: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const n = diffDays(v.from, v.to);
    if (n < 0) ctx.addIssue({ code: "custom", path: ["to"], message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม" });
    if (n > 120) ctx.addIssue({ code: "custom", path: ["to"], message: "ปิดจองได้ครั้งละไม่เกิน 120 วัน" });
  });
export type BlockInput = z.input<typeof blockSchema>;

/* ---------------------------------- settings --------------------------------- */

export const rentalSettingsSchema = z
  .object({
    checkInTime: hm,
    checkOutTime: hm,
    freeCancelDays: intMin(0, "จำนวนวันยกเลิกฟรี").max(365),
    depositPercent: intMin(0, "เปอร์เซ็นต์มัดจำ").max(100, "มัดจำไม่เกิน 100%"),
    allowFullPayment: z.boolean(),
    allowPayAtProperty: z.boolean(),
    maxAdvanceDays: intMin(7, "จองล่วงหน้าสูงสุด").max(730, "จองล่วงหน้าได้ไม่เกิน 730 วัน"),
    maxNights: intMin(1, "จำนวนคืนสูงสุด").max(90, "ไม่เกิน 90 คืน"),
    holdMinutes: intMin(5, "เวลาถือห้อง").max(1440, "ไม่เกิน 24 ชั่วโมง"),
  })
  .superRefine((v, ctx) => {
    if (v.checkOutTime >= v.checkInTime) ctx.addIssue({ code: "custom", path: ["checkOutTime"], message: "เวลาเช็กเอาต์ควรอยู่ก่อนเวลาเช็กอิน (เช่น 12:00 / 14:00)" });
  });
export type RentalSettingsInput = z.input<typeof rentalSettingsSchema>;
export type RentalSettingsValues = z.output<typeof rentalSettingsSchema>;

/* ------------------------------------ misc ----------------------------------- */

export const cancelSchema = z.object({ reason: str(300).min(1, "กรุณาระบุเหตุผล") });
export const notesSchema = z.object({ internalNote: optStr(2000), unitNumber: optStr(30) });
export type NotesInput = z.input<typeof notesSchema>;

export function bahtToSatang(v: string | number): number {
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}
export function satangToBaht(satang: number): string {
  if (!satang) return "";
  return (satang / 100).toFixed(satang % 100 ? 2 : 0);
}
