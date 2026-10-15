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
  rate_limited: "ทำรายการถี่เกินไป กรุณาลองใหม่ในอีกสักครู่",
  out_of_stock: "แพ็กเกจนี้หมดชั่วคราว กรุณาเลือกแพ็กเกจอื่น",
  login_required: "กรุณาเข้าสู่ระบบเพื่อใช้กระเป๋าเงิน",
  insufficient: "ยอดเงินในกระเป๋าไม่พอ กรุณาเติมเงินก่อน",
  frozen: "กระเป๋าเงินถูกระงับชั่วคราว กรุณาติดต่อแอดมิน",
  invalid_amount: "จำนวนเงินไม่ถูกต้อง",
  min_amount: "ยอดเติมขั้นต่ำไม่ถึงที่กำหนด",
  method_disabled: "ช่องทางชำระเงินนี้ไม่เปิดใช้งาน",
  invalid: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง",
};

export function errorLabel(code: string | undefined, fallback = ERROR_LABEL.invalid!): string {
  return (code && ERROR_LABEL[code]) || fallback;
}
