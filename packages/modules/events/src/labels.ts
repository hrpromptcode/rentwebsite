/** All customer-facing copy of the events module (Thai). Client-safe: no server imports. */

export type Tone = "default" | "success" | "warning" | "muted" | "destructive";

export const EVENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "ฉบับร่าง", tone: "muted" },
  published: { label: "เผยแพร่แล้ว", tone: "success" },
  cancelled: { label: "ยกเลิกงาน", tone: "destructive" },
  ended: { label: "จบงานแล้ว", tone: "muted" },
};

export const SESSION_STATUS: Record<string, { label: string; tone: Tone }> = {
  scheduled: { label: "เปิดจำหน่าย", tone: "success" },
  cancelled: { label: "ยกเลิกรอบ", tone: "destructive" },
  ended: { label: "จบรอบแล้ว", tone: "muted" },
};

export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "รอชำระเงิน", tone: "warning" },
  paid: { label: "ชำระแล้ว", tone: "success" },
  cancelled: { label: "ยกเลิก", tone: "destructive" },
  refunded: { label: "คืนเงินแล้ว", tone: "muted" },
  expired: { label: "หมดเวลาชำระ", tone: "destructive" },
};

export const TICKET_STATUS: Record<string, { label: string; tone: Tone }> = {
  valid: { label: "ใช้ได้", tone: "success" },
  checked_in: { label: "เช็กอินแล้ว", tone: "default" },
  void: { label: "ยกเลิกบัตร", tone: "destructive" },
  refunded: { label: "คืนเงินแล้ว", tone: "muted" },
};

/** Check-in outcomes shown on the scanner screen. */
export const CHECKIN_REASON: Record<string, { label: string; hint: string; tone: Tone }> = {
  checked_in: { label: "เช็กอินสำเร็จ", hint: "เชิญเข้างานได้เลย", tone: "success" },
  already_checked_in: { label: "บัตรนี้ใช้แล้ว", hint: "บัตรใบนี้ถูกเช็กอินไปก่อนหน้านี้แล้ว", tone: "warning" },
  unknown: { label: "ไม่พบบัตร", hint: "ไม่พบรหัสบัตรนี้ในระบบ ลองสแกนใหม่หรือตรวจสอบรหัสอีกครั้ง", tone: "destructive" },
  invalid_signature: { label: "QR ไม่ถูกต้อง", hint: "QR นี้ไม่ได้ออกโดยระบบ หรือถูกแก้ไข", tone: "destructive" },
  wrong_tenant: { label: "บัตรของงานอื่น", hint: "บัตรใบนี้ไม่ใช่ของผู้จัดงานนี้", tone: "destructive" },
  void: { label: "บัตรถูกยกเลิก", hint: "บัตรใบนี้ถูกยกเลิกแล้ว ไม่สามารถใช้เข้างานได้", tone: "destructive" },
  refunded: { label: "บัตรคืนเงินแล้ว", hint: "บัตรใบนี้ได้รับการคืนเงินแล้ว", tone: "destructive" },
  wrong_session: { label: "ผิดรอบ", hint: "บัตรใบนี้เป็นของรอบอื่น กรุณาตรวจสอบรอบการแสดง", tone: "warning" },
  wrong_day: { label: "ไม่ใช่วันนี้", hint: "บัตรใบนี้ใช้ได้เฉพาะวันที่ระบุบนบัตร", tone: "warning" },
  too_early: { label: "ยังไม่เปิดเช็กอิน", hint: "ยังไม่ถึงเวลาเช็กอินของรอบนี้", tone: "warning" },
  session_cancelled: { label: "รอบถูกยกเลิก", hint: "รอบของบัตรใบนี้ถูกยกเลิกแล้ว", tone: "destructive" },
  event_cancelled: { label: "งานถูกยกเลิก", hint: "งานนี้ถูกยกเลิกแล้ว", tone: "destructive" },
  not_paid: { label: "ยังไม่ชำระเงิน", hint: "คำสั่งซื้อของบัตรใบนี้ยังไม่ได้ชำระเงิน", tone: "destructive" },
};

export const METHOD_LABELS: Record<string, { label: string; description: string }> = {
  promptpay_qr: { label: "พร้อมเพย์ QR", description: "สแกนจ่ายด้วยแอปธนาคาร ยืนยันอัตโนมัติ" },
  slip: { label: "โอนเงินแนบสลิป", description: "โอนเข้าบัญชีผู้จัดงาน แล้วแนบสลิปในหน้าถัดไป" },
  free: { label: "บัตรฟรี", description: "ไม่มีค่าใช้จ่าย รับบัตรได้ทันที" },
};

