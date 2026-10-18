import * as React from "react";
import { cn } from "@rentweb/ui/lib/utils";
import { thb } from "@rentweb/core/money";
import { L } from "../labels";
import { formatThaiYmd } from "../services/time";

export interface QuoteBreakdownData {
  nights: number;
  guests: number;
  nightly: Array<{ date: string; price: number }>;
  roomTotal: number;
  extraGuests: number;
  extraGuestTotal: number;
  extras: Array<{ id: string; name: string; qty: number; total: number }>;
  extrasTotal: number;
  total: number;
  deposit: number;
  depositPercent: number;
}

/** Price breakdown (nights x rate, extra guests, add-ons, total, amount due now). Pure markup: usable from server and client. */
export function QuoteBreakdown({
  quote,
  dueNow,
  dueLabel,
  showNights = true,
  className,
}: {
  quote: QuoteBreakdownData;
  /** amount the guest pays online now (deposit / full / 0 = pay at the property); omit to hide the row */
  dueNow?: number | null;
  dueLabel?: string;
  showNights?: boolean;
  className?: string;
}) {
  const first = quote.nightly[0];
  const sameRate = quote.nightly.every((n) => n.price === first?.price);
  const due = dueNow ?? null;
  return (
    <dl className={cn("space-y-2 text-sm", className)} data-testid="quote-breakdown">
      <div className="flex items-start justify-between gap-4">
        <dt className="text-muted-foreground">
          {L.roomTotal} · {L.nights(quote.nights)}
          {sameRate && first ? (
            <span className="block text-xs">
              {thb(first.price)} × {quote.nights}
            </span>
          ) : null}
        </dt>
        <dd className="font-medium tabular-nums">{thb(quote.roomTotal)}</dd>
      </div>
      {showNights && !sameRate && (
        <details className="rounded-[var(--radius-md)] bg-muted/60 px-3 py-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">ราคาต่อคืนตามวันที่</summary>
          <ul className="mt-2 space-y-1 text-xs">
            {quote.nightly.map((n) => (
              <li key={n.date} className="flex justify-between tabular-nums">
                <span>{formatThaiYmd(n.date, { short: true, weekday: true })}</span>
                <span>{thb(n.price)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {quote.extraGuestTotal > 0 && (
        <div className="flex items-start justify-between gap-4">
          <dt className="text-muted-foreground">
            {L.extraGuests} · {L.guestsN(quote.extraGuests)}
          </dt>
          <dd className="font-medium tabular-nums">{thb(quote.extraGuestTotal)}</dd>
        </div>
      )}
      {quote.extras.map((e) => (
        <div key={e.id} className="flex items-start justify-between gap-4">
          <dt className="text-muted-foreground">
            {e.name}
            {e.qty > 1 ? ` × ${e.qty}` : ""}
          </dt>
          <dd className="font-medium tabular-nums">{thb(e.total)}</dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3">
        <dt className="font-medium">{L.total}</dt>
        <dd className="font-heading text-2xl font-semibold tabular-nums" data-testid="quote-total">
          {thb(quote.total)}
        </dd>
      </div>
      {due !== null && (
        <div className="flex items-baseline justify-between gap-4 rounded-[var(--radius-md)] bg-primary-soft px-3 py-2 text-primary">
          <dt className="font-medium">{dueLabel ?? L.dueNow}</dt>
          <dd className="font-semibold tabular-nums" data-testid="quote-due">
            {due > 0 ? thb(due) : L.payAtProperty}
          </dd>
        </div>
      )}
      {due !== null && due > 0 && due < quote.total && (
        <p className="text-xs text-muted-foreground">
          {L.payLater} {thb(quote.total - due)}
        </p>
      )}
    </dl>
  );
}
