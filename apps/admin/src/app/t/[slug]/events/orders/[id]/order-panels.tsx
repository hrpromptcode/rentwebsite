"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, Banknote, Check, Loader2, Pencil, QrCode, Save, Send, Undo2, Wallet, X } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Checkbox } from "@rentweb/ui/components/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { CANCEL_REASON_PRESETS, PAYMENT_METHOD_LABEL, PAYMENT_ROW_STATUS, REFUND_REASON_PRESETS, REJECT_SLIP_PRESETS, TICKET_STATUS, VOID_REASON_PRESETS } from "@rentweb/module-events/admin/labels";
import { bahtToSatang, satangToBaht, type HolderInput } from "@rentweb/module-events/admin/schemas";
import { MoneyInput, ReasonPicker, SlipPreview, StatusPill, formatThaiDateTime } from "@rentweb/module-events/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { thb } from "@/lib/format";
import { approvePaymentAction, cancelOrderAction, cashPaymentAction, refundOrderAction, rejectPaymentAction, resendTicketsAction, saveOrderNoteAction, updateHolderAction, voidTicketAction } from "../actions";

export interface TicketVM {
  id: string;
  code: string;
  holderName: string;
  holderEmail: string | null;
  seatLabel: string | null;
  typeName: string;
  sessionLabel: string | null;
  price: number;
  status: string;
  checkedInAt: string | null;
  voidReason: string | null;
  /** PNG data URL (live tickets only) */
  qr: string | null;
}

export interface PaymentVM {
  id: string;
  status: string;
  method: string;
  amount: number;
  refundedAmount: number;
  slipUrl: string | null;
  createdAt: string;
  paidAt: string | null;
  failureReason: string | null;
  current: boolean;
}

type R = { ok: boolean; error?: string; message?: string };

