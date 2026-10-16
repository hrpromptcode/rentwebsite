"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CalendarClock, Loader2, XCircle } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Label } from "@rentweb/ui/components/label";
import { Textarea } from "@rentweb/ui/components/textarea";
import { ReschedulePanel } from "@rentweb/module-booking/client";
import { L } from "@rentweb/module-booking/labels";
import type { BookingActionState } from "./actions";

export interface BookingActionsProps {
  canModify: boolean;
  cancelHours: number;
  serviceId: string;
  staffId: string | null;
  today: string;
  maxDate: string;
  showRemaining?: boolean;
  /** guests of a group booking (slots must fit the party) */
  partySize?: number;
  cancelAction: (prev: BookingActionState, form: FormData) => Promise<BookingActionState>;
  rescheduleAction: (start: string) => Promise<{ error: string } | void>;
}

/** Reschedule / cancel controls on /bookings/[id]; both respect the cancelHours policy. */
export function BookingActions({ canModify, cancelHours, serviceId, staffId, today, maxDate, showRemaining, partySize, cancelAction, rescheduleAction }: BookingActionsProps) {
  const [mode, setMode] = React.useState<"idle" | "reschedule" | "cancel">("idle");
  const [cancelState, submitCancel, cancelling] = useActionState(cancelAction, {} as BookingActionState);

  return (
    <div className="card p-5 md:p-6">
      <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
        <CalendarClock className="size-5 text-primary" /> {L.policyTitle}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{L.policy(cancelHours)}</p>

      {!canModify ? (
        <p className="mt-4 flex items-start gap-2 rounded-[var(--radius-md)] bg-muted p-3 text-sm text-muted-foreground">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {L.errors.too_late}
        </p>
      ) : mode === "idle" ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" size="lg" className="w-full sm:w-auto" onClick={() => setMode("reschedule")}>
            <CalendarClock className="size-4" /> เลื่อนนัด
          </Button>
          <Button type="button" variant="ghost" size="lg" className="w-full text-destructive hover:text-destructive sm:w-auto" onClick={() => setMode("cancel")}>
            <XCircle className="size-4" /> ยกเลิกการจอง
          </Button>
        </div>
      ) : mode === "reschedule" ? (
        <ReschedulePanel className="mt-4 border-0 p-0 shadow-none md:p-0" serviceId={serviceId} staffId={staffId} today={today} maxDate={maxDate} action={rescheduleAction} onClose={() => setMode("idle")} showRemaining={showRemaining} partySize={partySize} />
      ) : (
        <form action={submitCancel} className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="cancel-reason">เหตุผลในการยกเลิก (ไม่บังคับ)</Label>
            <Textarea id="cancel-reason" name="reason" rows={2} maxLength={500} placeholder="เช่น ติดธุระกะทันหัน" />
          </div>
          {cancelState.error && (
            <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-md)] bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="size-4" /> {cancelState.error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="lg" onClick={() => setMode("idle")} disabled={cancelling}>
              {L.back}
            </Button>
            <Button type="submit" variant="destructive" size="lg" disabled={cancelling}>
              {cancelling ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />} ยืนยันยกเลิกการจอง
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
