"use client";

import * as React from "react";
import { useActionState } from "react";
import { ArrowLeft, Clock, Loader2, ShoppingBag } from "lucide-react";
import { thb } from "@rentweb/core/money";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Textarea } from "@rentweb/ui/components/textarea";
import { PaymentMethodPicker, type PaymentMethodOption } from "@rentweb/storefront/payments";
import { cn } from "@rentweb/ui/lib/utils";
import type { CartItem } from "../services/cart-codec";
import type { Slot } from "../services/time";
import type { PickupState } from "../action-types";
import { L } from "../labels";
import { TotalsRows, type CartTotals } from "./cart-sheet";

export interface PickupCheckoutProps {
  lines: CartItem[];
  totals: CartTotals;
  slots: Slot[];
  methods: PaymentMethodOption[];
  action: (prev: PickupState, fd: FormData) => Promise<PickupState>;
  onBack: () => void;
}

/** Pickup step inside the cart sheet: time slot, contact, payment method, note. Submits a server action (redirects on success). */
export function PickupCheckout({ lines, totals, slots, methods, action, onBack }: PickupCheckoutProps) {
  const [state, formAction, pending] = useActionState(action, {} as PickupState);
  const [slot, setSlot] = React.useState(slots[0]?.value ?? "");
  const [method, setMethod] = React.useState<PaymentMethodOption["value"]>(methods[0]?.value ?? "promptpay_qr");
  const [showAll, setShowAll] = React.useState(false);
  const days = React.useMemo(() => [...new Set(slots.map((s) => s.day))], [slots]);
  const visible = showAll ? slots : slots.slice(0, 12);

  return (
    <form action={formAction} className="flex min-h-full flex-col">
      <input type="hidden" name="items" value={JSON.stringify(lines)} />
      <input type="hidden" name="scheduledFor" value={slot} />
      <input type="hidden" name="paymentMethod" value={method} />

      <div className="flex items-center gap-2 border-b px-3 py-3 pr-14">
        <Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label={L.back}>
          <ArrowLeft className="size-5" />
        </Button>
        <div>
          <h3 className="font-heading text-xl leading-tight font-semibold">{L.pickup}</h3>
          <p className="text-xs text-muted-foreground">{L.items(lines.reduce((s, l) => s + l.qty, 0))} · {thb(totals.total)}</p>
        </div>
      </div>

      <div className="grid gap-6 px-5 py-5">
        <section>
          <h4 className="flex items-center gap-2 text-sm font-medium">
            <Clock className="size-4 text-primary" /> {L.pickupTime}
            {days.length === 1 && <span className="text-muted-foreground">· {days[0]}</span>}
          </h4>
          {slots.length === 0 ? (
            <p className="mt-2 text-sm text-destructive">ขออภัย ขณะนี้ไม่มีช่วงเวลารับอาหารที่เปิดอยู่</p>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-4 gap-2" role="radiogroup" aria-label={L.pickupTime}>
                {visible.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    role="radio"
                    aria-checked={slot === s.value}
                    onClick={() => setSlot(s.value)}
                    className={cn("flex h-11 flex-col items-center justify-center rounded-[var(--radius-md)] border text-sm font-medium tabular-nums transition", slot === s.value ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}
                  >
                    {s.label}
                    {days.length > 1 && <span className="text-[10px] font-normal opacity-80">{s.day}</span>}
                  </button>
                ))}
              </div>
              {slots.length > 12 && (
                <button type="button" className="mt-1 inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline md:min-h-9" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "แสดงน้อยลง" : `แสดงเวลาอื่น (${slots.length - 12})`}
                </button>
              )}
            </>
          )}
        </section>

        <section className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="pickup-name">{L.name}</Label>
            <Input id="pickup-name" name="name" required maxLength={80} autoComplete="name" defaultValue={state.values?.name ?? ""} className="h-12" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pickup-phone">{L.phone}</Label>
            <Input id="pickup-phone" name="phone" type="tel" inputMode="tel" required autoComplete="tel" placeholder="08x-xxx-xxxx" defaultValue={state.values?.phone ?? ""} className="h-12" />
            <p className="text-xs text-muted-foreground">ใช้ติดตามสถานะออเดอร์และรับแจ้งเมื่ออาหารพร้อม</p>
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-sm font-medium">{L.paymentMethod}</h4>
          <PaymentMethodPicker options={methods} value={method} onChange={setMethod} name="paymentMethodPick" />
        </section>

        <section className="grid gap-1.5">
          <Label htmlFor="pickup-note">
            {L.note} <span className="font-normal text-muted-foreground">({L.optional})</span>
          </Label>
          <Textarea id="pickup-note" name="note" maxLength={300} placeholder={L.notePlaceholder} className="min-h-20" defaultValue={state.values?.note ?? ""} />
        </section>

        <TotalsRows totals={totals} className="rounded-[var(--radius-lg)] bg-muted/60 p-4" />
        {state.error && (
          <p role="alert" className="rounded-[var(--radius-md)] bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 mt-auto border-t bg-background px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button type="submit" size="lg" className="h-13 w-full justify-between px-5 text-base" disabled={pending || !slot || lines.length === 0}>
          <span className="flex items-center gap-2">
            {pending ? <Loader2 className="size-5 animate-spin" /> : <ShoppingBag className="size-5" />}
            {L.placeOrder}
          </span>
          <span className="tabular-nums">{thb(totals.total)}</span>
        </Button>
      </div>
    </form>
  );
}
