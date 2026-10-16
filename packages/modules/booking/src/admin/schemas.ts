/** zod schemas shared by admin server actions and client forms (client-safe: zod + the pure Bangkok time helpers). */
import { z } from "zod";
import { bkkDateString, parseYmd } from "../services/time";

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
const phone = z.string().trim().min(9, "เบอร์โทรไม่ถูกต้อง").max(20, "เบอร์โทรไม่ถูกต้อง").regex(/^[+\d][\d\s-]{7,19}$/, "เบอร์โทรไม่ถูกต้อง");
const optPhone = z.union([phone, z.literal(""), z.null(), z.undefined()]).transform((v) => (v ? v : null));
const optEmail = z.union([z.string().trim().email("อีเมลไม่ถูกต้อง"), z.literal(""), z.null(), z.undefined()]).transform((v) => (v ? v.toLowerCase() : null));
const urlField = z.union([z.string().trim().url("ลิงก์ไม่ถูกต้อง"), z.string().trim().regex(/^\//, "ลิงก์ไม่ถูกต้อง"), z.literal(""), z.null(), z.undefined()]).transform((v) => (v ? v : null));
const boolDefault = (d: boolean) => z.boolean().optional().transform((v) => v ?? d);

/* ---------------------------------- catalog --------------------------------- */

export const categorySchema = z.object({
  name: str(100).min(1, "กรุณากรอกชื่อหมวดหมู่"),
  slug: optSlug,
  sort: intMin(0, "ลำดับ").max(9999).default(0),
});
export type CategoryInput = z.input<typeof categorySchema>;

export const serviceSchema = z
  .object({
    categoryId: optUuid,
    name: str(160).min(1, "กรุณากรอกชื่อบริการ"),
    slug: optSlug,
    description: optStr(5000),
    image: urlField,
    durationMin: intMin(5, "ระยะเวลา").max(24 * 60, "ระยะเวลาต้องไม่เกิน 24 ชั่วโมง"),
    bufferBeforeMin: intMin(0, "เวลาเตรียมก่อน").max(240).default(0),
    bufferAfterMin: intMin(0, "เวลาพักหลัง").max(240).default(0),
    price: money,
    priceNote: optStr(60),
    depositRequired: boolDefault(false),
    depositAmount: money.default(0),
    capacity: intMin(1, "จำนวนที่รับ").max(500).default(1),
    requiresStaff: boolDefault(true),
    /** SBR-001: fixed guests per booking (package "for 2", priced per booking); null = per person (priced per guest) */
    seatsPerBooking: z
      .union([intMin(1, "จำนวนท่านต่อการจอง").max(500), z.null(), z.undefined(), z.literal("")])
      .transform((v) => (typeof v === "number" ? v : null)),
    active: boolDefault(true),
    featured: boolDefault(false),
    sort: intMin(0, "ลำดับ").max(9999).default(0),
  })
  .transform((v) => ({ ...v, seatsPerBooking: v.capacity > 1 ? v.seatsPerBooking : null }))
  .superRefine((v, ctx) => {
    if (v.seatsPerBooking && v.seatsPerBooking > v.capacity) ctx.addIssue({ code: "custom", path: ["seatsPerBooking"], message: "จำนวนท่านต่อการจองต้องไม่เกินจำนวนที่รับต่อรอบ" });
    if (v.depositRequired && v.depositAmount <= 0) ctx.addIssue({ code: "custom", path: ["depositAmount"], message: "กรุณาระบุยอดมัดจำ" });
    if (v.depositRequired && v.price > 0 && v.depositAmount > v.price) ctx.addIssue({ code: "custom", path: ["depositAmount"], message: "มัดจำต้องไม่เกินราคาบริการ" });
  });
export type ServiceInput = z.input<typeof serviceSchema>;
export type ServiceValues = z.output<typeof serviceSchema>;

export const staffSchema = z.object({
  name: str(120).min(1, "กรุณากรอกชื่อ"),
  slug: optSlug,
  title: optStr(120),
  bio: optStr(3000),
  avatar: urlField,
  email: optEmail,
  phone: optPhone,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "สีไม่ถูกต้อง").default("#6366f1"),
  kind: z.enum(["person", "room", "equipment"]).default("person"),
  acceptsOnlineBooking: boolDefault(true),
  active: boolDefault(true),
  sort: intMin(0, "ลำดับ").max(9999).default(0),
  serviceIds: z.array(uuid).max(200).default([]),
});
export type StaffInput = z.input<typeof staffSchema>;
export type StaffValues = z.output<typeof staffSchema>;

export const scheduleDaySchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    closed: z.boolean(),
    start: hm,
    end: hm,
  })
  .superRefine((v, ctx) => {
    if (!v.closed && v.start >= v.end) ctx.addIssue({ code: "custom", path: ["end"], message: "เวลาปิดต้องหลังเวลาเปิด" });
  });
