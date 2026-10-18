"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Copy, EyeOff, Flag, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { toast } from "@rentweb/ui/components/sonner";
import { EVENT_ACTION_LABEL, type EventAdminAction } from "@rentweb/module-events/admin/labels";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { deleteEventAction, duplicateEventAction, setEventStatusAction } from "../actions";

const ICON: Record<EventAdminAction, React.ComponentType<{ className?: string }>> = { publish: CheckCircle2, unpublish: EyeOff, cancel: Ban, end: Flag, reopen: RotateCcw };

export function EventActions({ slug, id, status, actions, summary, canWrite, readiness }: { slug: string; id: string; status: string; actions: EventAdminAction[]; summary: { paidOrders: number; pendingOrders: number; liveTickets: number; revenue: number; refunded: number }; canWrite: boolean; readiness: { sessions: number; ticketTypes: number } }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  if (!canWrite) return null;

  async function run(a: EventAdminAction) {
    setPending(a);
    try {
      const r = await setEventStatusAction(slug, id, a);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message ?? "บันทึกแล้ว");
        router.refresh();
      }
      return r.ok;
    } finally {
      setPending(null);
    }
  }

  const canPublish = readiness.sessions > 0 && readiness.ticketTypes > 0;
  const thbs = (n: number) => `฿${(n / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

  return (
    <div className="flex flex-wrap gap-2" data-testid="event-actions">
      {actions
        .filter((a) => a !== "cancel")
        .map((a, i) => {
          const Icon = ICON[a];
          const primary = a === "publish" || a === "reopen";
          if (a === "publish" && !canPublish) {
            return (
              <Button key={a} type="button" variant="default" disabled title="เพิ่มอย่างน้อย 1 รอบ และ 1 ประเภทบัตรก่อนเผยแพร่" data-testid="action-publish">
                <Icon aria-hidden /> {EVENT_ACTION_LABEL[a]}
              </Button>
            );
          }
          if (a === "end" || a === "unpublish") {
            return (
              <ConfirmButton
                key={a}
                variant="outline"
                title={a === "end" ? "ปิดงานนี้?" : "ซ่อนงานจากหน้าร้าน?"}
                description={a === "end" ? "งานจะย้ายไป “ที่ผ่านมา” และหยุดขายบัตรทันที บัตรที่ออกแล้วยังเช็กอินได้ตามปกติ" : "งานกลับเป็นฉบับร่าง ลูกค้าจะไม่เห็นและซื้อบัตรไม่ได้ คำสั่งซื้อและบัตรเดิมไม่ถูกแตะต้อง"}
                confirmLabel={EVENT_ACTION_LABEL[a]}
                action={() => setEventStatusAction(slug, id, a).then((r) => (r.ok ? (router.refresh(), r) : r))}
                data-testid={`action-${a}`}
              >
                <Icon aria-hidden /> {EVENT_ACTION_LABEL[a]}
              </ConfirmButton>
            );
          }
          return (
            <Button key={a} type="button" variant={primary ? "default" : i === 0 ? "default" : "outline"} onClick={() => run(a)} disabled={pending !== null} data-testid={`action-${a}`}>
              {pending === a ? <Loader2 className="animate-spin" aria-hidden /> : <Icon aria-hidden />} {EVENT_ACTION_LABEL[a]}
            </Button>
          );
        })}
      <ConfirmButton variant="outline" title="ทำสำเนาอีเวนต์นี้?" description="สร้างฉบับร่างใหม่พร้อมรอบและประเภทบัตรเดิม (ยอดขายเริ่มที่ 0) — เหมาะกับงานประจำปี" confirmLabel="ทำสำเนา" action={async () => {
        const r = await duplicateEventAction(slug, id);
        if (r.ok && r.data) router.push(`/t/${slug}/events/${r.data.id}`);
        return r;
      }}>
        <Copy aria-hidden /> ทำสำเนา
      </ConfirmButton>
      {actions.includes("cancel") && (
        <>
          <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)} data-testid="action-cancel">
            <Ban aria-hidden /> ยกเลิกงาน
          </Button>
          <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>ยกเลิกงานนี้?</DialogTitle>
                <DialogDescription>การยกเลิกงานย้อนกลับไม่ได้ ลูกค้าจะเห็นสถานะ “ยกเลิกงาน” บนหน้าร้าน และ QR ของบัตรทุกใบจะถูกปฏิเสธที่จุดเช็กอิน</DialogDescription>
              </DialogHeader>
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100">
                <p className="font-medium">ผลกระทบด้านเงิน</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  <li>
                    คำสั่งซื้อที่ชำระแล้ว <b>{summary.paidOrders}</b> รายการ · บัตรที่ใช้ได้ <b>{summary.liveTickets}</b> ใบ · รายรับ <b>{thbs(summary.revenue)}</b> — <b>ต้องคืนเงินทีละรายการ</b> จากหน้าคำสั่งซื้อ (ระบบไม่คืนเงินอัตโนมัติ)
                  </li>
                  <li>
                    คำสั่งซื้อที่ยังไม่ชำระ <b>{summary.pendingOrders}</b> รายการ จะถูกยกเลิกและปล่อยบัตรคืนทันที
                  </li>
                </ul>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCancelOpen(false)} disabled={pending !== null}>
                  ปิด
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending !== null}
                  data-testid="cancel-confirm"
                  onClick={async () => {
                    if (await run("cancel")) setCancelOpen(false);
                  }}
                >
                  {pending === "cancel" && <Loader2 className="animate-spin" aria-hidden />} ยืนยันยกเลิกงาน
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
      {status === "draft" && summary.paidOrders === 0 && summary.pendingOrders === 0 && (
        <ConfirmButton variant="ghost" className="text-destructive hover:text-destructive" title="ลบอีเวนต์นี้?" description="ลบได้เฉพาะงานที่ยังไม่มีคำสั่งซื้อ รอบและประเภทบัตรจะถูกลบไปด้วย" confirmLabel="ลบ" action={async () => {
          const r = await deleteEventAction(slug, id);
          if (r.ok) router.push(`/t/${slug}/events`);
          return r;
        }}>
          <Trash2 aria-hidden /> ลบ
        </ConfirmButton>
      )}
    </div>
  );
}
