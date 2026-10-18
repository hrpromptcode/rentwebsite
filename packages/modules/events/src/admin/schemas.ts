/** zod schemas for admin forms + server actions. Client-safe (zod only). */
import { z } from "zod";

export { eventInputSchema, sessionInputSchema, ticketTypeInputSchema, promoCodeInputSchema, type EventInput, type SessionInput, type TicketTypeInput, type PromoCodeInput } from "../services/catalog-schemas";

export type FormResult<T = unknown> = { ok: true; message?: string; data?: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = i.path.map(String).join(".") || "_";
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

export function bahtToSatang(v: string | number): number {
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

export function satangToBaht(satang: number | null | undefined): string {
  if (!satang) return "";
  return (satang / 100).toFixed(satang % 100 ? 2 : 0);
}

const reason = z.string().trim().min(1, "กรุณาระบุเหตุผล").max(300, "เหตุผลยาวเกิน 300 ตัวอักษร");

export const reasonSchema = z.object({ reason });

export const refundSchema = z.object({
  /** null / omitted = every live ticket (full refund) */
  ticketIds: z.array(z.string().uuid()).min(1, "เลือกบัตรอย่างน้อย 1 ใบ").optional().nullable(),
  /** satang; null = Σ price of the selected tickets */
  amount: z.coerce.number().int("จำนวนเงินต้องเป็นจำนวนเต็ม (สตางค์)").min(0, "จำนวนเงินต้องไม่ติดลบ").max(100_000_000_00).optional().nullable(),
  reason: z.string().trim().max(300, "เหตุผลยาวเกิน 300 ตัวอักษร").optional().nullable(),
});
export type RefundInput = z.input<typeof refundSchema>;

export const noteSchema = z.object({ internalNote: z.string().trim().max(2000, "โน้ตยาวเกิน 2000 ตัวอักษร").optional().nullable() });

export const holderSchema = z.object({
  holderName: z.string().trim().min(1, "กรุณากรอกชื่อผู้ถือบัตร").max(120),
  holderEmail: z.union([z.string().trim().email("อีเมลไม่ถูกต้อง").max(200), z.literal(""), z.null(), z.undefined()]).transform((v) => (v ? v : null)),
  seatLabel: z.union([z.string().trim().max(40), z.literal(""), z.null(), z.undefined()]).transform((v) => (v ? v : null)),
});
export type HolderInput = z.input<typeof holderSchema>;

export const gateCodeSchema = z.object({
  code: z.string().trim().min(4, "รหัสสั้นเกินไป").max(400),
  sessionId: z.union([z.string().uuid(), z.literal(""), z.null(), z.undefined()]).transform((v) => (v ? v : null)),
});
