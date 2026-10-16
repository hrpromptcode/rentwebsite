/** Thai labels + badge tones for the top-up back-office. Pure data – safe for client bundles. */
import { CATEGORY_LABEL, FULFILLMENT_LABEL, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, PAYMENT_METHOD_LABEL, WALLET_REASON_LABEL } from "../labels";

export type Tone = "success" | "warning" | "destructive" | "muted" | "soft" | "accent" | "outline";

export { CATEGORY_LABEL, FULFILLMENT_LABEL, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, PAYMENT_METHOD_LABEL, WALLET_REASON_LABEL };

export type OrderTab = "all" | "pending_payment" | "verify" | "manual" | "api" | "fulfilled" | "failed";

export const ORDER_TABS: Array<{ key: OrderTab; label: string }> = [
  { key: "pending_payment", label: "รอชำระ" },
  { key: "verify", label: "รอตรวจสลิป" },
  { key: "manual", label: "รอเติม" },
  { key: "api", label: "กำลังเติม" },
  { key: "fulfilled", label: "สำเร็จ" },
  { key: "failed", label: "ล้มเหลว" },
  { key: "all", label: "ทั้งหมด" },
];

export const PAYMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "รอชำระ", tone: "muted" },
  pending_verification: { label: "รอตรวจสลิป", tone: "warning" },
  paid: { label: "ชำระแล้ว", tone: "success" },
  partially_refunded: { label: "คืนเงินบางส่วน", tone: "warning" },
  refunded: { label: "คืนเงินแล้ว", tone: "destructive" },
  failed: { label: "ปฏิเสธ", tone: "destructive" },
  cancelled: { label: "ยกเลิก", tone: "muted" },
  expired: { label: "หมดอายุ", tone: "muted" },
};

export const FULFILLMENT_TONE: Record<string, Tone> = { api: "soft", stock: "accent", manual: "warning" };

export const PROVIDER_LABEL: Record<string, string> = {
  generic_http: "HTTP API ทั่วไป",
  manual: "เติมมือ (ไม่มี API)",
};

export const BLACKLIST_KIND_LABEL: Record<string, string> = {
  phone: "เบอร์โทร",
  ip: "IP",
  uid: "UID / ไอดีเกม",
  email: "อีเมล",
  device: "อุปกรณ์",
};

export const RISK_FLAG_LABEL: Record<string, string> = {
  guest: "ไม่ได้ล็อกอิน",
  no_contact: "ไม่มีช่องทางติดต่อ",
  high_value: "ยอดสูง",
  repeat_ip: "สั่งถี่จาก IP เดิม",
};

export const FIELD_TYPE_LABEL: Record<string, string> = { text: "ข้อความ", number: "ตัวเลข", select: "ตัวเลือก" };

export const FAIL_REASONS = ["UID ไม่ถูกต้อง / ไม่พบผู้เล่น", "เซิร์ฟเวอร์ / โซนไม่ตรง", "Supplier ขัดข้อง", "โค้ดหมดสต็อก", "ลูกค้าขอยกเลิก", "สงสัยทุจริต"] as const;

export const REJECT_SLIP_REASONS = ["ยอดเงินไม่ตรง", "ไม่พบรายการโอนในบัญชี", "สลิปซ้ำ / เคยใช้แล้ว", "รูปสลิปไม่ชัดเจน", "สลิปไม่ถูกต้อง"] as const;

export const STOCK_STATUS: Record<string, { label: string; tone: Tone }> = {
  available: { label: "พร้อมขาย", tone: "success" },
  reserved: { label: "จองไว้", tone: "warning" },
  sold: { label: "ขายแล้ว", tone: "muted" },
  void: { label: "ยกเลิก", tone: "destructive" },
};

export const TIER_LABEL: Record<string, string> = { member: "สมาชิก", vip: "VIP", agent: "ตัวแทน" };

export function orderStatus(status: string): { label: string; tone: Tone } {
  return { label: ORDER_STATUS_LABEL[status] ?? status, tone: ORDER_STATUS_TONE[status] ?? "muted" };
}

export function paymentStatus(status: string): { label: string; tone: Tone } {
  return PAYMENT_STATUS[status] ?? { label: status, tone: "muted" };
}

/** Primary id-like player field (uid first) for compact table cells. */
export function primaryPlayerField(fields: Record<string, string>): string {
  return fields.uid ?? fields.riotid ?? fields.username ?? fields.playerid ?? Object.values(fields)[0] ?? "-";
}
