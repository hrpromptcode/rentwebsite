import { z } from "zod";

/** Shapes stored in tenants.settings (shared by server actions and client forms). */

export const hoursSchema = z.array(z.object({ day: z.string().trim().min(1, "ระบุวัน").max(60), time: z.string().trim().min(1, "ระบุเวลา").max(60) })).max(14);

const optStr = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const optUrl = z.string().trim().max(300).refine((v) => !v || /^https?:\/\//i.test(v), "ต้องขึ้นต้นด้วย http:// หรือ https://").optional().or(z.literal(""));

export const generalSchema = z.object({
  name: z.string().trim().min(1, "กรุณาใส่ชื่อร้าน").max(80, "ชื่อยาวเกินไป"),
  tagline: optStr(160),
  contact: z.object({
    phone: optStr(30),
    email: z.string().trim().max(120).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "อีเมลไม่ถูกต้อง").optional().or(z.literal("")),
    lineId: optStr(60),
    address: optStr(300),
    mapUrl: optUrl,
    hours: hoursSchema.default([]),
    facebook: optUrl,
    instagram: optUrl,
    tiktok: optUrl,
    youtube: optUrl,
  }),
});
export type GeneralInput = z.input<typeof generalSchema>;

export interface ContactSettings {
  phone?: string;
  email?: string;
  lineId?: string;
  address?: string;
  mapUrl?: string;
  hours?: Array<{ day: string; time: string }>;
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
}

export function readGeneral(tenant: { name: string; settings: Record<string, unknown> }): GeneralInput {
  const c = (tenant.settings.contact ?? {}) as ContactSettings;
  return {
    name: tenant.name,
    tagline: String(tenant.settings.tagline ?? ""),
    contact: {
      phone: c.phone ?? "",
      email: c.email ?? "",
      lineId: c.lineId ?? "",
      address: c.address ?? "",
      mapUrl: c.mapUrl ?? "",
      hours: Array.isArray(c.hours) ? c.hours.map((h) => ({ day: String(h.day ?? ""), time: String(h.time ?? "") })) : [],
      facebook: c.facebook ?? "",
      instagram: c.instagram ?? "",
      tiktok: c.tiktok ?? "",
      youtube: c.youtube ?? "",
    },
  };
}

export const bankAccountSchema = z.object({
  bank: z.string().trim().min(1, "ระบุธนาคาร").max(40),
  name: z.string().trim().min(1, "ระบุชื่อบัญชี").max(80),
  number: z.string().trim().min(1, "ระบุเลขบัญชี").max(30),
});

export const paymentsSchema = z.object({
  promptpayId: z
    .string()
    .trim()
    .max(20)
    .refine((v) => {
      const d = v.replace(/[^0-9]/g, "");
      return !v || d.length === 10 || d.length === 13;
    }, "PromptPay ID ต้องเป็นเบอร์โทร 10 หลัก หรือเลขประจำตัว 13 หลัก")
    .optional()
    .or(z.literal("")),
  promptpayName: optStr(80),
  bankAccounts: z.array(bankAccountSchema).max(10),
  enabled: z.object({
    promptpay: z.boolean(),
    bankTransfer: z.boolean(),
    cod: z.boolean(),
    card: z.boolean(),
    wallet: z.boolean(),
    cash: z.boolean(),
  }),
  autoApproveSlips: z.boolean(),
  expiresMinutes: z.coerce.number().int().min(5, "อย่างน้อย 5 นาที").max(1440, "ไม่เกิน 24 ชั่วโมง"),
});
export type PaymentsInput = z.input<typeof paymentsSchema>;

export function readPayments(settings: Record<string, unknown>): PaymentsInput {
  const p = (settings.payments ?? {}) as Record<string, unknown>;
  const e = (p.enabled ?? {}) as Record<string, boolean | undefined>;
  const accounts = Array.isArray(p.bankAccounts) ? (p.bankAccounts as Array<Record<string, unknown>>) : [];
  return {
    promptpayId: String(p.promptpayId ?? ""),
    promptpayName: String(p.promptpayName ?? ""),
    bankAccounts: accounts.map((a) => ({ bank: String(a.bank ?? ""), name: String(a.name ?? ""), number: String(a.number ?? "") })),
    enabled: {
      promptpay: e.promptpay ?? true,
      bankTransfer: e.bankTransfer ?? true,
      cod: e.cod ?? false,
      card: e.card ?? false,
      wallet: e.wallet ?? false,
      cash: e.cash ?? false,
    },
    autoApproveSlips: !!p.autoApproveSlips,
    expiresMinutes: Number(p.expiresMinutes ?? 30) || 30,
  };
}

export const THAI_BANKS = ["กสิกรไทย", "ไทยพาณิชย์", "กรุงเทพ", "กรุงไทย", "กรุงศรีอยุธยา", "ทหารไทยธนชาต", "ออมสิน", "ธ.ก.ส.", "ยูโอบี", "ซีไอเอ็มบี", "เกียรตินาคินภัทร", "แลนด์ แอนด์ เฮ้าส์", "อื่นๆ"] as const;

export const MEMBER_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
export type MemberRoleKey = (typeof MEMBER_ROLES)[number];

export const ROLE_DESCRIPTION: Record<MemberRoleKey, string> = {
  owner: "สิทธิ์ทั้งหมด รวมถึงการเรียกเก็บเงินและการลบร้าน",
  admin: "จัดการเนื้อหา ตั้งค่า ทีม และช่องทางชำระเงิน",
  manager: "จัดการออเดอร์ สินค้า ลูกค้า และเนื้อหา",
  staff: "ดูและจัดการออเดอร์/การจองประจำวัน",
  viewer: "ดูข้อมูลอย่างเดียว",
};