export const scheduleSchema = z.object({
  /** null = business hours of the shop */
  staffId: optUuid,
  /** true → delete the staff's own rules so they follow the shop hours again */
  inherit: boolDefault(false),
  days: z.array(scheduleDaySchema).length(7, "ต้องมีครบ 7 วัน"),
});
export type ScheduleInput = z.input<typeof scheduleSchema>;
export type ScheduleDay = z.output<typeof scheduleDaySchema>;

const localDt = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "กรุณาเลือกวันและเวลา");
export const timeOffSchema = z
  .object({
    staffId: optUuid,
    /** "YYYY-MM-DDTHH:MM" Bangkok wall time */
    startsAt: localDt,
    endsAt: localDt,
    reason: optStr(200),
  })
  .superRefine((v, ctx) => {
    if (v.startsAt >= v.endsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "เวลาสิ้นสุดต้องหลังเวลาเริ่ม" });
  });
export type TimeOffInput = z.input<typeof timeOffSchema>;

/* --------------------------------- bookings --------------------------------- */

export const walkInSchema = z.object({
  serviceId: uuid,
  staffId: optUuid,
  /** ISO instant of the slot start */
  start: z.string().datetime({ offset: true, message: "กรุณาเลือกเวลา" }),
  customerId: optUuid,
  name: str(120).min(1, "กรุณากรอกชื่อลูกค้า"),
  phone: optPhone,
  email: optEmail,
  note: optStr(1000),
  partySize: intMin(1, "จำนวนคน").max(50).default(1),
  source: z.enum(["walk_in", "admin"]).default("walk_in"),
});
export type WalkInInput = z.input<typeof walkInSchema>;

export const cancelSchema = z.object({ reason: str(300).min(1, "กรุณาระบุเหตุผล") });
export const rescheduleSchema = z.object({ start: z.string().datetime({ offset: true, message: "กรุณาเลือกเวลา" }), staffId: optUuid });
export const internalNoteSchema = z.object({ note: optStr(3000) });

/* ---------------------------------- clinic ---------------------------------- */

export const patientSchema = z.object({
  firstName: str(100).min(1, "กรุณากรอกชื่อ"),
  lastName: optStr(100),
  nickname: optStr(60),
  gender: z
    .enum(["male", "female", "other", ""])
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  birthDate: z
    .union([
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "วันเกิดไม่ถูกต้อง")
        .refine((s) => !!parseYmd(s) && Number(s.slice(0, 4)) >= 1900, "วันเกิดไม่ถูกต้อง")
        // COR-12: compared with today's date in Bangkok, not the server's UTC date
        .refine((s) => s <= bkkDateString(new Date()), "วันเกิดต้องไม่เป็นวันในอนาคต"),
      z.literal(""),
      z.null(),
      z.undefined(),
    ])
    .transform((v) => (v ? v : null)),
  phone: optPhone,
  email: optEmail,
  bloodType: optStr(4),
  allergies: optStr(2000),
  chronicConditions: optStr(2000),
  currentMedications: optStr(2000),
  emergencyName: optStr(120),
  emergencyPhone: optPhone,
  emergencyRelation: optStr(60),
  notes: optStr(5000),
  tags: z.array(str(30).min(1)).max(20).default([]),
});
export type PatientInput = z.input<typeof patientSchema>;
export type PatientValues = z.output<typeof patientSchema>;

