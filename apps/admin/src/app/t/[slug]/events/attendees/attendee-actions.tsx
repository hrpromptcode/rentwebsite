"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Undo2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { toast } from "@rentweb/ui/components/sonner";
import { manualCheckInAction, undoCheckInAction } from "./actions";

export function AttendeeActions({ slug, ticketId, status, canWrite }: { slug: string; ticketId: string; status: string; canWrite: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  if (!canWrite || (status !== "valid" && status !== "checked_in")) return null;
  async function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setPending(true);
    try {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "ทำรายการไม่สำเร็จ");
      else {
        toast.success(r.message ?? "บันทึกแล้ว");
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }
  return status === "valid" ? (
    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => manualCheckInAction(slug, ticketId))} data-testid="attendee-checkin">
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} เช็กอิน
    </Button>
  ) : (
    <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => undoCheckInAction(slug, ticketId))} data-testid="attendee-undo">
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Undo2 aria-hidden />} ยกเลิกเช็กอิน
    </Button>
  );
}
