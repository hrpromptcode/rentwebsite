"use client";

import * as React from "react";
import { Banknote, CheckCircle2, Loader2, Receipt } from "lucide-react";
import { Button, type ButtonProps } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { toast } from "@rentweb/ui/components/sonner";
import type { OpenSession, SettleMode } from "@rentweb/module-restaurant/admin";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@rentweb/module-restaurant/admin/labels";
import { thb } from "@/lib/format";
import { settleSessionAction } from "../orders/actions";
import { SlipDialog } from "./slip-dialog";

/** "ปิดโต๊ะ/รับชำระ": approve the guests' PromptPay/slip payment or record cash for the outstanding amount, then close the session. */
export function CloseSessionDialog({ slug, session, onDone, children, ...btn }: ButtonProps & { slug: string; session: OpenSession; onDone?: () => void | Promise<void> }) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<SettleMode | null>(null);
  const p = session.payment;
  const awaiting = !!p && (p.status === "pending" || p.status === "pending_verification");
  // the guests' bill covers the orders due when they asked for it; rounds ordered later stay due (COR-07)
  const canApprove = awaiting && session.dueTotal > 0;
  const partial = canApprove && p!.amount < session.dueTotal;

  async function run(mode: SettleMode) {
    setPending(mode);
    try {
      const r = await settleSessionAction(slug, session.id, mode);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message ?? "ปิดโต๊ะแล้ว");
        setOpen(false);
        await onDone?.();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <Button type="button" {...btn} onClick={() => setOpen(true)}>
        {children ?? (
          <>
            <Receipt aria-hidden /> ปิดโต๊ะ/รับชำระ
          </>
        )}
      </Button>
      <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ปิดโต๊ะ {session.tableName}</DialogTitle>
            <DialogDescription>
              {session.ordersCount} ออเดอร์{session.zone ? ` · โซน${session.zone}` : ""}
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-y-1.5 rounded-xl border bg-muted/40 p-4 text-sm">
            <dt className="text-muted-foreground">ยอดรวมทั้งโต๊ะ</dt>
            <dd className="text-right font-medium tabular-nums">{thb(session.total)}</dd>
            <dt className="text-muted-foreground">ชำระแล้ว</dt>
            <dd className="text-right tabular-nums">{thb(session.paidTotal)}</dd>
            <dt className="font-medium">ค้างชำระ</dt>
            <dd className="text-right font-heading text-xl font-semibold tabular-nums">{thb(session.dueTotal)}</dd>
          </dl>
          {awaiting && p && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <span className="flex-1">
                ลูกค้าเลือก <b>{PAYMENT_METHOD_LABEL[p.method] ?? p.method}</b> {thb(p.amount)} · {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                {partial && <span className="block text-xs text-muted-foreground">มีการสั่งเพิ่มหลังขอบิล: อนุมัติแล้วยังค้าง {thb(session.dueTotal - p.amount)} รับเงินสดส่วนที่เหลือเพื่อปิดโต๊ะ</span>}
              </span>
              {p.slipUrl && <SlipDialog url={p.slipUrl} size="sm" />}
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {canApprove && (
              <Button type="button" className="w-full" onClick={() => run("approve")} disabled={!!pending}>
                {pending === "approve" ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />}
                {partial ? `อนุมัติการชำระ ${thb(p!.amount)} (ยังค้าง ${thb(session.dueTotal - p!.amount)})` : `อนุมัติการชำระ ${thb(p!.amount)} และปิดโต๊ะ`}
              </Button>
            )}
            {session.dueTotal > 0 ? (
              <Button type="button" variant={canApprove ? "outline" : "default"} className="w-full" onClick={() => run("cash")} disabled={!!pending}>
                {pending === "cash" ? <Loader2 className="animate-spin" aria-hidden /> : <Banknote aria-hidden />}
                รับเงินสด {thb(session.dueTotal)} และปิดโต๊ะ
              </Button>
            ) : (
              <Button type="button" className="w-full" onClick={() => run("close_only")} disabled={!!pending}>
                {pending === "close_only" ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />}
                ปิดโต๊ะ (ชำระครบแล้ว)
              </Button>
            )}
            <Button type="button" variant="ghost" className="w-full" onClick={() => setOpen(false)} disabled={!!pending}>
              ยกเลิก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
