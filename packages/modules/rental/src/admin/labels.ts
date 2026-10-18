/** Back-office copy for the rental module (Thai). Client-safe: no server imports. */
export { STAY_STATUS, STAY_PAYMENT_STATUS, METHOD_LABELS, EXTRA_PRICING_LABEL } from "../labels";
export { THAI_WEEKDAYS, THAI_WEEKDAYS_SHORT, THAI_MONTHS, THAI_MONTHS_SHORT } from "../services/time";

export type Tone = "default" | "success" | "warning" | "muted" | "destructive";

export type StayTab = "arrivals" | "inhouse" | "upcoming" | "departures" | "cancelled" | "all";

export const STAY_TABS: Array<{ key: StayTab; label: string; hint: string }> = [
  { key: "arrivals", label: "วันนี้เช็กอิน", hint: "การจองที่เช็กอินวันนี้ (รอเช็กอิน)" },
  { key: "inhouse", label: "เข้าพักอยู่", hint: "แขกที่เช็กอินแล้วและยังไม่เช็กเอาต์" },
  { key: "upcoming", label: "จองล่วงหน้า", hint: "การจองที่ยังไม่ถึงวันเข้าพัก" },
  { key: "departures", label: "เช็กเอาต์วันนี้", hint: "แขกที่ครบกำหนดออกวันนี้" },
  { key: "cancelled", label: "ยกเลิก", hint: "ยกเลิก / ไม่มาเข้าพัก" },
  { key: "all", label: "ทั้งหมด", hint: "ทุกสถานะ" },
];

export const SOURCE_LABEL: Record<string, string> = {
  online: "จองออนไลน์",
  walk_in: "Walk-in",
  admin: "แอดมินจองให้",
  phone: "โทรจอง",
  ota: "OTA",
};

export type StayAdminAction = "confirm" | "check_in" | "check_out" | "no_show";

export const ACTION_LABEL: Record<StayAdminAction, string> = {
  confirm: "ยืนยันการจอง",
  check_in: "เช็กอิน",
  check_out: "เช็กเอาต์",
  no_show: "ไม่มาเข้าพัก",
};

export const CANCELLABLE_STATUSES = ["pending", "confirmed", "checked_in"] as const;

export const PAYMENT_ROW_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "รอชำระ", tone: "warning" },
  pending_verification: { label: "รอตรวจสลิป", tone: "warning" },
  paid: { label: "ชำระแล้ว", tone: "success" },
  failed: { label: "ไม่ผ่าน", tone: "destructive" },
  refunded: { label: "คืนเงินแล้ว", tone: "muted" },
  partially_refunded: { label: "คืนเงินบางส่วน", tone: "muted" },
  cancelled: { label: "ยกเลิก", tone: "muted" },
  expired: { label: "หมดอายุ", tone: "muted" },
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  slip: "โอนเงิน (สลิป)",
  promptpay_qr: "พร้อมเพย์ QR",
  cash: "เงินสด / ชำระที่ที่พัก",
  card: "บัตร",
  wallet: "วอลเล็ต",
  cod: "เก็บเงินปลายทาง",
};

export const RATE_MODE_LABEL: Record<string, string> = {
  percent: "ปรับราคาเป็น %",
  price: "กำหนดราคาต่อคืน",
};

export const WEEKDAY_PRESETS: Array<{ label: string; days: number[] }> = [
  { label: "ทุกวัน", days: [] },
  { label: "ศุกร์–เสาร์", days: [5, 6] },
  { label: "เสาร์–อาทิตย์", days: [6, 0] },
  { label: "จันทร์–พฤหัส", days: [1, 2, 3, 4] },
];

export const AMENITY_SUGGESTIONS = ["Wi-Fi ฟรี", "เครื่องปรับอากาศ", "ระเบียงส่วนตัว", "วิวทะเล", "วิวภูเขา", "สระว่ายน้ำส่วนตัว", "อ่างอาบน้ำ", "ตู้เย็น/มินิบาร์", "เครื่องชงกาแฟ", "ทีวีจอแบน", "ตู้นิรภัย", "เตียงเสริมได้", "ที่จอดรถ", "ห้องปลอดบุหรี่"];
