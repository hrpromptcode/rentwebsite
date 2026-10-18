"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { PaymentMethodPicker, type PaymentMethodOption } from "@rentweb/storefront/payments";
import { cancelTicketOrderAction, renewTicketPaymentAction } from "../actions";
import { L } from "../labels";

export interface OrderActionsProps {
  orderId: string;
  accessKey: string | null;
  /** pending orders can be cancelled by the buyer */
  canCancel: boolean;
  /** shown when there is no live payment: why, and the methods a new one can use */
  renew: { reason: "expired" | "failed" | "none"; amountLabel: string; failureReason?: string | null; methods: PaymentMethodOption[] } | null;
  className?: string;
}

/** Renew-payment card (expired QR / rejected slip) and the cancel-unpaid flow on /tickets/[id]. */
export function OrderActions({ orderId, accessKey, canCancel, renew, className }: OrderActionsProps) {
  const router = useRouter();
  const [confirm, setConfirm] = React.useState(false);
  const [method, setMethod] = React.useState<PaymentMethodOption["value"]>(renew?.methods[0]?.value ?? "promptpay_qr");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const run = (fn: () => Promise<{ error: string } | { ok: true }>) =>
    start(async () => {
      setError(null);
      try {
        const r = await fn();
        if ("error" in r) setError(r.error);
        else router.refresh();
      } catch {
        setError(L.errors.unknown!);
      }
    });

  return (
    <div className={cn("space-y-4", className)} data-testid="order-actions">
      {renew && (
        <div className="card p-5 md:p-6">
          <p className="font-heading text-lg font-semibold">{renew.reason === "expired" ? L.qrExpired : renew.reason === "failed" ? L.slipRejected : L.payToIssue(renew.amountLabel)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {renew.failureReason ? `${renew.failureReason} · ` : ""}
            {L.renewHint}
          </p>
          {renew.methods.length > 1 && (
            <div className="mt-4">
              <PaymentMethodPicker options={renew.methods} value={method} onChange={setMethod} />
            </div>
          )}
          <Button type="button" size="lg" className="mt-4" disabled={pending || renew.methods.length === 0} onClick={() => run(() => renewTicketPaymentAction({ orderId, key: accessKey, method: method === "slip" ? "slip" : "promptpay_qr" }))} data-testid="renew-payment">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} {L.renewPayment}
          </Button>
          {renew.methods.length === 0 && <p className="mt-2 text-sm text-muted-foreground">{L.noMethods}</p>}
        </div>
      )}

      {canCancel && (
        <div className="card p-5 md:p-6">
          {!confirm ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">{L.cancelHint}</p>
              <Button type="button" variant="ghost" size="lg" className="text-destructive hover:text-destructive" onClick={() => setConfirm(true)} data-testid="cancel-open">
                <XCircle className="size-4" /> {L.cancelOrder}
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              <p className="rounded-[var(--radius-md)] bg-muted p-3 text-sm">{L.cancelHint}</p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" size="lg" onClick={() => setConfirm(false)} disabled={pending}>
                  {L.keepOrder}
                </Button>
                <Button type="button" variant="destructive" size="lg" disabled={pending} onClick={() => run(() => cancelTicketOrderAction({ orderId, key: accessKey }))} data-testid="cancel-confirm">
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />} {L.confirmCancel}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-md)] bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}
