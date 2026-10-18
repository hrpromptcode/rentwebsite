import { z } from "zod";
import { EVENT_STATUSES, PROMO_KINDS, SESSION_STATUSES, TICKET_VISIBILITIES } from "./config";

/** zod schemas shared by admin forms (client) and the catalog write services (server). Client-safe. */

const slug = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9ก-๙]+(?:-[a-z0-9ก-๙]+)*$/u, "slug ต้องเป็นตัวพิมพ์เล็ก ตัวเลข หรือขีดกลาง");

const url = z.string().trim().max(2000).refine((v) => v === "" || /^(https?:\/\/|\/)/i.test(v), "ต้องเป็นลิงก์ http(s) หรือ path").optional().nullable();

export const eventInputSchema = z.object({
  title: z.string().trim().min(1, "กรุณากรอกชื่องาน").max(200),
  slug: slug.optional(),
  summary: z.string().trim().max(500).optional().nullable(),
  /** raw HTML from the editor – sanitized by the service */
  description: z.string().max(50_000).optional().nullable(),
  cover: url,
  gallery: z.array(z.string().trim().max(2000)).max(20).default([]),
  category: z.string().trim().max(60).optional().nullable(),
  venueName: z.string().trim().max(200).optional().nullable(),
  venueAddress: z.string().trim().max(500).optional().nullable(),
  venueMapUrl: url,
  organizer: z.string().trim().max(200).optional().nullable(),
  status: z.enum(EVENT_STATUSES).default("draft"),
  featured: z.coerce.boolean().default(false),
  sort: z.coerce.number().int().min(-1000).max(1000).default(0),
  settings: z.record(z.string(), z.unknown()).default({}),
});
export type EventInput = z.input<typeof eventInputSchema>;

export const sessionInputSchema = z
  .object({
    name: z.string().trim().max(120).optional().nullable(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    doorsOpen: z.coerce.date().optional().nullable(),
    capacity: z.coerce.number().int().min(1).max(1_000_000).optional().nullable(),
    status: z.enum(SESSION_STATUSES).default("scheduled"),
    sort: z.coerce.number().int().min(-1000).max(1000).default(0),
  })
  .refine((s) => s.endsAt.getTime() > s.startsAt.getTime(), { message: "เวลาจบต้องอยู่หลังเวลาเริ่ม", path: ["endsAt"] });
export type SessionInput = z.input<typeof sessionInputSchema>;

export const ticketTypeInputSchema = z
  .object({
    sessionId: z.uuid().optional().nullable(),
    name: z.string().trim().min(1, "กรุณากรอกชื่อประเภทบัตร").max(120),
    description: z.string().trim().max(1000).optional().nullable(),
    /** satang */
    price: z.coerce.number().int().min(0).max(100_000_000).default(0),
    /** null = unlimited */
    quantity: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
    minPerOrder: z.coerce.number().int().min(1).max(100).default(1),
    maxPerOrder: z.coerce.number().int().min(1).max(100).default(10),
    salesStart: z.coerce.date().optional().nullable(),
    salesEnd: z.coerce.date().optional().nullable(),
    visibility: z.enum(TICKET_VISIBILITIES).default("public"),
    sort: z.coerce.number().int().min(-1000).max(1000).default(0),
  })
  .refine((t) => t.maxPerOrder >= t.minPerOrder, { message: "สูงสุดต่อคำสั่งซื้อต้องไม่น้อยกว่าขั้นต่ำ", path: ["maxPerOrder"] })
  .refine((t) => !t.salesStart || !t.salesEnd || t.salesEnd.getTime() > t.salesStart.getTime(), { message: "วันปิดขายต้องอยู่หลังวันเปิดขาย", path: ["salesEnd"] });
export type TicketTypeInput = z.input<typeof ticketTypeInputSchema>;

export const promoCodeInputSchema = z
  .object({
    eventId: z.uuid().optional().nullable(),
    code: z
      .string()
      .trim()
      .min(3)
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/, "ใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข ขีดกลางและขีดล่าง")
      .transform((v) => v.toUpperCase()),
    kind: z.enum(PROMO_KINDS).default("percent"),
    value: z.coerce.number().int().min(1).max(100_000_000),
    maxUses: z.coerce.number().int().min(1).max(1_000_000).optional().nullable(),
    startsAt: z.coerce.date().optional().nullable(),
    endsAt: z.coerce.date().optional().nullable(),
    active: z.coerce.boolean().default(true),
  })
  .refine((p) => p.kind !== "percent" || p.value <= 100, { message: "เปอร์เซ็นต์ต้องไม่เกิน 100", path: ["value"] });
export type PromoCodeInput = z.input<typeof promoCodeInputSchema>;
