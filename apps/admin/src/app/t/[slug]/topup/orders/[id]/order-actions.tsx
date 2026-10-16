"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, ImagePlus, Loader2, MessageSquarePlus, RotateCcw, ThumbsDown, ThumbsUp, Upload, XCircle } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { FAIL_REASONS, REJECT_SLIP_REASONS } from "@rentweb/module-topup/admin/labels";
import type { FormResult } from "@rentweb/module-topup/admin/schemas";
import { NativeSelect } from "@rentweb/module-topup/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { addNoteAction, approveSlipAction, cancelOrderAction, failOrderAction, fulfillOrderAction, rejectSlipAction, retryOrderAction, uploadProofAction } from "../actions";

export type OrderLite = { id: string; number: string; status: string; fulfillment: string; paymentMethod: string; price: number; paidAt: string | null };
export type PaymentLite = { id: string; status: string; amount: number; method: string; slipUrl: string | null } | null;

function useRun() {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const run = React.useCallback(
    async <T,>(key: string, fn: () => Promise<FormResult<T>>, onOk?: (r: Extract<FormResult<T>, { ok: true }>) => void) => {
      setPending(key);
      try {
        const r = await fn();
        if (!r.ok) {
          toast.error(r.error);
          return r;
        }
        toast.success(r.message ?? "ดำเนินการแล้ว");
        onOk?.(r);
        router.refresh();
        return r;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
        return { ok: false as const, error: String(e) };
      } finally {
        setPending(null);
      }
    },
    [router],
  );
  return { run, pending };
}

/** Primary action bar for one top-up order. */
export function TopupActionBar({ slug, order, payment, canWrite }: { slug: string; order: OrderLite; payment: PaymentLite; canWrite: boolean }) {
  const { run, pending } = useRun();
  const [fulfillOpen, setFulfillOpen] = React.useState(false);
  const [failOpen, setFailOpen] = React.useState(false);
  if (!canWrite) return null;
  const fulfillable = order.status === "processing" || order.status === "paid";
  const retryable = order.fulfillment !== "manual" && !!order.paidAt && ["failed", "processing", "paid"].includes(order.status);
  const slipPending = order.status === "pending_payment" && payment && ["pending", "pending_verification", "failed", "expired"].includes(payment.status);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {fulfillable && (
        <Button onClick={() => setFulfillOpen(true)} disabled={pending !== null}>
          <CheckCircle2 aria-hidden /> เติมสำเร็จ
        </Button>
      )}
      {retryable && (
        <ConfirmButton
          variant={order.status === "failed" ? "default" : "outline"}
          title="ลองเติมใหม่อีกครั้ง?"
          description="ระบบจะส่งคำสั่งเติมไปยัง supplier / ตัดโค้ดจากสต็อกอีกครั้งด้วยข้อมูลผู้เล่นเดิม"
          confirmLabel="ลองใหม่"
          action={() => retryOrderAction(slug, order.id)}
          disabled={pending !== null}
        >
          <RotateCcw aria-hidden /> ลองใหม่
        </ConfirmButton>
      )}
      {(fulfillable || (order.status === "failed" && order.fulfillment !== "manual")) && order.status !== "failed" && (
        <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setFailOpen(true)} disabled={pending !== null}>
          <XCircle aria-hidden /> เติมไม่สำเร็จ
        </Button>
      )}
      {slipPending && (
        <>
          <ConfirmButton
            title={`ยืนยันว่าได้รับเงิน ${(payment!.amount / 100).toLocaleString("th-TH")} บาท?`}
            description={order.fulfillment === "manual" ? "รายการจะเข้าคิวรอเติม และลูกค้าได้รับแจ้งว่าชำระเงินสำเร็จ" : "ระบบจะเติมให้อัตโนมัติทันทีหลังยืนยัน"}
            confirmLabel="อนุมัติสลิป"
            action={() => approveSlipAction(slug, order.id)}
            disabled={pending !== null}
          >
            <ThumbsUp aria-hidden /> อนุมัติสลิป
          </ConfirmButton>
          {payment!.status !== "failed" && <RejectSlipButton slug={slug} orderId={order.id} />}
        </>
      )}
      {order.status === "pending_payment" && <CancelButton slug={slug} orderId={order.id} number={order.number} />}

      <FulfillDialog slug={slug} order={order} open={fulfillOpen} onOpenChange={setFulfillOpen} />
      <FailDialog slug={slug} order={order} open={failOpen} onOpenChange={setFailOpen} />
    </div>
  );
}

