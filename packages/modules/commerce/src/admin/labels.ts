/** Thai labels + badge tones for the commerce back-office. Pure data, safe for client bundles. */

export type Tone = "success" | "warning" | "destructive" | "muted" | "soft" | "accent" | "outline";

export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "รอชำระ", tone: "warning" },
  confirmed: { label: "ยืนยันแล้ว", tone: "soft" },
  processing: { label: "กำลังเตรียม", tone: "soft" },
  shipped: { label: "จัดส่งแล้ว", tone: "accent" },
  completed: { label: "สำเร็จ", tone: "success" },
  cancelled: { label: "ยกเลิก", tone: "muted" },
  refunded: { label: "คืนเงินแล้ว", tone: "destructive" },
};

export const PAYMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  unpaid: { label: "ยังไม่ชำระ", tone: "muted" },
  pending: { label: "รอชำระ", tone: "muted" },
  pending_verification: { label: "รอตรวจสลิป", tone: "warning" },
  paid: { label: "ชำระแล้ว", tone: "success" },
  partially_refunded: { label: "คืนเงินบางส่วน", tone: "warning" },
  refunded: { label: "คืนเงินแล้ว", tone: "destructive" },
  failed: { label: "ปฏิเสธ", tone: "destructive" },
  cancelled: { label: "ยกเลิก", tone: "muted" },
  expired: { label: "หมดอายุ", tone: "muted" },
};

export const FULFILLMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  unfulfilled: { label: "ยังไม่จัดส่ง", tone: "muted" },
  partial: { label: "ส่งบางส่วน", tone: "warning" },
  fulfilled: { label: "จัดส่งแล้ว", tone: "success" },
  pickup_ready: { label: "พร้อมรับที่ร้าน", tone: "accent" },
  picked_up: { label: "รับแล้ว", tone: "success" },
};

export const PAYMENT_METHOD: Record<string, string> = {
  slip: "โอนเงิน (สลิป)",
  promptpay_qr: "พร้อมเพย์ QR",
  card: "บัตรเครดิต",
  cod: "เก็บเงินปลายทาง",
  wallet: "กระเป๋าเงิน",
  cash: "เงินสด",
  installment: "ผ่อนชำระ",
};

export const REF_TYPE: Record<string, string> = {
  order: "ออเดอร์",
  booking: "การจอง",
  topup: "เติมเกม",
  wallet_topup: "เติมกระเป๋าเงิน",
  rest_order: "ออเดอร์ร้านอาหาร",
  reservation: "จองโต๊ะ",
  patient_package: "แพ็กเกจคลินิก",
  invoice: "ใบแจ้งหนี้",
  stay: "จองห้องพัก",
  ticket_order: "บัตรอีเวนต์",
};

export const PRODUCT_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: "เผยแพร่", tone: "success" },
  draft: { label: "ฉบับร่าง", tone: "muted" },
  archived: { label: "เก็บถาวร", tone: "destructive" },
};

export const PRODUCT_TYPE: Record<string, string> = {
  physical: "สินค้าทั่วไป",
  digital: "สินค้าดิจิทัล",
  service: "บริการ",
  preorder: "พรีออเดอร์",
};

export const DISCOUNT_TYPE: Record<string, string> = {
  percent: "ลดเป็น %",
  fixed: "ลดเป็นบาท",
  free_shipping: "ส่งฟรี",
};

export const SHIPPING_TYPE: Record<string, { label: string; hint: string }> = {
  flat: { label: "ค่าส่งคงที่", hint: "คิดค่าส่งเท่ากันทุกออเดอร์" },
  weight: { label: "ตามน้ำหนัก", hint: "กำหนดค่าส่งเป็นขั้นตามน้ำหนักพัสดุ" },
  free_over: { label: "ส่งฟรีเมื่อซื้อครบ", hint: "คิดค่าส่งเมื่อยอดต่ำกว่าขั้นต่ำ" },
  cod: { label: "เก็บเงินปลายทาง", hint: "ลูกค้าจ่ายเมื่อรับของ บวกค่าธรรมเนียม COD" },
  pickup: { label: "รับที่ร้าน", hint: "ไม่มีค่าส่ง ลูกค้ามารับเอง" },
};

export const REVIEW_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "รอตรวจ", tone: "warning" },
  approved: { label: "อนุมัติแล้ว", tone: "success" },
  rejected: { label: "ปฏิเสธ", tone: "destructive" },
};

export interface Carrier {
  key: string;
  label: string;
  /** `{n}` is replaced with the tracking number */
  trackingUrl: string | null;
}

export const CARRIERS: Carrier[] = [
  { key: "flash", label: "Flash Express", trackingUrl: "https://www.flashexpress.com/fle/tracking?se={n}" },
  { key: "kerry", label: "Kerry Express", trackingUrl: "https://th.kerryexpress.com/th/track/?track={n}" },
  { key: "jnt", label: "J&T Express", trackingUrl: "https://www.jtexpress.co.th/trajectoryQuery?billcodes={n}" },
  { key: "thaipost", label: "ไปรษณีย์ไทย (EMS)", trackingUrl: "https://track.thailandpost.co.th/?trackNumber={n}" },
  { key: "ninja", label: "Ninja Van", trackingUrl: "https://www.ninjavan.co/th-th/tracking?id={n}" },
  { key: "dhl", label: "DHL eCommerce", trackingUrl: "https://ecommerceportal.dhl.com/track/?ref={n}" },
  { key: "best", label: "BEST Express", trackingUrl: "https://www.best-inc.co.th/track?bills={n}" },
  { key: "grab", label: "Grab / Lalamove (ส่งด่วน)", trackingUrl: null },
  { key: "pickup", label: "ลูกค้ารับเอง", trackingUrl: null },
  { key: "other", label: "ขนส่งอื่น ๆ", trackingUrl: null },
];

export function carrierLabel(key: string): string {
  return CARRIERS.find((c) => c.key === key)?.label ?? key;
}

export function trackingUrlFor(carrier: string, trackingNumber: string | null | undefined): string | null {
  const c = CARRIERS.find((x) => x.key === carrier);
  if (!c?.trackingUrl || !trackingNumber) return null;
  return c.trackingUrl.replace("{n}", encodeURIComponent(trackingNumber));
}

export const ORDER_TABS = [
  { key: "all", label: "ทั้งหมด" },
  { key: "verify", label: "รอตรวจสลิป" },
  { key: "to_ship", label: "รอจัดส่ง" },
  { key: "completed", label: "สำเร็จ" },
  { key: "cancelled", label: "ยกเลิก" },
] as const;
export type OrderTab = (typeof ORDER_TABS)[number]["key"];
