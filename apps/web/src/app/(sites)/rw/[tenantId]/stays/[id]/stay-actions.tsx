"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Label } from "@rentweb/ui/components/label";
import { Textarea } from "@rentweb/ui/components/textarea";
import { L } from "@rentweb/module-rental/labels";
import type { StayActionState } from "./actions";

export interface StayActionsProps {
  canCancel: boolean;
  freeCancelDays: number;
  depositPercent: number;
  /** what the policy says right now */
  policy: { free: boolean; refundDue: number; kept: number; daysBefore: number };
  keptLabel: string;
  cancelAction: (prev: StayActionState, form: FormData) => Promise<StayActionState>;
}

/** Cancellation card on /stays/[id]: policy summary, outcome preview, reason + confirm. */
export function StayActions({ canCancel, freeCancelDays, depositPercent, policy, keptLabel, cancelAction }: StayActionsProps) {
  const [open, setOpen] = React.useState(false);
  const [state, submit, pending] = useActionState(cancelAction, {} as StayActionState);

  return (
    <div className="card p-5 md:p-6" data-testid="stay-actions">
      <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck className="size-5 text-primary" /> {L.policyTitle}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{L.policy(freeCancelDays, depositPercent)}</p>

      {!canCancel ? (
        <p className="mt-4 flex items-start gap-2 rounded-[var(--radius-md)] bg-muted p-3 text-sm text-muted-foreground">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {L.errors.not_cancellable}
        </p>
      ) : !open ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm" data-testid="cancel-preview">
            {policy.free ? <span className="text-emerald-700 dark:text-emerald-300">{L.cancelFree}</span> : <span className="text-amber-700 dark:text-amber-300">{L.cancelKeep(keptLabel)}</span>}
          </p>
          <Button type="button" variant="ghost" size="lg" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)} data-testid="cancel-open">
            <XCircle className="size-4" /> {L.cancelStay}
          </Button>
        </div>
      ) : (
        <form action={submit} className="mt-4 grid gap-4">
          <p className="rounded-[var(--radius-md)] bg-muted p-3 text-sm">{policy.free ? L.cancelFree : L.cancelKeep(keptLabel)}</p>
          <div className="grid gap-2">
            <Label htmlFor="cancel-reason">{L.cancelReason}</Label>
            <Textarea id="cancel-reason" name="reason" rows={2} maxLength={500} placeholder="เช่น แผนการเดินทางเปลี่ยน" />
          </div>
          {state.error && (
            <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-md)] bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="size-4" /> {state.error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="lg" onClick={() => setOpen(false)} disabled={pending}>
              กลับ
            </Button>
            <Button type="submit" variant="destructive" size="lg" disabled={pending} data-testid="cancel-confirm">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />} ยืนยันยกเลิกการจอง
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
