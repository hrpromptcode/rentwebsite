"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, CalendarClock, Check, CheckCircle2, Loader2, LogIn, Play, Save, UserX, Wallet, X } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { ACTION_LABEL, PAY_AT_SHOP_DETAIL, PAY_AT_SHOP_LABEL, PAYMENT_ROW_STATUS, type BookingAction } from "@rentweb/module-booking/admin/labels";
import { addDays, Avatar, formatBkkTime, formatThaiYmd, parseYmd, SlipPreview, SlotPicker, StatusPill, ymdToString, type SlotChip } from "@rentweb/module-booking/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { thb } from "@/lib/format";
import { adminSlotsAction, approveDepositAction, cancelBookingAction, cashDepositAction, refundDepositAction, rejectDepositAction, rescheduleBookingAction, saveInternalNoteAction, transitionBookingAction } from "../actions";

const ACTION_ICON: Record<BookingAction, React.ComponentType<{ className?: string }>> = { confirm: Check, check_in: LogIn, start: Play, complete: CheckCircle2, no_show: UserX };

/** Reason prompt used by cancel + slip reject. */
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

export function StatusActions({ slug, id, actions, canCancel, canWrite }: { slug: string; id: string; actions: BookingAction[]; canCancel: boolean; canWrite: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  if (!canWrite || (!actions.length && !canCancel)) return null;

  async function run(a: BookingAction) {
    setPending(a);
    try {
      const r = await transitionBookingAction(slug, id, a);
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
          <Button key={a} type="button" variant={i === 0 ? "default" : "outline"} onClick={() => run(a)} disabled={pending !== null}>
            {pending === a ? <Loader2 className="animate-spin" aria-hidden /> : <Icon aria-hidden />} {ACTION_LABEL[a]}
          </Button>
        );
      })}
      {actions.includes("no_show") && (
        <ConfirmButton variant="ghost" title="บันทึกว่าลูกค้าไม่มาตามนัด?" description="สถานะจะเปลี่ยนเป็น “ไม่มาตามนัด” และช่องเวลานี้จะว่างให้คนอื่นจองได้" confirmLabel="ไม่มาตามนัด" action={async () => {
          const r = await transitionBookingAction(slug, id, "no_show");
          if (r.ok) router.refresh();
          return r;
        }}>
          <UserX aria-hidden /> ไม่มา
        </ConfirmButton>
      )}
      {canCancel && (
        <>
          <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)}>
            <Ban aria-hidden /> ยกเลิกนัด
          </Button>
          <ReasonDialog
            open={cancelOpen}
            onOpenChange={setCancelOpen}
            title="ยกเลิกการจองนี้?"
            description="ลูกค้าจะได้รับแจ้งการยกเลิก ช่องเวลาจะว่างให้คนอื่นจองได้ทันที"
            presets={["ลูกค้าขอยกเลิก", "ติดต่อลูกค้าไม่ได้", "ร้านปิด / พนักงานลา", "จองซ้ำ"]}
            confirmLabel="ยกเลิกการจอง"
            onConfirm={async (reason) => {
              const r = await cancelBookingAction(slug, id, reason);
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

const METHOD: Record<string, string> = { slip: "โอนเงิน (สลิป)", promptpay_qr: "PromptPay QR", cash: "เงินสด", card: "บัตร", wallet: "วอลเล็ต" };

export function DepositCard({ slug, bookingId, depositAmount, bookingPaymentStatus, bookingStatus, payment, canApprove, canWrite, payAtShop = false }: { slug: string; bookingId: string; depositAmount: number; bookingPaymentStatus: string; bookingStatus: string; payment: PaymentVM | null; canApprove: boolean; canWrite: boolean; payAtShop?: boolean }) {
  const router = useRouter();
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const live = !["cancelled", "no_show"].includes(bookingStatus);
  const awaiting = payment && ["pending", "pending_verification"].includes(payment.status);

  async function approve() {
    if (!payment) return;
    setBusy(true);
    try {
      const r = await approveDepositAction(slug, bookingId, payment.id);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message ?? "ยืนยันแล้ว");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="deposit-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-4" aria-hidden /> มัดจำ
        </CardTitle>
        <CardDescription>{depositAmount > 0 ? `ยอดมัดจำ ${thb(depositAmount)}` : payAtShop ? `ไม่ได้เก็บมัดจำ · ${PAY_AT_SHOP_LABEL}` : "บริการนี้ไม่ต้องชำระมัดจำ"}</CardDescription>
      </CardHeader>
      {payAtShop && !payment && depositAmount <= 0 && (
        <CardContent>
          <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-950 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-50" data-testid="pay-at-shop">
            <span className="font-semibold">{PAY_AT_SHOP_LABEL}</span> — {PAY_AT_SHOP_DETAIL}
          </p>
        </CardContent>
      )}
      {(payment || (depositAmount > 0 && bookingPaymentStatus === "unpaid")) && (
        <CardContent className="space-y-4">
          {payment && (
            <div className="flex gap-4">
              {payment.slipUrl ? <SlipPreview src={payment.slipUrl} description={`${thb(payment.amount)} · ส่งเมื่อ ${formatThaiYmd(payment.createdAt.slice(0, 10), { short: true })}`} /> : null}
              <dl className="grid min-w-0 flex-1 gap-1.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill map={PAYMENT_ROW_STATUS} status={payment.status} />
                  <span className="text-muted-foreground">{METHOD[payment.method] ?? payment.method}</span>
                </div>
                <div className="font-semibold tabular-nums">{thb(payment.amount)}</div>
                {payment.paidAt && <div className="text-xs text-muted-foreground">ยืนยันเมื่อ {new Date(payment.paidAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" })}</div>}
                {payment.failureReason && <div className="text-xs text-destructive">เหตุผล: {payment.failureReason}</div>}
                {payment.status === "pending" && !payment.slipUrl && <div className="text-xs text-muted-foreground">รอลูกค้าชำระ / อัปโหลดสลิป</div>}
              </dl>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {awaiting && canApprove && live && (
              <>
                <Button type="button" onClick={approve} disabled={busy} data-testid="approve-deposit">
                  {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} ยืนยันมัดจำ
                </Button>
                <Button type="button" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setRejectOpen(true)}>
                  <X aria-hidden /> ปฏิเสธสลิป
                </Button>
                <ReasonDialog
                  open={rejectOpen}
                  onOpenChange={setRejectOpen}
                  title="ปฏิเสธสลิปนี้?"
                  description="ลูกค้าจะเห็นเหตุผลและอัปโหลดสลิปใหม่ได้ การจองยังคงรอมัดจำ"
                  presets={["ยอดเงินไม่ตรง", "สลิปไม่ชัด / ไม่ครบ", "ไม่พบยอดเข้าบัญชี", "สลิปซ้ำ"]}
                  confirmLabel="ปฏิเสธสลิป"
                  onConfirm={async (reason) => {
                    const r = await rejectDepositAction(slug, bookingId, payment!.id, reason);
                    if (!r.ok) {
                      toast.error(r.error);
                      return false;
                    }
                    toast.success(r.message ?? "ปฏิเสธแล้ว");
                    router.refresh();
                    return true;
                  }}
                />
              </>
            )}
            {canWrite && live && depositAmount > 0 && bookingPaymentStatus === "unpaid" && !awaiting && (
              <ConfirmButton variant="outline" title={`รับมัดจำเงินสด ${thb(depositAmount)}?`} description="บันทึกว่าลูกค้าชำระมัดจำที่หน้าร้าน การจองจะถูกยืนยันอัตโนมัติ" confirmLabel="รับเงินแล้ว" action={() => cashDepositAction(slug, bookingId).then((r) => (r.ok && router.refresh(), r))}>
                <Wallet aria-hidden /> รับมัดจำเงินสด
              </ConfirmButton>
            )}
            {payment?.status === "paid" && canApprove && (bookingStatus === "cancelled" || bookingStatus === "no_show") && (
              <ConfirmButton variant="outline" title={`คืนมัดจำ ${thb(payment.amount)}?`} description="บันทึกว่าคืนเงินให้ลูกค้าแล้ว (โอนคืนเองนอกระบบ)" confirmLabel="บันทึกการคืนเงิน" action={() => refundDepositAction(slug, bookingId, payment.id).then((r) => (r.ok && router.refresh(), r))}>
                คืนมัดจำ
              </ConfirmButton>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function RescheduleCard({ slug, bookingId, serviceId, currentStart, currentStaffId, staff, today }: { slug: string; bookingId: string; serviceId: string; currentStart: string; currentStaffId: string | null; staff: Array<{ id: string; name: string; color: string; avatar: string | null }>; today: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const cur = new Date(currentStart);
  const curDate = new Date(cur.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  const [date, setDate] = React.useState(curDate < today ? today : curDate);
  const [staffId, setStaffId] = React.useState(currentStaffId ?? "");
  const [slots, setSlots] = React.useState<SlotChip[] | null>(null);
  const [start, setStart] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let live = true;
    setSlots(null);
    setStart(null);
    adminSlotsAction(slug, { serviceId, date, staffId: staffId || null }).then((r) => live && setSlots(r.ok ? (r.data ?? []).filter((s) => s.start !== currentStart || staffId !== (currentStaffId ?? "")) : []));
    return () => {
      live = false;
    };
  }, [open, slug, serviceId, date, staffId, currentStart, currentStaffId]);

  async function submit() {
    if (!start) return;
    setPending(true);
    try {
      const r = await rescheduleBookingAction(slug, bookingId, { start, staffId: staffId || null });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "เลื่อนนัดแล้ว");
      router.push(`/t/${slug}/bookings/${r.data!.id}`);
    } finally {
      setPending(false);
    }
  }

  const t = parseYmd(today)!;
  return (
    <Card data-testid="reschedule-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4" aria-hidden /> เลื่อนนัด
        </CardTitle>
        <CardDescription>ระบบจะยกเลิกคิวเดิมและสร้างคิวใหม่ให้ (ยอดมัดจำที่ชำระแล้วโอนไปคิวใหม่)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!open ? (
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            <CalendarClock aria-hidden /> เลือกวัน/เวลาใหม่
          </Button>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {[0, 1, 2].map((n) => {
                const d = ymdToString(addDays(t, n));
                return (
                  <Button key={d} type="button" size="sm" className="h-10" variant={date === d ? "secondary" : "outline"} onClick={() => setDate(d)}>
                    {n === 0 ? "วันนี้" : n === 1 ? "พรุ่งนี้" : formatThaiYmd(d, { short: true })}
                  </Button>
                );
              })}
              <Input type="date" value={date} min={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-10 w-auto" aria-label="วันที่ใหม่" />
            </div>
            {staff.length > 0 && (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="ผู้ให้บริการ">
                <button type="button" role="radio" aria-checked={!staffId} onClick={() => setStaffId("")} className={cn("min-h-10 rounded-full border px-3 text-sm", !staffId ? "border-primary bg-primary-soft/60" : "hover:bg-muted")}>
                  ใครก็ได้ที่ว่าง
                </button>
                {staff.map((s) => (
                  <button key={s.id} type="button" role="radio" aria-checked={staffId === s.id} onClick={() => setStaffId(s.id)} className={cn("flex min-h-10 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm", staffId === s.id ? "border-primary bg-primary-soft/60" : "hover:bg-muted")}>
                    <Avatar src={s.avatar} name={s.name} color={s.color} size="sm" className="size-7" /> {s.name}
                  </button>
                ))}
              </div>
            )}
            <SlotPicker slots={slots} selected={start} onSelect={setStart} />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                ปิด
              </Button>
              <Button type="button" onClick={submit} disabled={!start || pending}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CalendarClock aria-hidden />} {start ? `เลื่อนเป็น ${formatThaiYmd(date, { short: true })} ${formatBkkTime(start)}` : "เลือกเวลา"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function InternalNote({ slug, bookingId, initial, canWrite }: { slug: string; bookingId: string; initial: string; canWrite: boolean }) {
  const router = useRouter();
  const [note, setNote] = React.useState(initial);
  const [pending, setPending] = React.useState(false);
  const dirty = note !== initial;
  return (
    <Card>
      <CardHeader>
        <CardTitle>โน้ตภายใน</CardTitle>
        <CardDescription>เห็นเฉพาะทีมงาน ลูกค้าไม่เห็น</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={!canWrite} placeholder="เช่น ลูกค้าประจำ ชอบน้ำหนักมือเบา…" maxLength={3000} className="min-h-24" aria-label="โน้ตภายใน" />
        {canWrite && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              disabled={!dirty || pending}
              onClick={async () => {
                setPending(true);
                try {
                  const r = await saveInternalNoteAction(slug, bookingId, note);
                  if (!r.ok) toast.error(r.error);
                  else {
                    toast.success(r.message ?? "บันทึกแล้ว");
                    router.refresh();
                  }
                } finally {
                  setPending(false);
                }
              }}
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} บันทึกโน้ต
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
