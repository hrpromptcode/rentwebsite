/** Thai copy for the restaurant back-office (admin app). */
export const STATIONS = ["kitchen", "bar", "dessert"] as const;
export type Station = (typeof STATIONS)[number];

export const STATION_LABEL: Record<string, string> = { kitchen: "ครัว", bar: "บาร์", dessert: "ของหวาน" };

export const ORDER_TYPE_LABEL: Record<string, string> = { dine_in: "ทานที่ร้าน", pickup: "รับกลับบ้าน", delivery: "เดลิเวอรี่" };

export const ORDER_STATUS_LABEL_ADMIN: Record<string, string> = {
  received: "รับออเดอร์",
  preparing: "กำลังทำ",
  ready: "พร้อมเสิร์ฟ/พร้อมรับ",
  served: "เสิร์ฟแล้ว",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  paid: "ชำระแล้ว",
  unpaid: "ยังไม่ชำระ",
  pay_at_counter: "ชำระที่โต๊ะ/เคาน์เตอร์",
  refunded: "คืนเงินแล้ว",
  pending: "รอชำระ",
  pending_verification: "รอตรวจสลิป",
  failed: "ไม่ผ่าน",
  expired: "หมดอายุ",
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  promptpay_qr: "PromptPay",
  slip: "โอน/สลิป",
  cash: "เงินสด",
  card: "บัตร",
  cod: "เก็บปลายทาง",
  wallet: "กระเป๋าเงิน",
  counter: "เคาน์เตอร์",
};

export const SESSION_STATUS_LABEL: Record<string, string> = { open: "กำลังทาน", bill_requested: "ขอบิลแล้ว", paid: "ชำระแล้ว", expired: "หมดเวลา · ค้างชำระ", closed: "ปิดโต๊ะแล้ว" };

export const ITEM_STATUS_LABEL: Record<string, string> = { queued: "รอคิว", cooking: "กำลังทำ", done: "เสร็จแล้ว", served: "เสิร์ฟแล้ว", cancelled: "ยกเลิก" };

export const RESERVATION_STATUS_LABEL: Record<string, string> = {
  pending: "รอยืนยัน",
  confirmed: "ยืนยันแล้ว",
  seated: "นั่งแล้ว",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
  no_show: "ไม่มา",
};

export const TAG_SUGGESTIONS = ["recommended", "new", "spicy", "vegan", "vegetarian", "halal", "bestseller"];
export const TAG_LABEL: Record<string, string> = { recommended: "แนะนำ", new: "ใหม่", spicy: "เผ็ด", vegan: "วีแกน", vegetarian: "มังสวิรัติ", halal: "ฮาลาล", bestseller: "ขายดี" };
export const ALLERGEN_SUGGESTIONS = ["ถั่ว", "นม", "ไข่", "กลูเตน", "อาหารทะเล", "ถั่วเหลือง", "งา"];

/** Allowed next statuses for a reservation (pure, safe for client components). */
export type ReservationNext = "confirmed" | "seated" | "completed" | "no_show" | "cancelled";
const RESERVATION_NEXT: Record<string, ReservationNext[]> = {
  pending: ["confirmed", "seated", "no_show", "cancelled"],
  confirmed: ["seated", "completed", "no_show", "cancelled"],
  seated: ["completed"],
  completed: [],
  cancelled: [],
  no_show: [],
};
export function reservationTransitions(status: string): ReservationNext[] {
  return RESERVATION_NEXT[status] ?? [];
}