function ReasonDialog({ open, onOpenChange, title, description, presets, confirmLabel, destructive = true, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; presets: string[]; confirmLabel: string; destructive?: boolean; onConfirm: (reason: string) => Promise<boolean> }) {
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <ReasonPicker value={reason} onChange={setReason} presets={presets} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            ปิด
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
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

/* ----------------------------- header actions ------------------------------ */

export function OrderActions({ slug, orderId, status, canManage, canStaff, liveTickets, hasContact }: { slug: string; orderId: string; status: string; canManage: boolean; canStaff: boolean; liveTickets: number; hasContact: boolean }) {
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  if (!canStaff) return null;
  return (
    <div className="flex flex-wrap gap-2" data-testid="order-actions">
      {status === "paid" && liveTickets > 0 && (
        <Button
          type="button"
          variant="outline"
          disabled={sending || !hasContact}
          title={hasContact ? undefined : "คำสั่งซื้อนี้ไม่มีอีเมล/เบอร์โทร"}
          data-testid="action-resend"
          onClick={async () => {
            setSending(true);
            try {
              const r = await resendTicketsAction(slug, orderId);
              if (r.ok) toast.success(r.message ?? "ส่งแล้ว");
              else toast.error(r.error);
            } finally {
              setSending(false);
            }
          }}
        >
          {sending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} ส่งบัตรให้ลูกค้าอีกครั้ง
        </Button>
      )}
      {canManage && status === "pending" && (
        <>
          <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)} data-testid="action-cancel">
            <Ban aria-hidden /> ยกเลิกคำสั่งซื้อ
          </Button>
          <ReasonDialog
            open={cancelOpen}
            onOpenChange={setCancelOpen}
            title="ยกเลิกคำสั่งซื้อนี้?"
            description="บัตรที่ถือไว้จะถูกปล่อยคืนทันที QR / รายการโอนที่ยังไม่ชำระจะถูกยกเลิก (สลิปที่รอตรวจต้องอนุมัติหรือปฏิเสธก่อน)"
            presets={CANCEL_REASON_PRESETS}
            confirmLabel="ยกเลิกคำสั่งซื้อ"
            onConfirm={async (reason) => {
              const r = await cancelOrderAction(slug, orderId, reason);
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

/* ------------------------------ refund dialog ------------------------------ */

function RefundDialog({ slug, orderId, tickets, open, onOpenChange, preselect, paidAmount, refundedAmount, refundReleasesSeats }: { slug: string; orderId: string; tickets: TicketVM[]; open: boolean; onOpenChange: (o: boolean) => void; preselect: string[] | null; paidAmount: number; refundedAmount: number; refundReleasesSeats: boolean }) {
  const router = useRouter();
  const live = tickets.filter((t) => t.status === "valid" || t.status === "checked_in");
  const [selected, setSelected] = React.useState<Set<string>>(new Set(preselect ?? live.map((t) => t.id)));
  const [amount, setAmount] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setSelected(new Set(preselect ?? live.map((t) => t.id)));
      setTouched(false);
      setAmount("");
      setReason("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preselect]);
  const cap = Math.max(0, paidAmount - refundedAmount);
  const suggested = Math.min(cap, live.filter((t) => selected.has(t.id)).reduce((s, t) => s + t.price, 0));
  const satang = touched ? bahtToSatang(amount || 0) : suggested;
  const all = selected.size === live.length;
  const invalid = !selected.size || !Number.isFinite(satang) || satang < 0 || satang > cap;

  async function submit() {
    setPending(true);
    try {
      const r = await refundOrderAction(slug, orderId, { ticketIds: all ? null : [...selected], amount: touched ? satang : null, reason: reason || null });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "คืนเงินแล้ว");
      onOpenChange(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>คืนเงิน</DialogTitle>
          <DialogDescription>เลือกบัตรที่จะคืน บัตรที่เลือกจะใช้เข้างานไม่ได้อีก{refundReleasesSeats ? " และที่นั่งจะกลับมาขายได้" : ""} · โอนเงินคืนลูกค้าด้วยตนเองนอกระบบ แล้วบันทึกที่นี่</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border p-2" data-testid="refund-tickets">
            {live.map((t) => (
              <li key={t.id}>
                <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/60", selected.has(t.id) && "bg-primary-soft/60")}>
                  <Checkbox
                    checked={selected.has(t.id)}
                    onCheckedChange={(c) =>
                      setSelected((cur) => {
                        const n = new Set(cur);
                        if (c) n.add(t.id);
                        else n.delete(t.id);
                        return n;
                      })
                    }
                    aria-label={`คืนบัตร ${t.code}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {t.holderName} <span className="font-normal text-muted-foreground">· {t.typeName}</span>
                    </span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {t.code}
                      {t.status === "checked_in" ? " · เช็กอินแล้ว" : ""}
                    </span>
                  </span>
                  <span className="tabular-nums">{t.price ? thb(t.price) : "ฟรี"}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <button type="button" className="underline-offset-2 hover:underline" onClick={() => setSelected(new Set(all ? [] : live.map((t) => t.id)))}>
              {all ? "ไม่เลือกทั้งหมด" : "เลือกทั้งหมด"}
            </button>
            <span>
              เลือก {selected.size} / {live.length} ใบ · คืนได้สูงสุด {thb(cap)}
            </span>
          </div>
          <Field label="จำนวนเงินที่คืน (บาท)" htmlFor="rf-amount" hint={touched ? `แนะนำตามราคาบัตรที่เลือก ${thb(suggested)}` : "คำนวณจากราคาบัตรที่เลือก แก้ไขได้ (เช่น หักค่าธรรมเนียม)"} error={touched && invalid && selected.size ? `ต้องอยู่ระหว่าง ฿0 – ${thb(cap)}` : undefined}>
            <MoneyInput
              id="rf-amount"
              value={touched ? amount : satangToBaht(suggested) || "0"}
              onChange={(e) => {
                setTouched(true);
                setAmount(e.target.value);
              }}
              invalid={touched && invalid}
              data-testid="refund-amount"
            />
          </Field>
          <Field label="เหตุผล (ไม่บังคับ)" htmlFor="rf-reason">
            <ReasonPicker id="rf-reason" value={reason} onChange={setReason} presets={REFUND_REASON_PRESETS} placeholder="เหตุผลสำหรับบันทึกภายใน" />
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            ปิด
          </Button>
          <Button type="button" variant="destructive" onClick={submit} disabled={pending || invalid} data-testid="refund-confirm">
            {pending && <Loader2 className="animate-spin" aria-hidden />} คืนเงิน {thb(Number.isFinite(satang) ? satang : 0)}
            {all ? " (ทั้งหมด)" : ` · ${selected.size} ใบ`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- payment card ------------------------------ */

export function PaymentCard({ slug, orderId, orderStatus, total, paidAmount, refundedAmount, payments, tickets, canManage, refundReleasesSeats }: { slug: string; orderId: string; orderStatus: string; total: number; paidAmount: number; refundedAmount: number; payments: PaymentVM[]; tickets: TicketVM[]; canManage: boolean; refundReleasesSeats: boolean }) {
  const router = useRouter();
  const [rejectFor, setRejectFor] = React.useState<string | null>(null);
  const [refundOpen, setRefundOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const openOrder = orderStatus === "pending" || orderStatus === "expired";
  const hasSlipPending = payments.some((p) => p.status === "pending_verification");
  const live = tickets.filter((t) => t.status === "valid" || t.status === "checked_in");
  const refundable = orderStatus === "paid" && live.length > 0;

  async function act(key: string, fn: () => Promise<R>) {
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
          ยอดชำระ {total ? thb(total) : "ฟรี"} · รับแล้ว <span data-testid="paid-amount">{thb(paidAmount)}</span>
          {refundedAmount > 0 ? ` · คืนแล้ว ${thb(refundedAmount)}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {payments.length === 0 && <p className="text-sm text-muted-foreground">{total === 0 ? "บัตรฟรี — ไม่มีรายการชำระเงิน" : "ยังไม่มีรายการชำระเงิน"}</p>}
        {payments.map((p) => (
          <div key={p.id} className={cn("flex gap-4 rounded-xl border p-3", !p.current && payments.length > 1 && "opacity-70")} data-testid={`payment-${p.status}`}>
            {p.slipUrl ? <SlipPreview src={p.slipUrl} description={`${thb(p.amount)} · ส่งเมื่อ ${formatThaiDateTime(new Date(p.createdAt))}`} /> : null}
            <dl className="grid min-w-0 flex-1 gap-1.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill map={PAYMENT_ROW_STATUS} status={p.status} />
                <span className="text-muted-foreground">{PAYMENT_METHOD_LABEL[p.method] ?? p.method}</span>
                {p.current && payments.length > 1 && <span className="text-xs text-muted-foreground">(รายการปัจจุบัน)</span>}
              </div>
              <div className="font-semibold tabular-nums">
                {thb(p.amount)}
                {p.refundedAmount > 0 ? <span className="ml-2 text-xs font-normal text-muted-foreground">คืนแล้ว {thb(p.refundedAmount)}</span> : null}
              </div>
              <div className="text-xs text-muted-foreground">{p.paidAt ? `ยืนยันเมื่อ ${formatThaiDateTime(new Date(p.paidAt))}` : `สร้างเมื่อ ${formatThaiDateTime(new Date(p.createdAt))}`}</div>
              {p.failureReason && <div className="text-xs text-destructive">{p.failureReason}</div>}
              {canManage && ["pending", "pending_verification"].includes(p.status) && openOrder && (
                <div className="mt-1 flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => act(p.id, () => approvePaymentAction(slug, orderId, p.id))} disabled={busy !== null} data-testid="approve-payment">
                    {busy === p.id ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} {p.status === "pending_verification" ? "อนุมัติสลิป" : "บันทึกว่าได้รับเงิน"}
                  </Button>
                  {p.status === "pending_verification" && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setRejectFor(p.id)} disabled={busy !== null} data-testid="reject-payment">
                      <X aria-hidden /> ปฏิเสธสลิป
                    </Button>
                  )}
                </div>
              )}
            </dl>
          </div>
        ))}
        {canManage && (openOrder || refundable) && (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {openOrder && total > 0 && !hasSlipPending && (
              <ConfirmButton variant="outline" title="รับเงินสดหน้างาน?" description={`บันทึกว่ารับ ${thb(total)} เป็นเงินสด/บัตรที่หน้างาน — QR / รายการโอนที่ค้างจะถูกยกเลิก และออกบัตรให้ทันที`} confirmLabel="รับเงินสดและออกบัตร" action={() => cashPaymentAction(slug, orderId).then((r) => (r.ok ? (router.refresh(), r) : r))} data-testid="cash-payment">
                <Banknote aria-hidden /> รับเงินสด {thb(total)}
              </ConfirmButton>
            )}
            {openOrder && hasSlipPending && <p className="text-xs text-muted-foreground">มีสลิปรอตรวจ — อนุมัติหรือปฏิเสธก่อนจึงรับเงินสดได้</p>}
            {refundable && (
              <Button type="button" variant="outline" onClick={() => setRefundOpen(true)} data-testid="refund-open">
                <Undo2 aria-hidden /> คืนเงิน
              </Button>
            )}
          </div>
        )}
      </CardContent>
      <ReasonDialog
        open={!!rejectFor}
        onOpenChange={(o) => !o && setRejectFor(null)}
        title="ปฏิเสธสลิปนี้?"
        description="ลูกค้าจะเห็นเหตุผลและส่งสลิปใหม่ได้ บัตรยังถูกถือไว้ตามเวลาที่เหลือ"
        presets={REJECT_SLIP_PRESETS}
        confirmLabel="ปฏิเสธสลิป"
        onConfirm={async (reason) => {
          if (!rejectFor) return false;
          const r = await rejectPaymentAction(slug, orderId, rejectFor, reason);
          if (!r.ok) {
            toast.error(r.error);
            return false;
          }
          toast.success(r.message ?? "ปฏิเสธแล้ว");
          router.refresh();
          return true;
        }}
      />
      {refundable && <RefundDialog slug={slug} orderId={orderId} tickets={tickets} open={refundOpen} onOpenChange={setRefundOpen} preselect={null} paidAmount={paidAmount} refundedAmount={refundedAmount} refundReleasesSeats={refundReleasesSeats} />}
    </Card>
  );
}

/* ------------------------------- tickets card ------------------------------ */

export function TicketsCard({ slug, orderId, orderStatus, tickets, canManage, canStaff }: { slug: string; orderId: string; orderStatus: string; tickets: TicketVM[]; canManage: boolean; canStaff: boolean }) {
  const router = useRouter();
  const [voidFor, setVoidFor] = React.useState<TicketVM | null>(null);
  const [editFor, setEditFor] = React.useState<TicketVM | null>(null);
  const [qrFor, setQrFor] = React.useState<TicketVM | null>(null);
  const [holder, setHolder] = React.useState<HolderInput>({ holderName: "", holderEmail: "", seatLabel: "" });
  const [pending, setPending] = React.useState(false);

  if (!tickets.length) {
    return (
      <Card data-testid="tickets-card">
        <CardHeader>
          <CardTitle>บัตร</CardTitle>
          <CardDescription>{orderStatus === "pending" ? "บัตรจะออกให้อัตโนมัติเมื่อชำระเงินแล้ว" : orderStatus === "expired" || orderStatus === "cancelled" ? "คำสั่งซื้อนี้ไม่ได้ออกบัตร" : "ยังไม่มีบัตร"}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card data-testid="tickets-card">
      <CardHeader>
        <CardTitle>บัตร {tickets.length} ใบ</CardTitle>
        <CardDescription>แตะที่ QR เพื่อขยายให้ลูกค้าสแกน · แก้ชื่อผู้ถือบัตรได้จนกว่าจะเช็กอิน</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {tickets.map((t) => {
            const live = t.status === "valid" || t.status === "checked_in";
            return (
              <li key={t.id} className={cn("flex items-center gap-3 py-3 text-sm", !live && "opacity-70")} data-testid="ticket-row" data-ticket-status={t.status}>
                {t.qr ? (
                  <button type="button" onClick={() => setQrFor(t)} className="size-14 shrink-0 overflow-hidden rounded-lg border bg-white" aria-label={`ขยาย QR ของ ${t.code}`}>
                    <img src={t.qr} alt="" className="size-full" />
                  </button>
                ) : (
                  <span className="grid size-14 shrink-0 place-items-center rounded-lg border border-dashed text-muted-foreground" aria-hidden>
                    <QrCode className="size-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="truncate" data-testid="ticket-holder">
                      {t.holderName}
                    </span>
                    <StatusPill map={TICKET_STATUS} status={t.status} />
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span className="font-mono text-foreground" data-testid="ticket-code">
                      {t.code}
                    </span>
                    <span>{t.typeName}</span>
                    {t.seatLabel && <span>ที่นั่ง {t.seatLabel}</span>}
                    {t.sessionLabel && <span>{t.sessionLabel}</span>}
                    {t.checkedInAt && <span>เช็กอิน {formatThaiDateTime(new Date(t.checkedInAt))}</span>}
                    {t.voidReason && <span className="text-destructive">{t.voidReason}</span>}
                  </p>
                </div>
                {live && (
                  <div className="flex shrink-0 gap-1">
                    {canStaff && t.status === "valid" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`แก้ไขผู้ถือบัตร ${t.code}`}
                        onClick={() => {
                          setEditFor(t);
                          setHolder({ holderName: t.holderName, holderEmail: t.holderEmail ?? "", seatLabel: t.seatLabel ?? "" });
                        }}
                      >
                        <Pencil aria-hidden />
                      </Button>
                    )}
                    {canManage && (
                      <Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" aria-label={`ยกเลิกบัตร ${t.code}`} onClick={() => setVoidFor(t)} data-testid="void-ticket">
                        <Ban aria-hidden />
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>

      <ReasonDialog
        open={!!voidFor}
        onOpenChange={(o) => !o && setVoidFor(null)}
        title={`ยกเลิกบัตร ${voidFor?.code ?? ""}?`}
        description="บัตรใบนี้จะใช้เข้างานไม่ได้อีก ไม่มีการคืนเงินและที่นั่งไม่ถูกปล่อย (ต้องการคืนเงินให้ใช้ “คืนเงิน” แทน)"
        presets={VOID_REASON_PRESETS}
        confirmLabel="ยกเลิกบัตร"
        onConfirm={async (reason) => {
          if (!voidFor) return false;
          const r = await voidTicketAction(slug, orderId, voidFor.id, reason);
          if (!r.ok) {
            toast.error(r.error);
            return false;
          }
          toast.success(r.message ?? "ยกเลิกบัตรแล้ว");
          router.refresh();
          return true;
        }}
      />

      <Dialog open={!!editFor} onOpenChange={(o) => !o && setEditFor(null)}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!editFor) return;
              setPending(true);
              try {
                const r = await updateHolderAction(slug, orderId, editFor.id, holder);
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success(r.message ?? "บันทึกแล้ว");
                setEditFor(null);
                router.refresh();
              } finally {
                setPending(false);
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>ผู้ถือบัตร {editFor?.code}</DialogTitle>
              <DialogDescription>ชื่อนี้แสดงบนบัตรและที่จุดเช็กอิน</DialogDescription>
            </DialogHeader>
            <Field label="ชื่อ-นามสกุล" htmlFor="h-name">
              <Input id="h-name" value={holder.holderName} onChange={(e) => setHolder({ ...holder, holderName: e.target.value })} maxLength={120} required autoFocus />
            </Field>
            <Field label="อีเมล (ไม่บังคับ)" htmlFor="h-email">
              <Input id="h-email" type="email" value={holder.holderEmail ?? ""} onChange={(e) => setHolder({ ...holder, holderEmail: e.target.value })} maxLength={200} />
            </Field>
            <Field label="ที่นั่ง (ไม่บังคับ)" htmlFor="h-seat" hint="เช่น A12, โต๊ะ 5">
              <Input id="h-seat" value={holder.seatLabel ?? ""} onChange={(e) => setHolder({ ...holder, seatLabel: e.target.value })} maxLength={40} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditFor(null)} disabled={pending}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} บันทึก
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!qrFor} onOpenChange={(o) => !o && setQrFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{qrFor?.holderName}</DialogTitle>
            <DialogDescription>
              {qrFor?.typeName} · <span className="font-mono">{qrFor?.code}</span>
            </DialogDescription>
          </DialogHeader>
          {qrFor?.qr && <img src={qrFor.qr} alt={`QR บัตร ${qrFor.code}`} className="mx-auto w-full max-w-[280px] rounded-xl border bg-white p-2" />}
          <p className="text-center text-xs text-muted-foreground">ให้ลูกค้าสแกน QR นี้ที่จุดเช็กอิน หรือบอกรหัสบัตรกับเจ้าหน้าที่</p>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* -------------------------------- notes card -------------------------------- */

export function NotesCard({ slug, orderId, internalNote, canWrite }: { slug: string; orderId: string; internalNote: string | null; canWrite: boolean }) {
  const router = useRouter();
  const [note, setNote] = React.useState(internalNote ?? "");
  const [pending, setPending] = React.useState(false);
  const dirty = note !== (internalNote ?? "");
  async function save() {
    setPending(true);
    try {
      const r = await saveOrderNoteAction(slug, orderId, note || null);
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
        <CardTitle>โน้ตภายใน</CardTitle>
        <CardDescription>เห็นเฉพาะทีมงาน ลูกค้าไม่เห็น</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Textarea id="order-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} placeholder="เช่น ลูกค้าขอเปลี่ยนชื่อผู้ถือบัตร โทรยืนยันแล้ว" disabled={!canWrite} aria-label="โน้ตภายใน" />
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
