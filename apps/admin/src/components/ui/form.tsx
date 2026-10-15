"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@rentweb/ui/components/button";
import { Label } from "@rentweb/ui/components/label";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";

export function Field({ label, htmlFor, hint, error, children, className }: { label: React.ReactNode; htmlFor?: string; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function SubmitButton({ children, pendingText, ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

export type ActionResult = { ok: true; message?: string; data?: unknown } | { ok: false; error: string };

/**
 * Wraps a server action so forms get a toast on success/failure.
 * Usage: <form action={withToast(saveThing)}>
 */
export function withToast(action: (fd: FormData) => Promise<ActionResult | void>, opts: { success?: string; onSuccess?: (r: ActionResult) => void } = {}) {
  return async (fd: FormData) => {
    try {
      const r = await action(fd);
      if (r && r.ok === false) {
        toast.error(r.error);
        return;
      }
      toast.success((r && r.ok && r.message) || opts.success || "บันทึกแล้ว");
      if (r) opts.onSuccess?.(r);
    } catch (e) {
      // redirect() throws a special error that must propagate
      if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
      toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };
}

/** Hook: run a server action with pending state + toast; returns [run, pending]. */
export function useAction<TArgs extends unknown[]>(action: (...args: TArgs) => Promise<ActionResult | void>, opts: { success?: string; onSuccess?: (r: ActionResult | void) => void } = {}) {
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    async (...args: TArgs) => {
      setPending(true);
      try {
        const r = await action(...args);
        if (r && r.ok === false) {
          toast.error(r.error);
          return r;
        }
        if (opts.success !== "") toast.success((r && r.ok && r.message) || opts.success || "บันทึกแล้ว");
        opts.onSuccess?.(r);
        return r;
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
        toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
        return { ok: false as const, error: String(e) };
      } finally {
        setPending(false);
      }
    },
    [action, opts],
  );
  return [run, pending] as const;
}
