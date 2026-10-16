/** Back-office copy for the booking + clinic modules (Thai). Client-safe: no server imports. */
export { BOOKING_STATUS, PAYMENT_STATUS, PACKAGE_STATUS, METHOD_LABELS } from "../labels";
export { THAI_WEEKDAYS, THAI_WEEKDAYS_SHORT, THAI_MONTHS, THAI_MONTHS_SHORT } from "../services/time";

export type Tone = "default" | "success" | "warning" | "muted" | "destructive";

export const SOURCE_LABEL: Record<string, string> = {
  online: "จองออนไลน์",
  walk_in: "Walk-in",
  admin: "แอดมินจองให้",
  line: "LINE",
};

export const STAFF_KIND: Record<string, string> = {
  person: "บุคคล",
  room: "ห้อง",
  equipment: "อุปกรณ์",
};

/** Preset colours for staff columns / chips. */
export const STAFF_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#0ea5e9", "#8b5cf6", "#ef4444", "#14b8a6", "#f97316", "#64748b"] as const;

export type BookingAction = "confirm" | "check_in" | "start" | "complete" | "no_show";

/** Which primary actions make sense for each status (cancel is handled separately). */
export const STATUS_ACTIONS: Record<string, BookingAction[]> = {
  pending: ["confirm", "no_show"],
  confirmed: ["check_in", "start", "complete", "no_show"],
  checked_in: ["start", "complete"],
  in_progress: ["complete"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export const ACTION_LABEL: Record<BookingAction, string> = {
  confirm: "ยืนยันนัด",
  check_in: "เช็กอิน",
  start: "เริ่มบริการ",
  complete: "เสร็จสิ้น",
  no_show: "ไม่มาตามนัด",
};

export const CANCELLABLE_STATUSES = ["pending", "confirmed", "checked_in"] as const;
export const RESCHEDULABLE_STATUSES = ["pending", "confirmed"] as const;

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

export const VISIT_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: "กำลังตรวจ", tone: "warning" },
  completed: { label: "เสร็จสิ้น", tone: "success" },
  cancelled: { label: "ยกเลิก", tone: "muted" },
};

export const VISIT_PAYMENT: Record<string, { label: string; tone: Tone }> = {
  unpaid: { label: "ยังไม่ชำระ", tone: "warning" },
  paid: { label: "ชำระแล้ว", tone: "success" },
  waived: { label: "ไม่คิดเงิน", tone: "muted" },
};

export const CONSENTS = [
  { key: "treatment", label: "ยินยอมรับการรักษา", hint: "จำเป็นก่อนเริ่มการรักษาทุกครั้ง" },
  { key: "photo", label: "ยินยอมถ่ายภาพก่อน-หลัง", hint: "ใช้ภายในคลินิกเพื่อติดตามผล" },
  { key: "marketing", label: "รับข่าวสารและโปรโมชัน", hint: "SMS / LINE / อีเมล" },
] as const;

export const GENDER_LABEL: Record<string, string> = { male: "ชาย", female: "หญิง", other: "อื่น ๆ" };
export const BLOOD_TYPES = ["A", "B", "AB", "O", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export const PATIENT_PACKAGE_STATUS = {
  pending: { label: "รอชำระเงิน", tone: "warning" },
  active: { label: "ใช้งานได้", tone: "success" },
  exhausted: { label: "ใช้ครบแล้ว", tone: "muted" },
  expired: { label: "หมดอายุ", tone: "muted" },
  refunded: { label: "คืนเงินแล้ว", tone: "destructive" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const CLINIC_PAY_METHOD: Record<string, string> = { cash: "เงินสด", transfer: "โอนเงิน", none: "ยังไม่รับชำระ" };

/** Default business hours used when the tenant has no business-hour rules yet. */
export const DEFAULT_OPEN_MIN = 9 * 60;
export const DEFAULT_CLOSE_MIN = 21 * 60;
