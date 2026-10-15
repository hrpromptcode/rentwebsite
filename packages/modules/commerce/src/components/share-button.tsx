"use client";

import * as React from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { L } from "../labels";

/** Native share sheet on mobile, copy-link fallback elsewhere (Thai shops sell a lot via LINE/Facebook links). */
export function ShareButton({ title, text, className }: { title: string; text?: string; className?: string }) {
  const [done, setDone] = React.useState(false);
  async function share() {
    const url = window.location.href;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setDone(true);
      toast.success(L.copied);
      setTimeout(() => setDone(false), 2000);
    } catch {
      /* user dismissed the sheet */
    }
  }
  return (
    <Button type="button" variant="ghost" size="sm" className={cn("h-11", className)} onClick={share}>
      {done ? <Check className="size-4" /> : <Share2 className="size-4" />}
      {L.share}
    </Button>
  );
}
