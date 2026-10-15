"use client";

import * as React from "react";
import { useTransition } from "react";
import { Loader2, XCircle } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@rentweb/ui/components/dialog";
import { toast } from "@rentweb/ui/components/sonner";
import { L } from "../labels";

/** Customer-side cancel for unpaid orders, behind a confirm dialog. The action returns an error string or nothing. */
export function CancelOrderButton({ action }: { action: () => Promise<{ error?: string } | void> }) {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = useTransition();
  function confirm() {
    start(async () => {
      const r = await action();
      if (r && r.error) toast.error(r.error);
      else setOpen(false);
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="default" className="text-muted-foreground hover:text-destructive">
          <XCircle className="size-4" /> {L.cancelOrder}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{L.cancelConfirm}</DialogTitle>
          <DialogDescription>{L.cancelHint}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            กลับ
          </Button>
          <Button type="button" variant="destructive" onClick={confirm} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {L.cancelOrder}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
