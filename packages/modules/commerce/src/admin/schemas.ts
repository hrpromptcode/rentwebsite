/** zod schemas for commerce back-office forms. Pure (no db/react) so client forms can validate before submitting. */
import { z } from "zod";

// ---------- helpers -----------------------------------------------------------

/** "1,290.50" → 129050 satang. Empty → null. */
export function bahtToSatang(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) : Number.NaN;
  const s = String(v).replace(/[,\s฿]/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return Number.NaN;
  return Math.round(n * 100);
}

export function satangToBaht(satang: number | null | undefined): string {
  if (satang === null || satang === undefined) return "";
  return (satang / 100).toFixed(satang % 100 === 0 ? 0 : 2);
}

const moneyRequired = (label: string) => z.preprocess((v) => bahtToSatang(v), z.number({ error: `กรุณากรอก${label}` }).int().min(0, `${label}ต้องไม่ติดลบ`));
const moneyOptional = (label: string) => z.preprocess((v) => bahtToSatang(v), z.number({ error: `${label}ไม่ถูกต้อง` }).int().min(0, `${label}ต้องไม่ติดลบ`).nullable());

const intField = (label: string, min = 0) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 0 : Number(v)),
    z.number({ error: `กรุณากรอก${label}` }).int(`${label}ต้องเป็นจำนวนเต็ม`).min(min, `${label}ต้องไม่น้อยกว่า ${min}`),
  );

const optionalInt = (label: string, min = 1) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number({ error: `${label}ไม่ถูกต้อง` }).int(`${label}ต้องเป็นจำนวนเต็ม`).min(min, `${label}ต้องไม่น้อยกว่า ${min}`).nullable(),
  );

/** The stock value the edit form was loaded with (COR-32): only the user's change is applied, as a delta. */
const stockLoaded = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number().int().optional());

const optionalDate = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.date().nullable());

const optionalText = (max: number, msg?: string) => z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().trim().max(max, msg).nullable());

export const slugField = z
  .string()
  .trim()
  .min(1, "กรุณากรอก slug")
  .max(120)
  .regex(/^[\p{L}\p{M}\p{N}-]+$/u, "slug ใช้ได้เฉพาะตัวอักษร ตัวเลข และขีดกลาง");

/** Plain textarea text → HTML paragraphs. Existing HTML is passed through. */
export function descriptionToHtml(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (/<\/?(p|ul|ol|li|h[1-6]|br|strong|em|div)\b/i.test(t)) return t;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return t
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

/** HTML paragraphs → textarea text (inverse of descriptionToHtml for simple markup). */
export function htmlToDescription(html: string | null | undefined): string {
  const h = (html ?? "").trim();
  if (!h) return "";
  if (!/<p\b/i.test(h)) return h;
  return h
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<\/?p[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

// ---------- products ------------------------------------------------------------

export const productOptionSchema = z.object({
  name: z.string().trim().min(1, "กรุณาตั้งชื่อตัวเลือก").max(40),
  values: z.array(z.string().trim().min(1).max(40)).min(1, "ตัวเลือกต้องมีอย่างน้อย 1 ค่า"),
});

export const productVariantSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(120),
  optionValues: z.record(z.string(), z.string()).default({}),
  sku: optionalText(64),
  price: moneyRequired("ราคา"),
  compareAtPrice: moneyOptional("ราคาก่อนลด"),
  stock: intField("สต็อก"),
  stockLoaded,
  active: z.boolean().default(true),
});

export const productImageSchema = z.object({ url: z.string().trim().min(1).max(2000), alt: z.string().trim().max(200).optional(), mediaId: z.string().optional() });

export const productSchema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่อสินค้า").max(200, "ชื่อสินค้ายาวเกินไป"),
  slug: slugField,
  shortDescription: optionalText(300, "คำอธิบายสั้นไม่เกิน 300 ตัวอักษร"),
  description: optionalText(20000),
  categoryId: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable()),
  images: z.array(productImageSchema).max(12, "ใส่รูปได้สูงสุด 12 รูป").default([]),
  price: moneyRequired("ราคา"),
  compareAtPrice: moneyOptional("ราคาก่อนลด"),
  costPrice: moneyOptional("ต้นทุน"),
  type: z.enum(["physical", "digital", "service", "preorder"]).default("physical"),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  trackInventory: z.boolean().default(true),
  stock: intField("สต็อก"),
  stockLoaded,
  lowStockThreshold: intField("จุดเตือนสต็อกต่ำ"),
  weightGrams: intField("น้ำหนัก (กรัม)"),
  sku: optionalText(64),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  featured: z.boolean().default(false),
  seoTitle: optionalText(70, "SEO title ไม่เกิน 70 ตัวอักษร"),
  seoDescription: optionalText(160, "SEO description ไม่เกิน 160 ตัวอักษร"),
  options: z.array(productOptionSchema).max(3, "ตัวเลือกได้สูงสุด 3 ชุด").default([]),
  variants: z.array(productVariantSchema).max(100).default([]),
});
export type ProductInput = z.input<typeof productSchema>;
export type ProductValues = z.output<typeof productSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่อหมวดหมู่").max(100),
  slug: slugField,
  description: optionalText(500),
  image: optionalText(2000),
  parentId: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable()),
  sort: intField("ลำดับ"),
});
export type CategoryInput = z.input<typeof categorySchema>;

