"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";

/** Copies `value` to the clipboard; 44px target with a 2-second "copied" state. */
export function CopyButton({ value, label = "คัดลอก", className, size = "icon-sm" }: { value: string; label?: string; className?: string; size?: "icon" | "icon-sm" }) {
  const [copied, setCopied] = React.useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`คัดลอก ${value.length > 24 ? `${value.slice(0, 24)}…` : value} แล้ว`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  }
  return (
    <Button type="button" variant="ghost" size={size} onClick={copy} aria-label={`${label} ${value}`} className={cn("shrink-0", className)}>
      {copied ? <Check className="text-emerald-600" aria-hidden /> : <Copy aria-hidden />}
    </Button>
  );
}

/** Label + monospace value + copy button, used for player fields / codes. */
export function CopyField({ label, value, mono = true, className }: { label: string; value: string | null | undefined; mono?: boolean; className?: string }) {
  const v = (value ?? "").trim();
  return (
    <div className={cn("flex items-center justify-between gap-2 rounded-xl border bg-muted/40 px-3 py-2", className)}>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("truncate text-base font-semibold", mono && "font-mono tracking-wide")}>{v || "—"}</p>
      </div>
      {v && <CopyButton value={v} label={`คัดลอก ${label}`} size="icon" />}
    </div>
  );
}
