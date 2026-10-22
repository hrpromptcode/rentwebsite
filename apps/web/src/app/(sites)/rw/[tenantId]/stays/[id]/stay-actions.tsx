"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, Loader2, ShieldCheck, XCircle } from "lucide-react";
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

/** Cancellation card on /stays/[id]: policy summary, outcome preview, reason + confirm (instant pressed / pending state). */
export function StayActions({ canCancel, freeCancelDays, depositPercent, policy, keptLabel, cancelAction }: StayActionsProps) {
  const [open, setOpen] = React.useState(false);
  const [state, submit, pending] = useActionState(cancelAction, {} as StayActionState);
  const reasonRef = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    if (open) reasonRef.current?.focus();
  }, [open]);

  return (
    <div className="rounded-[var(--radius-2xl)] border border-border bg-card p-5 md:p-7" data-testid="stay-actions">
      <h2 className="flex items-center gap-2 font-heading text-step-1 font-semibold">
        <ShieldCheck className="size-5 text-primary-ink" aria-hidden /> {L.policyTitle}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{L.policy(freeCancelDays, depositPercent)}</p>

      {!canCancel ? (
        <p className="mt-5 flex items-start gap-2 rounded-[var(--radius-md)] bg-muted p-3 text-sm text-muted-foreground">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {L.errors.not_cancellable}
        </p>
      ) : !open ? (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-center gap-2 text-sm" data-testid="cancel-preview">
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${policy.free ? "bg-emerald-600" : "bg-amber-600"}`} />
            {policy.free ? <span className="text-emerald-800 dark:text-emerald-300">{L.cancelFree}</span> : <span className="text-amber-800 dark:text-amber-300">{L.cancelKeep(keptLabel)}</span>}
          </p>
          <button type="button" className="rw-press inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-destructive/30 px-5 text-sm font-medium text-destructive transition-colors hover:bg-destructive hover:text-white" onClick={() => setOpen(true)} data-testid="cancel-open">
            <XCircle className="size-4" aria-hidden /> {L.cancelStay}
          </button>
        </div>
      ) : (
        <form action={submit} className="mt-5 grid gap-4">
          <p className="rounded-[var(--radius-md)] bg-muted p-3 text-sm">{policy.free ? L.cancelFree : L.cancelKeep(keptLabel)}</p>
          <div className="grid gap-2">
            <Label htmlFor="cancel-reason">{L.cancelReason}</Label>
            <Textarea ref={reasonRef} id="cancel-reason" name="reason" rows={2} maxLength={500} placeholder="เช่น แผนการเดินทางเปลี่ยน" />
          </div>
          {state.error && (
            <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-md)] bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="size-4" aria-hidden /> {state.error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="rw-press inline-flex min-h-12 items-center justify-center rounded-full border border-border px-6 text-sm font-medium hover:border-foreground disabled:opacity-50" onClick={() => setOpen(false)} disabled={pending}>
              กลับ
            </button>
            <button type="submit" className="rw-press inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-destructive px-6 text-sm font-semibold text-white hover:bg-destructive/90 disabled:opacity-70" disabled={pending} data-testid="cancel-confirm">
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <XCircle className="size-4" aria-hidden />} ยืนยันยกเลิกการจอง
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
