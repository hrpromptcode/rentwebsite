/** Back-office copy (Thai) for the events module. Client-safe: no server imports. */
export { EVENT_STATUS, SESSION_STATUS, TICKET_STATUS, ORDER_STATUS, CHECKIN_REASON, METHOD_LABELS, type Tone } from "../labels";
import type { Tone } from "../labels";

/* ------------------------------- events list ------------------------------- */

export type EventScope = "upcoming" | "draft" | "past" | "all";

export const EVENT_SCOPES: Array<{ key: EventScope; label: string; hint: string }> = [
  { key: "upcoming", label: "กำลังจะมาถึง", hint: "งานที่เผยแพร่แล้วและยังไม่จบ" },
  { key: "draft", label: "ฉบับร่าง", hint: "งานที่ยังไม่เผยแพร่ — ลูกค้ายังไม่เห็นบนหน้าร้าน" },
  { key: "past", label: "ที่ผ่านมา", hint: "งานที่จบแล้วหรือถูกยกเลิก" },
  { key: "all", label: "ทั้งหมด", hint: "ทุกสถานะ" },
];

export const CATEGORY_SUGGESTIONS = ["คอนเสิร์ต", "เวิร์กช็อป", "สัมมนา", "งานวิ่ง", "นิทรรศการ", "เทศกาล", "ปาร์ตี้", "กีฬา", "การกุศล", "มีตอัป", "ละครเวที", "ตลาดนัด"];

export const VISIBILITY_LABEL: Record<string, { label: string; tone: Tone }> = {
  public: { label: "แสดงบนหน้าร้าน", tone: "success" },
  hidden: { label: "ซ่อน (ลิงก์ตรง / หน้างาน)", tone: "muted" },
};

export const SALE_STATE: Record<string, { label: string; tone: Tone }> = {
  on_sale: { label: "เปิดขาย", tone: "success" },
  not_started: { label: "ยังไม่เปิดขาย", tone: "warning" },
  closed: { label: "ปิดขายแล้ว", tone: "muted" },
  sold_out: { label: "บัตรหมด", tone: "destructive" },
  hidden: { label: "ซ่อนอยู่", tone: "muted" },
};

export type EventAdminAction = "publish" | "unpublish" | "cancel" | "end" | "reopen";

export const EVENT_ACTION_LABEL: Record<EventAdminAction, string> = {
  publish: "เผยแพร่",
  unpublish: "ซ่อนจากหน้าร้าน",
  cancel: "ยกเลิกงาน",
  end: "ปิดงาน",
  reopen: "เปิดงานอีกครั้ง",
};

/** status → the actions the detail page offers (reopen only for ended events; cancelled is final) */
export const EVENT_ACTIONS: Record<string, EventAdminAction[]> = {
  draft: ["publish"],
  published: ["unpublish", "end", "cancel"],
  ended: ["reopen"],
  cancelled: [],
};

/* ---------------------------------- orders --------------------------------- */

export type OrderTab = "pending" | "paid" | "cancelled" | "refunded" | "all";

export const ORDER_TABS: Array<{ key: OrderTab; label: string; hint: string; statuses: string[] | null }> = [
  { key: "pending", label: "รอชำระ", hint: "คำสั่งซื้อที่ยังไม่ชำระเงิน (ถือบัตรไว้จนหมดเวลา)", statuses: ["pending"] },
  { key: "paid", label: "ชำระแล้ว", hint: "ชำระเงินแล้วและออกบัตรแล้ว", statuses: ["paid"] },
  { key: "cancelled", label: "ยกเลิก", hint: "ยกเลิกหรือหมดเวลาชำระ — บัตรถูกปล่อยคืนแล้ว", statuses: ["cancelled", "expired"] },
  { key: "refunded", label: "คืนเงิน", hint: "คืนเงินครบทุกใบแล้ว (คืนบางใบยังอยู่ใน “ชำระแล้ว”)", statuses: ["refunded"] },
  { key: "all", label: "ทั้งหมด", hint: "ทุกสถานะ", statuses: null },
];

