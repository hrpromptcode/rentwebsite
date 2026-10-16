"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Armchair, Ban, Check, CheckCheck, Loader2, UserX } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { toast } from "@rentweb/ui/components/sonner";
import type { ReservationRow } from "@rentweb/module-restaurant/admin";
import { reservationTransitions } from "@rentweb/module-restaurant/admin/labels";
import { ConfirmButton } from "@/components/ui/confirm-button";
import type { ActionResult } from "@/components/ui/form";
import { thb } from "@/lib/format";
import { SlipDialog } from "../_components/slip-dialog";
import { approveDepositAction, setReservationStatusAction } from "./actions";

export function ReservationActions({ slug, r, canWrite, canMoney }: { slug: string; r: ReservationRow; canWrite: boolean; canMoney: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const allowed = reservationTransitions(r.status);
  const awaitingDeposit = r.depositAmount > 0 && r.status === "pending" && !!r.payment && (r.payment.status === "pending" || r.payment.status === "pending_verification");

  async function run(key: string, fn: () => Promise<ActionResult>) {
    setBusy(key);
    try {
      const res = await fn();
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(res.message ?? "อัปเดตแล้ว");
        router.refresh();
      }
      return res;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      return { ok: false as const, error: String(e) };
    } finally {
      setBusy(null);
    }
  }

  if (!canWrite || allowed.length === 0) return null;
  const icon = (k: string, el: React.ReactNode) => (busy === k ? <Loader2 className="animate-spin" aria-hidden /> : el);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {awaitingDeposit && canMoney && (
        <>
          {r.payment?.slipUrl && <SlipDialog url={r.payment.slipUrl} size="sm" description={`${r.number} · มัดจำ ${thb(r.payment.amount)}`} />}
          <Button type="button" size="sm" onClick={() => run("deposit", () => approveDepositAction(slug, r.id))} disabled={!!busy}>
            {icon("deposit", <Check aria-hidden />)} {r.payment?.status === "pending_verification" ? "อนุมัติสลิปมัดจำ" : "รับมัดจำแล้ว"}
          </Button>
        </>
      )}
      {allowed.includes("confirmed") && !awaitingDeposit && (
        <Button type="button" size="sm" onClick={() => run("confirmed", () => setReservationStatusAction(slug, r.id, "confirmed"))} disabled={!!busy}>
          {icon("confirmed", <Check aria-hidden />)} ยืนยัน
        </Button>
      )}
      {allowed.includes("confirmed") && awaitingDeposit && !canMoney && (
        <Button type="button" size="sm" variant="outline" onClick={() => run("confirmed", () => setReservationStatusAction(slug, r.id, "confirmed"))} disabled={!!busy}>
          {icon("confirmed", <Check aria-hidden />)} ยืนยันโดยไม่รอมัดจำ
        </Button>
      )}
      {allowed.includes("seated") && (
        <Button type="button" size="sm" variant={r.status === "confirmed" ? "default" : "outline"} onClick={() => run("seated", () => setReservationStatusAction(slug, r.id, "seated"))} disabled={!!busy}>
          {icon("seated", <Armchair aria-hidden />)} นั่งแล้ว
        </Button>
      )}
      {allowed.includes("completed") && (
        <Button type="button" size="sm" variant={r.status === "seated" ? "default" : "outline"} onClick={() => run("completed", () => setReservationStatusAction(slug, r.id, "completed"))} disabled={!!busy}>
          {icon("completed", <CheckCheck aria-hidden />)} เสร็จสิ้น
        </Button>
      )}
      {allowed.includes("no_show") && (
        <ConfirmButton size="sm" variant="ghost" title={`บันทึกว่า ${r.name} ไม่มาตามนัด?`} description={r.depositAmount > 0 ? `มัดจำ ${thb(r.depositAmount)} จะไม่ถูกคืนอัตโนมัติ` : "โต๊ะจะถูกปล่อยให้ลูกค้าท่านอื่น"} confirmLabel="ไม่มา" action={() => run("no_show", () => setReservationStatusAction(slug, r.id, "no_show"))} disabled={!!busy}>
          <UserX aria-hidden /> ไม่มา
        </ConfirmButton>
      )}
      {allowed.includes("cancelled") && (
        <ConfirmButton size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-destructive" aria-label={`ยกเลิกการจอง ${r.number}`} title={`ยกเลิกการจอง ${r.number}?`} description={`${r.name} · ${r.partySize} คน${r.depositAmount > 0 ? ` · มัดจำ ${thb(r.depositAmount)} ต้องคืนเอง` : ""}`} confirmLabel="ยกเลิกการจอง" action={() => run("cancelled", () => setReservationStatusAction(slug, r.id, "cancelled"))} disabled={!!busy}>
          <Ban aria-hidden />
        </ConfirmButton>
      )}
    </div>
  );
}
