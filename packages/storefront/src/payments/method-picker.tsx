"use client";

import * as React from "react";
import { Banknote, CreditCard, QrCode, Store, Truck, Wallet } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";

export interface PaymentMethodOption {
  value: "promptpay_qr" | "slip" | "cod" | "cash" | "wallet" | "card";
  label: string;
  description?: string;
  disabled?: boolean;
  extra?: string; // e.g. "+฿30"
}

const ICONS = { promptpay_qr: QrCode, slip: Banknote, cod: Truck, cash: Store, wallet: Wallet, card: CreditCard };

/** Radio-style payment method chooser used by checkout, booking deposit and top-up flows. */
export function PaymentMethodPicker({ options, value, onChange, name = "paymentMethod" }: { options: PaymentMethodOption[]; value: string; onChange: (v: PaymentMethodOption["value"]) => void; name?: string }) {
  return (
    <div className="grid gap-3" role="radiogroup">
      {options.map((o) => {
        const Icon = ICONS[o.value];
        const active = value === o.value;
        return (
          <label
            key={o.value}
            className={cn(
              "flex cursor-pointer items-center gap-4 rounded-[var(--radius-lg)] border p-4 transition",
              active ? "border-primary bg-primary-soft ring-2 ring-primary/30" : "hover:bg-muted",
              o.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input type="radio" name={name} value={o.value} checked={active} disabled={o.disabled} onChange={() => onChange(o.value)} className="sr-only" />
            <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full", active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
              <Icon className="size-5" />
            </span>
            <span className="flex-1">
              <span className="block font-medium">{o.label}</span>
              {o.description && <span className="block text-sm text-muted-foreground">{o.description}</span>}
            </span>
            {o.extra && <span className="text-sm font-medium">{o.extra}</span>}
          </label>
        );
      })}
    </div>
  );
}