export const SOURCE_LABEL: Record<string, string> = {
  online: "ซื้อออนไลน์",
  admin: "ออกบัตรหน้างาน",
};

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
  cash: "เงินสดหน้างาน",
  card: "บัตร",
  wallet: "วอลเล็ต",
  free: "บัตรฟรี",
};

export const CANCEL_REASON_PRESETS = ["ลูกค้าขอยกเลิก", "ติดต่อลูกค้าไม่ได้", "สั่งซื้อซ้ำ", "ออกบัตรหน้างานแทน"];
export const REJECT_SLIP_PRESETS = ["ยอดเงินไม่ตรง", "สลิปไม่ชัด / อ่านไม่ได้", "โอนผิดบัญชี", "สลิปซ้ำ"];
export const REFUND_REASON_PRESETS = ["ลูกค้าขอคืนเงิน", "งานถูกยกเลิก", "เปลี่ยนรอบ / ออกบัตรใหม่", "ชำระซ้ำ"];
export const VOID_REASON_PRESETS = ["ออกบัตรซ้ำ", "บัตรปลอม / ทุจริต", "เปลี่ยนชื่อผู้ถือบัตร", "ลูกค้าขอยกเลิกโดยไม่คืนเงิน"];

/* --------------------------------- attendees -------------------------------- */

export type AttendeeStatusFilter = "all" | "valid" | "checked_in" | "void";

export const ATTENDEE_FILTERS: Array<{ key: AttendeeStatusFilter; label: string; statuses: string[] | null }> = [
  { key: "all", label: "ทั้งหมด", statuses: null },
  { key: "valid", label: "ยังไม่เช็กอิน", statuses: ["valid"] },
  { key: "checked_in", label: "เช็กอินแล้ว", statuses: ["checked_in"] },
  { key: "void", label: "ยกเลิก / คืนเงิน", statuses: ["void", "refunded"] },
];

/* ----------------------------------- gate ---------------------------------- */

/** Gate-only outcome on top of CHECKIN_REASON: the ticket belongs to another event than the one selected at the gate. */
export const GATE_EXTRA_REASON: Record<string, { label: string; hint: string; tone: Tone }> = {
  wrong_event: { label: "บัตรของงานอื่น", hint: "บัตรใบนี้เป็นของงานอื่น ไม่ใช่งานที่เลือกอยู่ที่จุดเช็กอินนี้", tone: "warning" },
};

export const GATE = {
  title: "เช็กอินหน้างาน",
  scanHint: "สแกน QR บนบัตร หรือพิมพ์รหัส 12 ตัวแล้วกด Enter",
  placeholder: "ABCD-EFGH-JKLM",
  camera: "เปิดกล้องสแกน",
  cameraStop: "ปิดกล้อง",
  cameraUnsupported: "เบราว์เซอร์นี้ไม่รองรับการสแกนด้วยกล้อง — ใช้เครื่องสแกนบาร์โค้ดหรือพิมพ์รหัสแทนได้",
  cameraDenied: "ไม่ได้รับอนุญาตให้ใช้กล้อง — ตรวจสอบการตั้งค่าเบราว์เซอร์ หรือพิมพ์รหัสแทน",
  anySession: "ทุกรอบ (ไม่ตรวจรอบ)",
  waiting: "พร้อมสแกน",
  waitingHint: "ผลการเช็กอินจะแสดงที่นี่",
  checkedInCount: "เช็กอินแล้ว",
  remaining: "ยังไม่มา",
  undoLast: "ยกเลิกเช็กอินล่าสุด",
  recent: "เช็กอินล่าสุด",
  noEvents: "ยังไม่มีงานที่เปิดเช็กอิน",
  noEventsHint: "สร้างอีเวนต์ เพิ่มรอบ และเผยแพร่ก่อน จากนั้นจึงเช็กอินได้จากหน้านี้",
};