function FulfillDialog({ slug, order, open, onOpenChange }: { slug: string; order: OrderLite; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { run, pending } = useRun();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [proof, setProof] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [note, setNote] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (open) {
      setProof(null);
      setCode("");
      setNote("");
      setErrors({});
    }
  }, [open]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await uploadProofAction(slug, fd);
      if (!r.ok) toast.error(r.error);
      else setProof(r.data?.url ?? null);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit() {
    const r = await run("fulfill", () => fulfillOrderAction(slug, order.id, { deliveredCode: code.trim() || null, proofImage: proof, note: note.trim() || null }), () => onOpenChange(false));
    if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>บันทึกเติมสำเร็จ · {order.number}</DialogTitle>
          <DialogDescription>แนบภาพหลักฐานการเติม (ไม่บังคับ) ลูกค้าจะได้รับแจ้งเตือนว่าเติมสำเร็จทันที</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="ภาพหลักฐาน (ไม่บังคับ)" htmlFor="proof-file" hint="ภาพหน้าจอผลการเติมจากเกม / supplier">
            <div className="flex items-start gap-3">
              {proof ? <img src={proof} alt="หลักฐานการเติม" className="size-20 shrink-0 rounded-lg border object-cover" /> : <span className="grid size-20 shrink-0 place-items-center rounded-lg border border-dashed bg-muted text-muted-foreground"><ImagePlus className="size-5" aria-hidden /></span>}
              <div className="grid flex-1 gap-2">
                <input ref={fileRef} id="proof-file" type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />} {proof ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
                </Button>
                {proof && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setProof(null)}>
                    ลบรูป
                  </Button>
                )}
              </div>
            </div>
          </Field>
          <Field label="โค้ด / ข้อมูลที่ส่งให้ลูกค้า (ไม่บังคับ)" htmlFor="delivered-code" error={errors.deliveredCode} hint="เช่น โค้ดบัตรของขวัญ ระบบจะเข้ารหัสและแสดงให้ลูกค้าในหน้ารายการ">
            <Input id="delivered-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" autoComplete="off" className="font-mono" aria-invalid={!!errors.deliveredCode} />
          </Field>
          <Field label="โน้ตภายใน (ไม่บังคับ)" htmlFor="fulfill-note">
            <Input id="fulfill-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น เติมผ่านแอป Garena เรียบร้อย" maxLength={500} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending !== null}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={pending !== null || uploading}>
            {pending === "fulfill" ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />} ยืนยันเติมสำเร็จ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FailDialog({ slug, order, open, onOpenChange }: { slug: string; order: OrderLite; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { run, pending } = useRun();
  const [preset, setPreset] = React.useState<string>(FAIL_REASONS[0]);
  const [custom, setCustom] = React.useState("");
  const reason = preset === "__other" ? custom.trim() : preset;
  const paid = order.status !== "pending_payment";
  const walletRefund = paid && order.paymentMethod === "wallet";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>บันทึกเติมไม่สำเร็จ · {order.number}</DialogTitle>
          <DialogDescription>
            {walletRefund ? `ระบบจะคืนเงิน ${(order.price / 100).toLocaleString("th-TH")} บาท เข้ากระเป๋าเงินของลูกค้าอัตโนมัติ` : paid ? "รายการนี้ชำระผ่านช่องทางอื่น ระบบจะติดธง “ต้องคืนเงินมือ” ให้คุณโอนคืนลูกค้าเอง" : "รายการยังไม่ชำระเงิน จะถูกปิดเป็นไม่สำเร็จ"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="เหตุผล (ลูกค้าจะเห็น)" htmlFor="fail-reason">
            <NativeSelect id="fail-reason" value={preset} onChange={(e) => setPreset(e.target.value)}>
              {FAIL_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value="__other">อื่น ๆ (ระบุเอง)</option>
            </NativeSelect>
          </Field>
          {preset === "__other" && (
            <Field label="ระบุเหตุผล" htmlFor="fail-custom">
              <Textarea id="fail-custom" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={300} placeholder="อธิบายสั้น ๆ" />
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending !== null}>
            กลับ
          </Button>
          <Button variant="destructive" disabled={pending !== null || reason.length < 2} onClick={() => run("fail", () => failOrderAction(slug, order.id, reason), () => onOpenChange(false))}>
            {pending === "fail" ? <Loader2 className="animate-spin" aria-hidden /> : <XCircle aria-hidden />} ยืนยันเติมไม่สำเร็จ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectSlipButton({ slug, orderId }: { slug: string; orderId: string }) {
  const { run, pending } = useRun();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  return (
    <>
      <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)} disabled={pending !== null}>
        <ThumbsDown aria-hidden /> ปฏิเสธสลิป
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ปฏิเสธสลิปนี้?</DialogTitle>
            <DialogDescription>ลูกค้าจะเห็นเหตุผลและสามารถแนบสลิปใหม่ได้</DialogDescription>
          </DialogHeader>
          <Field label="เหตุผล" htmlFor="reject-reason">
            <NativeSelect id="reject-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">เลือกเหตุผล…</option>
              {REJECT_SLIP_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending !== null}>
              กลับ
            </Button>
            <Button variant="destructive" disabled={pending !== null || !reason} onClick={() => run("reject", () => rejectSlipAction(slug, orderId, reason), () => setOpen(false))}>
              {pending === "reject" && <Loader2 className="animate-spin" aria-hidden />} ปฏิเสธสลิป
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CancelButton({ slug, orderId, number }: { slug: string; orderId: string; number: string }) {
  const { run, pending } = useRun();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  return (
    <>
      <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)} disabled={pending !== null}>
        <Ban aria-hidden /> ยกเลิกรายการ
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยกเลิก {number}?</DialogTitle>
            <DialogDescription>ใช้เมื่อลูกค้าไม่ชำระเงิน รายการชำระเงินที่ค้างอยู่จะถูกปิด</DialogDescription>
          </DialogHeader>
          <Field label="เหตุผล (ไม่บังคับ)" htmlFor="cancel-reason">
            <Input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="เช่น ลูกค้าไม่โอนภายในเวลา" />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending !== null}>
              กลับ
            </Button>
            <Button variant="destructive" disabled={pending !== null} onClick={() => run("cancel", () => cancelOrderAction(slug, orderId, reason), () => setOpen(false))}>
              {pending === "cancel" && <Loader2 className="animate-spin" aria-hidden />} ยืนยันยกเลิก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function NoteComposer({ slug, orderId, canEdit }: { slug: string; orderId: string; canEdit: boolean }) {
  const { run, pending } = useRun();
  const [text, setText] = React.useState("");
  if (!canEdit) return null;
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        void run("note", () => addNoteAction(slug, orderId, text), () => setText(""));
      }}
    >
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="โน้ตสำหรับทีม เช่น โทรเช็ค UID กับลูกค้าแล้ว (ลูกค้าไม่เห็น)" className="min-h-20" maxLength={1000} aria-label="โน้ตภายใน" />
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant={text.trim() ? "default" : "outline"} disabled={!text.trim() || pending !== null}>
          {pending === "note" ? <Loader2 className="animate-spin" aria-hidden /> : <MessageSquarePlus aria-hidden />} เพิ่มโน้ต
        </Button>
      </div>
    </form>
  );
}
