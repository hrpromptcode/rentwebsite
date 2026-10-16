"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Loader2, PackageCheck, RotateCcw, Save, ThumbsDown, ThumbsUp, Truck } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { CARRIERS, trackingUrlFor } from "@rentweb/module-commerce/admin/labels";
import { satangToBaht, type FormResult } from "@rentweb/module-commerce/admin/schemas";
import { MoneyInput, NativeSelect } from "@rentweb/module-commerce/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { cancelOrderAction, completeOrderAction, confirmOrderAction, refundOrderAction, rejectPaymentAction, saveInternalNoteAction, shipOrderAction, verifyPaymentAction } from "../actions";

type OrderLite = { id: string; number: string; status: string; paymentStatus: string; fulfillmentStatus: string; shippingMethodType: string | null; total: number };
type PaymentLite = { id: string; status: string; amount: number; refundedAmount: number; method: string };

function useRun() {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const run = React.useCallback(
    async (key: string, fn: () => Promise<FormResult>, onOk?: (r: Extract<FormResult, { ok: true }>) => void) => {
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

/** Primary + secondary actions for one order (header bar). */
export function OrderActionBar({ slug, order, payments, canWrite }: { slug: string; order: OrderLite; payments: PaymentLite[]; canWrite: boolean }) {
  const { run, pending } = useRun();
  const [shipOpen, setShipOpen] = React.useState(false);
  const [refundOpen, setRefundOpen] = React.useState(false);
  const closed = order.status === "cancelled" || order.status === "refunded" || order.status === "completed";
  const refundable = payments.filter((p) => (p.status === "paid" || p.status === "partially_refunded") && p.amount - p.refundedAmount > 0);
  const isPickup = order.shippingMethodType === "pickup";
  if (!canWrite) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {order.status === "pending" && (
        <Button onClick={() => run("confirm", () => confirmOrderAction(slug, order.id))} disabled={pending !== null}>
          {pending === "confirm" ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />} ยืนยันออเดอร์
        </Button>
      )}
      {(order.status === "confirmed" || order.status === "processing") && (
        <Button onClick={() => setShipOpen(true)} disabled={pending !== null}>
          <Truck aria-hidden /> {isPickup ? "พร้อมให้รับ / จัดส่ง" : "จัดส่ง"}
        </Button>
      )}
      {(order.status === "shipped" || ((order.status === "confirmed" || order.status === "processing") && isPickup)) && (
        <Button variant={order.status === "shipped" ? "default" : "outline"} onClick={() => run("complete", () => completeOrderAction(slug, order.id))} disabled={pending !== null}>
          {pending === "complete" ? <Loader2 className="animate-spin" aria-hidden /> : <PackageCheck aria-hidden />} เสร็จสิ้น
        </Button>
      )}
      {refundable.length > 0 && (
        <Button variant="outline" onClick={() => setRefundOpen(true)} disabled={pending !== null}>
          <RotateCcw aria-hidden /> คืนเงิน
        </Button>
      )}
      {!closed && <CancelOrderButton slug={slug} orderId={order.id} number={order.number} paid={order.paymentStatus === "paid"} />}

      <ShipDialog slug={slug} orderId={order.id} open={shipOpen} onOpenChange={setShipOpen} isPickup={isPickup} />
      {refundable.length > 0 && <RefundDialog slug={slug} orderId={order.id} payments={refundable} open={refundOpen} onOpenChange={setRefundOpen} />}
    </div>
  );
}

function CancelOrderButton({ slug, orderId, number, paid }: { slug: string; orderId: string; number: string; paid: boolean }) {
  const { run, pending } = useRun();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  return (
    <>
      <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)} disabled={pending !== null}>
        <Ban aria-hidden /> ยกเลิก
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยกเลิกออเดอร์ {number}?</DialogTitle>
            <DialogDescription>สินค้าที่ตัดสต็อกไว้จะถูกคืนเข้าสต็อก และรายการชำระเงินที่ค้างอยู่จะถูกยกเลิก{paid ? " ออเดอร์นี้ชำระเงินแล้ว — กรุณาคืนเงินลูกค้าแยกต่างหาก" : ""}</DialogDescription>
          </DialogHeader>
          <Field label="เหตุผล (ลูกค้าจะเห็น)" htmlFor="cancel-reason">
            <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น สินค้าหมด, ลูกค้าขอยกเลิก" maxLength={300} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending !== null}>
              กลับ
            </Button>
            <Button variant="destructive" onClick={() => run("cancel", () => cancelOrderAction(slug, orderId, reason), () => setOpen(false))} disabled={pending !== null}>
              {pending === "cancel" && <Loader2 className="animate-spin" aria-hidden />} ยืนยันยกเลิก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ShipDialog({ slug, orderId, open, onOpenChange, isPickup }: { slug: string; orderId: string; open: boolean; onOpenChange: (v: boolean) => void; isPickup: boolean }) {
  const { run, pending } = useRun();
  const [carrier, setCarrier] = React.useState(isPickup ? "pickup" : "flash");
  const [tracking, setTracking] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [note, setNote] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const auto = trackingUrlFor(carrier, tracking.trim());
  const needsTracking = carrier !== "pickup" && carrier !== "grab";
  async function submit() {
    const errs: Record<string, string> = {};
    if (needsTracking && !tracking.trim()) errs.trackingNumber = "กรุณากรอกเลขพัสดุ";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    await run(
      "ship",
      () => shipOrderAction(slug, orderId, { carrier, trackingNumber: tracking.trim() || null, trackingUrl: url.trim() || null, note: note.trim() || null }),
      () => onOpenChange(false),
    ).then((r) => {
      if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>บันทึกการจัดส่ง</DialogTitle>
          <DialogDescription>ลูกค้าจะได้รับแจ้งเตือนพร้อมเลขพัสดุทันทีที่บันทึก</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="ขนส่ง" htmlFor="ship-carrier" error={errors.carrier}>
            <NativeSelect id="ship-carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
              {CARRIERS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={needsTracking ? "เลขพัสดุ" : "เลขพัสดุ / อ้างอิง (ถ้ามี)"} htmlFor="ship-tracking" error={errors.trackingNumber} hint={auto ? `ลิงก์ติดตาม: ${auto}` : undefined}>
            <Input id="ship-tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="เช่น TH0123456789" autoComplete="off" aria-invalid={!!errors.trackingNumber} />
          </Field>
          <Field label="ลิงก์ติดตาม (ไม่บังคับ)" htmlFor="ship-url" error={errors.trackingUrl} hint="เว้นว่างเพื่อใช้ลิงก์ของขนส่งอัตโนมัติ">
            <Input id="ship-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-invalid={!!errors.trackingUrl} />
          </Field>
          <Field label="หมายเหตุภายใน" htmlFor="ship-note">
            <Input id="ship-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ส่ง 2 กล่อง" maxLength={500} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending !== null}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={pending !== null}>
            {pending === "ship" ? <Loader2 className="animate-spin" aria-hidden /> : <Truck aria-hidden />} บันทึกการจัดส่ง
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({ slug, orderId, payments, open, onOpenChange, initialPaymentId }: { slug: string; orderId: string; payments: PaymentLite[]; open: boolean; onOpenChange: (v: boolean) => void; initialPaymentId?: string }) {
  const { run, pending } = useRun();
  const [paymentId, setPaymentId] = React.useState(initialPaymentId ?? payments[0]?.id ?? "");
  const selected = payments.find((p) => p.id === paymentId) ?? payments[0];
  const remaining = selected ? selected.amount - selected.refundedAmount : 0;
  const [amount, setAmount] = React.useState(satangToBaht(remaining));
  const [note, setNote] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    if (open) {
      setAmount(satangToBaht(remaining));
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, paymentId]);
  async function submit() {
    const r = await run("refund", () => refundOrderAction(slug, orderId, { paymentId, amount, note }), () => onOpenChange(false));
    if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>คืนเงินลูกค้า</DialogTitle>
          <DialogDescription>บันทึกยอดที่โอนคืนให้ลูกค้า (ระบบไม่ได้โอนเงินอัตโนมัติ) คืนได้สูงสุด {satangToBaht(remaining)} บาท</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {payments.length > 1 && (
            <Field label="รายการชำระเงิน" htmlFor="refund-payment">
              <NativeSelect id="refund-payment" value={paymentId} onChange={(e) => setPaymentId(e.target.value)}>
                {payments.map((p) => (
                  <option key={p.id} value={p.id}>
                    {satangToBaht(p.amount - p.refundedAmount)} บาท · {p.method}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field label="จำนวนเงินคืน (บาท)" htmlFor="refund-amount" error={errors.amount}>
            <MoneyInput id="refund-amount" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={!!errors.amount} />
          </Field>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setAmount(satangToBaht(remaining))}>
              คืนเต็มจำนวน
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setAmount(satangToBaht(Math.round(remaining / 2)))}>
              ครึ่งหนึ่ง
            </Button>
          </div>
          <Field label="หมายเหตุ" htmlFor="refund-note">
            <Input id="refund-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น สินค้าชำรุด โอนคืนผ่าน KBank" maxLength={300} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending !== null}>
            ยกเลิก
          </Button>
          <Button variant="destructive" onClick={submit} disabled={pending !== null}>
            {pending === "refund" ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />} บันทึกการคืนเงิน
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Verify / reject buttons under one payment row. */
export function PaymentActions({ slug, orderId, payment, canWrite }: { slug: string; orderId: string; payment: PaymentLite; canWrite: boolean }) {
  const { run, pending } = useRun();
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [refundOpen, setRefundOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  if (!canWrite) return null;
  const verifiable = ["pending", "pending_verification", "failed", "expired"].includes(payment.status);
  const refundable = (payment.status === "paid" || payment.status === "partially_refunded") && payment.amount - payment.refundedAmount > 0;
  if (!verifiable && !refundable) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {verifiable && (
        <>
          <ConfirmButton
            size="sm"
            title="ยืนยันว่าได้รับเงินแล้ว?"
            description={`ยอด ${satangToBaht(payment.amount)} บาท — ออเดอร์จะเปลี่ยนเป็นชำระแล้วและลูกค้าได้รับใบเสร็จ`}
            confirmLabel="ยืนยันชำระ"
            action={() => verifyPaymentAction(slug, orderId, payment.id)}
          >
            <ThumbsUp aria-hidden /> ยืนยันชำระ
          </ConfirmButton>
          {payment.status !== "failed" && (
            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setRejectOpen(true)} disabled={pending !== null}>
              <ThumbsDown aria-hidden /> ปฏิเสธสลิป
            </Button>
          )}
          <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>ปฏิเสธสลิปนี้?</DialogTitle>
                <DialogDescription>ลูกค้าจะได้รับแจ้งเหตุผลและสามารถแนบสลิปใหม่ได้</DialogDescription>
              </DialogHeader>
              <Field label="เหตุผล" htmlFor={`reject-${payment.id}`}>
                <NativeSelect id={`reject-${payment.id}`} value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">เลือกเหตุผล…</option>
                  <option value="ยอดเงินไม่ตรง">ยอดเงินไม่ตรง</option>
                  <option value="ไม่พบรายการโอนในบัญชี">ไม่พบรายการโอนในบัญชี</option>
                  <option value="สลิปซ้ำ / เคยใช้แล้ว">สลิปซ้ำ / เคยใช้แล้ว</option>
                  <option value="รูปสลิปไม่ชัดเจน">รูปสลิปไม่ชัดเจน</option>
                  <option value="สลิปไม่ถูกต้อง">สลิปไม่ถูกต้อง</option>
                </NativeSelect>
              </Field>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={pending !== null}>
                  กลับ
                </Button>
                <Button variant="destructive" onClick={() => run("reject", () => rejectPaymentAction(slug, orderId, payment.id, reason), () => setRejectOpen(false))} disabled={pending !== null || !reason}>
                  {pending === "reject" && <Loader2 className="animate-spin" aria-hidden />} ปฏิเสธสลิป
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
      {refundable && (
        <>
          <Button size="sm" variant="outline" onClick={() => setRefundOpen(true)}>
            <RotateCcw aria-hidden /> คืนเงิน
          </Button>
          <RefundDialog slug={slug} orderId={orderId} payments={[payment]} open={refundOpen} onOpenChange={setRefundOpen} initialPaymentId={payment.id} />
        </>
      )}
    </div>
  );
}

export function InternalNote({ slug, orderId, initial, canEdit }: { slug: string; orderId: string; initial: string; canEdit: boolean }) {
  const { run, pending } = useRun();
  const [note, setNote] = React.useState(initial);
  const [saved, setSaved] = React.useState(initial);
  const dirty = note !== saved;
  return (
    <div className="grid gap-2">
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="โน้ตสำหรับทีม เช่น โทรก่อนส่ง, ห่อของขวัญ (ลูกค้าไม่เห็น)" className="min-h-24" disabled={!canEdit} maxLength={5000} aria-label="โน้ตภายใน" />
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" variant={dirty ? "default" : "outline"} disabled={!dirty || pending !== null} onClick={() => run("note", () => saveInternalNoteAction(slug, orderId, note), () => setSaved(note))}>
            {pending === "note" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} บันทึกโน้ต
          </Button>
        </div>
      )}
    </div>
  );
}
