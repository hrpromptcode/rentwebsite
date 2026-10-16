"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { toast } from "@rentweb/ui/components/sonner";
import { satangToBaht } from "@rentweb/module-commerce/admin/schemas";
import { NativeSelect } from "@rentweb/module-commerce/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { approvePaymentAction, rejectPaymentQueueAction } from "./actions";

export function PaymentQueueActions({ slug, payment, canWrite }: { slug: string; payment: { id: string; status: string; amount: number }; canWrite: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  if (!canWrite) return null;
  const verifiable = ["pending", "pending_verification", "failed", "expired"].includes(payment.status);
  if (!verifiable) return null;

  async function reject() {
    setPending(true);
    try {
      const r = await rejectPaymentQueueAction(slug, payment.id, reason);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message);
        setOpen(false);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <ConfirmButton size="sm" title="ยืนยันว่าได้รับเงินแล้ว?" description={`ยอด ${satangToBaht(payment.amount)} บาท — รายการที่เกี่ยวข้องจะถูกอัปเดตเป็นชำระแล้วทันที`} confirmLabel="ยืนยันชำระ" action={() => approvePaymentAction(slug, payment.id)}>
        <ThumbsUp aria-hidden /> ยืนยัน
      </ConfirmButton>
      {payment.status !== "failed" && (
        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
          <ThumbsDown aria-hidden /> ปฏิเสธ
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ปฏิเสธสลิปนี้?</DialogTitle>
            <DialogDescription>ลูกค้าจะได้รับแจ้งเหตุผลและแนบสลิปใหม่ได้</DialogDescription>
          </DialogHeader>
          <Field label="เหตุผล" htmlFor={`pq-reason-${payment.id}`}>
            <NativeSelect id={`pq-reason-${payment.id}`} value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">เลือกเหตุผล…</option>
              <option value="ยอดเงินไม่ตรง">ยอดเงินไม่ตรง</option>
              <option value="ไม่พบรายการโอนในบัญชี">ไม่พบรายการโอนในบัญชี</option>
              <option value="สลิปซ้ำ / เคยใช้แล้ว">สลิปซ้ำ / เคยใช้แล้ว</option>
              <option value="รูปสลิปไม่ชัดเจน">รูปสลิปไม่ชัดเจน</option>
              <option value="สลิปไม่ถูกต้อง">สลิปไม่ถูกต้อง</option>
            </NativeSelect>
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              กลับ
            </Button>
            <Button variant="destructive" onClick={reject} disabled={pending || !reason}>
              {pending && <Loader2 className="animate-spin" aria-hidden />} ปฏิเสธสลิป
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
