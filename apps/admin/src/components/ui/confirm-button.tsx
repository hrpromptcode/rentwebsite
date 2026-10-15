"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { toast } from "@rentweb/ui/components/sonner";
import type { ActionResult } from "./form";

export function ConfirmButton({
  title,
  description,
  confirmLabel = "ยืนยัน",
  action,
  children,
  successMessage,
  ...btn
}: ButtonProps & {
  title: string;
  description?: string;
  confirmLabel?: string;
  successMessage?: string;
  action: () => Promise<ActionResult | void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  async function run() {
    setPending(true);
    try {
      const r = await action();
      if (r && r.ok === false) toast.error(r.error);
      else toast.success((r && r.ok && r.message) || successMessage || "ดำเนินการแล้ว");
      setOpen(false);
    } catch (e) {
      if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
      toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button type="button" {...btn} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              ยกเลิก
            </Button>
            <Button type="button" variant={btn.variant === "destructive" ? "destructive" : "default"} onClick={run} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
