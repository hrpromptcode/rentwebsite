"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, XCircle } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";

/** Two-tap cancel (first tap asks for confirmation) wired to a server action. */
export function CancelReservationButton({ action, label = "ยกเลิกการจอง" }: { action: () => Promise<{ ok: boolean; error?: string }>; label?: string }) {
  const [confirm, setConfirm] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const router = useRouter();
  React.useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 6000);
    return () => clearTimeout(t);
  }, [confirm]);
  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant={confirm ? "destructive" : "outline"}
        size="lg"
        className="h-12"
        disabled={pending}
        onClick={() => {
          if (!confirm) return setConfirm(true);
          setError(null);
          start(async () => {
            const r = await action();
            if (!r.ok) setError(r.error ?? "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
            else router.refresh();
          });
        }}
      >
        {pending ? <Loader2 className="size-5 animate-spin" /> : <XCircle className="size-5" />}
        {confirm ? "แตะอีกครั้งเพื่อยืนยันยกเลิก" : label}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
