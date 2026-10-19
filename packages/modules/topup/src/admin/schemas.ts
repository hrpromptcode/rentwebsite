/** zod schemas + form helpers shared by server actions and client forms (no server imports). */
import { z } from "zod";

export type FormResult<T = unknown> = { ok: true; message?: string; data?: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

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

export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const key = i.path.map(String).join(".") || "_";
    if (!out[key]) out[key] = i.message;
  }
  return out;
}

const uuid = z.string().uuid();

/** Stored image reference: an uploaded "/uploads/…" path (rendered via assetUrl in the admin) or an http(s) URL. */
const imageRef = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => !v || /^https?:\/\/\S+$/i.test(v) || /^\/(?!\/)\S*$/.test(v), "ลิงก์รูปต้องขึ้นต้นด้วย https:// หรือกดอัปโหลดรูป");

/** Baht string ("35", "1,290.50") → satang integer; empty → null. */
const bahtField = (label: string, opts: { required?: boolean; min?: number } = {}) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.union([z.string(), z.number(), z.null()]).transform((v, ctx) => {
      const s = bahtToSatang(v);
      if (s === null) {
        if (opts.required) ctx.addIssue({ code: "custom", message: `กรุณากรอก${label}` });
        return null;
      }
      if (Number.isNaN(s)) {
        ctx.addIssue({ code: "custom", message: `${label}ต้องเป็นตัวเลข` });
        return null;
      }
      if (s < (opts.min ?? 0)) {
        ctx.addIssue({ code: "custom", message: `${label}ต้องไม่น้อยกว่า ${(opts.min ?? 0) / 100} บาท` });
        return null;
      }
      return s;
    }),
  );

export const gameFieldSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "กรุณากรอก key")
    .max(30)
    .regex(/^[a-z0-9_]+$/, "key ใช้ได้เฉพาะ a-z 0-9 และ _"),
  label: z.string().trim().min(1, "กรุณากรอกชื่อช่อง").max(60),
  type: z.enum(["text", "number", "select"]),
  required: z.boolean().default(true),
  placeholder: z.string().trim().max(80).optional().or(z.literal("")),
  options: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  helpImage: imageRef.optional().or(z.literal("")),
  // STOREFRONT-12 format rules (GameField): kept when the admin saves a game; the pattern is re-checked server-side
  // with services safeFieldPattern (unsafe / invalid patterns refused) in saveGameAction
  pattern: z.string().trim().max(200, "รูปแบบยาวเกิน 200 ตัวอักษร").optional().or(z.literal("")),
  minLength: z.coerce.number().int().min(1).max(120).optional(),
  maxLength: z.coerce.number().int().min(1).max(120).optional(),
  inputMode: z.enum(["text", "numeric"]).optional(),
  hint: z.string().trim().max(80, "คำแนะนำยาวเกิน 80 ตัวอักษร").optional().or(z.literal("")),
});
export type GameFieldInput = z.input<typeof gameFieldSchema>;

export const gameSchema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่อเกม").max(120),
  slug: z
    .string()
    .trim()
    .min(1, "กรุณากรอก slug")
    .max(80)
    .regex(/^[\p{Ll}\p{Lo}\p{M}\p{N}]+(?:-[\p{Ll}\p{Lo}\p{M}\p{N}]+)*$/u, "slug ใช้ได้เฉพาะตัวอักษรพิมพ์เล็ก ตัวเลข และ - (เช่น rov, free-fire)"),
  publisher: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  image: imageRef.nullable().optional(),
  banner: imageRef.nullable().optional(),
  category: z.enum(["mobile", "pc", "console", "voucher", "app"]),
  fields: z.array(gameFieldSchema).max(10),
  instructions: z.string().trim().max(2000).nullable().optional(),
  featured: z.boolean(),
  active: z.boolean(),
  sort: z.coerce.number().int().min(0).max(9999),
});
export type GameInput = z.input<typeof gameSchema>;
export type GameValues = z.output<typeof gameSchema>;

export const packageSchema = z.object({
  id: uuid.nullable().optional(),
  name: z.string().trim().min(1, "กรุณากรอกชื่อแพ็กเกจ").max(120),
  description: z.string().trim().max(500).nullable().optional(),
  price: bahtField("ราคาขาย", { required: true, min: 100 }),
  costPrice: bahtField("ต้นทุน"),
  tierVip: bahtField("ราคา VIP"),
  tierAgent: bahtField("ราคาตัวแทน"),
  fulfillment: z.enum(["api", "stock", "manual"]),
  supplierId: uuid.nullable().optional(),
  supplierProductCode: z.string().trim().max(120).nullable().optional(),
  estimatedMinutes: z.coerce.number().int().min(0).max(10080),
  badge: z.string().trim().max(30).nullable().optional(),
  active: z.boolean(),
  sort: z.coerce.number().int().min(0).max(9999),
});
export type PackageInput = z.input<typeof packageSchema>;
export type PackageValues = z.output<typeof packageSchema>;

export const supplierSchema = z.object({
  id: uuid.nullable().optional(),
  name: z.string().trim().min(1, "กรุณากรอกชื่อ supplier").max(120),
  provider: z.enum(["generic_http", "manual"]),
  config: z
    .string()
    .trim()
    .max(10_000)
    .transform((s, ctx) => {
      if (!s) return {} as Record<string, unknown>;
      try {
        const v = JSON.parse(s) as unknown;
        if (!v || typeof v !== "object" || Array.isArray(v)) {
          ctx.addIssue({ code: "custom", message: 'config ต้องเป็น JSON object เช่น {"baseUrl": "https://api.example.com"}' });
          return {} as Record<string, unknown>;
        }
        return v as Record<string, unknown>;
      } catch {
        ctx.addIssue({ code: "custom", message: "config ไม่ใช่ JSON ที่ถูกต้อง" });
        return {} as Record<string, unknown>;
      }
    }),
  active: z.boolean(),
});
export type SupplierInput = z.input<typeof supplierSchema>;

export const blacklistSchema = z.object({
  kind: z.enum(["phone", "ip", "uid", "email", "device"]),
  value: z.string().trim().min(2, "กรุณากรอกค่าที่ต้องการบล็อก").max(200),
  reason: z.string().trim().max(300).nullable().optional(),
});
export type BlacklistInput = z.input<typeof blacklistSchema>;

export const walletAdjustSchema = z.object({
  type: z.enum(["credit", "debit"]),
  amount: bahtField("จำนวนเงิน", { required: true, min: 1 }),
  reason: z.string().trim().min(3, "กรุณาระบุเหตุผล (อย่างน้อย 3 ตัวอักษร)").max(300),
});
export type WalletAdjustInput = z.input<typeof walletAdjustSchema>;

export const fulfillSchema = z.object({
  deliveredCode: z.string().trim().max(500).nullable().optional(),
  proofImage: z.string().trim().max(2000).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type FulfillInput = z.input<typeof fulfillSchema>;

export const failSchema = z.object({ reason: z.string().trim().min(2, "กรุณาระบุเหตุผล").max(300) });

export const stockImportSchema = z.object({
  codes: z
    .string()
    .transform((s) =>
      s
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().max(500)).min(1, "กรุณาวางโค้ดอย่างน้อย 1 บรรทัด").max(500, "นำเข้าได้ครั้งละไม่เกิน 500 โค้ด")),
  expiresAt: z.string().trim().optional().or(z.literal("")),
});