// ---------- discounts -----------------------------------------------------------

export const discountSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, "โค้ดอย่างน้อย 2 ตัวอักษร")
      .max(30, "โค้ดไม่เกิน 30 ตัวอักษร")
      .regex(/^[A-Za-z0-9_-]+$/, "โค้ดใช้ได้เฉพาะ A-Z 0-9 ขีดกลางและขีดล่าง")
      .transform((s) => s.toUpperCase()),
    name: optionalText(120),
    type: z.enum(["percent", "fixed", "free_shipping"]),
    /** percent (0-100) or baht for fixed; ignored for free_shipping */
    value: z.preprocess((v) => (v === "" || v === null || v === undefined ? 0 : Number(String(v).replace(/[,\s]/g, ""))), z.number({ error: "มูลค่าส่วนลดไม่ถูกต้อง" }).min(0, "มูลค่าต้องไม่ติดลบ")),
    minSubtotal: moneyOptional("ยอดขั้นต่ำ").transform((v) => v ?? 0),
    maxDiscount: moneyOptional("ส่วนลดสูงสุด"),
    maxUses: optionalInt("จำนวนครั้งที่ใช้ได้"),
    perCustomerLimit: optionalInt("จำกัดต่อลูกค้า"),
    startsAt: optionalDate,
    endsAt: optionalDate,
    active: z.boolean().default(true),
  })
  .superRefine((d, ctx) => {
    if (d.type === "percent" && (d.value <= 0 || d.value > 100)) ctx.addIssue({ code: "custom", path: ["value"], message: "เปอร์เซ็นต์ต้องอยู่ระหว่าง 1–100" });
    // COR-30: discounts.value stores whole percents — 12.5 must not silently become 13 (or 0.4 a 0% coupon)
    else if (d.type === "percent" && !Number.isInteger(d.value)) ctx.addIssue({ code: "custom", path: ["value"], message: "เปอร์เซ็นต์ต้องเป็นจำนวนเต็ม (1–100)" });
    if (d.type === "fixed" && d.value <= 0) ctx.addIssue({ code: "custom", path: ["value"], message: "กรุณากรอกจำนวนเงินส่วนลด" });
    if (d.startsAt && d.endsAt && d.endsAt < d.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "วันสิ้นสุดต้องหลังวันเริ่ม" });
  });
export type DiscountInput = z.input<typeof discountSchema>;

// ---------- shipping ------------------------------------------------------------

export const weightTierSchema = z.object({
  maxGrams: intField("น้ำหนักสูงสุด (กรัม)", 1),
  amount: moneyRequired("ค่าส่ง"),
});

export const shippingMethodSchema = z
  .object({
    name: z.string().trim().min(1, "กรุณากรอกชื่อวิธีจัดส่ง").max(120),
    description: optionalText(300),
    type: z.enum(["flat", "weight", "free_over", "cod", "pickup"]),
    amount: moneyOptional("ค่าส่ง"),
    threshold: moneyOptional("ยอดขั้นต่ำส่งฟรี"),
    fee: moneyOptional("ค่าธรรมเนียม COD"),
    tiers: z.array(weightTierSchema).max(20).default([]),
    estimatedDays: optionalText(60),
    active: z.boolean().default(true),
    sort: intField("ลำดับ"),
  })
  .superRefine((m, ctx) => {
    if ((m.type === "flat" || m.type === "free_over" || m.type === "cod") && m.amount === null) ctx.addIssue({ code: "custom", path: ["amount"], message: "กรุณากรอกค่าส่ง" });
    if (m.type === "free_over" && m.threshold === null) ctx.addIssue({ code: "custom", path: ["threshold"], message: "กรุณากรอกยอดขั้นต่ำที่ส่งฟรี" });
    if (m.type === "weight" && m.tiers.length === 0) ctx.addIssue({ code: "custom", path: ["tiers"], message: "กรุณาเพิ่มขั้นน้ำหนักอย่างน้อย 1 ขั้น" });
  });
