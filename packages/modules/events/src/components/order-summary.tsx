import * as React from "react";
import { cn } from "@rentweb/ui/lib/utils";
import { thb } from "@rentweb/core/money";
import { GlueWords } from "./thai-wrap";
import { L } from "../labels";

export interface OrderLinesData {
  lines: Array<{ ticketTypeId: string; name: string; unitPrice: number; qty: number; total: number }>;
  quantity: number;
  subtotal: number;
  discount: number;
  total: number;
  promoCode?: string | null;
}

/** Lines × qty, discount and total of a ticket order (server-safe; also used inside the client buy widget). */
export function OrderLines({ data, className, compact }: { data: OrderLinesData; className?: string; compact?: boolean }) {
  return (
    <div className={cn("text-sm", className)} data-testid="order-lines">
      <ul className="divide-y divide-border">
        {data.lines.map((l) => (
          <li key={l.ticketTypeId} className={cn("flex items-start justify-between gap-3", compact ? "py-1.5" : "py-2.5")}>
            <div className="min-w-0">
              <p className="font-medium">
                <GlueWords text={l.name} />
              </p>
              <p className="text-xs text-muted-foreground">
                {l.unitPrice > 0 ? thb(l.unitPrice) : L.free} × {L.ticketsN(l.qty)}
              </p>
            </div>
            <span className="shrink-0 font-medium tabular-nums">{l.total > 0 ? thb(l.total) : L.free}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-2 space-y-1 border-t border-border pt-2">
        {data.discount > 0 && (
          <>
            <div className="flex justify-between text-muted-foreground">
              <dt>{L.subtotal}</dt>
              <dd className="tabular-nums">{thb(data.subtotal)}</dd>
            </div>
            <div className="flex justify-between text-emerald-700 dark:text-emerald-300">
              <dt>
                {L.discount}
                {data.promoCode ? ` (${data.promoCode})` : ""}
              </dt>
              <dd className="tabular-nums">−{thb(data.discount)}</dd>
            </div>
          </>
        )}
        <div className="flex items-baseline justify-between pt-1">
          <dt className="font-medium">
            {L.total} · {L.ticketsN(data.quantity)}
          </dt>
          <dd className="font-heading text-xl font-semibold tabular-nums text-primary" data-testid="order-total">
            {data.total > 0 ? thb(data.total) : L.free}
          </dd>
        </div>
      </dl>
    </div>
  );
}
