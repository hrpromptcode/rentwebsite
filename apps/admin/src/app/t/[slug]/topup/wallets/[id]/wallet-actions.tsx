"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, LockOpen, Minus, Plus, SlidersHorizontal } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { bahtToSatang, fieldErrors, walletAdjustSchema } from "@rentweb/module-topup/admin/schemas";
import { MoneyInput } from "@rentweb/module-topup/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { thb } from "@/lib/format";
import { adjustWalletAction, setWalletFrozenAction } from "../actions";

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function WalletActions({ slug, walletId, frozen, balance, customerName }: { slug: string; walletId: string; frozen: boolean; balance: number; customerName: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<"credit" | "debit">("credit");
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  // one key per opened dialog: a double click / retry after a timeout cannot write the adjustment twice
  const keyRef = React.useRef<string>("");

  function openDialog() {
    keyRef.current = newKey();
    setType("credit");
    setAmount("");
    setReason("");
    setErrors({});
    setOpen(true);
  }

  const satang = bahtToSatang(amount);
  const preview = satang !== null && !Number.isNaN(satang) && satang > 0 ? balance + (type === "credit" ? satang : -satang) : null;

  async function submit() {
    const input = { type, amount, reason };
    const parsed = walletAdjustSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    if (type === "debit" && preview !== null && preview < 0) {
      setErrors({ amount: `ยอดคงเหลือมีเพียง ${thb(balance)}` });
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const r = await adjustWalletAction(slug, walletId, input, keyRef.current);
      if (!r.ok) {
        toast.error(r.error);
        if (r.fieldErrors) setErrors(r.fieldErrors);
        return;
      }
      toast.success(r.message ?? "ปรับยอดแล้ว");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 sm:justify-end">
      <Button onClick={openDialog} disabled={frozen} title={frozen ? "ปลดระงับก่อนปรับยอด" : undefined}>
        <SlidersHorizontal aria-hidden /> ปรับยอด
      </Button>
      {frozen ? (
        <ConfirmButton variant="outline" title="ปลดระงับกระเป๋าเงิน?" description={`${customerName} จะกลับมาใช้จ่ายและเติมเงินเข้ากระเป๋าได้ตามปกติ`} confirmLabel="ปลดระงับ" action={() => setWalletFrozenAction(slug, walletId, false)}>
          <LockOpen aria-hidden /> ปลดระงับ
        </ConfirmButton>
      ) : (
        <ConfirmButton variant="outline" className="text-destructive hover:text-destructive" title="ระงับกระเป๋าเงินนี้?" description={`${customerName} จะใช้ยอดคงเหลือ ${thb(balance)} ซื้อแพ็กเกจหรือเติมเงินเข้าไม่ได้ จนกว่าจะปลดระงับ (ใช้เมื่อสงสัยทุจริต)`} confirmLabel="ระงับกระเป๋า" action={() => setWalletFrozenAction(slug, walletId, true)}>
          <Lock aria-hidden /> ระงับ
        </ConfirmButton>
      )}

      <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ปรับยอดกระเป๋าเงิน</DialogTitle>
            <DialogDescription>
              {customerName} · คงเหลือตอนนี้ {thb(balance)} — ทุกการปรับยอดถูกบันทึกในประวัติและ audit log
            </DialogDescription>
          </DialogHeader>
          <form
            id="wallet-adjust-form"
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="ประเภทการปรับยอด">
              {(
                [
                  ["credit", "เพิ่มเงิน", Plus],
                  ["debit", "หักเงิน", Minus],
                ] as const
              ).map(([k, label, Icon]) => (
                <label key={k} className={cn("flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors", type === k ? (k === "credit" ? "border-emerald-600 bg-emerald-500/10 text-emerald-800" : "border-destructive bg-destructive/5 text-destructive") : "hover:bg-muted/50")}>
                  <input type="radio" name="adj-type" value={k} checked={type === k} onChange={() => setType(k)} className="sr-only" />
                  <Icon className="size-4" aria-hidden /> {label}
                </label>
              ))}
            </div>
            <Field label="จำนวนเงิน (บาท)" htmlFor="adj-amount" error={errors.amount} hint={preview !== null ? `คงเหลือหลังปรับ ${thb(preview)}` : undefined}>
              <MoneyInput id="adj-amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" invalid={!!errors.amount} autoFocus />
            </Field>
            <Field label="เหตุผล (บันทึกในประวัติ)" htmlFor="adj-reason" error={errors.reason}>
              <Textarea id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ชดเชยเติมล่าช้า / คืนเงินโอนผิด" maxLength={300} aria-invalid={!!errors.reason} />
            </Field>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              ยกเลิก
            </Button>
            <Button type="submit" form="wallet-adjust-form" variant={type === "debit" ? "destructive" : "default"} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />} {type === "credit" ? "ยืนยันเพิ่มเงิน" : "ยืนยันหักเงิน"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