export const visitCreateSchema = z.object({
  patientId: uuid,
  bookingId: optUuid,
  doctorId: optUuid,
  chiefComplaint: optStr(1000),
});
export type VisitCreateInput = z.input<typeof visitCreateSchema>;

const procedureSchema = z.object({
  serviceId: optUuid,
  name: str(160).min(1, "กรุณาระบุชื่อหัตถการ"),
  price: money,
  staffId: optUuid,
});
const prescriptionSchema = z.object({
  name: str(160).min(1, "กรุณาระบุชื่อยา"),
  dose: optStr(120),
  qty: intMin(1, "จำนวน").max(9999).default(1),
  price: money.default(0),
});
export const visitSchema = z.object({
  doctorId: optUuid,
  chiefComplaint: optStr(1000),
  vitals: z.object({ bp: optStr(20), hr: optStr(10), weight: optStr(10), temp: optStr(10), height: optStr(10) }).partial().default({}),
  /** plain text – encrypted at rest */
  notes: optStr(20000),
  diagnosis: optStr(2000),
  procedures: z.array(procedureSchema).max(50).default([]),
  prescriptions: z.array(prescriptionSchema).max(50).default([]),
  photosBefore: z.array(z.string().trim().min(1)).max(20).default([]),
  photosAfter: z.array(z.string().trim().min(1)).max(20).default([]),
  discount: money.default(0),
  nextVisitNote: optStr(1000),
});
export type VisitInput = z.input<typeof visitSchema>;
export type VisitValues = z.output<typeof visitSchema>;

export const completeVisitSchema = z.object({ method: z.enum(["cash", "transfer", "none"]) });

export const clinicPackageSchema = z
  .object({
    name: str(160).min(1, "กรุณากรอกชื่อแพ็กเกจ"),
    description: optStr(3000),
    image: urlField,
    serviceId: optUuid,
    sessions: intMin(1, "จำนวนครั้ง").max(1000),
    price: money,
    compareAtPrice: z.union([money, z.null(), z.undefined(), z.literal("")]).transform((v) => (typeof v === "number" ? v : null)),
    validityDays: intMin(1, "อายุการใช้งาน").max(3650).default(365),
    active: boolDefault(true),
    sort: intMin(0, "ลำดับ").max(9999).default(0),
  })
  .superRefine((v, ctx) => {
    if (v.compareAtPrice != null && v.compareAtPrice <= v.price) ctx.addIssue({ code: "custom", path: ["compareAtPrice"], message: "ราคาเต็มต้องมากกว่าราคาขาย" });
  });
export type ClinicPackageInput = z.input<typeof clinicPackageSchema>;

export const sellPackageSchema = z.object({ packageId: uuid, method: z.enum(["cash", "transfer"]) });

/** Visit totals – shared by the form preview and the server. */
export function visitTotals(v: { procedures: Array<{ price: number }>; prescriptions: Array<{ price?: number; qty?: number }>; discount: number }) {
  const procedures = v.procedures.reduce((s, p) => s + (p.price || 0), 0);
  const prescriptions = v.prescriptions.reduce((s, p) => s + (p.price || 0) * (p.qty || 1), 0);
  const subtotal = procedures + prescriptions;
  const total = Math.max(0, subtotal - (v.discount || 0));
  return { procedures, prescriptions, subtotal, total };
}

/** Baht string ("1,200.50") → satang; NaN-safe. */
export function bahtToSatang(v: string | number): number {
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}
export function satangToBaht(satang: number): string {
  if (!satang) return "";
  return (satang / 100).toFixed(satang % 100 === 0 ? 0 : 2);
}
