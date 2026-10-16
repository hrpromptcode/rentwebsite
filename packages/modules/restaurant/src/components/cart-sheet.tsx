"use client";

import * as React from "react";
import { ShoppingBasket } from "lucide-react";
import { thb } from "@rentweb/core/money";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@rentweb/ui/components/sheet";
import { cn } from "@rentweb/ui/lib/utils";
import { L } from "../labels";
import { QtyStepper } from "./qty-stepper";

export interface DisplayLine {
  key: string;
  name: string;
  nameEn?: string | null;
  image?: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  modifiers: string[];
  note?: string | null;
}

export interface CartTotals {
  subtotal: number;
  serviceChargePercent: number;
  serviceCharge: number;
  deliveryFee: number;
  total: number;
}

export function TotalsRows({ totals, className }: { totals: CartTotals; className?: string }) {
  return (
    <dl className={cn("space-y-1.5 text-sm", className)}>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">{L.subtotal}</dt>
        <dd className="tabular-nums">{thb(totals.subtotal)}</dd>
      </div>
      {totals.serviceCharge > 0 && (
        <div className="flex justify-between">
          <dt className="text-muted-foreground">
            {L.serviceCharge} {totals.serviceChargePercent}%
          </dt>
          <dd className="tabular-nums">{thb(totals.serviceCharge)}</dd>
        </div>
      )}
      {totals.deliveryFee > 0 && (
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{L.deliveryFee}</dt>
          <dd className="tabular-nums">{thb(totals.deliveryFee)}</dd>
        </div>
      )}
      <div className="flex items-baseline justify-between border-t pt-2 text-base">
        <dt className="font-medium">{L.total}</dt>
        <dd className="font-heading text-xl font-semibold tabular-nums">{thb(totals.total)}</dd>
      </div>
    </dl>
  );
}

/** Cart sheet: editable lines + totals + a mode-specific footer (children). `replace` swaps the whole body (confirmation). */
export function CartSheet({
  open,
  onOpenChange,
  title,
  lines,
  totals,
  onQty,
  onRemove,
  notice,
  children,
  replace,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  lines: DisplayLine[];
  totals: CartTotals;
  onQty: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
  notice?: React.ReactNode;
  children?: React.ReactNode;
  replace?: React.ReactNode;
  /** element to focus when the sheet closes (the cart bar) – the sheet has no Radix trigger (RA-05) */
  returnFocus?: () => HTMLElement | null | undefined;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] w-full gap-0 overflow-hidden p-0 sm:max-w-lg"
        aria-describedby={undefined}
        onCloseAutoFocus={(e) => {
          const el = returnFocus?.();
          if (el) {
            e.preventDefault();
            el.focus();
          }
        }}
      >
        {replace ? (
          <div className="min-h-0 flex-1 overflow-y-auto">{replace}</div>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-3 border-b px-5 py-4 pr-14">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                <ShoppingBasket className="size-5" />
              </span>
              <div>
                <SheetTitle className="font-heading text-xl leading-tight">{title}</SheetTitle>
                <SheetDescription className="text-xs">{L.items(lines.reduce((s, l) => s + l.qty, 0))}</SheetDescription>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {lines.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
                  <ShoppingBasket className="size-10 text-muted-foreground/60" />
                  <p className="font-medium">{L.emptyCart}</p>
                  <p className="text-sm text-muted-foreground">{L.emptyCartHint}</p>
                </div>
              ) : (
                <ul className="divide-y px-5">
                  {lines.map((l) => (
                    <li key={l.key} className="flex gap-3 py-4">
                      <div className="size-14 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-muted">{l.image ? <img src={l.image} alt="" className="size-full object-cover" loading="lazy" /> : null}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium leading-snug">{l.name}</p>
                          <p className="shrink-0 font-semibold tabular-nums">{thb(l.lineTotal)}</p>
                        </div>
                        {l.modifiers.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{l.modifiers.join(" · ")}</p>}
                        {l.note && <p className="mt-0.5 text-xs text-muted-foreground italic">“{l.note}”</p>}
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <span className="text-xs text-muted-foreground tabular-nums">{thb(l.unitPrice)} / รายการ</span>
                          <QtyStepper value={l.qty} onChange={(q) => onQty(l.key, q)} onRemove={() => onRemove(l.key)} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {lines.length > 0 && (
                <div className="px-5 pt-2 pb-4">
                  <TotalsRows totals={totals} className="rounded-[var(--radius-lg)] bg-muted/60 p-4" />
                  {notice}
                </div>
              )}
            </div>
            {children && <div className="shrink-0 border-t bg-background px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
