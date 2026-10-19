"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertTriangle, Gift, Loader2, Plus } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { cn } from "@rentweb/ui/lib/utils";
import { PaymentMethodPicker, type PaymentMethodOption } from "@rentweb/storefront/payments";
import { percentOf, thb } from "@rentweb/core/money";
import { MAX_WALLET_TOPUP_SATANG, parseBahtInput } from "./format";

export interface WalletTopupState {
  error?: string;
}

export function WalletTopupForm({
  presets,
  minAmount,
  bonusPercent,
  methods,
  action,
  maxAmount = MAX_WALLET_TOPUP_SATANG,
}: {
  /** satang */
  presets: number[];
  minAmount: number;
  bonusPercent: number;
  methods: PaymentMethodOption[];
  action: (prev: WalletTopupState, form: FormData) => Promise<WalletTopupState>;
  /** satang; defaults to the server action's cap (฿100,000) */
  maxAmount?: number;
}) {
  const [state, submit, pending] = useActionState(action, {} as WalletTopupState);
  const [preset, setPreset] = React.useState<number>(presets[1] ?? presets[0] ?? minAmount);
  const [custom, setCustom] = React.useState<string>("");
  const [method, setMethod] = React.useState<PaymentMethodOption["value"]>(methods.find((m) => !m.disabled)?.value ?? "promptpay_qr");
  // a typed amount always wins over the preset; an unparsable one blocks the submit with an inline reason
  const usingCustom = custom.trim() !== "";
  const parsed = usingCustom ? parseBahtInput(custom, { max: maxAmount }) : null;
  const customError = parsed && !parsed.ok ? parsed.error : null;
  const amount = parsed ? (parsed.ok ? parsed.satang : 0) : preset;
  const bonus = percentOf(amount, bonusPercent);
  const tooLow = !customError && amount < minAmount;
  const blocked = !!customError || tooLow || amount <= 0;

  const pickPreset = (v: number) => {
    setPreset(v);
    setCustom("");
  };

  return (
    <form action={submit} className="grid gap-6">
      <input type="hidden" name="amount" value={amount} />
      <div>
        <Label className="mb-3 block">เลือกจำนวนเงิน</Label>
        <div role="radiogroup" aria-label="จำนวนเงิน" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {presets.map((p) => {
            const active = preset === p && !usingCustom;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => pickPreset(p)}
                className={cn(
                  "flex h-16 flex-col items-center justify-center rounded-[var(--radius-lg)] border transition",
                  active ? "border-primary bg-primary-soft ring-2 ring-primary/40 shadow-[0_0_28px_-8px_var(--glow)]" : "border-border/70 bg-background/40 hover:border-primary/50",
                )}
              >
                <span className="font-heading text-lg font-semibold">{thb(p)}</span>
                {bonusPercent > 0 && <span className="text-[11px] text-emerald-500">+{thb(percentOf(p, bonusPercent))} โบนัส</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid gap-2">
          <Label htmlFor="custom-amount">หรือระบุจำนวนเอง (บาท)</Label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground">฿</span>
            <Input
              id="custom-amount"
              inputMode="decimal"
              autoComplete="off"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder={`ขั้นต่ำ ${thb(minAmount)}`}
              className="h-12 pl-8"
              maxLength={16}
              aria-invalid={customError ? true : undefined}
              aria-describedby={customError ? "custom-amount-error" : undefined}
            />
          </div>
          {customError && (
            <p id="custom-amount-error" role="alert" className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" /> {customError}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-primary/30 bg-primary-soft p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">ชำระ</span>
          <span className="font-medium">{amount > 0 ? thb(amount) : "—"}</span>
        </div>
        {bonusPercent > 0 && (
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-1.5 text-emerald-500">
              <Gift className="size-4" /> โบนัส {bonusPercent}%
            </span>
            <span className="font-medium text-emerald-500">+{thb(bonus)}</span>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between border-t border-primary/20 pt-2">
          <span className="font-medium">เข้ากระเป๋าทั้งหมด</span>
          <span className="font-heading text-2xl font-semibold text-primary text-glow">{amount > 0 ? thb(amount + bonus) : "—"}</span>
        </div>
      </div>

      <div>
        <Label className="mb-3 block">วิธีชำระเงิน</Label>
        <PaymentMethodPicker options={methods} value={method} onChange={setMethod} />
      </div>

      {(tooLow || state.error) && (
        <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="size-4" /> {state.error ?? `ยอดเติมขั้นต่ำ ${thb(minAmount)}`}
        </p>
      )}

      <Button type="submit" size="xl" disabled={pending || blocked} className="w-full">
        {pending ? <Loader2 className="animate-spin" /> : <Plus />} {pending ? "กำลังสร้างรายการ…" : amount > 0 && !customError ? `เติมเงิน ${thb(amount)}` : "เติมเงิน"}
      </Button>
    </form>
  );
}
