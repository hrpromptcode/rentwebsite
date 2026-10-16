import { Badge } from "@rentweb/ui/components/badge";
import { PAYMENT_METHOD_LABEL } from "@rentweb/module-restaurant/admin/labels";
import type { AdminPaymentInfo } from "@rentweb/module-restaurant/admin";

/** Order-level payment chip: combines order.paymentStatus with the live payment row. */
export function PaymentBadge({ paymentStatus, payment, dineIn }: { paymentStatus: string; payment: AdminPaymentInfo | null; dineIn?: boolean }) {
  if (payment?.refundRequired) return <Badge variant="destructive" title={payment.refundRequired}>ต้องคืนเงิน · {payment.refundRequired}</Badge>;
  if (paymentStatus === "paid") return <Badge variant="success">ชำระแล้ว{payment ? ` · ${PAYMENT_METHOD_LABEL[payment.method] ?? payment.method}` : ""}</Badge>;
  if (paymentStatus === "refunded") return <Badge variant="muted">คืนเงินแล้ว</Badge>;
  if (payment?.status === "pending_verification") return <Badge variant="warning">รอตรวจสลิป</Badge>;
  if (paymentStatus === "pay_at_counter") return <Badge variant="muted">{dineIn ? "ชำระที่โต๊ะ" : "ชำระที่ร้าน"}</Badge>;
  if (payment?.status === "failed") return <Badge variant="destructive">สลิปไม่ผ่าน</Badge>;
  if (payment?.status === "expired") return <Badge variant="destructive">QR หมดอายุ</Badge>;
  return <Badge variant="outline">ยังไม่ชำระ{payment ? ` · ${PAYMENT_METHOD_LABEL[payment.method] ?? payment.method}` : ""}</Badge>;
}

export function SessionStatusBadge({ status }: { status: string }) {
  if (status === "bill_requested") return <Badge variant="warning">ขอบิลแล้ว</Badge>;
  if (status === "paid") return <Badge variant="success">ชำระแล้ว</Badge>;
  if (status === "closed") return <Badge variant="muted">ปิดโต๊ะแล้ว</Badge>;
  if (status === "expired") return <Badge variant="destructive">หมดเวลา · ค้างชำระ</Badge>;
  return <Badge variant="soft">กำลังทาน</Badge>;
}
