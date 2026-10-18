"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, Banknote, Check, Loader2, LogIn, LogOut, Save, UserX, Wallet, X } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { ACTION_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_ROW_STATUS, type StayAdminAction } from "@rentweb/module-rental/admin/labels";
import { SlipPreview, StatusPill, formatThaiDateTime } from "@rentweb/module-rental/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { thb } from "@/lib/format";
import { approvePaymentAction, cancelStayAction, cashPaymentAction, refundPaymentAction, rejectPaymentAction, saveStayNotesAction, transitionStayAction } from "../actions";

const ACTION_ICON: Record<StayAdminAction, React.ComponentType<{ className?: string }>> = { confirm: Check, check_in: LogIn, check_out: LogOut, no_show: UserX };

function ReasonDialog({ open, onOpenChange, title, description, presets, confirmLabel, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; presets: string[]; confirmLabel: string; onConfirm: (reason: string) => Promise<boolean> }) {
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button key={p} type="button" onClick={() => setReason(p)} className={cn("min-h-9 rounded-full border px-3 text-sm", reason === p ? "border-primary bg-primary-soft" : "hover:bg-muted")}>
                {p}
              </button>
            ))}
          </div>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ระบุเหตุผล" maxLength={300} aria-label="เหตุผล" autoFocus />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            ปิด
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending || !reason.trim()}
            data-testid="reason-confirm"
            onClick={async () => {
              setPending(true);
              try {
                if (await onConfirm(reason.trim())) {
                  setReason("");
                  onOpenChange(false);
                }
              } finally {
                setPending(false);
              }
            }}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />} {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StatusActions({ slug, id, actions, canCancel, canWrite }: { slug: string; id: string; actions: StayAdminAction[]; canCancel: boolean; canWrite: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  if (!canWrite || (!actions.length && !canCancel)) return null;

  async function run(a: StayAdminAction) {
    setPending(a);
    try {
      const r = await transitionStayAction(slug, id, a);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message ?? "บันทึกแล้ว");
        router.refresh();
      }
    } finally {
      setPending(null);
    }
  }

  const primary = actions.filter((a) => a !== "no_show");
  return (
    <div className="flex flex-wrap gap-2" data-testid="status-actions">
      {primary.map((a, i) => {
        const Icon = ACTION_ICON[a];
        return (
          <Button key={a} type="button" variant={i === 0 ? "default" : "outline"} onClick={() => run(a)} disabled={pending !== null} data-testid={`action-${a}`}>
            {pending === a ? <Loader2 className="animate-spin" aria-hidden /> : <Icon aria-hidden />} {ACTION_LABEL[a]}
          </Button>
        );
      })}
      {actions.includes("no_show") && (
        <ConfirmButton
          variant="ghost"
          title="บันทึกว่าแขกไม่มาเข้าพัก?"
          description="สถานะจะเปลี่ยนเป็น “ไม่มาเข้าพัก” รายการชำระเงินที่ค้างอยู่จะถูกยกเลิก และห้องจะว่างให้จองได้"
          confirmLabel="ไม่มาเข้าพัก"
          action={async () => {
            const r = await transitionStayAction(slug, id, "no_show");
            if (r.ok) router.refresh();
            return r;
          }}
        >
          <UserX aria-hidden /> ไม่มา
        </ConfirmButton>
      )}
      {canCancel && (
        <>
          <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)} data-testid="action-cancel">
            <Ban aria-hidden /> ยกเลิกการจอง
          </Button>
          <ReasonDialog
            open={cancelOpen}
            onOpenChange={setCancelOpen}
            title="ยกเลิกการจองนี้?"
            description="ลูกค้าจะได้รับแจ้งการยกเลิก QR / รายการโอนที่ยังไม่ชำระจะถูกยกเลิก และห้องจะว่างให้จองได้ทันที (สลิปที่รอตรวจต้องอนุมัติหรือปฏิเสธก่อน เงินที่รับแล้วต้องคืนแยกต่างหาก)"
            presets={["ลูกค้าขอยกเลิก", "ติดต่อลูกค้าไม่ได้", "ห้องไม่พร้อมให้บริการ", "จองซ้ำ"]}
            confirmLabel="ยกเลิกการจอง"
            onConfirm={async (reason) => {
              const r = await cancelStayAction(slug, id, reason);
              if (!r.ok) {
                toast.error(r.error);
                return false;
              }
              toast.success(r.message ?? "ยกเลิกแล้ว");
              router.refresh();
              return true;
            }}
          />
        </>
      )}
    </div>
  );
}