export type ShippingMethodInput = z.input<typeof shippingMethodSchema>;

/** shipping_methods.config from the form values */
export function shippingConfigFrom(m: z.output<typeof shippingMethodSchema>): Record<string, unknown> {
  switch (m.type) {
    case "flat":
      return { amount: m.amount ?? 0 };
    case "weight":
      return { tiers: [...m.tiers].sort((a, b) => a.maxGrams - b.maxGrams) };
    case "free_over":
      return { amount: m.amount ?? 0, threshold: m.threshold ?? 0 };
    case "cod":
      return { amount: m.amount ?? 0, fee: m.fee ?? 0 };
    default:
      return {};
  }
}

// ---------- orders --------------------------------------------------------------

export const shipOrderSchema = z.object({
  carrier: z.string().trim().min(1, "กรุณาเลือกขนส่ง").max(40),
  trackingNumber: optionalText(80),
  trackingUrl: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().trim().url("ลิงก์ติดตามไม่ถูกต้อง").max(500).nullable()),
  note: optionalText(500),
});
export type ShipOrderInput = z.input<typeof shipOrderSchema>;

export const refundSchema = z.object({
  paymentId: z.string().uuid(),
  amount: moneyRequired("จำนวนเงินคืน").refine((v) => v > 0, "จำนวนเงินคืนต้องมากกว่า 0"),
  note: optionalText(300),
});

export const addressSchema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่อผู้รับ").max(120),
  phone: z.string().trim().min(9, "เบอร์โทรไม่ถูกต้อง").max(20),
  line1: z.string().trim().min(1, "กรุณากรอกที่อยู่").max(300),
  line2: z.string().trim().max(300).optional(),
  subdistrict: z.string().trim().max(100).optional(),
  district: z.string().trim().max(100).optional(),
  province: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(10).optional(),
  note: z.string().trim().max(300).optional(),
});

export const manualOrderSchema = z
  .object({
    items: z
      .array(
        z.object({
          productId: z.string().uuid(),
          variantId: z.string().uuid().nullable().default(null),
          quantity: intField("จำนวน", 1),
        }),
      )
      .min(1, "กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ")
      .max(50),
    contact: z.object({
      name: z.string().trim().min(1, "กรุณากรอกชื่อลูกค้า").max(120),
      phone: z.string().trim().min(9, "เบอร์โทรไม่ถูกต้อง").max(20),
      email: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().trim().email("อีเมลไม่ถูกต้อง").max(200).nullable()),
    }),
    /** null → pickup / no delivery address */
    address: addressSchema.nullable().default(null),
    shippingMethodId: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable()),
    /** manual override in satang (null = use method quote) */
    shippingFee: moneyOptional("ค่าส่ง"),
    discount: moneyOptional("ส่วนลด").transform((v) => v ?? 0),
    paymentMethod: z.enum(["cash", "slip", "promptpay_qr", "cod"]),
    /** mark the payment as received right away (cash / already transferred) */
    markPaid: z.boolean().default(false),
    customerNote: optionalText(500),
    internalNote: optionalText(2000),
  })
  .superRefine((o, ctx) => {
    if (!o.shippingMethodId && o.shippingFee === null) ctx.addIssue({ code: "custom", path: ["shippingMethodId"], message: "เลือกวิธีจัดส่ง หรือกรอกค่าส่งเอง" });
  });
export type ManualOrderInput = z.input<typeof manualOrderSchema>;

export const reviewReplySchema = z.object({ reply: z.string().trim().min(1, "กรุณาพิมพ์ข้อความตอบกลับ").max(1000) });

/** Flattened { field: message } map for inline form errors. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const key = i.path.map(String).join(".") || "_";
    if (!out[key]) out[key] = i.message;
  }
  return out;
}

/** Cartesian product of option values → variant skeletons (title + optionValues). */
export function generateVariantCombos(options: Array<{ name: string; values: string[] }>): Array<{ title: string; optionValues: Record<string, string> }> {
  const clean = options.filter((o) => o.name.trim() && o.values.length);
  if (!clean.length) return [];
  let combos: Array<Record<string, string>> = [{}];
  for (const o of clean) {
    const next: Array<Record<string, string>> = [];
    for (const c of combos) for (const v of o.values) next.push({ ...c, [o.name]: v });
    combos = next;
  }
  return combos.map((ov) => ({ title: clean.map((o) => ov[o.name]).join(" / "), optionValues: ov }));
}

/** Result shape returned by admin server actions (toast-friendly + inline field errors). */
export type FormResult<T = unknown> = { ok: true; message?: string; data?: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };
