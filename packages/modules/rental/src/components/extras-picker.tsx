"use client";

import * as React from "react";
import { Check, Minus, Plus } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { thb } from "@rentweb/core/money";
import { EXTRA_PRICING_LABEL, L } from "../labels";

export interface ExtraOption {
  id: string;
  name: string;
  description: string | null;
  price: number;
  pricing: string;
}

export interface ExtraSelection {
  id: string;
  qty: number;
}

const MAX_QTY = 5;

/** Add-ons list: tap to toggle, −/+ for the quantity of a selected add-on (airport pickup × 2 …). */
export function ExtrasPicker({ extras, value, onChange, className }: { extras: ExtraOption[]; value: ExtraSelection[]; onChange: (v: ExtraSelection[]) => void; className?: string }) {
  if (!extras.length) return null;
  const qtyOf = (id: string) => value.find((v) => v.id === id)?.qty ?? 0;
  const set = (id: string, qty: number) => {
    const rest = value.filter((v) => v.id !== id);
    onChange(qty > 0 ? [...rest, { id, qty: Math.min(MAX_QTY, qty) }] : rest);
  };
  return (
    <ul className={cn("grid gap-2", className)} data-testid="extras-picker">
      {extras.map((e) => {
        const qty = qtyOf(e.id);
        const on = qty > 0;
        return (
          <li key={e.id} className={cn("flex items-center gap-3 rounded-[var(--radius-lg)] border p-3 transition-colors duration-300", on ? "border-primary bg-primary-soft" : "border-border hover:border-foreground/40")}>
            <button type="button" role="checkbox" aria-checked={on} data-testid={`extra-${e.id}`} onClick={() => set(e.id, on ? 0 : 1)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left">
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md border transition-all duration-300", on ? "scale-110 border-primary bg-primary text-primary-foreground" : "border-input bg-background")} aria-hidden>
                {on && <Check className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-snug">{e.name}</span>
                <span className="block text-xs text-muted-foreground">
                  <span className="rw-price-num">{thb(e.price)}</span> {EXTRA_PRICING_LABEL[e.pricing] ?? ""}
                  {e.description ? ` · ${e.description}` : ""}
                </span>
              </span>
            </button>
            {on && (
              <span className="flex shrink-0 items-center gap-1" role="group" aria-label={`จำนวน ${e.name}`}>
                <button type="button" onClick={() => set(e.id, qty - 1)} aria-label={`ลดจำนวน ${e.name}`} className="rw-press flex size-11 items-center justify-center rounded-full border border-border bg-background hover:border-foreground">
                  <Minus className="size-3.5" aria-hidden />
                </button>
                <span className="w-6 text-center text-sm font-medium tabular-nums" aria-live="polite">
                  {qty}
                </span>
                <button type="button" onClick={() => set(e.id, qty + 1)} disabled={qty >= MAX_QTY} aria-label={`เพิ่มจำนวน ${e.name}`} className="rw-press flex size-11 items-center justify-center rounded-full border border-border bg-background hover:border-foreground disabled:opacity-40">
                  <Plus className="size-3.5" aria-hidden />
                </button>
              </span>
            )}
          </li>
        );
      })}
      <li className="text-xs text-muted-foreground">{L.extrasHint}</li>
    </ul>
  );
}
