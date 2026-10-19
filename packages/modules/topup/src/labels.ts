/** Thai UI copy for the top-up module. Pure module – safe to import from server and client components. */

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_payment: "รอชำระเงิน",
  paid: "ชำระแล้ว",
  processing: "กำลังเติม",
  fulfilled: "เติมสำเร็จ",
  failed: "ไม่สำเร็จ",
  refunded: "คืนเงินแล้ว",
  cancelled: "ยกเลิก",
};

export const ORDER_STATUS_TONE: Record<string, "muted" | "warning" | "success" | "destructive" | "soft"> = {
  pending_payment: "warning",
  paid: "soft",
  processing: "soft",
  fulfilled: "success",
  failed: "destructive",
  refunded: "muted",
  cancelled: "muted",
};

export const FULFILLMENT_LABEL: Record<string, string> = {
  api: "อัตโนมัติ",
  stock: "รับโค้ดทันที",
  manual: "เติมมือ",
};

export const CATEGORY_LABEL: Record<string, string> = {
  mobile: "มือถือ",
  app: "แอป",
  pc: "PC",
  console: "คอนโซล",
  voucher: "บัตร / โค้ด",
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  wallet: "กระเป๋าเงินในเว็บ",
  promptpay_qr: "PromptPay QR",
  slip: "โอนเงิน + แนบสลิป",
};

export const WALLET_REASON_LABEL: Record<string, string> = {
  topup: "เติมเงินเข้ากระเป๋า",
  bonus: "โบนัสเติมเงิน",
  purchase: "ซื้อแพ็กเกจเติมเกม",
  refund: "คืนเงิน (เติมไม่สำเร็จ)",
  adjustment: "ปรับยอดโดยแอดมิน",
};

/** Service error codes → customer-facing Thai copy. */
export const ERROR_LABEL: Record<string, string> = {
  game_not_found: "ไม่พบเกมที่เลือก",
  package_not_found: "ไม่พบแพ็กเกจที่เลือก หรือแพ็กเกจปิดขายชั่วคราว",
  missing_field: "กรุณากรอกข้อมูลผู้เล่นให้ครบถ้วน",
  invalid_field: "ข้อมูลผู้เล่นไม่ถูกต้อง",
  blacklisted: "ไม่สามารถทำรายการได้ กรุณาติดต่อแอดมิน",
  rate_limited: "สั่งซื้อเกินจำนวนที่กำหนดต่อชั่วโมง (นับรายการใน 60 นาทีล่าสุด) กรุณาชำระรายการที่ค้างอยู่ หรือลองใหม่ภายหลัง",
  out_of_stock: "แพ็กเกจนี้หมดชั่วคราว กรุณาเลือกแพ็กเกจอื่น",
  login_required: "กรุณาเข้าสู่ระบบเพื่อใช้กระเป๋าเงิน",
  otp_required: "ร้านนี้ให้ยืนยันเบอร์โทรด้วย OTP ก่อนสั่งซื้อครั้งแรก (ครั้งเดียว)",
  insufficient: "ยอดเงินในกระเป๋าไม่พอ กรุณาเติมเงินก่อน",
  frozen: "กระเป๋าเงินถูกระงับชั่วคราว กรุณาติดต่อแอดมิน",
  invalid_amount: "จำนวนเงินไม่ถูกต้อง",
  min_amount: "ยอดเติมขั้นต่ำไม่ถึงที่กำหนด",
  method_disabled: "ช่องทางชำระเงินนี้ไม่เปิดใช้งาน",
  customer_blocked: "ขออภัย ไม่สามารถทำรายการได้ กรุณาติดต่อร้านโดยตรง",
  contact_required: "กรุณากรอกเบอร์โทร อีเมล หรือ LINE ID สำหรับติดตามรายการ",
  not_pending: "รายการนี้ไม่อยู่ในสถานะรอชำระเงินแล้ว",
  payment_open: "รายการชำระเงินเดิมยังใช้ได้อยู่ — ชำระหรือแนบสลิปได้เลย",
  slip_pending: "สลิปของคุณอยู่ระหว่างตรวจสอบ กรุณารอร้านยืนยัน",
  invalid: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง",
};

export function errorLabel(code: string | undefined, fallback = ERROR_LABEL.invalid!): string {
  return (code && ERROR_LABEL[code]) || fallback;
}

/**
 * Copy for a refused service Result (RV-01): the service's own Thai message when it has one (customer_blocked,
 * contact_required, missing_field / invalid_field name the field and its format, e.g. "UID ไม่ถูกต้อง (ตัวเลข 9–10 หลัก)"),
 * otherwise the label of the code. A message without Thai text is a bare code and is never shown as is.
 */
export function refusalLabel(code: string | undefined, error: string | undefined): string {
  const e = (error ?? "").trim();
  if (e && e !== code && /[\u0E00-\u0E7F]/.test(e)) return e;
  return errorLabel(code);
}

/** Top-up order numbers are `TP-<counter>` (services/orders.ts). Anything else can never match a row. */
export const TOPUP_ORDER_NUMBER_RE = /^TP-\d{1,10}$/;

/**
 * Normalises a user-supplied order number (route param, ?number=) to the stored form, or null when it cannot be one —
 * callers answer 404 / "ไม่พบรายการ" without querying (control characters such as NUL make Postgres throw).
 */
export function parseTopupOrderNumber(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toUpperCase();
  return TOPUP_ORDER_NUMBER_RE.test(v) ? v : null;
}

/** Customer-facing copy for the per-customer hourly order cap (services/orders.ts counts every order placed in the last 60 minutes). */
export function rateLimitedLabel(maxOrdersPerHour: number): string {
  return maxOrdersPerHour > 0
    ? `สั่งซื้อได้สูงสุด ${maxOrdersPerHour} รายการต่อชั่วโมง (นับทุกรายการที่สร้างใน 60 นาทีล่าสุด รวมรายการที่ยังไม่ชำระ) กรุณาชำระรายการที่ค้างอยู่ หรือรอแล้วลองใหม่ภายหลัง`
    : ERROR_LABEL.rate_limited!;
}