export const L = {
  events: "อีเวนต์",
  allEvents: "งานทั้งหมด",
  upcoming: "เร็ว ๆ นี้",
  past: "ที่ผ่านมา",
  featured: "แนะนำ",
  free: "ฟรี",
  from: "เริ่มต้น",
  perTicket: "/ใบ",
  tickets: "บัตร",
  ticketsN: (n: number) => `${n} ใบ`,
  soldOut: "บัตรหมด",
  remaining: (n: number) => `เหลือ ${n} ใบ`,
  lastTickets: (n: number) => `เหลือเพียง ${n} ใบสุดท้าย`,
  salesNotStarted: "ยังไม่เปิดจำหน่าย",
  salesClosed: "ปิดการจำหน่ายแล้ว",
  session: "รอบ",
  pickSession: "เลือกรอบ",
  doorsOpen: "ประตูเปิด",
  venue: "สถานที่",
  organizer: "ผู้จัด",
  openMap: "ดูแผนที่",
  buyTickets: "ซื้อบัตร",
  getTickets: "รับบัตร",
  checkout: "ชำระเงิน",
  orderNumber: "หมายเลขคำสั่งซื้อ",
  myTickets: "บัตรของฉัน",
  showQr: "แสดง QR นี้ที่จุดเช็กอิน",
  holder: "ชื่อผู้ถือบัตร",
  contact: "ข้อมูลผู้ติดต่อ",
  name: "ชื่อ-นามสกุล",
  phone: "เบอร์โทรศัพท์",
  email: "อีเมล",
  note: "หมายเหตุ",
  promoCode: "โค้ดส่วนลด",
  applyPromo: "ใช้โค้ด",
  subtotal: "ยอดรวม",
  discount: "ส่วนลด",
  total: "ยอดชำระ",
  payWithin: (min: number) => `กรุณาชำระเงินภายใน ${min} นาที มิฉะนั้นบัตรจะถูกปล่อยคืน`,
  cancelOrder: "ยกเลิกคำสั่งซื้อ",
  renewPayment: "ขอ QR ใหม่",
  emptyEvents: "ยังไม่มีอีเวนต์ที่เปิดจำหน่ายในขณะนี้",
  emptyOrders: "คุณยังไม่มีคำสั่งซื้อบัตร",
  loading: "กำลังโหลด…",
  errors: {
    invalid_input: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง",
    invalid_phone: "เบอร์โทรศัพท์ไม่ถูกต้อง",
    event_not_found: "ไม่พบอีเวนต์นี้",
    event_not_open: "อีเวนต์นี้ยังไม่เปิดจำหน่ายบัตร",
    session_required: "กรุณาเลือกรอบ",
    session_not_found: "ไม่พบรอบที่เลือก",
    session_closed: "รอบนี้ปิดจำหน่ายแล้ว",
    ticket_type_not_found: "ไม่พบประเภทบัตรที่เลือก",
    no_lines: "กรุณาเลือกบัตรอย่างน้อย 1 ใบ",
    sales_not_started: "บัตรนี้ยังไม่เปิดจำหน่าย",
    sales_closed: "บัตรนี้ปิดจำหน่ายแล้ว",
    min_qty: "จำนวนบัตรน้อยกว่าขั้นต่ำต่อคำสั่งซื้อ",
    max_qty: "จำนวนบัตรเกินสูงสุดต่อคำสั่งซื้อ",
    max_per_order: "จำนวนบัตรรวมเกินสูงสุดต่อคำสั่งซื้อ",
    sold_out: "ขออภัย บัตรที่เลือกหมดหรือเหลือไม่พอ",
    capacity: "ขออภัย ที่นั่งของรอบนี้เต็มแล้ว",
    promo_invalid: "โค้ดส่วนลดไม่ถูกต้องหรือหมดอายุ",
    invalid_customer: "กรุณากรอกเบอร์โทรศัพท์หรืออีเมล",
    customer_blocked: "ขออภัย ไม่สามารถทำรายการได้ กรุณาติดต่อผู้จัดงานโดยตรง",
    login_required: "กรุณาเข้าสู่ระบบก่อนซื้อบัตร",
    payment_method: "ผู้จัดงานยังไม่เปิดรับชำระเงินออนไลน์",
    not_found: "ไม่พบคำสั่งซื้อ",
    not_pending: "คำสั่งซื้อนี้ไม่ได้อยู่ในสถานะรอชำระเงิน",
    not_paid: "คำสั่งซื้อนี้ยังไม่ได้ชำระเงิน",
    nothing_to_refund: "ไม่มียอดที่คืนเงินได้",
    unknown: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
  } as Record<string, string>,
};