export interface PaymentVM {
  id: string;
  status: string;
  method: string;
  amount: number;
  slipUrl: string | null;
  createdAt: string;
  paidAt: string | null;
  failureReason: string | null;
}

export function PaymentCard({ slug, stayId, stayStatus, paymentStatus, total, paidAmount, depositAmount, payments, canApprove, canWrite }: { slug: string; stayId: string; stayStatus: string; paymentStatus: string; total: number; paidAmount: number; depositAmount: number; payments: PaymentVM[]; canApprove: boolean; canWrite: boolean }) {
  const router = useRouter();
  const [rejectFor, setRejectFor] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const live = !["cancelled", "no_show", "checked_out"].includes(stayStatus);
  const balance = Math.max(0, total - paidAmount);
  const awaiting = payments.filter((p) => ["pending", "pending_verification"].includes(p.status));

  async function act(key: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setBusy(key);
    try {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "ทำรายการไม่สำเร็จ");
      else {
        toast.success(r.message ?? "บันทึกแล้ว");
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card data-testid="payment-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-4" aria-hidden /> การชำระเงิน
        </CardTitle>
        <CardDescription>
          ยอดรวม {thb(total)} · รับแล้ว <span data-testid="paid-amount">{thb(paidAmount)}</span>
          {balance > 0 ? ` · คงเหลือ ${thb(balance)}` : " · ชำระครบแล้ว"}
          {depositAmount > 0 && paymentStatus === "unpaid" ? ` · มัดจำที่ต้องชำระ ${thb(depositAmount)}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {payments.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีรายการชำระเงิน</p>}
        {payments.map((p) => (
          <div key={p.id} className="flex gap-4 rounded-xl border p-3" data-testid={`payment-${p.status}`}>
            {p.slipUrl ? <SlipPreview src={p.slipUrl} description={`${thb(p.amount)} · ส่งเมื่อ ${formatThaiDateTime(p.createdAt)}`} /> : null}
            <dl className="grid min-w-0 flex-1 gap-1.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill map={PAYMENT_ROW_STATUS} status={p.status} />
                <span className="text-muted-foreground">{PAYMENT_METHOD_LABEL[p.method] ?? p.method}</span>
              </div>
              <div className="font-semibold tabular-nums">{thb(p.amount)}</div>
              <div className="text-xs text-muted-foreground">{p.paidAt ? `ยืนยันเมื่อ ${formatThaiDateTime(p.paidAt)}` : `สร้างเมื่อ ${formatThaiDateTime(p.createdAt)}`}</div>
              {p.failureReason && <div className="text-xs text-destructive">{p.failureReason}</div>}
              {canApprove && ["pending", "pending_verification"].includes(p.status) && live && (
                <div className="mt-1 flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => act(p.id, () => approvePaymentAction(slug, stayId, p.id))} disabled={busy !== null} data-testid="approve-payment">
                    {busy === p.id ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} {p.status === "pending_verification" ? "อนุมัติสลิป" : "บันทึกว่าได้รับเงิน"}
                  </Button>
                  {p.status === "pending_verification" && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setRejectFor(p.id)} disabled={busy !== null}>
                      <X aria-hidden /> ปฏิเสธสลิป
                    </Button>
                  )}
                </div>
              )}
              {canApprove && p.status === "paid" && (
                <div className="mt-1">
                  <ConfirmButton size="sm" variant="ghost" title="บันทึกการคืนเงิน?" description={`บันทึกว่าคืนเงิน ${thb(p.amount)} ให้ลูกค้าแล้ว (โอนคืนด้วยตนเองนอกระบบ)`} confirmLabel="บันทึกคืนเงิน" action={() => refundPaymentAction(slug, stayId, p.id).then((r) => (r.ok ? (router.refresh(), r) : r))}>
                    คืนเงิน
                  </ConfirmButton>
                </div>
              )}
            </dl>
          </div>
        ))}
        {canWrite && live && (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {paymentStatus === "unpaid" && depositAmount > 0 && awaiting.every((p) => p.status !== "pending_verification") && (
              <ConfirmButton variant="outline" title="รับเงินสดที่ที่พัก?" description={`บันทึกว่ารับ ${thb(depositAmount)} เป็นเงินสด/บัตรที่หน้าเคาน์เตอร์ — QR / รายการโอนที่ค้างจะถูกยกเลิก และการจองจะได้รับการยืนยัน`} confirmLabel="รับเงินสด" action={() => cashPaymentAction(slug, stayId, "due").then((r) => (r.ok ? (router.refresh(), r) : r))}>
                <Banknote aria-hidden /> รับมัดจำเงินสด {thb(depositAmount)}
              </ConfirmButton>
            )}
            {paymentStatus !== "unpaid" && balance > 0 && (
              <ConfirmButton variant="outline" title="รับชำระส่วนที่เหลือ?" description={`บันทึกว่ารับ ${thb(balance)} ที่ที่พัก (เงินสด/บัตร) — การจองจะเป็น “ชำระครบแล้ว”`} confirmLabel="บันทึกรับเงิน" action={() => cashPaymentAction(slug, stayId, "balance").then((r) => (r.ok ? (router.refresh(), r) : r))} data-testid="cash-balance">
                <Banknote aria-hidden /> รับส่วนที่เหลือ {thb(balance)}
              </ConfirmButton>
            )}
          </div>
        )}
      </CardContent>
      <ReasonDialog
        open={!!rejectFor}
        onOpenChange={(o) => !o && setRejectFor(null)}
        title="ปฏิเสธสลิปนี้?"
        description="ลูกค้าจะเห็นเหตุผลและส่งสลิปใหม่ได้ ห้องยังถูกถือไว้ตามเวลาที่เหลือ"
        presets={["ยอดเงินไม่ตรง", "สลิปไม่ชัด / อ่านไม่ได้", "โอนผิดบัญชี", "สลิปซ้ำ"]}
        confirmLabel="ปฏิเสธสลิป"
        onConfirm={async (reason) => {
          if (!rejectFor) return false;
          const r = await rejectPaymentAction(slug, stayId, rejectFor, reason);
          if (!r.ok) {
            toast.error(r.error);
            return false;
          }
          toast.success(r.message ?? "ปฏิเสธแล้ว");
          router.refresh();
          return true;
        }}
      />
    </Card>
  );
}

export function NotesCard({ slug, stayId, unitNumber, internalNote, canWrite }: { slug: string; stayId: string; unitNumber: string | null; internalNote: string | null; canWrite: boolean }) {
  const router = useRouter();
  const [unit, setUnit] = React.useState(unitNumber ?? "");
  const [note, setNote] = React.useState(internalNote ?? "");
  const [pending, setPending] = React.useState(false);
  const dirty = unit !== (unitNumber ?? "") || note !== (internalNote ?? "");
  async function save() {
    setPending(true);
    try {
      const r = await saveStayNotesAction(slug, stayId, { unitNumber: unit || null, internalNote: note || null });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message ?? "บันทึกแล้ว");
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }
  return (
    <Card data-testid="notes-card">
      <CardHeader>
        <CardTitle>หมายเลขห้องและโน้ตภายใน</CardTitle>
        <CardDescription>ลูกค้าเห็นเฉพาะหมายเลขห้อง โน้ตภายในเห็นเฉพาะทีมงาน</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Field label="หมายเลขห้อง / ยูนิต" htmlFor="stay-unit" hint="เช่น 201, Villa B">
          <Input id="stay-unit" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={30} disabled={!canWrite} data-testid="unit-number" />
        </Field>
        <Field label="โน้ตภายใน" htmlFor="stay-note">
          <Textarea id="stay-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} placeholder="เช่น ขอห้องชั้นล่าง แพ้อาหารทะเล มาถึงดึก" disabled={!canWrite} />
        </Field>
        {canWrite && (
          <div className="flex justify-end">
            <Button type="button" onClick={save} disabled={!dirty || pending} data-testid="save-notes">
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} บันทึก
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
