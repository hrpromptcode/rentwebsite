"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, Loader2, ShieldCheck, ShoppingBag } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { PaymentMethodPicker, type PaymentMethodOption } from "@rentweb/storefront/payments";
import { L } from "@rentweb/module-booking/labels";
import type { BuyState } from "./actions";

/** Payment-method picker + submit for /packages/[id]/buy. */
export function BuyForm({ methods, amountLabel, action, venue = "คลินิก", itemLabel = "คอร์ส" }: { methods: PaymentMethodOption[]; amountLabel: string; action: (prev: BuyState, form: FormData) => Promise<BuyState>; /** who stores the data in the PDPA line (คลินิก / สตูดิโอ / ร้าน) */ venue?: string; /** คอร์ส / คลาสพาส */ itemLabel?: string }) {
  const [method, setMethod] = React.useState<string>(methods[0]?.value ?? "promptpay_qr");
  const [state, submit, pending] = useActionState(action, {} as BuyState);

  return (
    <form action={submit} className="grid gap-5">
      <div>
        <p className="mb-2 text-sm font-medium">วิธีชำระเงิน</p>
        <PaymentMethodPicker options={methods} value={method} onChange={(v) => setMethod(v)} />
      </div>
      <label className="flex items-start gap-3 text-sm text-muted-foreground">
        <input type="checkbox" name="consent" required className="mt-1 size-4 accent-[var(--color-primary)]" />
        <span>ข้าพเจ้ารับทราบว่า{itemLabel}มีอายุการใช้งานตามที่ระบุ สิทธิ์เฉพาะบุคคล และยินยอมให้{venue}จัดเก็บข้อมูลเพื่อให้บริการ (PDPA)</span>
      </label>
      {state.error && (
        <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-md)] bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="size-4" /> {state.error}
        </p>
      )}
      <Button type="submit" size="xl" className="w-full" disabled={pending || methods.length === 0}>
        {pending ? <Loader2 className="size-5 animate-spin" /> : <ShoppingBag className="size-5" />}
        {pending ? "กำลังสร้างรายการ…" : `${L.buyPackage} · ${amountLabel}`}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" /> {itemLabel}จะเปิดใช้งานทันทีเมื่อยืนยันการชำระเงิน
      </p>
    </form>
  );
}
